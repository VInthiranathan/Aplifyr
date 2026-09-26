# Supabase och EU-GDPR – åtgärdsguide för Aplifyr

Uppdaterad 2026-09-08. Branch: `fix/security-gdpr-audit`.

Senaste samlade migrationsfil: `supabase/migrations/008_privacy_consent_and_limits.sql`. Den är avsedd för ditt befintliga schema och innehåller samtycke, reservationskvoter, ägarskydd och saknade fältgränser. Appens samtyckesflöde, nonce-CSP och övriga kodfixar kräver separat driftsättning av branchen. Följ operatörskommentarerna i SQL-filen innan AI aktiveras.

Du har uppgett att RLS redan är aktiverat för profilen. Det respekteras: avsaknaden i migration 001 bevisar inte en lucka i din drift. Inga produktionsinställningar eller användaruppgifter har ändrats under granskningen. Den här guiden är en teknisk åtgärdsplan, inte ett juridiskt intyg. Hela fyndlistan finns i [granskningsrapporten](security-gdpr-audit-2026-09-08.md).

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

Självserviceexporten hämtar kontoidentitet, profil, sidindelad karriär och favoriter i aktuell webbläsare. Den är **inte ett komplett registerutdrag**: administrativt måste du komplettera med relevanta behandlingsuppgifter/loggar/mottagare och rättighetsinformation. Skicka aldrig lösenordshashar, tokens, privata nycklar eller andra användares uppgifter.

