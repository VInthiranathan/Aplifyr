Examensarbete 

Titel på arbetet: Aplifyr
Klass: SYSM8
Termin och år: 2026 T1
Författare: Aleksander Lukic, Jetlir Kuci, Vithunan Inthiranathan
Kursansvarig: Jerry Johansson


# Sammanfattning
Detta examensarbete handlar om att utveckla en webbaserad applikation som syftar till att förenkla och effektivisera processen för jobbsökande. Idén bygger på insikten att stora delar av dagens rekryteringsprocess redan är automatiserad – exempelvis genom AI-baserad CV-screening och automatiska urvalssystem. Vår utgångspunkt är därför: om arbetsgivare automatiserar sin del av processen, varför skulle inte arbetssökande kunna göra detsamma?

Applikationen matchar användare med relevanta jobbannonser och ger dem möjlighet att automatiskt generera personligt anpassade personliga brev baserat på jobbannonsens innehåll, användarens CV samt information från användarens profil. Systemet erbjuder även matchningsgrader (A, B eller C) baserat på hur väl användarens kompetens och preferenser stämmer överens med tjänsten.

Frontend byggs med Next.js, backend utvecklas i .NET, och databasen hanteras via Supabase.

# Innehållsförteckning
    Detta genreras automatiskt i word, inget vi måste fylla i själva

# Uppdragsbeskrivning/problemformulering  
Att söka jobb är ofta en tidskrävande och repetitiv process. Arbetssökande förväntas anpassa sina CV:n och skriva unika personliga brev för varje enskild tjänst. Samtidigt använder många företag automatiserade system (ATS – Applicant Tracking Systems) för att filtrera och bedöma ansökningar.

Problemet är att:

- Det är svårt för arbetssökande att veta hur väl de faktiskt matchar en tjänst.
- Att skriva personliga brev för varje ansökan tar mycket tid.
- Många kandidater anpassar inte sina ansökningar tillräckligt, vilket minskar deras chans att gå vidare i processen.
- Det saknas verktyg som aktivt hjälper användaren att förstå matchningsgrad innan ansökan skickas.

Vår applikation adresserar detta genom att:

- Matcha användare mot jobb baserat på CV, profil och ortspreferenser.
- Ge en tydlig indikation på matchningsgrad (A, B eller C).
- Automatisera skapandet av ett personligt brev som är skräddarsytt efter jobbannonsens innehåll.
 

# Examensarbetets mål 
Målet med examensarbetet är att utveckla en fungerande prototyp av en intelligent jobbmatchningsapplikation som:

1. Tillåter användare att:
    - Skapa en profil
    - Ladda upp eller fylla i sitt CV
    - Ange preferenser, exempelvis önskad ort
    - Beskriva sig själva, sina intressen och hobbyer

2. Matchar användare med jobbannonser och klassificerar matchningen i tre nivåer:
    - A-matchning – stark överensstämmelse
    - B-matchning – god överensstämmelse
    - C-matchning – viss överensstämmelse

3. Genererar ett personligt brev automatiskt baserat på:
    - Innehållet i jobbannonsen
    - Användarens CV
    - Profilinformation

4. Byggs med en modern och skalbar teknisk arkitektur:
    - Next.js för frontend
    - .NET för backend och API-logik
    - Supabase som databaslösning

Ett övergripande mål är att undersöka hur automatisering och intelligent matchning kan förbättra effektiviteten och kvaliteten i jobbsökningsprocessen.
 

# Nulägesbeskrivning 

 

# Metodbeskrivning  
Projektet genomförs som ett systemutvecklingsprojekt där fokus ligger på att ta fram en fungerande prototyp.

Systemarkitektur
Applikationen byggs med en uppdelad arkitektur:
    Frontend (Next.js)
    Används för att skapa ett modernt och responsivt användargränssnitt. Här hanteras användarinteraktioner såsom registrering, profilhantering, visning av matchningar och generering av personligt brev.

    Backend (.NET)
    Ansvarar för affärslogik, matchningsalgoritmer och API:er. Här sker bearbetning av CV-data, analys av jobbannonser och klassificering av matchningsgrad.

    Databas (Supabase)
    Används för att lagra användarprofiler, CV-information, jobbannonser och matchningsdata.

Arbetsprocess
Utvecklingen sker iterativt där funktioner implementeras och testas stegvis. Projektet delas upp i följande delar:

Design av databasstruktur
    Implementering av användarhantering och profilfunktioner
    Utveckling av matchningslogik
    Implementering av funktion för generering av personligt brev
    Testning och utvärdering av funktionalitet


Matchningslogiken baseras på en jämförelse mellan:
    Kompetenser och erfarenheter i CV
    Krav och nyckelord i jobbannonsen
    Användarens preferenser (exempelvis ort)

Resultatet klassificeras i tre nivåer (A, B eller C), beroende på hur stark överensstämmelsen är.
 

Resultatredovisning 

 

Analys och slutsatser 

 

Rekommendationer 

 

Källförteckning 
https://nextjs.org/
https://tailwindcss.com/
https://chatgpt.com/
 

Bilagor 

 

 