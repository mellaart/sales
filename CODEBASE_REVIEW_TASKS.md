# Codebase review: voorgestelde taken

## 1) Typfout/UI-tekst verbeteren
**Taak:** wijzig labeltekst `Relation kiezen` naar `Relatie kiezen` op de API-testpagina.

- **Waarom:** de huidige tekst gebruikt een Engels/Nederlands mengvorm en oogt als typfout voor Nederlandstalige gebruikers.
- **Impact:** betere UX-consistentie en professionelere copy.
- **Locatie:** `app/api-koppeling-test/page.tsx` (label bij relation selector).

## 2) Bugfix: lege zoekopdracht blokken op relation-search endpoint
**Taak:** voeg validatie toe zodat een lege `query` (na trimmen) een `400` teruggeeft in plaats van een volledige dataset-opvraag.

- **Waarom:** `searchRelations` wordt ook bij lege input aangeroepen; met `per_page=5000` kan dit onnodige load en trage respons veroorzaken.
- **Impact:** voorkomt dure requests, vermindert latency en API-belasting.
- **Locatie:** `app/api/smart-trade/relations/search/route.ts` en eventueel client-side guard in `app/api-koppeling-test/page.tsx`.

## 3) Documentatie-discrepantie oplossen
**Taak:** harmoniseer package-manager instructies in `README.md` met de repository-configuratie (er is een `pnpm-lock.yaml` en `pnpm-workspace.yaml`, terwijl README `npm install`/`npm run dev` noemt).

- **Waarom:** nieuwe developers kunnen de verkeerde tooling gebruiken.
- **Impact:** sneller onboarden, minder setup-fouten.
- **Locatie:** `README.md` (Setup-sectie).

## 4) Testverbetering: datumgrens-gedrag module-activiteit
**Taak:** voeg unit tests toe voor `isModuleActive` met randgevallen:
- `endsAt = null` (moet actief zijn),
- ongeldige datumstring,
- datum exact op `Date.now()`,
- datum net in verleden/toekomst,
- expliciete timezone-input.

- **Waarom:** actieve/inactieve modulestatus drijft UI en samenvattingscijfers; regressies zijn hier snel zichtbaar voor gebruikers.
- **Impact:** betrouwbaardere businesslogica rond contractstatus.
- **Locatie:** `lib/smart-trade-api.ts` (eventueel helper exporteren voor testbaarheid) + nieuw testbestand.
