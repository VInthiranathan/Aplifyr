
# Projektöversikt

## Mål
Bygga en webapp som förbereder jobbansökningar åt användaren genom att kombinera användarens egen beskrivning och uppladdat CV, samt matcha detta mot en målposition. Och även förbereder ett personligtbrev för tjänsten.

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
- Frontend: Next.js (React) + TypeScript + Tailwind CSS
- Backend: Next.js API routes eller Node.js + Express (TypeScript)
- AI: Managed LLM‑API (t.ex. OpenAI, Anthropic) för parsing och generering
- Vector store: Pinecone eller Redis Vector
- Fil‑lagring: AWS S3 eller motsvarande
- Auth: Clerk, Auth0 eller NextAuth

**Varför:** Snabb utveckling, enkel hosting (Vercel) och förenklad integration.

## Rekommendation — NLP‑tung / Skalbar produktion
- Frontend: React + TypeScript (kan använda Next.js)
- Backend: FastAPI (Python) eller NestJS (TypeScript). Välj Python för tunga NLP‑pipelines.
- NLP/ML: Hugging Face‑modeller eller lokal drift av modeller (t.ex. Llama‑familjen) vid behov av finjustering.
- Vector DB: Milvus, Weaviate eller managed Pinecone
- CV‑parsing: LLM‑driven parsing eller verktyg som pyresparser + OCR (Tesseract) för skannade PDF
- Infrastruktur: Docker + Kubernetes (EKS/GKE/AKS) för skalning

**Varför:** Mer kontroll över kostnad och latency samt möjlighet att finjustera modeller.

## MVP‑checklista (minimalt värde)
- Upload: CV (PDF/DOCX) sparas i cloud storage
- Parsing: Extrahera text med pdfminer/Tika eller via LLM‑prompt
- Embeddings: Skapa embeddings med managed API eller HF‑embedder
- Matchning: Semantisk sökning i vector store mot jobbbeskrivningar
- Generation: Generera personligt brev och CV‑sammanfattning via LLM
- UI: Visa och låt användaren redigera förslagen; export som PDF/DOCX
- Säkerhet: Autentisering och kryptering av lagrade CV

## Praktiska råd & GDPR
- **Dataskydd:** Kryptera personuppgifter i vila och under transport; tillhandahåll tydlig datapolicy samt möjlighet att radera data på begäran.
- **Prompt‑säkerhet:** Undvik att logga fullständiga CV i klartext; använd anonymisering eller lagra endast embeddings för intern sökning.
- **Kostnadshantering:** Använd managed LLM för MVP; överväg open‑source eller lokal drift när trafiken ökar.
- **Juridik:** Informera användare tydligt om hur AI används i ansökningsprocessen.
