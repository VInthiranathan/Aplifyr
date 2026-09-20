using System.Text.Json;
using System.Text.Json.Nodes;

namespace Aplifyr.Api.Cv;

/** User edits are plain text, not AI-reviewed claims. Keep trusted identity/job metadata server-owned. */
public static class CvEditing
{
    public static JsonNode Apply(JsonElement saved, JsonElement edits)
    {
        if (edits.ValueKind != JsonValueKind.Object || edits.EnumerateObject().Count() != 3 ||
            edits.EnumerateObject().Any(p => p.Name is not ("professionalSummary" or "experience" or "education")))
            throw new CvFailure(400, "invalidEdit");
        var content = JsonNode.Parse(saved.GetRawText())!;
        JsonArray Statements(JsonElement values, JsonArray original)
        {
            if (values.ValueKind != JsonValueKind.Array || values.GetArrayLength() != original.Count)
                throw new CvFailure(400, "invalidEdit");
            var result = new JsonArray();
            var index = 0;
            foreach (var value in values.EnumerateArray())
            {
                if (value.ValueKind != JsonValueKind.String) throw new CvFailure(400, "invalidEdit");
                var text = value.GetString()!.Trim();
                if (text.Length > 600 || text.Any(c => char.IsControl(c) && c != '\n' && c != '\r' && c != '\t'))
                    throw new CvFailure(400, "invalidEdit");
                var previous = original[index++]!;
                if (text.Length == 0) continue;
                result.Add(text == previous["text"]!.GetValue<string>() ? previous.DeepClone() :
                    new JsonObject { ["text"] = text, ["sourceFactId"] = "", ["sourceFactIds"] = new JsonArray(), ["userEdited"] = true });
            }
            return result;
        }
        foreach (var section in new[] { "professionalSummary", "experience", "education" })
        {
            if (!edits.TryGetProperty(section, out var values)) throw new CvFailure(400, "invalidEdit");
            var original = content[section]!.AsArray();
            if (section == "professionalSummary") content[section] = Statements(values, original);
            else
            {
                if (values.ValueKind != JsonValueKind.Array || values.GetArrayLength() != original.Count)
                    throw new CvFailure(400, "invalidEdit");
                for (var i = 0; i < original.Count; i++) original[i]!["bullets"] = Statements(values[i], original[i]!["bullets"]!.AsArray());
            }
        }
        content["userEdited"] = true;
        if (System.Text.Encoding.UTF8.GetByteCount(content.ToJsonString()) > 60000) throw new CvFailure(400, "invalidEdit");
        return content;
    }
}
