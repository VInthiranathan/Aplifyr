# Generera Personligt Brev - Setup Guide

## Översikt

Din applikation kan nu generera personliga brev automatiskt baserat på jobbannons och din profil. Systemet använder AI för att skapa professionella, skräddarsydda personliga brev.

## AI-providers

Systemet använder två AI-providers med automatisk fallback:

1. **Gemini API** (primär) - Google's Gemini 1.5 Flash
2. **Groq API** (fallback) - Llama 3.3 70B

Om Gemini når rate limit eller misslyckas, aktiveras Groq automatiskt.

## Setup - Backend

### 1. Skaffa API-nycklar (gratis)

#### Gemini API Key

1. Gå till [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Logga in med ditt Google-konto
3. Klicka på "Create API Key"
4. Kopiera nyckeln

**Gratisnivå:**

- 15 förfrågningar per minut
- 1 miljon tokens per minut
- Helt gratis

#### Groq API Key

1. Gå till [Groq Console](https://console.groq.com/)
2. Skapa ett gratis konto
3. Navigera till "API Keys"
4. Klicka på "Create API Key"
5. Kopiera nyckeln

**Gratisnivå:**

- 30 förfrågningar per minut
- 6,000 tokens per minut
- Helt gratis

### 2. Konfigurera Backend

1. Skapa en `.env` fil i `backend/` mappen:

```bash
cd backend
cp .env.example .env
```

2. Öppna `.env` och lägg till dina API-nycklar:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# AI API Keys for Cover Letter Generation
GEMINI_API_KEY=din_gemini_nyckel_här
GROQ_API_KEY=din_groq_nyckel_här
```

**Obs:** Du behöver minst en av de två API-nycklarna. Rekommenderat att lägga till båda för bästa redundans.

### 3. Starta Backend

```bash
cd backend
dotnet restore
dotnet run
```

Backend körs nu på `http://localhost:5000`

## Setup - Frontend

### 1. Konfigurera Frontend

1. Skapa en `.env.local` fil i `frontend/` mappen:

```bash
cd frontend
cp .env.example .env.local
```

2. `.env.local` innehåller redan rätt värden för lokal utveckling:

```env
BACKEND_URL=http://localhost:5000
NEXT_PUBLIC_BACKEND_URL=http://localhost:5000
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

### 2. Installera Dependencies

```bash
cd frontend
npm install
```

### 3. Starta Frontend

```bash
npm run dev
```

Frontend körs nu på `http://localhost:3000`

## Användning

### 1. Navigera till en jobbannons

1. Gå till `http://localhost:3000/jobs`
2. Klicka på ett jobb för att se detaljer

### 2. Generera personligt brev

1. På jobbsidan, klicka på **"Generera personligt brev"**
2. Vänta medan AI:n genererar ditt brev (5-15 sekunder)
3. Brevet visas i en snygg modal

### 3. Interagera med brevet

I modalen kan du:

- **Redigera** - Ändra texten efter ditt behov
- **Kopiera** - Kopiera brevet till urklipp
- **Generera om** - Skapa en ny version
- **Skicka ansökan** - Kopierar brevet och öppnar ansökningslänken

### 4. Skicka ansökan

När du klickar på "Skicka ansökan":

1. Brevet kopieras automatiskt till urklipp
2. Jobbets ansökningssida öppnas i ny flik
3. Klistra in ditt brev i ansökningsformuläret

## Funktioner

### AI-generering

- **Språkdetektering** - Automatisk detektering av jobbannons språk (svenska/engelska)
- **Personalisering** - Brevet anpassas efter din profil och jobbets krav
- **Fallback** - Automatisk växling mellan Gemini och Groq vid problem
- **Snabbt** - Genererar brev på 5-15 sekunder

### Modal-funktioner

- **Dark/Light mode** - Matchar applikationens tema
- **Redigering** - Inline-redigering direkt i modalen
- **Kopiering** - Ett klick för att kopiera hela brevet
- **Regenerering** - Skapa nya versioner med olika formuleringar
- **Ansökningsintegration** - Sömlös övergång till ansökan

### Design

- **Responsiv** - Fungerar på mobil, surfplatta och desktop
- **Tillgänglig** - Keyboard navigation och screen reader-vänlig
- **Snabb** - Smooth animationer och transitions
- **Konsekvent** - Matchar Aplifyr's designspråk perfekt

## Felsökning

### Backend startar inte

```
Error: GEMINI_API_KEY not set
```

**Lösning:** Kontrollera att `.env` finns i `backend/` och innehåller minst en API-nyckel.

### Brevet genereras inte

1. **Kontrollera konsolen** - Öppna Developer Tools (F12) och kolla Network-fliken
2. **Verifiera API-nycklar** - Säkerställ att nycklarna är korrekta
3. **Kontrollera rate limits** - Om du nått gränsen, vänta en minut

### Modal visar inte

**Lösning:** Kontrollera att både frontend och backend körs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5000`

## API Endpoints

### POST /api/coverletters/generate-all

Genererar personligt brev för en eller flera jobbannons.

**Request:**

```json
{
  "jobs": [
    {
      "headline": "Junior Utvecklare",
      "employer": { "name": "Tech AB" },
      "description": { "text": "Vi söker..." },
      "workplace_address": { "municipality": "Stockholm" }
    }
  ],
  "user": {
    "name": "Anna Andersson",
    "title": "Fullstack Developer",
    "bio": "Kort profiltext...",
    "tech_stack": ["C#", "React"],
    "roles": ["Frontend Developer"],
    "cv_text": "Extraherad text från användarens PDF-CV"
  }
}
```

`cv_text` genereras server-side när användaren laddar upp ett PDF-CV. Om ingen läsbar PDF-text finns tillgänglig använder funktionen bara jobbannonsen och övrig profilinformation.

**Response:**

```json
[
  {
    "title": "Junior Utvecklare",
    "coverLetter": "Hej,\n\nJag ansöker...",
    "provider": "Gemini"
  }
]
```

## Teknisk Stack

### Backend

- **.NET 10** - Minimal Web API
- **Gemini 1.5 Flash** - Primär AI-provider
- **Groq (Llama 3.3 70B)** - Fallback AI-provider
- **DotNetEnv** - Environment variables

### Frontend

- **Next.js 16** - Pages Router
- **React** - UI Components
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Lucide React** - Icons

## Kostnader

✅ **Helt gratis!**

Både Gemini och Groq erbjuder generösa gratisnivåer som är mer än tillräckliga för personligt bruk och små till medelstora applikationer.

## Support

Vid problem, kontrollera:

1. `.env` filer i både backend och frontend
2. Att både servrar körs
3. API-nycklarna är giltiga
4. Ingen firewall blockerar localhost-anslutningar

## Nästa steg

Möjliga förbättringar:

- Spara genererade brev i databasen
- Historik över tidigare brev
- Export till PDF
- Email-integration för direktansökan
- A/B-testning av olika brevversioner
- Custom templates och toner
