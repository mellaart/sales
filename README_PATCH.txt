# V11 - Assets / upsell API patch

Vervang:
- components/app-shell.tsx

Voeg toe:
- lib/smart-trade-api.ts
- app/api/smart-trade/relations/search/route.ts
- app/api/smart-trade/assets/by-relation/route.ts
- app/assets/page.tsx
- components/assets-dashboard.tsx

CSS:
- Voeg de inhoud van app/globals.assets.css onderaan app/globals.css toe.

Environment variables lokaal en in Vercel:
SMART_TRADE_API_BASE_URL=https://my.troublefree.nl/v3/api
SMART_TRADE_API_TOKEN=<jouw bearer token>
SMART_TRADE_COMPANY_KEY=troublefree
SMART_TRADE_AUTH_MODE=bearer
# Let op: als je SMART_TRADE_API_TOKEN gebruikt blijft default auth bearer,
# ook als de token een : bevat. Zet SMART_TRADE_AUTH_MODE alleen expliciet naar basic indien nodig.

Voor Basic Auth (Troublefree):
SMART_TRADE_API_BASE_URL=https://retail.troublefree.nl/v3/api
SMART_TRADE_AUTH_MODE=basic
SMART_TRADE_API_TOKEN=username:password
# of
SMART_TRADE_API_USER=<jouw gebruiker>
SMART_TRADE_API_PASSWORD=<jouw wachtwoord>

Werking:
1. Nieuw tabblad Assets.
2. Zoek debiteur via GET /api/relations?company[partial]=term.
3. Selecteer debiteur.
4. Haal assets op via GET /api/assets?owner=relationId.
5. Per asset detail via GET /api/assets/{asset}?include=contractAgreements.
6. Toon contractAgreements als modules/diensten.
