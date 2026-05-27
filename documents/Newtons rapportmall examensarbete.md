Examensarbete

Titel på arbetet: Aplifyr
Klass: SYSM8
Termin och år: 2026 T1
Författare: Aleksander Lukic, Jetlir Kuci, Vithunan Inthiranathan
Kursansvarig: Jerry Johansson

1. Sammanfattning

Detta examensarbete handlar om att utveckla en webbaserad applikation som syfte till att
förenkla och effektivisera processen för jobbsökande. Idén bygger på insikten att stora delar av
dagens rekryteringsprocess redan är automatiserad, exempelvis genom AI-baserad CVscreening och automatiska urvalssystem.
Vår utgångspunkt är därför: om arbetsgivare automatiserar sin del av processen, varför skulle
inte arbetssökande kunna göra detsamma?
Applikationen matchar användare med relevanta jobbannonser genom Arbetsförmedlingens
API och ger dem möjlighet att automatiskt generera personligt anpassade personliga brev
baserat på jobbannonsens innehåll och från användarens profil. Systemet erbjuder även
matchningsgrader (A, B eller C) baserat på hur väl användarens kompetens och preferenser
stämmer överens med tjänsten. Användaren ska även kunna se alla andra tillgängliga jobb och
även där ska man kunna generera ett personligt brev även om inte en AI matchning skett.
Frontend byggs med Next.js, backend utvecklas i .NET, och databasen hanteras via Supabase.
Målet är även att bygga en skalbar produkt som kan utvecklas i framtiden med ytterligare
funktioner som tillexempel att kunna bygga CV med rekommendationer och hjälp av AI samt
rådgivning vid arbetssökandet med uppföljning.

2. Innehållsförteckning

    Detta genreras automatiskt i word, inget vi måste fylla i själva

