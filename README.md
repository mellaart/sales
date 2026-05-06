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
3. Run `supabase/schema.sql` in Supabase SQL Editor
4. Zet Email auth aan in Supabase
5. Start lokaal met `npm run dev`

## Belangrijk

- Nieuwe users krijgen automatisch een profiel met rol `sales`
- Alleen admins mogen rollen wijzigen in `profiles`
- RLS bepaalt welke deals zichtbaar en bewerkbaar zijn


## Wijziging: geen totalen
Deze build toont geen korting, correctie maandprijs, contractduur of TCV meer in de UI/PDF. Focus ligt op maandprijs en implementatie.
