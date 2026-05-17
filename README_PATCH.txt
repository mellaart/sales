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
SMART_TRADE_API_BASE_URL=https://retail.troublefree.nl/v3/api
SMART_TRADE_API_TOKEN=<jouw bearer token>
SMART_TRADE_COMPANY_KEY=<jouw company key>
SMART_TRADE_AUTH_MODE=bearer

Voor Basic Auth:
SMART_TRADE_AUTH_MODE=basic
SMART_TRADE_API_TOKEN=username:password

Werking:
1. Nieuw tabblad Assets.
2. Zoek debiteur via GET /api/relations?company[partial]=term.
3. Selecteer debiteur.
4. Haal assets op via GET /api/assets?owner=relationId.
5. Per asset detail via GET /api/assets/{asset}?include=contractAgreements.
6. Toon contractAgreements als modules/diensten.
