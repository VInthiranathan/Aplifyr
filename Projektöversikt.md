
# Projektöversikt

## Mål
Bygga en webbapp som förbereder jobbansökningar åt användaren genom att kombinera användarens beskrivning och uppladdade CV med en målposition, samt genererar ett personligt brev för tjänsten.

## Huvudfunktioner
- CV‑uppladdning (PDF/DOCX)
- CV‑parsing och textutvinning
- Semantisk matchning mot jobbannonser
- Generering av anpassat personligt brev och CV‑sammanfattning
- Redigerbar förhandsvisning och export (PDF/DOCX)

## Steg
1. Välj tech‑stack: Bestäm om fokus ska vara ett snabbt MVP eller en NLP‑fokuserad produktion.
2. Frontend & uppladdning: Bygg UI för CV‑upload och textfält för användarens beskrivning.
3. Backend & lagring: Spara filer säkert, extrahera text och hantera autentisering.
4. AI & matchning: CV‑parsing, embeddings + vektorsökning, och LLM‑promptlogik för generering.
5. Test & driftsätt: CI/CD, säkerhetstestning och GDPR‑efterlevnad.

## Rekommendation — Snabbt MVP
- Frontend: Next.js + TypeScript + Tailwind CSS
- Backend: .NET (C#)
- AI: Managed LLM‑API (t.ex. OpenAI, Anthropic) för parsing och generering
- Vektorlager: Pinecone eller Redis Vector
- Fil‑lagring: AWS S3 eller motsvarande
- Auth: SSR using Supabase

**Varför:** Snabb utveckling, enkel hosting (Vercel) och förenklad integration.


## MVP‑checklista (minimalt värde)
- Upload: CV (PDF/DOCX) sparas i cloud storage
- Parsing: Extrahera text med pdfminer/Tika eller via LLM‑prompt
- Embeddings: Skapa embeddings med managed API eller HF‑embedder
- Matchning: Semantisk sökning i vektorlager mot jobbbeskrivningar
- Generation: Generera personligt brev och CV‑sammanfattning via LLM
- UI: Visa och låt användaren redigera förslagen; export som PDF/DOCX
- Säkerhet: Autentisering och kryptering av lagrade CV

## Praktiska råd & GDPR
- **Dataskydd:** Kryptera personuppgifter i vila och under transport; tillhandahåll tydlig datapolicy samt möjlighet att radera data på begäran.
- **Prompt‑säkerhet:** Undvik att logga fullständiga CV i klartext; använd anonymisering eller lagra endast embeddings för intern sökning.
- **Kostnadshantering:** Använd managed LLM för MVP; överväg open‑source eller lokal drift när trafiken ökar.
- **Juridik:** Informera användare tydligt om hur AI används i ansökningsprocessen.


## INFÖR RAPPORT
- resuktat + analys + metod viktigast för VG
- Köllor (next.js tailwind osv eller chatgpt (för rekomendationer osv))