import type { NextApiRequest, NextApiResponse } from "next";
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/auth-helpers-nextjs";
import formidable from "formidable";
import fs from "fs";

function isPdfUpload(file: formidable.File) {
  const mimeType = file.mimetype?.toLowerCase() ?? "";
  const fileName = file.originalFilename?.toLowerCase() ?? "";

  return mimeType === "application/pdf" || fileName.endsWith(".pdf");
}

function normalizePdfText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdfText(fileBuffer: Buffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: fileBuffer });

  try {
    const parsed = await parser.getText();
    return normalizePdfText(parsed.text ?? "");
  } finally {
    await parser.destroy();
  }
}

// Disable default body parser
export const config = {
  api: {
    bodyParser: false,
  },
};

function appendSetCookie(res: NextApiResponse, values: string[]) {
  const existing = res.getHeader("Set-Cookie");
  const existingArray =
    typeof existing === "string"
      ? [existing]
      : Array.isArray(existing)
        ? existing
        : [];

  res.setHeader("Set-Cookie", [...existingArray, ...values]);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const cookieHeader = req.headers.cookie ?? "";
  const parsed = parseCookieHeader(cookieHeader);

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return parsed.map((c) => ({ name: c.name, value: c.value ?? "" }));
      },
      setAll(cookies) {
        const setCookie = cookies.map(({ name, value, options }) =>
          serializeCookieHeader(name, value, options),
        );
        appendSetCookie(res, setCookie);
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  let tempFilePath: string | null = null;

  try {
    const form = formidable({ maxFileSize: 5 * 1024 * 1024 }); // 5MB max

    const [, files] = await form.parse(req);

    const fileArray = files.file;
    if (!fileArray || fileArray.length === 0) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = fileArray[0];
    tempFilePath = file.filepath;

    if (!isPdfUpload(file)) {
      return res.status(400).json({
        error: "Only PDF files are supported for CV uploads",
        code: "cv_pdf_only",
      });
    }

    const fileName = `${user.id}/cv-${Date.now()}.pdf`;

    // Read file content
    const fileBuffer = fs.readFileSync(file.filepath);
    const extractedText = await extractPdfText(fileBuffer);

    if (!extractedText) {
      return res.status(422).json({
        error: "Could not extract text from the uploaded PDF",
        code: "cv_parse_failed",
      });
    }

    const { data: existingProfile, error: existingProfileError } = await supabase
      .from("profiles")
      .select("cv_storage_path")
      .eq("id", user.id)
      .maybeSingle();

    if (existingProfileError) {
      console.error("Profile fetch error:", existingProfileError);
      return res.status(500).json({ error: existingProfileError.message });
    }

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("cvs")
      .upload(fileName, fileBuffer, {
        contentType: file.mimetype || "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return res.status(500).json({ error: uploadError.message });
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          cv_storage_path: fileName,
          cv_text: extractedText,
        },
        { onConflict: "id" },
      );

    if (updateError) {
      console.error("Profile update error:", updateError);
      return res.status(500).json({ error: updateError.message });
    }

    if (
      existingProfile?.cv_storage_path &&
      existingProfile.cv_storage_path !== fileName
    ) {
      const { error: removeError } = await supabase.storage
        .from("cvs")
        .remove([existingProfile.cv_storage_path]);

      if (removeError) {
        console.warn("Old CV cleanup error:", removeError);
      }
    }

    return res.status(200).json({ cv_view_url: "/api/cv" });
  } catch (e) {
    console.error("Upload handler error:", e);
    const message = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: message });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}
