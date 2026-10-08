# Supabase och EU-GDPR – åtgärdsguide för Aplifyr

## Uppföljning av lanseringskrav — 2026-10-08

Denna uppföljning gäller lokala ändringar ovanpå `4b2b1cba9cf225f1c78f7f05d78378bd8570e888` på `work`. Ägaren godkände specifikt Tailwind/`@tailwindcss/postcss` 4.3.3 efter granskning av kandidatens audit, bygge och åtta UI-kombinationer. Vid den lokala verifieringen hade ingen commit, push, PR, merge eller ny driftsättning gjorts i denna uppföljning. Den efterföljande publiceringsbegäran redovisas separat nedan; inga hostinginställningar, live-migrationer eller notices har ändrats. Tidigare resultat nedan är historiska; **publik lansering är fortfarande blockerad av de externa kontrollerna och saknade operatörsuppgifterna.**

Ägaren instruerade under arbetet att **hoppa över Supabase-delen**. Därefter gjordes inga fler Supabase-driftkontroller eller konfigurationsändringar. Appens Auth-kod och lokala tester ingår fortfarande. Tidigare läsande kontroll i denna uppföljning bekräftade att läckt-lösenordsskyddet är avstängt och organisationen använder Free; aktuell Supabase-dokumentation anger Pro eller högre för skyddet. Detta har inte åtgärdats eller verifierats som aktiverat.

| Lanseringspunkt | Utfört och verifierat | Kvar/ansvar |
|---|---|---|
| 1. Utvecklings-/byggberoenden | Tailwind 4.3.3 och separat PostCSS-plugin ersätter sårbara Tailwind 3-kedjan. Rootverktyget concurrently är 9.2.4 med exakt shell-quote 1.12.0-override. Full audit för rot och frontend: noll fynd. Ren root-installation inklusive frontend-postinstall passerade. .NET-audit: inga sårbara paket. | Hosted CI på slutlig revision krävs före publicering; framtida advisories kan ändra resultatet. |
| 2. Läckta lösenord | Endast ovanstående tidigare läsande status. | Undantaget enligt ägarens senaste besked; skyddet är fortfarande ej aktiverat. |
| 3. Isolerad miljö/Auth | Separata loopback-processer och syntetisk Auth-origin, inga driftcredentials. Registrering, PKCE/cookies, återställning, utloggning, sena svar och kontobyte täcks av beteendetester. Återställningens råa fel, språkförlust, dubbla försök och gamla kontotillstånd är rättade. | Ingen separat hosted-staging har skapats. Verklig registrering, SMTP-mejlleverans, reset och förnyelse/återkallande av verkliga sessioner är inte slutverifierade. |
| 4. AI och leverantörsfel | Säkerhets-/CV-/workspaceharnessar och frontendtester verifierar krav på ägare, korrekt notice/samtycke, reservationer, kvoter, separat faktagranskning och avvisade/felaktiga leverantörssvar. | Ingen ny verklig AI-generering utfördes: lokala AI-credentials saknas och Supabase-driftflödet är undantaget. Aktuell leverantör/tier/avtal och komplett hosted-flöde återstår. |
| 5. Radering/återläsning | Nytt lokalt PGlite-test fyller alla 13 ägda data-/kvottabeller, raderar A med cascade och bevarar B; återläser en äldre snapshot, återapplicerar A:s radering och verifierar ägarskydd. | Testet verifierar inte Auth-tokenrevokering, leverantörsradering, binärt storage eller driftbackup. Verklig kontoradering och återläsning kräver separat isolerad driftmiljö, identifierat syntetiskt konto och dokumenterad raderings-/återläsningsväg. |
| 6. Last/drift/Render | 180 lokala hälsoanrop med åtta samtidiga klienter: 119 HTTP 200, 61 HTTP 429 med Retry-After; p95 14,05 ms. Privat läsning utan Auth-konfiguration gav 503. Render-version, hälsokontroll, loggar och CPU/minne granskade läsande i bekräftad My Workspace. | Ingen verklig last mot jobbsökning/AI/hosting eller larmleverans/budgetgräns verifierad. Dockerbygge blockerades av nätpolicyn vid Microsofts container-CDN. |
| 7. Integritet/identitet/avtal | Faktisk datakarta, noticekrav, raderingsscope och operatörsbeslut är sammanställda i privacy-controls.md. Ägaren angav kontaktens visningsnamn Aplifyr support. | Fullständigt juridiskt namn, bevakad e-postadress, rättsliga grunder, faktiska avtal/överföringsskydd och lagringsbeslut har inte lämnats. Inga uppgifter har uppfunnits eller publicerats. |

### Säkerhetsgranskning och kodrättningar

Granskningen omfattar API/SSR-identitet, ägar-RLS/grants och avsedda privilegierade consent-RPC-definitioner, mutationernas CSRF-skydd, privata no-store-svar, PKCE/redirects, kontoscopat klienttillstånd, HTML/URL-validering, AI-credentialseparation/reservationer, request-/kapacitetsgränser, export/radering, loggning och leveranskedjan. Granskningen är ingen garanti att alla framtida fel eller sårbarheter är uteslutna.

- **Hög konsekvens, rättad:** återställningsvyn kunde behålla readiness/lösenordsutkast efter utloggning eller kontobyte och saknade skydd mot ett sent initialt sessionssvar. Vyn rensar nu lösenord vid identitetsbyte och avvisar gamla completion-/sessionssvar; Auth-servern förblir auktoritativ för själva mutationen. Kod: `frontend/pages/auth/reset-password.tsx`.
- **Medel, rättad:** återställningssidorna visade rå provider-/transporttext och saknade säker resultatåterhämtning om navigeringen misslyckades efter lösenordsbyte. Nu lokaliserade koder, engångsmutation, rensade lösenordsfält och fortsatt framgångsbesked/länk. Kod: samma fil, `forgot-password.tsx`, `authFlow.ts`.
- **Medel, rättad:** callbacken för lösenordsåterställning saknade serverns PKCE-utbyte/URL-rensning och begäran tappade svensk locale. Den delade `authCallback.ts` validerar indata, binder verifier/cookies och begränsar transporten till tio sekunder. Presentationsparametern `result` är aldrig behörighet. Återställningsbegäran har dubbelförsöksskydd och 60-sekunders UI-cooldown; hosted begränsningar kvarstår oberoende.
- **Höga/kritiska beroendefynd, rättade:** rootens shell-quote och frontendens Tailwind-byggkedja. CI omfattar nu hela Node-träden, .NET körs i ett oberoende auditjobb, alla CI-actions är commitpinnade och checkout sparar inte credentials. Rootens postinstall använder `npm ci` i frontend i stället för en installation som kan ändra lockfilen.
- Tidigare läsande DB-kontroll visade RLS på alla 15 public-tabeller. De fem privata budget-/kvottabellerna saknar medvetet klientpolicies/grants. De två consent-RPC:erna har låst search_path och använder `auth.uid()`; mutation kontrollerar även användarens existens. Advisor-varningarna för dessa avsedda privilegier är inte bevis på öppet ägarskydd och har inte kringgåtts genom att bevilja klientåtkomst. Ingen schemaändring gjordes.

