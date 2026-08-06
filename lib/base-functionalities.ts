export type BaseFunctionality = {
  key: string;
  label: string;
  description: string;
};

export const IMPLEMENTATION_BASE_FUNCTIONALITIES: readonly BaseFunctionality[] = [
  {
    key: "base:relations",
    label: "Relatiebeheer",
    description: "Beheer interacties met klanten en leveranciers voor duurzame relaties.",
  },
  {
    key: "base:quotes",
    label: "Offertes",
    description: "Maak en beheer gepersonaliseerde offertes met klantspecifieke afspraken.",
  },
  {
    key: "base:orders",
    label: "Orders",
    description: "Registreer en volg klantorders van plaatsing tot aflevering efficiënt.",
  },
  {
    key: "base:invoices",
    label: "Facturen",
    description: "Genereer en verstuur facturen automatisch op basis van orders.",
  },
  {
    key: "base:articles",
    label: "Artikelbeheer",
    description: "Beheer productinformatie, prijzen en voorraadniveaus.",
  },
  {
    key: "base:users",
    label: "Gebruikersbeheer",
    description: "Beheer toegangsrechten en rollen van gebruikers voor veiligheid.",
  },
  {
    key: "base:purchasing",
    label: "Inkopen",
    description: "Beheer voorraden nauwkeurig om overstock en stockouts te voorkomen.",
  },
  {
    key: "base:statistics",
    label: "Statistieken",
    description: "Analyseer bedrijfsgegevens voor betere besluitvorming.",
  },
  {
    key: "base:templates",
    label: "Sjablonen",
    description: "Pas e-mail, offerte, order- en factuursjablonen aan naar wens.",
  },
  {
    key: "base:api",
    label: "API",
    description: "Integreer externe applicaties met het ERP via een flexibele API.",
  },
  {
    key: "base:smart-login",
    label: "Smart Login",
    description: "Veilig en eenvoudig inloggen voor al je administraties.",
  },
];
