# Smart Trade prijs calculator v8

Versie 8 voegt rolgebaseerde toegang toe bovenop de calculator, offerteflow, deal-opslag en login uit v7.

## Rollen

- `sales`: ziet en beheert alleen eigen deals
- `manager`: ziet, wijzigt en verwijdert alle deals
- `admin`: alles van manager plus rolbeheer via `/admin`

## Setup

1. Installeer dependencies:
   `npm install`
2. Vul `.env.local` met:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SMART_TRADE_API_BASE_URL` (voor Troublefree bijvoorbeeld `https://my9.troublefree.nl/v3/api`)
   - `SMART_TRADE_API_USER` (Basic Auth gebruikersnaam)
   - `SMART_TRADE_API_PASSWORD` (Basic Auth wachtwoord)
   - `SMART_TRADE_COMPANY` (meestal `troublefree`)
3. Run `supabase/schema.sql` in Supabase SQL Editor
4. Zet Email auth aan in Supabase
5. Start lokaal met `npm run dev`

## Troublefree API-koppeling (pull)

Deze app heeft al server-side API-routes voor het ophalen van gegevens uit Troublefree met Basic Auth + `company` header:

- `GET /api/smart-trade/relations/search?query=<term>`
- `GET /api/smart-trade/relations/<relationId>`
- `GET /api/smart-trade/assets/by-relation?relationId=<relationId>`

Praktisch testpad in de UI:

- `/api-koppeling-test`
- `/testen`

## Belangrijk

- Nieuwe users krijgen automatisch een profiel met rol `sales`
- Alleen admins mogen rollen wijzigen in `profiles`
- RLS bepaalt welke deals zichtbaar en bewerkbaar zijn

## Wijziging: geen totalen

Deze build toont geen korting, correctie maandprijs, contractduur of TCV meer in de UI/PDF. Focus ligt op maandprijs en implementatie.
