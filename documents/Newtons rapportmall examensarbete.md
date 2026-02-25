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
1. Marknaden
I Sverige söker tusentals människor jobb varje dag. Den svenska arbetsmarknaden förändras ständigt och med det även hur vi söker jobb. Arbetsförmedlingen har länge varit en central aktör, men under senare år har digitala jobbplattformar som LinkedIn, Indeed och Platsbanken tagit över allt mer utrymme. Samtidigt har många arbetssökande upptäckt att bara skicka iväg samma CV till alla tjänster sällan ger bra resultat.

Från arbetsgivarens sida används ofta ATS-system (Applicant Tracking Systems) för att filtrera bort ansökningar som inte matchar vad de söker. Det kan handla om specifika nyckelord, utbildningsnivå eller tidigare erfarenheter. Dessa system gör rekrytering mer effektiv för företagen, men skapar också en utmaning för den som söker jobb om ansökan inte är anpassad efter tjänsten riskerar den att aldrig nå en mänsklig rekryterare.

Det finns verktyg som hjälper arbetssökande att skapa CV:n och personliga brev, till exempel Canva, olika Word-mallar eller tjänster som Kickresume. Men dessa fungerar mest som formatverktyg de hjälper användaren att få texten att se bra ut, men de genererar inte innehållet automatiskt eller analyserar hur väl man matchar en specifik tjänst.

Det som saknas idag är ett verktyg som aktivt hjälper arbetssökande att:
    - Förstå hur väl de faktiskt passar för en viss tjänst innan de skickar in sin ansökan
    - Få hjälp att skriva ett relevant och skräddarsytt personligt brev baserat på den specifika jobbannonsen
    - Spara tid genom att automatisera delar av ansökningsprocessen på samma sätt som arbetsgivarna automatiserar sin del

Vissa tjänster har börjat experimentera med AI för CV-skrivning, men dessa är ofta generella och tar inte hänsyn till specifika jobbannonser eller matchningsgrad. LinkedIn erbjuder förslag på jobb baserat på profil, men ger ingen tydlig bedömning av hur stark matchningen egentligen är.

Vår applikation fyller detta gap genom att kombinera matchningsanalys med automatisk generering av personliga brev. Tanken är inte att ersätta den mänskliga processen helt, utan att ge arbetssökande bättre verktyg för att förstå sina chanser och spara tid på det repetitiva arbetet precis som arbetsgivarna redan gjort.

2. Restriktioner och hänsynstaganden

Vid utvecklingen av applikationen finns flera viktiga aspekter att ta hänsyn till, både juridiska, tekniska och etiska.

2.1 Juridiska aspekter (GDPR)

Eftersom systemet hanterar personuppgifter som namn, e-post och CV-innehåll omfattas det av GDPR. Det innebär att data måste lagras säkert, skyddas mot obehörig åtkomst och endast den information som är nödvändig ska sparas. Användaren bör även ha möjlighet att uppdatera eller radera sina uppgifter. Även om detta är en prototyp är det viktigt att visa medvetenhet kring dataskydd och integritet.

2.2 Tekniska begränsningar

Applikationen använder externa API:er och filuppladdning, vilket medför vissa begränsningar. Arbetsförmedlingens API kan ha anropsbegränsningar och användarvillkor som måste följas. Uppladdning av CV-filer kräver också säker hantering för att undvika risker. Matchningsalgoritmen kommer dessutom vara förenklad, vilket innebär att A/B/C-betyg endast ska ses som en indikation och inte en exakt bedömning.

2.3 Etiska överväganden

AI-genererade personliga brev kan innehålla formuleringar som inte helt speglar verkligheten. Därför bör systemet ses som ett stödverktyg, inte en garanti för att få jobb. Det är också viktigt att tydliggöra att matchningsgraden inte innebär någon säker prognos, utan endast en hjälp för användaren att bedöma sina chanser.

2.4 Avgränsning

Eftersom detta är ett examensarbete är projektet tidsbegränsat. Fokus ligger därför på att utveckla en fungerande prototyp med tydlig struktur, snarare än en helt färdig kommersiell produkt.



# Metodbeskrivning

Projektet genomförs som ett systemutvecklingsprojekt där fokus ligger på att ta fram en fungerande prototyp.

Systemarkitektur
Applikationen byggs med en uppdelad arkitektur:
Frontend (Next.js)
    Används för att skapa ett modernt och responsivt användargränssnitt. Här hanteras användarinteraktioner såsom   registrering, profilhantering, visning av matchningar och generering av personligt brev.

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

# Resultatredovisning

# Analys och slutsatser

# Rekommendationer

# Källförteckning
https://nextjs.org/
https://tailwindcss.com/
https://chatgpt.com/

# Bilagor
