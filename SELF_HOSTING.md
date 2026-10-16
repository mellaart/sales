# Smart Trade Sales op eigen server

Deze app kan zonder Supabase draaien wanneer de Supabase environment variables niet zijn ingevuld. De app gebruikt dan:

- PostgreSQL op dezelfde server
- lokale sessies en wachtwoorden
- lokale bestandsopslag voor Worldline-documenten en instellingen

## Environment

Zet op de server in `.env.local`:

```env
PGHOST=/var/run/postgresql
PGDATABASE=sales_troublefree_nl
PGUSER=sales.troublefree.nl
LOCAL_STORAGE_ROOT=/hosting/sales.troublefree.nl/apps/sales/storage
SALES_BOOTSTRAP_ADMIN_EMAIL=erik@smarttrade.nl
SALES_BOOTSTRAP_ADMIN_PASSWORD=vul-hier-een-tijdelijk-wachtwoord-in
```

Laat deze Supabase variabelen leeg of verwijder ze op de eigen server:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Eerste login

Als er nog geen gebruikers in de lokale database staan, wordt bij de eerste login automatisch een admin aangemaakt voor `SALES_BOOTSTRAP_ADMIN_EMAIL`.

Log daarna in met:

- e-mail: `erik@smarttrade.nl`
- wachtwoord: de waarde van `SALES_BOOTSTRAP_ADMIN_PASSWORD`

Wijzig daarna het wachtwoord in de app en verwijder `SALES_BOOTSTRAP_ADMIN_PASSWORD` uit `.env.local`.

## Wachtwoord vergeten

Gebruikers kunnen op het inlogscherm zelf een herstelmail aanvragen. Dit gebruikt dezelfde
server-mailvoorziening als de maandagse dealmail, niet de Outlook-koppeling:

```env
SALES_NOTIFICATION_FROM_EMAIL=notifications@sales.troublefree.nl
SALES_SENDMAIL_PATH=/usr/sbin/sendmail
SALES_PUBLIC_URL=https://sales.troublefree.nl
```

De herstelpagina moet via HTTPS bereikbaar zijn. Links verlopen na 30 minuten en zijn
eenmalig te gebruiken. Per e-mailadres worden maximaal drie mails per uur aangevraagd,
met minimaal twee minuten ertussen. De knop bevestigt nooit of een account bestaat.
Na herstel worden bestaande sessies en vertrouwde apparaten ingetrokken; 2FA blijft actief.
Bij een mailserverfout wordt een melding zonder persoonsgegevens in de serverlog gezet.
De benodigde tabellen worden automatisch toegevoegd; bestaande accounts blijven behouden.

Testen zonder productiegegevens of echte e-mails: `npm run test:password-reset`.

## Outlook-concepten

Voor de knop `Klaarzetten in Outlook` is een Microsoft Entra-appregistratie nodig. Voeg aan
`.env.local` toe:

```env
MICROSOFT_OUTLOOK_TENANT_ID=vul-hier-de-tenant-id-in
MICROSOFT_OUTLOOK_CLIENT_ID=vul-hier-de-application-client-id-in
MICROSOFT_OUTLOOK_CLIENT_SECRET=vul-hier-het-client-secret-in
SALES_OUTLOOK_ENCRYPTION_KEY=vul-hier-een-lange-willekeurige-sleutel-in
```

Registreer deze redirect-URI als `Web`:

```text
https://sales.troublefree.nl/api/outlook/callback
```

Geef de app de gedelegeerde Microsoft Graph-machtiging `Mail.ReadWrite`. De app maakt
uitsluitend een conceptbericht; verzenden blijft een bewuste handeling in Outlook.

## Automatische incasso

Voor digitale machtigingen voor automatische incasso voeg je toe:

```dotenv
SALES_SEPA_CREDITOR_NAME=Troublefree B.V.
SALES_SEPA_CREDITOR_ID=vul-hier-de-officiele-incassant-id-in
```

## Data

De database-tabellen worden automatisch aangemaakt bij de eerste server-aanroep. Documenten worden opgeslagen onder:

```text
/hosting/sales.troublefree.nl/apps/sales/storage
```

Maak van zowel PostgreSQL als deze map een back-up.

## Supabase import

Zet de Supabase gegevens tijdelijk in de shell en start daarna de import:

```sh
export SUPABASE_URL="https://..."
export SUPABASE_SERVICE_ROLE_KEY="..."
npm run import:supabase
unset SUPABASE_URL
unset SUPABASE_SERVICE_ROLE_KEY
```

