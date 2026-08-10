export const WORLDLINE_RETURN_PIN_ACCEPTANCE_VERSION = "2026-08-10-v1";

export const WORLDLINE_RETURN_PIN_RESPONSIBILITY_PARAGRAPHS = [
  "Troublefree B.V. zal de functionaliteit voor retourpinnen inschakelen op basis van de door de klant aangeleverde instellingen en gebruikersgegevens. Retourpintransacties worden mogelijk gemaakt binnen de voorwaarden en kaders die de klant met zijn transactieverwerker is overeengekomen. De klant is verantwoordelijk voor de juistheid en volledigheid van de aangeleverde gegevens en voor het naleven van de afspraken met de transactieverwerker.",
  "Om de klant te ondersteunen bij het beperken van de risico's rondom retourpinnen, past Troublefree B.V. in de software beperkingen toe op gebruikers en pinapparaten, in overeenstemming met de instellingen en limieten die de klant in het formulier heeft opgegeven. Daarnaast stelt Troublefree B.V. notificaties en rapportages beschikbaar ter ondersteuning van het voorkomen en signaleren van fraude. Deze beperkingen en hulpmiddelen verkleinen de kans op onbevoegd gebruik, maar kunnen fraude of misbruik niet volledig voorkomen. De klant is verantwoordelijk voor het correct gebruiken van deze hulpmiddelen en voor het regelmatig controleren van retourpintransacties en de beschikbare rapportages.",
  "Na ingebruikname blijft de klant verantwoordelijk voor het beheer en de actualiteit van de gebruikersrechten, instellingen en limieten. Hieronder valt onder meer het tijdig aanpassen of intrekken van rechten bij functiewijzigingen, uitdiensttreding of andere wijzigingen binnen de organisatie. De klant is daarnaast verantwoordelijk voor het zorgvuldig beheren van pincodes en inloggegevens en voor het voorkomen dat onbevoegde personen toegang krijgen tot de functionaliteit voor retourpinnen.",
  "Troublefree B.V. is niet aansprakelijk voor fraude, misbruik of daaruit voortvloeiende schade voor zover deze ontstaat doordat de klant de ingestelde gebruikersrechten, pinapparaten en limieten niet na ingebruikname heeft gecontroleerd, instellingen niet juist of niet tijdig heeft laten aanpassen, transacties of rapportages onvoldoende heeft gecontroleerd, of pincodes en inloggegevens onzorgvuldig heeft beheerd. Dit geldt niet voor zover de schade het rechtstreekse gevolg is van opzet of bewuste roekeloosheid van Troublefree B.V. of voor zover aansprakelijkheid op grond van dwingend recht niet kan worden uitgesloten.",
] as const;

export const WORLDLINE_RETURN_PIN_ACCEPTANCE_TEXT =
  "De ondertekenaar verklaart de hierboven vermelde instellingen, verantwoordelijkheden en aansprakelijkheidsbepalingen te hebben gelezen, begrepen en geaccepteerd. Tevens geeft de ondertekenaar opdracht tot het activeren van retourpinnen en verklaart hij of zij bevoegd te zijn om deze opdracht te verstrekken.";

export type WorldlineReturnPinStatus = "open" | "accepted" | "revoked";

export type WorldlineReturnPinUser = {
  id: string;
  name: string;
  pinCode: string;
};

export type WorldlineReturnPinFormData = {
  companyName: string;
  email: string;
  phone: string;
  maxTransactionAmount: string;
  maxDailyAmount: string;
  notificationThreshold: string;
  notificationEmail: string;
  authorizedUsers: WorldlineReturnPinUser[];
  acceptancePlace: string;
  acceptedByName: string;
  acceptedByFunction: string;
};

export type WorldlineReturnPinEvidence = {
  acceptedAt: string;
  acceptedByName: string;
  acceptedByFunction: string;
  acceptedPlace: string;
  ipAddress: string;
  userAgent: string;
  acceptanceVersion: string;
  evidenceHash: string;
};

