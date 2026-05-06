# Versie 9 - Offertegenerator

Gebaseerd op v8.6.2.

Vervang:
- components/price-calculator.tsx
- lib/pdf.ts
- app/globals.css

Voeg toe:
- lib/offer-template.ts

Nieuw:
- PDF export is nu een echte offerte-opbouw zoals de voorbeeldmail/PDF.
- Vaste teksten voor:
  - Functionaliteiten / pakketkeuze
  - Support
  - Smart Trade maandtarief
  - Implementatie
  - Financieel pakket
  - Consultancy
  - Hardware
  - Tot slot
- Tabellen voor licentie, support en extra modules.
- Starter is standaard geselecteerd.
- BTW-toggle is verwijderd.
- Aanbevolen-badge is verwijderd.
- PDF-knop heet nu 'Maak offerte-PDF'.

Let op:
- De PDF blijft jsPDF gebruiken. Dit is robuust in Next.js, maar nog geen HTML-to-PDF renderer.
- Logo/beeldmerk kan in v9.1 toegevoegd worden.