### Faktisk verifiering i denna uppföljning

- Slutligt frontendträd: **157 godkända beteende-/databastester**, produktionsbygge och route-initialisering med `require(ESM)` avstängt. Testkörningen använde `node --test --test-isolation=none tests/*.test.cjs`; ordinarie CI-script behåller processisolering. Nya tester täcker återställningens verifier/cookies, fel, föråldrade svar och den fullständiga lokala raderings-/snapshotkedjan.
- Backend: Release utan varningar/fel; 27 auth-gränstester och övriga säkerhetsharnessar, 93 CV-kontroller, 16 matchningsregressioner och 27 workspacekontroller passerade. Ingen backendkod eller runtimeversion ändrades.
- Noll rapporterade fynd i rootens och frontendens fulla npm-audit samt .NET-audit. Gitleaks 8.24.3 (checksumverifierad) hittade inga hemligheter i 167 git-commits eller aktuell spårad/icke-ignorerad källkod. En separat oavgränsad katalogaudit träffade genererade Next-cache-/manifestfiler; dessa ingår inte i källkod eller commit. Den avgränsade källkodsauditen döljer inga rapporterade källkodsfynd.
- Jobb-/workspace-UI-kontrollen passerade alla åtta språk/bredd/tema-kombinationer på det uppdaterade lokala produktionsbygget. Favoriter, osparade utkast, läsfel/återförsök, tangentbord, ingen horisontell overflow och nonce-CSP verifierades. Även `check-auth-ui.cjs` passerade samtliga åtta kombinationer: svensk/engelsk callback, cooldown, tangentbordsinskick, lokaliserat lösenordsfel utan rå providertext, ogiltig callback med rensad URL och spärrad mutation, ingen overflow och nonce-CSP. Testfixturen exponerar Auths API-version genom CORS så SDK:n kan tolka felkoden; detta är testtransport, ingen ändrad hosted-inställning. Alla privata/AI-anrop använder syntetiska fixtures; inga verkliga mejl skickas och inga driftdata ändras.
- Lokal återläsning är en PGlite-snapshot, inte Supabase PITR/backup, och stöder inte hosted pg_cron. Raderingsrutinen måste återapplicera ett separat minimalt raderingsregister innan en återställd tjänst exponeras.

### Render, loggar, larm och kostnader

Ägaren bekräftade `tea-dafgk2v40ujc73b78r8g` (My Workspace). Tjänsten `srv-dafgqh0n74is739v2l2g` (Aplifyr) kör Docker från main, backend/Dockerfile, i Frankfurt. Deployment `dep-db3jq3p5efls73atan9g` var live med commit **30a9bb7ea38aa478aae0f8d58b92a3fa50aa4db4**, färdig 2026-10-08 06:50:12 UTC. Detta omfattar föregående publicerade säkerhetsrättningar, inte denna arbetskopias nya ändringar.

Hälsokontrollvägen är `/`; konfigurationen anger en Free-instans, previews avstängda och `notifyOnFail=default`. Lästa app-loggar visar 200-svar på hälsokontrollen. CPU-/minnesdata fanns, med observerad minnesanvändning upp till cirka 151 MB i det hämtade intervallet. HTTP-count/latency var tomma och inga fel-/varningsrader kom tillbaka med motsvarande levelfilter. Dessa resultat bevisar varken frånvaro av historiska fel eller att ett larm skickas till en bevakad mottagare. Ett textsök hittade tidigare `providerStatus=503, reason=UNAVAILABLE` för Gemini den 2026-10-07; det är historiskt felbevis, ingen ny lyckad generering.

Före lansering ska operatören verifiera larmets mottagare och faktisk leverans med en kontrollerad testhändelse, följa 5xx/429, upstreamfel/timeouts, CPU/minne och latency under representativ last, samt besluta responstider/eskalering. Bekräfta faktisk proxykedja innan separat ändring av TRUSTED_PROXY_ADDRESSES; utan den kan bakomliggande proxy-IP dela publik/pre-auth-kvot mellan användare.

`ai_budget` är en spärr för **anropsantal**, inte pengar: migrationsdefault är 1000 per dag och 20 per användare/dag. Aktuella driftvärden har inte lästs efter Supabase-undantaget. Bestäm faktisk månadsbudget, modell-/tokenkostnad, reservmarginal och externa leverantörsgränser samt separata larm. Verifiera om leverantörsgränser verkligen stoppar anrop eller endast skickar notiser. Testa gräns och återgång i isolerad miljö; ett lokalt reservationstest verifierar inte fakturering.

Dockerbygget nådde inte verifierbart resultat: nätpolicyn nekade hämtning från `centralus.data.mcr.microsoft.com`. Plattformens proxy/CA behölls och nätspärren kringgicks inte. Kör befintligt Docker-/CI-jobb på slutlig revision i en miljö med godkänd åtkomst före publicering.

### Konkret återstående operatörsarbete

1. Ange personuppgiftsansvarigs fullständiga identitet och en verifierat bevakad e-postadress för Aplifyr support. Testa att kontakten kan ta emot och besvara rättighetsärenden.
2. Besluta och dokumentera rättslig grund per ändamål, faktiska leverantörsavtal och överföringar, inaktivkontons/loggars/ärendens/backups lagring, incidentansvar och DPIA-screening. Följ datakartan i privacy-controls.md; ingen AI-ruta ersätter dessa beslut.
3. Färdigställ svensk/engelsk publik notice från dessa faktiska beslut, och granska AI-noticens kontakt/leverantörstext. Ändra inte redan accepterad text i stället för att skapa en ny granskad version när ändringen kräver det. Ingen notice eller miljövariabel aktiveras av denna dokumentation.
4. Använd ett separat hosted-projekt, egna testcredentials och kontrollerad mailbox när undantagen driftverifiering återupptas. Kör verklig registrering/bekräftelse/reset/refresh/utloggning/A–B-kontobyte med sessionsisolation och anonym/A/B direktåtkomst; kontrollera även gamla token efter radering.
5. Verifiera ett faktiskt AI-anrop med syntetiska sparade fakta och användarens eget aktuella samtycke, samt nekad åtkomst utan/efter återkallat samtycke. Använd injicerade fel i staging för timeout/429/5xx/felaktigt svar; inga verkliga användartexter i fixtures.
6. Genomför kontoradering, relevant processorbegäran med bekräftelse och backupåterläsning i isolerad driftmiljö; dokumentera restaureringstid, förlorat tidsintervall, återapplicerade raderingar och bevarat konto B.
7. Kör representativ last, verifiera larm och monetära gränser, och kör CI/Docker på slutlig revision. Publicering/hostingåtgärder beslutas separat enligt repositoryreglerna.