De import neemt `profiles`, `deals`, `worldline_projects`, `worldline_documents`, prijsinstellingen,
rolrechten en Worldline-documentbestanden mee. Bestaande lokale gebruikers worden gekoppeld op e-mailadres,
zodat `erik@smarttrade.nl` admin blijft en oude deals naar de juiste lokale gebruiker verwijzen.

## Automatische deploy via cron

De server kan automatisch nieuwe versies van `main` ophalen en live zetten. Het deployscript staat in:

```text
/hosting/sales.troublefree.nl/apps/sales/scripts/deploy-production.sh
```

Het script doet alleen iets wanneer `origin/main` nieuwer is dan de versie op de server. Bij een nieuwe versie voert het uit:

- `git pull --ff-only`
- `npm install --no-package-lock`
- `npm run build`
- app herstarten op poort `3007`
- healthcheck op `http://127.0.0.1:3007`

Eerste keer testen op de server:

```sh
cd "$HOME/apps/sales"
git pull
chmod +x scripts/deploy-production.sh
scripts/deploy-production.sh
```

Cronregel toevoegen:

```sh
crontab -e
```

Voeg deze regel toe om elke 2 minuten te controleren op een nieuwe versie:

```cron
*/2 * * * * /hosting/sales.troublefree.nl/apps/sales/scripts/deploy-production.sh >/dev/null 2>&1
```

Logs staan hier:

```text
/hosting/sales.troublefree.nl/logs/sales-deploy.log
/hosting/sales.troublefree.nl/logs/sales-next.log
```

Wanneer `git pull` al is uitgevoerd maar de app nog niet opnieuw is gebouwd of gestart, kun je een deploy forceren:

```sh
cd "$HOME/apps/sales"
scripts/deploy-production.sh --force
```


## Automatische verhoging gebruikers in admintool

`ADMIN_TOOL_API_TOKEN` staat uitsluitend in `.env.local` op de server. Gebruik nooit
`NEXT_PUBLIC_` voor deze sleutel. Na een wijziging herbouwt/herstart de bestaande deploy de app.

Nieuwe online of telefonische akkoorden op bestaande-klantuitbreidingen zetten een
opdracht in `app_settings` onder `admin-tool-license:<deal-id>`, in dezelfde transactie
als het akkoord. Alleen maandelijkse regels “Gebruikers / Smart Trade <pakket> Extra
gebruiker” tellen mee. Chauffeurs, support, planningsapp, nieuwe implementaties en
historische akkoorden worden niet opgehoogd. Een deal wordt maximaal eenmaal verwerkt;
maak voor een latere aanvullende verkoop een nieuwe deal.

De app zoekt de administratienaam uit de laatste haakjes van bestaande assets in het
`company`-veld van alle pagina's van GET `/api/companies`. Ze schrijft het huidige
`system_max_users` plus het verkochte aantal via PUT `/api/companies/<id>` en leest
het resultaat terug. Status en oude/nieuwe limiet staan bij “Assets aanmaken” in de deal.
De bestaande beveiligde klantformulier-cron herhaalt nog niet gestarte opdrachten
iedere tien minuten. Er is geen extra cron-secret nodig.

Vóór PUT worden doelwaarde en een blijvende bedrijfsvergrendeling opgeslagen.
`applying` na een onderbreking en `review` na een onduidelijk antwoord worden NOOIT
automatisch opnieuw verstuurd. Controleer dan eerst het logboek van de admintool
tegen `companyId`, `previous`, `target` en het deal-ID in de opgeslagen opdracht.
Pas nadat de daadwerkelijke verwerking is vastgesteld, kan een beheerder de opdracht
als `synced` afsluiten en de bijbehorende `admin-tool-company-lock:<company-id>`
verwijderen. Als aantoonbaar niets is verwerkt, kan de opdracht terug naar `pending`
en de vergrendeling worden verwijderd. Doe beide wijzigingen samen in een transactie.
Een blokkade houdt volgende verkopen voor dat bedrijf tegen; andere bedrijven gaan door.

De API ondersteunt voor zover gedocumenteerd geen conditionele update of atomische
verhoging. De app serialiseert eigen verkopen per bedrijf, maar gelijktijdige handmatige
limietwijzigingen in de admintool zijn daarmee niet beschermd. Voer die niet tegelijk
uit met automatische verwerking; voor volledige bescherming is API-ondersteuning voor
conditionele/atomische wijzigingen nodig.
