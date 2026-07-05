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