### PR #39 — godkänd publiceringsbegäran, 2026-10-08

Ägaren bad uttryckligen att committa, pusha, öppna PR, köra CI och därefter merge. Kodrättningarna är committade i `b22d06b`; aktuell `main` (`30a9bb7`) lästes in utan konflikt i `26b393b`. [PR #39](https://github.com/VInthiranathan/Aplifyr/pull/39) innehåller de 23 granskade filerna. Ordinarie `npm test` passerade samtliga 38 testfiler på kodträdet, och gitleaks på den committade historiken hittade inga hemligheter. De tidigare lokala bygg-/webbläsarresultaten ovan gäller samma applikationskod; efter inläsningen ändrades endast historisk dokumentation från main.

Vid denna dokumentationsrevision är PR:en öppen och hosted CI/preview ska verifieras på den slutliga PR-revisionen före merge. Resultat och mergecommit redovisas i PR:ens kontroller och slutrapporten; detta stycke påstår inte att de redan passerat. Merge medger den befintliga automatiska driftsättningen, men inga separata plattformsändringar, migrationer eller notice-aktiveringar. De kvarvarande lanseringskraven ovan gäller även efter publicering.

## Lanseringsgranskning — 2026-10-07

Granskningen gäller arbetskopian på bascommit `f891681`, med nedanstående rättningar. Vid den lokala granskningen var ändringarna ännu inte publicerade. Resultaten från dåvarande hosted-app avser dess befintliga version och bevisar inte att den kör rättningarna. **Publik lansering är ännu inte godkänd:** kvarstående verifiering och operatörsbeslut anges nedan.

### Projektägare och testmiljö — uppgift från ägaren 2026-10-07

Aplifyr drivs av projektägaren personligen som ett eget projekt, inte av ett företag. Ingen separat staging-/testmiljö finns för närvarande. Fortsatt verifiering görs därför lokalt med syntetiska uppgifter där möjligt; lokala UI-fixtures verifierar inte hosted Auth, leverantörsinställningar, verklig e-post eller radering i drift. Ingen stagingmiljö har skapats och inga driftinställningar har ändrats utifrån detta besked.

Publikt namn/identitet, bevakad projektkontakt, faktiska leverantörsvillkor och lagringsrutiner återstår att fastställa för integritetsinformationen. Ett företagsnamn ska inte uppfinnas eller läggas in som platshållare. Projektägaren ansvarar för de kvarstående drift- och lanseringsbesluten i denna runbook; beskedet avgör inte i sig tillämpliga rättsliga grunder eller andra dataskyddskrav.

### Verifierade fel som har rättats

| Fel och konsekvens | Rättning |
|---|---|
| Jobbdetaljen kunde använda annonsinnehåll från URL-parametern `data`, visa en annan annons än valt ID eller behålla gammalt innehåll efter navigering. | Läs endast den kanoniska annonsen via API, validera ID och svar, avbryt gamla anrop och töm tidigare innehåll. |
| `null` i annonsens kvalifikationer kunde krascha rendering. | Hantera saknade kvalifikationer utan krasch. |
| Misslyckad läsning av sparat brev eller ansökan behandlades som tom data; användaren kunde fortsätta utan att se läsfelet. | Visa lokaliserat fel och försök igen; spärra berörda skrivåtgärder tills läsningen lyckas. |
| Även läsningen av sparad revision efter brevgenerering kunde misslyckas utan tydligt fel. Redigering erbjöds trots saknad revision. | Behåll genererad text för kopiering/nedladdning, visa läsfel och spärra redigering/omgenerering tills återförsök hämtar den sparade revisionen. Inget nytt AI-anrop görs vid återförsök. |
| Ett tillfälligt läsfel för anteckningar krävde att användaren lämnade eller laddade om sidan. | Lägg till lokaliserat återförsök. Skrivningar förblir spärrade under läsfel och utkast bevaras vid skrivfel. |
| Osparade ändringar i brev, CV, anteckningar och ansökningsuppgifter kunde försvinna vid navigering eller stängning. | Bekräfta kassering vid navigering och relevanta dialogåtgärder, samt varna före sidstängning. |
| Stängning av ett osparat inline-brev gav två bekräftelser; utkastet kunde tömmas före avslutad navigering. | Låt route-skyddet bekräfta en gång och behåll utkastet tills navigeringen lyckas. |
| Tidigare kontos profil eller sent CV-svar kunde påverka vyn efter kontobyte/utloggning. | Knyt vy och svar till aktuell kontoidentitet, avbryt gamla läsningar och töm tidigare kontos tillstånd. |
| Två felaktiga integritetsvärden i rotens låsfil stoppade ren installation med `EINTEGRITY`. | Återställ registry-verifierade checksummor för `has-flag@4.0.0` och `rxjs@7.8.2`, utan versionsändringar. |

Inga nya behandlingar, mottagare eller lagringstider införs av rättningarna. Kontraktsändringarna beskrivs även i `application-workspace.md`, `privacy-controls.md` och `troubleshooting.md`.

Prioritering och kodankare (radnummer i den granskade arbetskopian): kontoisolering **hög**, `frontend/pages/user/index.tsx:204` och `frontend/pages/jobs/[id]/cv.tsx:67`; förfalskad annonskälla **hög**, `frontend/features/jobs/useJobDetails.ts:19`; null-krasch **medel**, `frontend/components/JobAdContent.tsx:260`; sparade läsfel **medel**, `frontend/features/jobs/useCoverLetter.ts:49` och `frontend/features/jobs/useJobApplication.ts:23`; misslyckad revisionsläsning efter generering **medel**, `frontend/features/jobs/useCoverLetter.ts:143`; osparade ändringar **medel**, `frontend/lib/useUnsavedChanges.ts:6`; dubbel bekräftelse **medel**, `frontend/components/CoverLetterModal.tsx:49`; anteckningsåterförsök **låg**, `frontend/features/jobs/JobNotes.tsx:145`; installationsstopp **medel**, `package-lock.json:34`. Prioriteringen beskriver teknisk användarpåverkan, inte bevis på inträffad incident.

### Utförd verifiering

- Frontend: 144 tester i samtliga 37 testfiler passerade, inklusive tolv nya beteenderegressioner i `launch-regressions.test.cjs`. Slutkörningen använde `node --test --test-isolation=none tests/*.test.cjs` eftersom processisoleringen inte fungerade i den begränsade exekveringsmiljön; ordinarie testscript/CI är oförändrade. Produktionsbygge och kontroll av jobb-/CV-routemoduler passerade på slutlig kod. Rotens tidigare `npm ci --ignore-scripts` passerade efter checksumrättningen; detta verifierar inte postinstall-skriptet.
- Backend: Release-bygge utan varningar/fel. CV-, matchnings-, workspace- och säkerhetsharnessar passerade, inklusive ägargränser, revisionskonflikter, reservationsskydd och begränsning av samtidiga anrop.
- Chromium mot det korrigerade lokala produktionsbygget: publika sidor på svenska/engelska, 1440- och 390-pixlars bredd, ljus/mörk konfiguration, nonce-CSP och ingen horisontell overflow. Inloggning med testkonto/servercookies, brevets läsfel/återförsök samt bevarat utkast och bekräftad tangentbordsnavigering passerade. Ingen oväntad sidkrasch observerades. Annons-/brevfixtures var syntetiska.
- De tre sista rättningarna (inline-stängning, återförsök för anteckningar och revisionsläsning efter generering) har verifierats med beteendetester och ett nytt produktionsbygge. Ovanstående Chromium-körning föregick dessa rättningar; de har därefter verifierats i den lokala körningen 2026-10-08 nedan. Beroendeuppdateringar och hosted-konfiguration har inte ändrats under uppföljningen.
- Befintlig hosted-app: testkontots profil, karriär, ansökningar, workspace, kö, förberedda jobb, samtyckesläsning och export svarade framgångsrikt. Reversibla CRUD-/konflikttester för profil, karriär, ansökningar och anteckningar passerade; teständringar återställdes/raderades. Utloggad privat API-åtkomst nekades. Favoritflödet i webbläsaren kunde inte slutverifieras efter söktimeout; separat läsning av backend/JobTech gav senare HTTP 200.
- Beroendeaudit: frontendens produktionsberoenden hade inga rapporterade sårbarheter; .NET-auditen rapporterade inga sårbara paket. Frontendens fullständiga utvecklings-/byggträd hade fortfarande sju fynd (fem höga, två måttliga), beskrivna nedan. Granskningen är ingen garanti för att alla fel eller sårbarheter har upptäckts.

### Lokal webbläsarverifiering — 2026-10-08

`frontend/scripts/check-launch-ui.cjs` passerade mot den senaste arbetskopians produktionsbygge på localhost. Samtliga åtta kombinationer av svenska/engelska, 390/1440 pixlars bredd och ljust/mörkt tema passerade. Verifierat: favorit sparas, finns efter omladdning och kan tas bort; inline-brev frågar en gång per stängningsförsök och behåller utkast vid nekad navigering; anteckningsläsning kan återförsökas och misslyckad skrivning behåller texten; misslyckad revisionsläsning efter simulerad generering spärrar redigering/omgenerering och återförsöket gör inget nytt genereringsanrop. Tangentbordsstängning, ingen horisontell overflow och nonce-CSP verifierades. Inga oväntade sidfel eller anrop observerades.

Kontrollen använder en syntetisk klientsession och fångar privata/API-/leverantörsanrop i webbläsaren med fixtures. Endast den lokala frontendens publika jobbsida, route-data och statiska filer hämtas från servern. Ingen riktig Auth-inloggning, AI-generering, samtyckestilldelning eller databasändring görs. Resultatet verifierar UI-beteende; det ersätter inte verkliga auth-, leverantörs-, persistens- eller raderingstester. Reproducerbara körinstruktioner och verktygskrav finns i `quick-start.md` under "Optional browser check with synthetic data". Ingen stagingmiljö eller ny driftsättning har skapats.

### Återstår före lansering

1. Åtgärda och verifiera byggberoenden: Tailwind 3-trädet drar in `braces`-varningen GHSA-vfj7-8cjw-p6xm och `postcss-selector-parser`-varningen GHSA-rj75-hqrm-r3gf via transitiva paket. Registry erbjöd ingen korrigerad `braces@3.0.4` vid kontrollen; automatiskt föreslagen lösning innebar större Tailwind-uppgradering. Ingen sådan uppgradering gjordes. Välj kompatibel åtgärd och verifiera CSS, tester och bygge innan dessa fynd stängs.
2. Supabase Security Advisor rapporterade att skydd mot läckta lösenord är avstängt. Operatören behöver aktivera och verifiera [lösenordsskyddet](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) enligt vald plan. Advisor-varningar för ägarbundna consent-RPC:er och privata kvottabeller får inte åtgärdas genom blind indragning av avsedda behörigheter; stäm av faktisk hosted-definition mot migrationer och ägartester.
3. Verifiera verklig registrering, bekräftelsemejl, återställning och sessionsförnyelse; AI-generering med aktuell leverantör/notice; konto-/leverantörsradering och backupåterläsning; favoriter med verklig in-/utloggning och kontobyte; samt belastning och felhantering i en separat godkänd isolerad testmiljö, som ännu saknas. Dessa verkliga flöden har inte slutverifierats i denna granskning. Den lokala UI-körningen ersätter dem inte.
4. Slutför integritetsinformation och bevakad kontakt, rättsliga grunder, leverantörsavtal/överföringsskydd, retention, incidentansvar och DPIA-screening enligt avsnitt 4–8. Tidigare aktiverad utvecklingstext och befintligt testsamtycke innebär inte att operatörskraven är lösta.
5. Slutverifiera plattformarnas privata bygg-/runtime-loggar, Render-version, driftlarm och budgetgränser med bekräftad plattformsåtkomst. CI/Docker och Vercels status för PR #37 är godkända; aktuell publik HTTP-verifiering redovisas nedan. Dessa resultat ersätter inte privata driftkontroller eller verkliga Auth-/AI-/raderingstester.

### Publiceringsbegäran — 2026-10-08

Ägaren har begärt att de granskade ändringarna publiceras och mergas till `main` om kontrollresultaten är godkända. Publiceringen ska gå via PR med godkända frontend-/backend-/Docker- och säkerhetskontroller för PR:ens slutliga revision. Begäran omfattar merge och dess automatiska deployment; inga separata ändringar av hostinginställningar, runtime-versioner, schema eller AI-notices ingår. Kvarstående lanseringskrav ovan gäller även efter merge. Lokal verifiering, PR-kontroller och faktisk hosted-version ska fortsatt redovisas var för sig.

### Publiceringskontroll — 2026-10-08

Rättningarna har publicerats i [PR #37](https://github.com/VInthiranathan/Aplifyr/pull/37) på `work`, kodrevision `f98afb0e6c64c5fb7f969a5823bb3bda72495ce5`. [CI 37728227647](https://github.com/VInthiranathan/Aplifyr/actions/runs/37728227647) passerade frontend, backend och Docker. [Security checks 37728227688](https://github.com/VInthiranathan/Aplifyr/actions/runs/37728227688) passerade hemlighetsskanningen men misslyckades i produktionsberoendeauditen: `next@16.3.6` omfattas nu av rapporterade säkerhetsvarningar, inklusive hög SSRF-varning GHSA-cjq9-62q9-8jv4. Backendens beroendeaudit kördes inte i detta jobb eftersom steget före misslyckades. Den tidigare lokala auditen utan produktionsfynd ovan är historisk och ersätter inte detta resultat.

Den officiella [Next.js 16.3.8-releasen](https://github.com/vercel/next.js/releases/tag/v16.3.8) innehåller rättningarna. En separat tillfällig källkodskopia med exakt `16.3.8` gav noll produktionsfynd i `npm audit --omit=dev`; bara Next och dess versionsbundna env/SWC-paket ändrades. Ren installation med `npm ci --ignore-scripts`, samtliga 144 frontendtester via ordinarie `npm test`, produktionsbygge och kontroll av jobb-/CV-routemoduler passerade i kopian. Bygget använde publika Auth-platshållare; ingen verklig inloggning eller webbläsarkörning av patchkandidaten verifierades. Detta är en kandidatutvärdering, ingen uppdatering av appens versionsfiler eller verifierad driftsättning. `AGENTS.md` kräver uttryckligt godkännande av versionsändringar som påverkar Render/Vercel; denna patch behöver därför ägarens specifika godkännande före införande och nya fullständiga PR-kontroller.

Vid denna kontroll var PR:en ännu inte mergad. Vercels godkända status för kodrevisionen avsåg preview och bevisade inte publicering i produktion. Merge och verifiering av den automatiska produktionsdeploymenten återstod tills säkerhetskontrollen var godkänd. Ingen hostinginställning, migration eller notice-aktivering ändrades.

### Godkänd säkerhetspatch — 2026-10-08

Ägaren har uttryckligen godkänt uppdateringen från Next.js `16.3.6` till exakt `16.3.8`. Frontendens manifest och låsfil uppdateras tillsammans med Nexts versionsbundna env/SWC-paket. Övriga paketversioner, Node/.NET/React, hostinginställningar, migrationer och notices omfattas inte av ändringen. Den tidigare publiceringskontrollen ovan avser den opatchade revisionen; merge kräver nya godkända kontroller för den slutliga patchade PR-revisionen. Automatisk deployment efter den redan godkända mergen ska verifieras separat från preview och lokala tester.

Lokal verifiering av den införda patchen: `npm ci` (inklusive installationsskript), ordinarie `npm test` med 144 godkända tester, produktionsbygge och kontroll av jobb-/CV-routemoduler med `require(ESM)` avstängt passerade. Produktionsberoendeauditen rapporterade noll fynd. Detta ersätter den tidigare separata kandidatutvärderingen för lokal kodvalidering; slutliga hosted-kontroller återstår.

Chromium-kontrollen kördes på nytt mot patchens lokala produktionsbygge: samtliga åtta kombinationer av svenska/engelska, mobil/desktop och ljust/mörkt tema passerade, inklusive favoriter, osparade utkast, läs-/skrivfel, revisionsåterförsök, tangentbord och nonce-CSP. Inga oväntade sidfel eller anrop observerades. Kontrollen använder fortsatt syntetisk session och avlyssnade privata/AI-anrop; verklig Auth, AI och databasverifiering återstår.

Vid read-only hostinginspektion nekade Vercels API teamåtkomst med 403; ingen Vercel CLI fanns för alternativ åtkomst. Render-anslutningen hade ingen bekräftad workspace vald, så ingen tjänst-/deploymentinspektion gjordes där. GitHubs deploymentstatus och publika HTTP-kontroller följs efter merge; de ersätter inte plattformarnas privata bygg-/runtime-loggar.

### Verifierad publicering av PR #37 — 2026-10-08

[PR #37](https://github.com/VInthiranathan/Aplifyr/pull/37) är mergad till `main` på `4b2b1cba9cf225f1c78f7f05d78378bd8570e888`, med Next.js `16.3.8` och samtliga granskade kodrättningar. Slutlig PR-revision `a5b262adbd042ad10018d89a3eb5a159883d3347` hade godkänd [CI 37736595195](https://github.com/VInthiranathan/Aplifyr/actions/runs/37736595195) och [Security checks 37736595193](https://github.com/VInthiranathan/Aplifyr/actions/runs/37736595193), inklusive frontendtester/bygge/routemoduler, backendregressioner, Docker, hemlighetsskanning samt frontend-/backendberoendeauditer. Även push-kontrollerna efter merge passerade: [CI 37736769711](https://github.com/VInthiranathan/Aplifyr/actions/runs/37736769711) och [Security checks 37736769692](https://github.com/VInthiranathan/Aplifyr/actions/runs/37736769692).

Vercel rapporterade lyckad automatisk deployment för mergecommitten ([deploymentstatus](https://vercel.com/vithu/aplifyr/7ZTnEDzAszVzFcAUHSyG8crC1DeG)). Den publika domänen bytte build-ID från `y6FOZFlDgBchOHjv4W08-` före merge till `RiM3Lga0AIIVDUxtlbnqW` efter merge. `/jobs`, `/auth`, `/privacy` och `/support` gav HTTP 200 på svenska och engelska med nonce-CSP; privat profil och kontoexport gav 401 med `private, no-store`, och privat CV-route skickade gästen till inloggning. Publik jobbsökning och läsning av en verklig annons gav 200. Render-backendens publika hälsokontroll gav 200 och `Aplifyr.Api`/`OK`; dess deploymentrevision och privata loggar är fortfarande inte verifierade.

Ett ytterligare Chromium-försök mot den publika jobbannonsen stoppades av exekveringsmiljöns proxy-/certifikattrust. Denna hosted-webbläsarkontroll är därför inte godkänd; lokal Chromium-verifiering och hosted HTTP/API-resultat redovisas separat. TLS-verifiering stängdes inte av. Verklig registrering/e-post, inloggad kontoisolering efter patchen, AI, radering/backup och belastning är fortsatt lanseringskrav. Inga hostinginställningar, migrationer eller notices ändrades utöver den uttryckligen godkända kodpatchen och automatisk deployment efter merge. Publiceringen innebär inte godkänd publik lansering.

## Verifierad status — 2026-10-03

Appen är i utvecklings-/teststadium. PR #34 är mergad till `main` på `5d1da64276b215cc7cb74b6364198b3f72524ba8`. Arbetsyta, privata anteckningar, sparad brevredigering och AI-förslag finns i koden. Detta är inte ett godkännande för offentlig lansering.

- Fixcommit `433bd7babd643e7a1a3536afce26a8408d9d1034`: 112 frontendtester och produktionsbygge passerade. GitHub CI `36993410194` passerade frontend, backend, regressioner och Docker; säkerhetskörning `36993410172` passerade. Detta är tidigare kodvalidering, inte nya tester av dokumentändringen.
- Workspace-migrationen kördes 2026-10-02 i Aplifyr1 (`trgloqvcyzfizeycbhjx`). RLS/grants, privat kvoträknare, ägar-CRUD, nekad åtkomst mellan två syntetiska ägare och gamla revisionskonflikter verifierades. Testdata rullades tillbaka. Det var databasrolltester, inte riktiga webbläsarsessioner.
- Efter uttryckligt ägargodkännande aktiverades `2026-10-documents-v3` 2026-10-03 och v2 avaktiverades atomiskt. Efterkontroll visar endast Gemini v3 aktiv. Granskad text bevarades; inga användarsamtycken tilldelades. Varje användare måste själv godkänna v3 innan nya AI-anrop.
- Vercel rapporterade lyckad deployment för mergecommitten. Render-version, riktiga auth-/AI-flöden, mobil/keyboard och komplett driftkedja är ännu inte verifierade i denna uppföljning. Inga hostinginställningar ändrades.
- Kontaktadress saknas i den aktiverade utvecklingstexten. Betald Gemini-konfiguration, aktuella leverantörsvillkor/avtal, rättsliga grunder, överföringar, organisatorisk retention, backup/radering och DPIA-screening måste verifieras/beslutas av operatören före publik lansering. Aktivering innebär inte att dessa punkter är lösta. Ingen ny juridisk bedömning har utförts i dokumentgenomgången.

### Migrationshistorik i hosted-projektet

Läsande kontroll 2026-10-03 bekräftade följande ledger. Äldre schema finns också; saknad separat ledger-post bevisar inte saknad migration. Jämför SQL/schema före separat godkänd historikreparation. Kör inte blind `supabase db push` och kör inte om gamla migrationer.

| Repositoryfil/version | Hosted version | Namn |
|---|---|---|
| `008` (samlad manuell uppgradering) | `20260909045349` | privacy_consent_and_limits |
| `20260918164504` | `20260918164504` | prepared_jobs_and_generated_document_retention |
| `20260921184722` | `20260921184722` | add_profile_contact_details |
| `20260923122723` | `20260923152826` | job_application_tracker |
| `20260926051754` | `20260929072629` | security_hardening_and_document_revisions |
| `20261002075427` | `20261002183713` | application_workspace |

Historiska engångsrapporter, beroendeaudit-snapshots och profiles-schema-snapshot har tagits bort ur den aktuella dokumentationen. Originalen finns i git-historiken. Aktuella kontrakt finns i feature-dokumenten; kvarstående drift- och integritetskrav finns här.

## 1. Kontrollera befintligt Supabase-projekt – läsning först

Bekräfta projektets referens och staging/produktion. Spara befintliga policies, grants och schema i en skyddad administrativ backup. Klistra inte in nycklar eller personuppgifter i ärenden eller git. Appen använder `public.profiles` (plural), inte `public.profile`.

Kör följande läsande SQL i rätt projekts SQL Editor:

```sql
select to_regclass('public.profiles'), to_regclass('public.profile');
select n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('profiles','profile_career_entries');
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname='public'
and tablename in ('profiles','profile_career_entries');
select grantee,table_name,privilege_type from information_schema.table_privileges
where table_schema='public' and table_name in ('profiles','profile_career_entries');
select conrelid::regclass as child, conname, pg_get_constraintdef(oid)
from pg_constraint where contype='f' and confrelid='auth.users'::regclass;
```

Förväntat: RLS på båda tabellerna; ägarvillkor för läsning och mutationer (`auth.uid() = id` på profiles, `auth.uid() = user_id` på career); UPDATE kontrollerar både befintlig och ny ägare. Granska samtliga policies: flera permissiva policies kan tillsammans ge bredare åtkomst. SQL Editor och service-role kan kringgå RLS och är därför inte isolationstest. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

Migration 006 innehåller en restriktiv ägarspärr och låsta search_path. **Kör den inte blint över dina befintliga policies.** Jämför först avsedd behörighet, migrationshistorik och funktionsnamn i staging. Om motsvarande skydd redan finns: dokumentera hur dashboardändringarna motsvarar migrationshistoriken och använd projektets ordinarie schema-/migrationsflöde. Ta inte bort fungerande policies eller kör om 001 på befintlig databas.

### Verifiera med två testkonton

Använd separata sessioner A och B samt anonym klient, med publishable/anon-nyckel – aldrig service-role. Testa både UI och direkt Data API:

| Åtgärd | Förväntat |
|---|---|
| Anonym SELECT/INSERT/UPDATE/DELETE på båda tabellerna | Ingen privat data läses eller ändras |
| A läser A:s profil/karriär | Fungerar |
| A läser/ändrar/raderar B:s rader | Ingen åtkomst; B:s data oförändrad |
| A sätter id/user_id till B vid INSERT/UPDATE | Avvisas |
| A sparar normal profil och karriär | Fungerar |
| Två flikar sparar samma gamla profilversion | Den andra får 409, ingen tyst överskrivning |
| Export med A:s session och B:s id i URL | Endast A:s data |
| Signup efter härdning | Profiltrigger fungerar |

Spara testresultat utan tokens eller riktiga personuppgifter.

## 2. Inför databasskydd mot stora direktanrop

Migration 007, även inkluderad när den saknas i den samlade migrationen `008_privacy_consent_and_limits.sql`, begränsar profiltext och listor samt varje karriärfärdighet. Den ändrar inga RLS-policies. Kör efter föregående schemamigrationer, först i staging. `NOT VALID` bevarar äldre rader men kontrollerar nya/uppdaterade rader; en redan för stor rad kan därför inte uppdateras förrän den rättats. Ingen automatisk kapning sker.

Efter migrationen, inventera endast antal avvikelser:

```sql
select count(*) as invalid_profiles from public.profiles where
  length(full_name)>200 or length(title)>200 or length(location)>200 or length(bio)>5000
  or not public.aplifyr_short_text_array(tech_stack)
  or not public.aplifyr_short_text_array(roles)
  or not public.aplifyr_short_text_array(location_preferences);
select count(*) as invalid_career_skills from public.profile_career_entries
where not public.aplifyr_short_text_array(skills);
```

Rätta avvikelser med respektive användare eller beslutad datarättelserutin. När antalen är noll och stagingtesterna passerat, validera via godkänt ändringsfönster:

```sql
alter table public.profiles validate constraint profiles_personal_data_limits;
alter table public.profile_career_entries validate constraint career_skill_item_limits;
```

Ta backup och bedöm låsningstid före produktionskörning. Migrationsfilen är avsedd att köras en gång via migrationshistoriken. Migration 008 inför en atomisk kvot på 200 karriärposter per konto, även vid direkt Data API. Äldre överkvotsdata bevaras; nya poster kräver att antalet först minskas.

## 3. Hosted Auth, nycklar och driftskydd

- Kontrollera e-postbekräftelse, säkert lösenordsbyte, lösenordspolicy och missbruksbegränsning i hosted-projektet. Lokala `config.toml`-värden visar inte produktionsläget.
- Kräv MFA för administratörer och begränsa medlemsroller; granska inaktiva medlemmar. Utvärdera MFA för användare utifrån risk.
- Begränsa redirect-URL:er till kontrollerade HTTPS-domäner; testa återställning och tokenrefresh.
- Registrering och bekräftelse: kontrollera Site URL och allowlist för de kontrollerade `/auth/confirm`- och `/sv/auth/confirm`-adresserna inklusive returparametrar. Behåll `{{ .ConfirmationURL }}` i Confirm signup-mallen för appens PKCE-callback; token-hash-mallar kräver ett annat, separat verifierat flöde. Ändring av hosted-konfiguration kräver separat godkännande.
- Testa med en kontrollerad testbrevlåda efter driftsättning: registrering → informationssida → mejllänk i samma webbläsare → bekräftat/inloggat läge → utloggning → lösenordsinloggning. Testa även annan webbläsare, återanvänd/utgången länk, ny bekräftelselänk, inloggning före bekräftelse och avbruten navigering efter lyckad registrering. Behåll jobbets returadress; kontrollera att koder inte finns kvar i resultat-URL eller appens loggar. Lokala fixturetester ersätter inte detta.
- Håll service-role enbart i skyddad server-/administratörsmiljö. Rotera endast berörda nycklar med samordnad driftsplan om exponering konstateras eller misstänks.
- Verifiera HTTPS/HSTS, backup/återläsning, loggåtkomst och faktisk logglagringstid. Lägg inte request bodies, cookies eller AI-texter i tracing.
- Allmän frekvens-/samtidighetsbegränsning är processlokal. Migration 008 inför distribuerade AI-kvoter och reservationslås. Ställ in leverantörernas monetära budgettak och larm separat; SQL-gränsen räknar anrop, inte kronor.

## 4. Publicera riktig integritetsinformation

Kodstödet finns på `/privacy`, åtkomligt före inloggning och länkat från auth, sidomeny och mobilinställningar. Sätt servermiljövariablerna:

- `PRIVACY_NOTICE_SV`: granskad svensk fulltext.
- `PRIVACY_NOTICE_EN`: motsvarande engelsk fulltext.
- `PRIVACY_CONTACT_EMAIL`: en verklig bevakad adress. Testa att ett ärende tas emot och hanteras; mailto-länken är inte en leveransgaranti.

Texterna renderas som vanlig escaped text, inte HTML. Saknade värden visar uttryckligen att information/kontakt saknas. **Detta är en varning, inte en teknisk spärr för registrering. Håll publik lansering/nya registreringar stängda i drift tills uppgifterna är kompletta.**

Fyll i: personuppgiftsansvarigs identitet och kontakt, dataskyddsombud om tillämpligt, varje ändamål/rättslig grund, datakategorier, mottagare, eventuella tredjelandsöverföringar/skydd, lagringstider eller kriterier, obligatoriska uppgifter/konsekvenser, rättigheter och klagomål till IMY. Beskriv profilering och AI korrekt. Bestäm grunder per ändamål – anta inte att allt täcks av avtal eller ett generellt samtycke. [IMY:s GDPR-vägledning](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/).

## 5. Tillgång, export, rättelse och radering

Självserviceexporten hämtar kontoidentitet, profil, sidindelad karriär, AI-samtycken/kvitton, aktiva CV:n/brev, ansökningar, jobbanteckningar och favoriter i aktuell webbläsare. Den är **inte ett komplett registerutdrag**: administrativt måste du komplettera med relevanta behandlingsuppgifter/loggar/mottagare och rättighetsinformation. Skicka aldrig lösenordshashar, tokens, privata nycklar eller andra användares uppgifter.

1. Registrera begärans datum, typ och ansvarig. Verifiera identitet proportionerligt, helst via befintlig inloggning; begär inte rutinmässigt ID-kopia.
2. Bekräfta begäran och följ upp normalt inom en månad. Förlängning kan vara möjlig i vissa fall, men måste motiveras och meddelas inom första månaden. [IMY om rättigheter](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/de-registrerades-rattigheter/).
3. Rättelse: profil/karriär kan redigeras; komplettera eventuell felaktig data hos mottagare. Restriktion/invändning kräver beslutad ärendehantering, inte bara borttagning i UI.
4. Radering: kontrollera rättsliga undantag och exakt verifierat användar-UUID/projekt. Börja med ett testkonto i staging. Bekräfta konsekvenser och behörighet före verklig radering.
5. Inventera användarens eventuella legacy-CV/avatarobjekt enligt avsnitt 10. Ta bort verifierade objekt via Storage API, inte genom att bara radera metadata i SQL. Radera inte en hel bucket om den innehåller andra användares data.
6. Radera kontot via Supabase Auths administratörsflöde efter målbekräftelse. Kontrollera cascade för profil, karriär, samtycken/kvitton, genererade dokument, förberedda jobb, ansökningar, anteckningar och privata kvoträknare. Auth-radering återkallar inte omedelbart redan utfärdade JWT:er; hantera giltighetstiden och använd sessionskontroll för känsliga operationer. Testa både gamla token och refresh samt att åtkomst faktiskt upphör. [Supabase användarhantering](https://supabase.com/docs/guides/auth/managing-user-data).
7. Rensa berörda lokala favoriter på tillgängliga enheter och informera om andra webbläsare/nedladdade brev. Begär radering hos relevanta leverantörer och följ upp bekräftelse.
8. Dokumentera backupers utfasning och en rutin som återapplicerar raderingar vid återläsning. Bevara bara nödvändigt ärendebevis med beslutad retention. Meddela vad som raderats och eventuella lagliga undantag; påstå inte omedelbar radering från alla backups.

Ingen automatisk konto-raderingsendpoint har införts: berörda produktionssystem och raderingsomfattning måste först verifieras.

## 6. Avtal, EU/EES och extern AI

Lämna `AI_ALLOWED_PROVIDERS` tom tills varje aktiverad leverantör är bedömd. Dokumentera Supabase, hosting, e-post och AI: roll, avtal/biträdesavtal där tillämpligt, underbiträden, data, supportåtkomst, länder, retention, träning och radering. EU-region utesluter inte tredjelandsåtkomst. Bedöm aktuell överföringsmekanism, exempelvis tillämpligt adekvansbeslut eller SCC med kompletterande bedömning/skydd; ett regionval är inte hela lösningen. [IMY om överföringar](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/overforing-till-tredje-land/).

För vanlig brevgenerering har jobbdetaljen ett explicit val av högst tre karriärposter: endast typ, titel, organisation, datum och färdigheter skickas. Övrig karriärfritext skickas inte i det flödet. CV och formuleringsförslag använder däremot utvald sparad karriärfritext enligt respektive feature-dokument. Samtycke krävs per leverantör. Undvik känsliga fritextuppgifter; bedöm särskilda krav om sådana faktiskt behandlas.

## 7. Retention, incidenter och konsekvensbedömning

Besluta för varje datatyp: ansvarig, ändamål, lagringstid/kriterium, gallringstrigger, utförande och verifiering. Omfatta aktiva/inaktiva konton, karriär, lokala favoriter, AI-leverantörer, loggar, rättighetsärenden och backups. Lägg inte in godtyckliga tidsfrister som påstått lagkrav.

Utse incidentansvarig och eskaleringsväg. Utred och dokumentera incidenter; anmäl till IMY inom 72 timmar från vetskap när anmälningsskyldighet föreligger, och informera berörda vid hög risk enligt tillämpliga regler. Kodfynd är inte i sig bevis på en inträffad incident. [IMY incidenter](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/personuppgiftsincidenter/).

Dokumentera DPIA-screening för profilering/AI. Genomför konsekvensbedömning om sannolik hög risk föreligger; pröva på nytt om systemet börjar fatta betydande beslut om kandidater. [IMY konsekvensbedömning](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/konsekvensbedomning/).

## 8. Kvarstående kod- och driftarbete – inte dolt som klart

Kod för cache-/poolgränser, tydliga upstream-fel, nonce-CSP, fokusfällor, AI-instruktionsseparation, valda karriärfakta och konfigurerbar e-postkontakt är nu införd. Migration 008 inför samtycke och distribuerad AI-begränsning. CI/Docker-resultat och begränsad databasverifiering finns i statusavsnittet. Kvar före publik lansering: belastnings-/webbläsartest i staging, hosted Auth, avtal, rättsliga grunder, fullständiga notice-texter, retention och fungerande organisatoriska rutiner. Detta kan inte lösas genom SQL eller användarsamtycke ensamt.

Godkänn inte lansering förrän ansvariga signerat relevanta punkter och staging visar godkända tester. Registrera kvarstående beslut och verifieringsresultat med ansvarig och datum. Verifiera även hosted lösenordsskydd/plan, budgetlarm och historiska loggars åtkomst/retention. Bedöm eventuell tidigare exponering utifrån bevis; gamla kodfynd visar inte i sig att en incident inträffat.

## 9. Kontroll och återgång vid kommande utrullning

Kör frontendtester/produktionsbygge, backend Release och säkerhets-, CV-, matchnings- och workspacetester på slutlig kod. CI omfattar Docker, beroendeaudit och secret scan. Testa migrationskedjan på tom lokal databas och med syntetiska äldre data i staging; PGlite utelämnar pg_cron och ersätter inte Supabase-staging.

Före separat godkänd SQL: stäm av schema/ledger, backup/återläsningsväg, avvikelser och ändringsfönster. Bevara RLS/grants, historiska notice-texter och kvitton. Ny behandling kräver ny granskad text och separat aktiveringsbeslut; aktivera aldrig Groq som felsökningsåtgärd. Användarna lämnar själva samtycke.

Efter utrullning: testa två användare och anonym direkt Data API-åtkomst, signup/refresh/logout, anteckningar och export, dokumentens oförändrade expiry efter redigering, gamla revisioner, återkallat samtycke och senaste timrensningen. Kontrollera svenska/engelska, mobil/tangentbord, nonce-CSP och att loggar inte innehåller tokens eller personlig text. Verifiera verklig proxykedja före godkänd ändring av `TRUSTED_PROXY_ADDRESSES`; allmänna limiter är processlokala.

Återgång får inte återaktivera missvisande äldre notice eller ta bort ägarskydd. Pausa vid behov nya AI-anrop genom godkänd operatörsåtgärd och rätta framåt. Bedöm äldre kods samtyckeskrav före rollback. Dokumentera faktiskt observerade resultat separat från kodens avsedda beteende.

## 10. Äldre filstorage — endast berörda installationer

CV-filuppladdning och profilbilder är avvecklade; dagens CV/PDF-generering använder ingen filuppladdning. Migration 005 tar bort gamla profilkolumner och spärrar det äldre `cvs`-bucketet. Kontrollera först vilka objekt som faktiskt finns och vilka användare de tillhör. Schemaändring bevisar inte att binära objekt har raderats.

Efter separat godkännande, radera verifierade legacy-objekt via Supabase Storage API/administrationsflöde, aldrig genom att enbart radera `storage.objects`-rader i SQL. Ta bara bort hela bucketet om allt innehåll omfattas av godkännandet. Tidigare signerade länkar kan gälla fram till utgång eller objektradering. Kontrollera återstående objekt, spärrade gamla endpoints och backuphantering. Kolumn-/objektradering kan inte ångras genom en app-rollback. Ingen sådan radering utfördes vid dokumentuppdateringen.