3. Uppdragsbeskrivning/problemformulering
Att söka jobb är ofta en tidskrävande och repetitiv process. Arbetssökande förväntas anpassa
sina CV och skriva unika personliga brev för varje enskild tjänst. Samtidigt använder många
företag automatiserade system (ATS – Applicant Tracking Systems) för att filtrera och bedöma
ansökningar.
3.1 Utmaningarna
• Det är svårt för arbetssökande att veta hur väl de faktiskt matchar en tjänst.
• Att skriva personliga brev för varje ansökan tar mycket tid.
• Många kandidater anpassar inte sina ansökningar tillräckligt, vilket minskar deras chans
att gå vidare i processen.
• Det saknas verktyg som aktivt hjälper användaren att förstå matchningsgrad innan
ansökan skickas.
3.2 Lösning
• Matcha användare mot jobb baserat på CV, profil och ortspreferenser.
• Ge en tydlig indikation på matchningsgrad (A, B eller C).
• Automatisera skapandet av ett personligt brev som är skräddarsytt efter jobbannonsens
innehåll, där även användaren kan korrigera om det behövs.
4. Examensarbetets mål
Målet med examensarbetet i helhet är att utveckla en fungerande prototyp av en intelligent
jobbmatchningsapplikation för att underlätta hela processen från att leta och hitta jobb som
arbetssökande matchar med. Dessutom ha en indikator med hur bra alla matchningar är samt
kunna generera ett unikt och anpassat personligt brev för varje jobb användaren vill ansöka.
4.1 Användare
Användaren kommer att kunna skapa en profil och ladda upp sitt CV där vi förvarar det säkert i
databasen. Användaren kommer även kunna ställa in sina preferenser och även måste ha en
beskrivning om sig själv samt sina intressen och hobby för att kunna generera personliga brev
som kommer att anpassas och bli unika som matchar bäst till jobbannonsen.
4.2 Matchningar
Det kommer att finnas tre klasser av matchningar vilket gör att arbetssökaren lätt kan navigera
genom all sina matchningar.
• A väldigt starka överenskommelser med både jobbannonsen och användaren.
• B starka överenskommelser men kan vara längre bort eller något av sina preferenser
inte faller in.
• C delvis överenskommelser samt kan vara längre bort och flera av sina preferenser inte
faller in
4.3 Artificiell intelligens
Vi kommer att använda oss av AI för att kunna läsa av CV och profilinformation för att sedan
kunna generera matchningar baserat på profilen och innehållet i annonsen, varje matchad
jobbannons kommer hamna i en lista av sina matchade jobb med en matchnings grad för att
användaren lätt ska kunna filtrera sina matchningar.
Dessutom kommer det att finnas en AI för att kunna generera personliga brev som kommer att
vara tillgänglig för alla jobbannonser där användaren själv kan gå in och söka genom olika
annonser om användaren tycker att något låter intressant utanför sina preferenser.
4.4 Skalbarhet
Applikationen byggs med en modern och skalbar teknisk arkitektur där vi har använt oss av
Next.js som frontend, .NET för backend samt API logik och Supabase som databaslösning.
Ett övergripande mål är att undersöka hur automatisering och intelligent matchning kan
förbättra effektiviteten och kvaliteten i jobbsökningsprocessen.
5. Nulägesbeskrivning
5.1 Marknaden
I Sverige söker tusentals människor jobb varje dag. Den svenska arbetsmarknaden förändras
ständigt och med det även hur vi söker jobb. Arbetsförmedlingen har länge varit en central
aktör, men under senare år har digitala jobbplattformar som LinkedIn, Indeed och Platsbanken
tagit över allt mer utrymme. Samtidigt har många arbetssökande upptäckt att bara skicka iväg
samma CV till alla tjänster sällan ger bra resultat.
5.1.1 Arbetsgivaren
Från arbetsgivarens sida används ofta ATS-system (Applicant Tracking Systems) för att filtrera
bort ansökningar som inte matchar vad de söker. Det kan handla om specifika nyckelord,
utbildningsnivå eller tidigare erfarenheter. Dessa system gör rekrytering mer effektiv för
företagen, men skapar också en utmaning för den som söker jobb om ansökan inte är anpassad
efter tjänsten riskerar den att aldrig nå en mänsklig rekryterare.
5.1.2 Arbetssökande
Det finns verktyg som hjälper arbetssökande att skapa CV och personliga brev, till exempel
Canva, olika Word-mallar eller tjänster som Kickresume. Men dessa fungerar mest som
formatverktyg de hjälper användaren att få texten att se bra ut, men de genererar inte
innehållet automatiskt eller analyserar hur väl man matchar en specifik tjänst.
5.1.3 Gapet
Det som saknas idag är ett verktyg som aktivt hjälper arbetssökande att:
• Förstå hur väl de faktiskt passar för en viss tjänst innan de skickar in sin ansökan
• Få hjälp att skriva ett relevant och skräddarsytt personligt brev baserat på den specifika
jobbannonsen
• Spara tid genom att automatisera delar av ansökningsprocessen på samma sätt som
arbetsgivarna automatiserar sin del
Vissa tjänster har börjat experimentera med AI för CV-skrivning, men dessa är ofta generella
och tar inte hänsyn till specifika jobbannonser eller matchningsgrad. LinkedIn erbjuder förslag
på jobb baserat på profil, men ger ingen tydlig bedömning av hur stark matchningen egentligen
är.
Vår applikation fyller detta gap genom att kombinera matchningsanalys med automatisk
generering av personliga brev. Tanken är inte att ersätta den mänskliga processen helt, utan att
ge arbetssökande bättre verktyg för att förstå sina chanser och spara tid på det repetitiva
arbetet precis som arbetsgivarna redan gjort.
5.2 Restriktioner och hänsynstaganden
Vid utvecklingen av applikationen finns flera viktiga aspekter att ta hänsyn till, både juridiska,
tekniska och etiska. De här aspekterna påverkar egentligen hela utvecklingsprocessen från hur
systemet byggs upp och vilka tekniker som används, till hur data sparas och hur användaren
upplever tjänsten. Många av besluten som tas tidigt kan få konsekvenser längre fram, så det är
viktigt att tänka igenom dem ordentligt. Genom att ha koll på juridiska krav, tekniska
begränsningar och etiska frågor redan från start blir det enklare att undvika problem och bygga
något som fungerar bra i praktiken. Det gör också att lösningen känns mer genomtänkt och
hållbar i längden.
5.2.1 Juridiska aspekter (GDPR)
Eftersom systemet hanterar personuppgifter som namn, e-post och CV-innehåll omfattas det
av GDPR. Det innebär att data måste lagras säkert, skyddas mot obehörig åtkomst och endast
den information som är nödvändig ska sparas. Användaren bör även ha möjlighet att uppdatera
eller radera sina uppgifter. Även om detta är en prototyp är det viktigt att visa medvetenhet
kring dataskydd och integritet.
För att ytterligare stärka dataskyddet används Row Level Security (RLS) i Supabase. Detta
innebär att användare endast kan läsa och modifiera sina egna uppgifter i databasen.
Åtkomstkontrollen implementeras direkt på databasskiktsnivå, vilket minskar risken för
obehörig åtkomst även om applikationslogiken skulle innehålla brister.
Systemet lagrar inte fullständiga promptloggar från LLM-anrop. Endast det genererade
resultatet sparas vid behov. Detta minimerar lagring av känsliga persondata och följer principen
om dataminimering enligt GDPR.
5.2.2 Tekniska begränsningar
Applikationen använder externa API:er och filuppladdning, vilket medför vissa begränsningar.
Arbetsförmedlingens API kan ha anropsbegränsningar och användarvillkor som måste följas.
Uppladdning av CV-filer kräver också säker hantering för att undvika risker.
Matchningsalgoritmen kommer dessutom vara förenklad, vilket innebär att A/B/C-betyg endast
ska ses som en indikation och inte en exakt bedömning.
5.2.3 Etiska överväganden
AI-genererade personliga brev kan innehålla formuleringar som inte helt speglar verkligheten.
Därför bör systemet ses som ett stödverktyg, inte en garanti för att få jobb. Det är också viktigt
att tydliggöra att matchningsgraden inte innebär någon säker prognos, utan endast en hjälp för
användaren att bedöma sina chanser. LLM används som ett stödverktyg för textgenerering,
men fattar inga autonoma beslut. Användaren har alltid möjlighet att granska och redigera det
genererade innehållet innan det används.
5.2.4 Avgränsning
Eftersom detta är ett examensarbete är projektet tidsbegränsat. Fokus ligger därför på att
utveckla en fungerande prototyp med tydlig struktur, snarare än en helt färdig kommersiell
produkt. Det betyder att vissa delar, som mer avancerad optimering, en heltäckande
säkerhetsgranskning och större användartester, inte hinns med i den här versionen. Istället
ligger fokus på att få grundfunktionerna att fungera ordentligt. De mer fördjupade delarna får
ses som naturliga steg att arbeta vidare med om projektet skulle utvecklas vidare i framtiden.
6. Metodbeskrivning
Projektet genomförs som ett systemutvecklingsprojekt där fokus ligger på att ta fram en
fungerande prototyp. Arbetet sker stegvis, där funktioner planeras, implementeras och testas
löpande. Utvecklingsprocessen är iterativ, vilket innebär att lösningen kontinuerligt förbättras
baserat på insikter som uppstår under arbetets gång. På så sätt kan både tekniska lösningar och
design justeras efter behov.
6.1 Systemarkitektur
Applikationen byggs med en uppdelad arkitektur där frontend, backend och databas hålls
separerade från varandra. Detta gör systemet mer strukturerat och lättare att underhålla,
samtidigt som det skapar bättre förutsättningar för vidareutveckling. Genom att tydligt dela
upp ansvaret mellan olika delar av systemet blir koden mer överskådlig och flexibel.
6.1.1 Frontend (Next.js)
Används för att skapa ett modernt och responsivt användargränssnitt. Här hanteras
användarinteraktioner såsom registrering, profilhantering, visning av matchningar och
generering av personligt brev. Frontend-delen ansvarar också för att presentera data på ett
tydligt och användarvänligt sätt, så att användaren enkelt kan navigera i systemet. Stor vikt
läggs vid att skapa en intuitiv design som fungerar både på dator och mobila enheter.
6.1.2 Backend (.NET)
Ansvarar för affärslogik, matchningsalgoritmer och API:er. Här sker bearbetning av CV-data,
analys av jobbannonser och klassificering av matchningsgrad. Backend fungerar som länken
mellan frontend och databasen och säkerställer att data hanteras korrekt och säkert. Det är
också här validering av indata sker samt att logik för behörighet och åtkomstkontroll
implementeras.
6.1.3 Databas (Supabase)
Databasen (Supabase/PostgreSQL) är utformad enligt principer för relationsdatabasnormalisering för att minimera redundans och säkerställa dataintegritet. Användarprofiler, CVdata, jobbannonser, matchningsresultat och AI-genererat innehåll lagras i separata tabeller
med tydliga relationer via främmande nycklar.
Strukturen möjliggör skalbarhet, bättre underhållbarhet samt en tydlig separation mellan
rådata och genererat innehåll.
6.2 Arbetsprocess
Utvecklingen sker iterativt där funktioner implementeras och testas stegvis. Projektet delas upp
i följande delar:
• Design av databasstruktur
• Implementering av användarhantering och profilfunktioner
• Utveckling av matchningslogik
• Implementering av funktion för generering av personligt brev
• Testning och utvärdering av funktionalitet
Matchningslogiken baseras på en kombination av strukturerad jämförelse och semantisk
analys. Text från CV, profilinformation och jobbannonser omvandlas till numeriska
representationer (embeddings) med hjälp av en språkmodell.
Dessa vektorer lagras i databasen och jämförs för att beräkna semantisk likhet mellan
användarens kompetens och jobbannonsens krav.
Resultatet klassificeras i tre nivåer (A, B eller C) beroende på hur stark överensstämmelsen är.
Genom att använda embeddings möjliggörs matchning även när olika formuleringar används
för liknande kompetenser, vilket ger en mer robust bedömning än enbart nyckelordsbaserad
matchning.
7. Resultatredovisning
8. Analys och slutsatser
9. Rekommendationer
10. Källförteckning
Next.js
Next.js Documentation. https://nextjs.org/
Tailwind CSS
Tailwind CSS. Documentation. https://tailwindcss.com/
Supabase
Supabase Documentation. https://supabase.com/
ChatGPT (för forskning och rekommendationer)
ChatGPT. AI language model. https://chatgpt.com/
11. Bilagor