export type WorldlineReturnPinFormSummary = {
  id: string;
  projectId: string;
  version: number;
  status: WorldlineReturnPinStatus;
  formData: WorldlineReturnPinFormData;
  publicUrl: string;
  expiresAt: string;
  acceptedAt: string | null;
  evidence: WorldlineReturnPinEvidence | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicWorldlineReturnPinForm = Omit<
  WorldlineReturnPinFormSummary,
  "projectId" | "publicUrl" | "evidence"
> & {
  customerName: string;
};

export const EMPTY_WORLDLINE_RETURN_PIN_FORM_DATA: WorldlineReturnPinFormData = {
  companyName: "",
  email: "",
  phone: "",
  maxTransactionAmount: "",
  maxDailyAmount: "",
  notificationThreshold: "",
  notificationEmail: "",
  authorizedUsers: [],
  acceptancePlace: "",
  acceptedByName: "",
  acceptedByFunction: "",
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeUser(value: unknown, index: number): WorldlineReturnPinUser | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const name = text(source.name, 180);
  const pinCode = text(source.pinCode, 24).replace(/\s/g, "");
  if (!name && !pinCode) return null;

  return {
    id: text(source.id, 80) || `user-${index + 1}`,
    name,
    pinCode,
  };
}

export function normalizeWorldlineReturnPinFormData(value: unknown): WorldlineReturnPinFormData {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const users = Array.isArray(source.authorizedUsers)
    ? source.authorizedUsers
        .slice(0, 16)
        .map(normalizeUser)
        .filter((user): user is WorldlineReturnPinUser => Boolean(user))
    : [];

  return {
    companyName: text(source.companyName, 180),
    email: text(source.email, 320).toLowerCase(),
    phone: text(source.phone, 80),
    maxTransactionAmount: text(source.maxTransactionAmount, 40),
    maxDailyAmount: text(source.maxDailyAmount, 40),
    notificationThreshold: text(source.notificationThreshold, 40),
    notificationEmail: text(source.notificationEmail, 320).toLowerCase(),
    authorizedUsers: users,
    acceptancePlace: text(source.acceptancePlace, 120),
    acceptedByName: text(source.acceptedByName, 180),
    acceptedByFunction: text(source.acceptedByFunction, 180),
  };
}

function validAmount(value: string) {
  const compact = value.replace(/\s/g, "");
  return /^(?:\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[,.]\d{1,2})?)$/.test(compact);
}

export function validateWorldlineReturnPinFormData(formData: WorldlineReturnPinFormData) {
  if (!formData.companyName) return "Vul de bedrijfsnaam in.";
  if (!/^\S+@\S+\.\S+$/.test(formData.email)) return "Vul een geldig e-mailadres in.";
  if (formData.phone.replace(/\D/g, "").length < 6) return "Vul een geldig telefoonnummer in.";
  if (!validAmount(formData.maxTransactionAmount)) {
    return "Vul een geldig maximaal bedrag per retourpintransactie in.";
  }
  if (!validAmount(formData.maxDailyAmount)) return "Vul een geldig maximaal totaalbedrag per dag in.";
  if (!validAmount(formData.notificationThreshold)) return "Vul een geldig notificatiebedrag in.";
  if (!/^\S+@\S+\.\S+$/.test(formData.notificationEmail)) {
    return "Vul een geldig e-mailadres voor notificaties in.";
  }
  if (formData.authorizedUsers.length === 0) return "Voeg minimaal een geautoriseerde gebruiker toe.";

  for (const [index, user] of formData.authorizedUsers.entries()) {
    if (!user.name) return `Vul de naam van geautoriseerde gebruiker ${index + 1} in.`;
    if (!/^\d{4,12}$/.test(user.pinCode)) {
      return `Vul voor geautoriseerde gebruiker ${index + 1} een pincode van 4 tot 12 cijfers in.`;
    }
  }

  if (!formData.acceptancePlace) return "Vul de plaats van goedkeuring in.";
  if (!formData.acceptedByName) return "Vul de naam van de tekenbevoegde in.";
  if (!formData.acceptedByFunction) return "Vul de functie van de tekenbevoegde in.";
  return "";
}