1. Registrera begärans datum, typ och ansvarig. Verifiera identitet proportionerligt, helst via befintlig inloggning; begär inte rutinmässigt ID-kopia.
2. Bekräfta begäran och följ upp normalt inom en månad. Förlängning kan vara möjlig i vissa fall, men måste motiveras och meddelas inom första månaden. [IMY om rättigheter](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/de-registrerades-rattigheter/).
3. Rättelse: profil/karriär kan redigeras; komplettera eventuell felaktig data hos mottagare. Restriktion/invändning kräver beslutad ärendehantering, inte bara borttagning i UI.
4. Radering: kontrollera rättsliga undantag och exakt verifierat användar-UUID/projekt. Börja med ett testkonto i staging. Bekräfta konsekvenser och behörighet före verklig radering.
5. Inventera användarens eventuella legacy-CV/avatarobjekt enligt [retire-file-storage.md](retire-file-storage.md). Ta bort verifierade objekt via Storage API, inte genom att bara radera metadata i SQL. Radera inte en hel bucket om den innehåller andra användares data.
6. Radera kontot via Supabase Auths administratörsflöde efter målbekräftelse. Kontrollera cascade för profiles/career. Auth-radering återkallar inte omedelbart redan utfärdade JWT:er; hantera giltighetstiden och använd sessionskontroll för känsliga operationer. Testa både gamla token och refresh samt att åtkomst faktiskt upphör. [Supabase användarhantering](https://supabase.com/docs/guides/auth/managing-user-data).
7. Rensa berörda lokala favoriter på tillgängliga enheter och informera om andra webbläsare/nedladdade brev. Begär radering hos relevanta leverantörer och följ upp bekräftelse.
8. Dokumentera backupers utfasning och en rutin som återapplicerar raderingar vid återläsning. Bevara bara nödvändigt ärendebevis med beslutad retention. Meddela vad som raderats och eventuella lagliga undantag; påstå inte omedelbar radering från alla backups.

Ingen automatisk konto-raderingsendpoint har införts: berörda produktionssystem och raderingsomfattning måste först verifieras.

## 6. Avtal, EU/EES och extern AI

Lämna `AI_ALLOWED_PROVIDERS` tom tills varje aktiverad leverantör är bedömd. Dokumentera Supabase, hosting, e-post och AI: roll, avtal/biträdesavtal där tillämpligt, underbiträden, data, supportåtkomst, länder, retention, träning och radering. EU-region utesluter inte tredjelandsåtkomst. Bedöm aktuell överföringsmekanism, exempelvis tillämpligt adekvansbeslut eller SCC med kompletterande bedömning/skydd; ett regionval är inte hela lösningen. [IMY om överföringar](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/overforing-till-tredje-land/).

Jobbdetaljen har nu ett explicit val av högst tre karriärposter: endast typ, titel, organisation, datum och färdigheter skickas. Övrig karriärfritext skickas inte. Samtycke krävs per leverantör. Undvik känsliga fritextuppgifter; bedöm särskilda krav om sådana faktiskt behandlas.

## 7. Retention, incidenter och konsekvensbedömning

Besluta för varje datatyp: ansvarig, ändamål, lagringstid/kriterium, gallringstrigger, utförande och verifiering. Omfatta aktiva/inaktiva konton, karriär, lokala favoriter, AI-leverantörer, loggar, rättighetsärenden och backups. Lägg inte in godtyckliga tidsfrister som påstått lagkrav.

Utse incidentansvarig och eskaleringsväg. Utred och dokumentera incidenter; anmäl till IMY inom 72 timmar från vetskap när anmälningsskyldighet föreligger, och informera berörda vid hög risk enligt tillämpliga regler. Kodfynd är inte i sig bevis på en inträffad incident. [IMY incidenter](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/personuppgiftsincidenter/).

Dokumentera DPIA-screening för profilering/AI. Genomför konsekvensbedömning om sannolik hög risk föreligger; pröva på nytt om systemet börjar fatta betydande beslut om kandidater. [IMY konsekvensbedömning](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/konsekvensbedomning/).

## 8. Kvarstående kod- och driftarbete – inte dolt som klart

Kod för cache-/poolgränser, tydliga upstream-fel, nonce-CSP, fokusfällor, AI-instruktionsseparation, valda karriärfakta och konfigurerbar e-postkontakt är nu införd. Migration 008 inför samtycke och distribuerad AI-begränsning. Kvar före produktion: normal CI/Docker-gate, belastnings-/webbläsartest i staging, hosted Supabase/Auth, avtal, rättsliga grunder, fullständiga notice-texter, retention och fungerande organisatoriska rutiner. Detta kan inte lösas genom SQL eller användarsamtycke ensamt.

Godkänn inte lansering förrän ansvariga signerat relevanta punkter och staging visar godkända tester. Använd granskningens ID:n i ärenden för att följa upp kvarstående arbete.

## 9. Härdning 2026-09-26 – förberedd utrullning

Kod och migration är förberedda i en separat arbetskopia. Produktionsdatabas, samtyckesaktivering, lösenordsskydd och Render/Vercel har inte ändrats i detta arbete. Tidigare datum/status ovan är historiska. Nuvarande migrationsfil är `20260926051754_security_hardening_and_document_revisions.sql`.

### Ordning och beslut

1. Granska och versionshantera kodändringen enligt repositoryts regler. Ingen branch, commit, push eller merge ingår utan uttryckligt uppdrag. Kör befintlig CI samt nya `security.yml` före merge. Bekräfta staging, backup/återläsningsväg och ändringsfönster innan produktions-SQL.
2. Stäm av migrationshistoriken läsande. Produktion registrerar ansökningstrackern som `20260923152826`; repositoryt använder `20260923122723`. Den tidigare manuella 008-uppgraderingen registreras som `20260909045349`. Jämför registrerad SQL, schema, policies och funktioner med filerna. Dokumentera motsvarigheten innan en separat godkänd ledger-reparation. Kör inte om 001–009 eller byt migrationsidentitet på antagande. Använd inte blind `supabase db push` mot denna historik.
3. Testa hela migrationskedjan på tom lokal databas och uppgradering med syntetiska äldre data i staging. Kontrollera att de två constraintavvikelserna fortfarande är noll med frågorna i avsnitt 2. Den läsande förkontrollen 2026-09-26 gav noll för båda. Ny migration validerar dem och avbryter atomiskt vid fel; den raderar eller kapar inte data. Räkna även befintliga ansökningar per konto utan att exportera innehållet.
4. Efter uttryckligt godkännande: kör enbart den nya granskade migrationen i rätt Supabase-projekt och registrera dess exakta version. Den återkallar överflödiga grants, lägger till index, validerar constraints, inför ansökningskvot samt nya CV-/samtyckes-RPC:er. Låsgränsen är 5 sekunder och frågegränsen 60 sekunder; vid timeout utred belastningen, stäng inte av skydd blint. Äldre RPC:er finns kvar för kompatibilitet under utrullningen.
5. Granska svensk/engelsk notice `2026-09-documents-v2` i migrationen. Den beskriver den faktiska sjudagarslagringen men är uttryckligen en utvecklingstext med saknad kontaktadress. Slutför operatörens uppgifter och leverantörsbedömning före publik lansering. Vid separat godkänd aktivering: inaktivera äldre Gemini-notice och aktivera den nya i samma transaktion. Ändra aldrig redan accepterad text. Ge inte någon användare samtycke; användarna måste själva godkänna den nya versionen. Aktivera inte Groq.
6. Driftsätt godkänd frontend/backend tillsammans efter migrationen. Koden kräver den nya notice-versionen; före aktivering blockeras generering avsiktligt. Det tidigare miljövärdet `GEMINI_CV_NOTICE_VERSION` används inte längre. Om den nya texten aktiveras före koden måste den korta övergången kontrolleras; om koden kommer först är AI tillfälligt otillgänglig. Planera ett underhållsfönster för ett konsekvent byte. Gamla klienters samtycken görs inte automatiskt giltiga.
7. Verifiera den verkliga proxykedjan innan separat godkänd konfiguration av `TRUSTED_PROXY_ADDRESSES`. Endast verifierade direkta proxy-IP:n får anges; koden litar inte på godtyckligt `X-Forwarded-For`. Utan detta kan många användare dela en proxy-IP:s publika/pre-auth-gräns. Dokumentgränser efter verifierad identitet är användarspecifika. Testa legitim samtidighet och missbruk i staging; allmänna limiter är fortfarande processlokala.
8. Slå på Supabase Auths skydd mot läckta lösenord efter godkänd hosted Auth-ändring. Kontrollera först projektets plan/tillgänglighet; eventuell betald uppgradering kräver eget beslut. Verifiera därefter Security Advisor och syntetisk registrering/lösenordsåterställning. Lokal kod eller `config.toml` bevisar inte att hosted-skyddet är aktivt.

### Kontroll efter utrullning

- Verifiera grants: authenticated saknar TRUNCATE/TRIGGER/REFERENCES för profiles/career och saknar åtkomst till kvoträknaren. Befintlig owner-CRUD och signup-trigger fungerar.
- Med två syntetiska användare och anon-klient: kontrollera direkt Data API-isolation, nya privata HTTP-rutter, dokumentläsning/radering och export. Service-role är inte ett isolationstest.
- Generera ett syntetiskt CV, redigera direkt med returnerad revision, få 409 för en gammal revision och kontrollera oförändrad expiry efter redigering. Testa brev separat.
- Kontrollera att gammalt/återkallat samtycke blockerar nästa provideranrop, att den nya texten visas före nytt godkännande och att profil/jobbsökning fungerar utan AI.
- Verifiera ansökningslista, status och export över 500 poster i staging. Testa direkt insert vid 1 000-gränsen, idempotent dublett, radering och konto-cascade. Inga verkliga konton fylls med testposter.
- Testa tokenrefresh, utloggning, svensk/engelsk integritetssida och nonce-CSP i riktig webbläsare. Kontrollera att frontend/backend loggar inte innehåller tokens, profiltext eller dokument.
- Kontrollera senaste lyckade timrensningen, giltighetspolicies och att genereringsfel inte förlänger dokument. Den läsande granskningen såg tre lyckade senaste cron-körningar; det ersätter inte kontroll efter ändringen.

Återgång: återkalla inte datagränser eller återaktivera missvisande transient-text för att få generering att fungera. Vid problem, pausa ny AI-generering genom godkänd operatörsåtgärd, behåll sparade dokument/ägarskydd och rätta framåt. En rollback av appen måste särskilt granskas eftersom äldre kod kan acceptera äldre samtyckesversioner.

### Fyndens status

| Fynd | Förberedd åtgärd | Kvar i drift |
|---|---|---|
| F1 samtycke | Ny korrekt lagringsbeskrivning och strikt versionskontroll i varje reservation | Granskning/aktivering och nytt användarsamtycke |
| F2 anropsgränser | Verifierad användare, separata trafikklasser och begränsad Auth-kapacitet | Proxykontroll och belastningsprov |
| F3 grants | Riktad återkallelse i migration | Körning och efterkontroll |
| F4 auth-paket | `@supabase/ssr`, gemensam serverklient och refresh-regression | Hosted login/refresh-prov |
| F5 CV-revision | RPC returnerar faktisk sparad revision | Migration och verkligt generera–redigera-prov |
| F6/F7 ansökningar | Full sidindelning och atomisk databaskvot | Migration och Data API-prov |
| F8 nya rutter | Auth som standard, explicit publik metadata | Normal deploy/HTTP-prov |
| F9 lösenord | Operatörssteg specificerat ovan | Hosted-inställning och eventuell planfråga |
| F10 tester | Databas-, HTTP-, limiter-, pagination- och cookie-regression; security-CI | Hosted CI och full stagingkedja |
| F11 ansvar | Gemensam auth/pagination/validering; separata CV-, brev- och matchningstjänster; uppdelade hem-/sök-/jobbflöden | Hosted kontroll av oförändrade flöden efter godkänd deploy |
| F12 driftavvikelser | Index/constraint/policy-migration samt dokumenterad ledger-avvikelse | Verifierad historikavstämning och migration |

### Lokal verifiering av härdningen

Frontend: 88 tester passerade, inklusive uppgradering i PGlite, direktkvoter, 601-posters export, ägarfilter och sessionsförnyelse; produktionsbygget passerade. Backend: Release-build utan varningar/fel, 27 autentiseringsgränsfall samt separata tester av verklig lokal HTTP-routing, limiter, samtyckesreservation och ägarbunden dokumenttransport passerade. Dessutom passerade 93 CV-kontroller och 16 matchningsregressioner. npm:s produktionsaudit och NuGets transitiva audit rapporterade inga kända sårbarheter vid körningen.

PGlite-kedjan kör alla föregående schemamigrationer med syntetiska legacy-data; pg_cron-delen kan inte köras i PGlite och utelämnas. Detta är inte en full Supabase-stagingmiljö. GitHub Actions/secret-skanningen, Docker, verkliga provideranrop och autentiserade produktionsflöden har inte körts som del av denna härdning. De måste verifieras vid godkänd utrullning.

### Publicerad granskningsbranch och fortsatt uppdelning

Ändringarna publiceras på `fix/architecture-security-hardening` i utkast-PR #31. Det innebär inte merge till main. Första PR-körningen hade godkända backend-/Docker-/säkerhetskontroller och 88 frontendtester men frontendbygget stoppades av en saknad `safeHtml`-import efter en sen importändring. Importen har återställts; saneringen behålls. Uppdelningen av controllers och sidflöden kräver nya tester/bygge på den uppdaterade committen, inte återanvändning av det tidigare byggresultatet.

Lokal kontroll efter uppdelningen: 89 frontendtester, TypeScript och frontendens produktionsbygge passerade. Backendens Release-build samt säkerhets-, 93 CV- och 16 matchningskontroller passerade. Säkerhetstestet provar också faktisk HTTP-routing och dependency injection för de nya CV-/brev-/matchningstjänsterna med syntetiska ogiltiga indata. Ett nytt hook-test kontrollerar att ett gammalt söksvar inte skriver över ett nyare. Jobb- och CV-rutterna laddas även med require(ESM) avstängt. Ny hosted CI ska verifieras på den publicerade uppföljningscommitten.
