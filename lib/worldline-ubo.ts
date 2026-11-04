import type { WorldlineAgreementFields } from "./worldline";

type Person = { name: string; firstName: string; lastName: string; birthDate: string; birthPlace: string; nationality: string };
type Entity = { name: string; kvk: string; address: string; owner?: Person & { kvk: string }; directors: Person[] };
export type UboPrefill = { text: Record<string, string>; checks: Record<string, string>; warnings: string[] };

const compact = (value: string) => value.replace(/\s+/g, " ").trim();
const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const labels = "Statutaire naam|Statutaire zetel|Handelsnaam|Startdatum onderneming|Naam|Geboortedatum|Geboorteplaats|Nationaliteit|Bezoekadres|Postadres|Privéadres|Woonadres|Ingeschreven onder|Enig aandeelhouder|Datum in functie|Titel|Bevoegdheid|E-mailadres|Telefoonnummer|Datum vestiging|Activiteiten|Werkzame personen|Gegevens zijn vervaardigd";
function value(text: string, label: string) {
  return compact(text.match(new RegExp(`(?:^|\\s)(?:${label})\\s*:?\\s*(.*?)(?=\\s*(?:${labels})|$)`, "i"))?.[1] ?? "");
}
function person(text: string): Person {
  const name = value(text, "Naam");
  const parts = name.split(",").map(compact);
  return {
    name, firstName: parts.length === 2 ? parts[1] : "", lastName: parts.length === 2 ? parts[0] : name,
    birthDate: text.match(/Geboortedatum\s*:?\s*(\d{2}-\d{2}-\d{4})/i)?.[1] ?? "",
    birthPlace: value(text, "Geboorteplaats"), nationality: value(text, "Nationaliteit"),
  };
}
export function parseUboKvk(raw: string): Entity {
  const text = compact(raw);
  const ownerSection = text.match(/Enig aandeelhouder\s+(.*?)(?=\bBestuurders?\b|\bGegevens zijn vervaardigd|$)/i)?.[1];
  const directorsSection = text.match(/\bBestuurders?\s+(.*?)(?=\bGevolmachtigden?\b|\bGegevens zijn vervaardigd|$)/i)?.[1] ?? "";
  return {
    name: value(text, "Statutaire naam"),
    kvk: text.match(/KVK-nummer\s*:?\s*(\d{8})/i)?.[1] ?? "",
    address: value(text.split(/Enig aandeelhouder|\bBestuurders?\b/i)[0], "Bezoekadres"),
    owner: ownerSection ? { ...person(ownerSection), kvk: ownerSection.match(/KvK-nummer\s*:?\s*(\d{8})/i)?.[1] ?? "" } : undefined,
    directors: directorsSection.split(/(?=\bNaam)/i).map(person).filter(p => p.name),
  };
}

export function buildUboPrefill(texts: string[], fields: WorldlineAgreementFields): UboPrefill {
  const result: UboPrefill = { text: { "1723.1.01.VP.1": fields.companyName || "", "1723.1.01.VP.2": fields.vatNumber || "" }, checks: {}, warnings: [] };
  const entities = texts.map(parseUboKvk).filter(e => e.name && e.kvk);
  const matches = entities.filter(e => fields.kvkNumber ? e.kvk === fields.kvkNumber.replace(/\D/g, "") : key(e.name) === key(fields.companyName || ""));
  if (matches.length !== 1) {
    result.warnings.push("Geen eenduidig KvK-uittreksel voor de contractant gevonden; vul de UBO-gegevens aan.");
    return result;
  }
  const root = matches[0];
  const chain: Entity[] = [];
  let current: Entity | undefined = root;
  let owner: Person | undefined;
  while (current && !chain.some(e => e.kvk === current!.kvk)) {
    chain.push(current);
    if (current.owner?.birthDate) { owner = current.owner; break; }
    const nextOwner: Entity["owner"] = current.owner;
    const next: Entity[] = nextOwner ? entities.filter(e => nextOwner.kvk ? e.kvk === nextOwner.kvk : key(e.name) === key(nextOwner.name)) : [];
    current = next.length === 1 ? next[0] : undefined;
  }
  const putPerson = (p: Person, prefix: string, dob: string, birthPlace: string, nationality: string) => {
    result.text[`${prefix}.1`] = p.firstName;
    result.text[`${prefix}.2`] = p.lastName;
    result.text[dob] = p.birthDate;
    result.text[birthPlace] = p.birthPlace;
    result.text[nationality] = p.nationality;
  };
  if (owner) {
    putPerson(owner, "1723.2.31.BO", "Date-1-50-1", "1723.2.35.BO.2", "1723.2.35.BO.3");
    // The indirect ownership option explicitly covers ownership via another company.
    result.checks[chain.length === 1 ? "1723.1.50.BO.1" : "1723.1.51.BO.1"] = "Yes";
    result.checks["1723.2.38a.BO.1"] = chain.length === 1 ? "1" : "2";
    if (chain.length === 1) {
      result.text["1723.2.39.BO.1"] = "100";
    } else {
      const holding = chain[1];
      result.text["1723.2.41.BO.1"] = "100";
      result.text["1723.2.42.BO.1"] = holding.name;
      result.text["1723.2.43.BO.1"] = holding.address;
      const address = holding.address.match(/^(.*?),?\s+(\d{4})\s*([A-Z]{2})\s+(.+)$/i);
      if (address) {
        result.text["1723.2.43.BO.1"] = address[1].replace(/,$/, "");
        result.text["1723.2.44.BO.1"] = `${address[2]} ${address[3]}`;
        result.text["1723.2.44.BO.2"] = address[4];
        result.text["1723.2.44.BO.3"] = "NL";
      }
      result.text["1723.2.45.BO.1"] = "100";
      if (chain.length > 2) result.warnings.push("De eigendomsketen bevat meerdere holdings; voeg het volledige organisatieschema toe.");
    }
    result.warnings.push("Controleer en vul de ontbrekende privégegevens en stemrechten van de UBO aan; deze staan niet volledig in de KvK-uittreksels.");
  } else {
    result.warnings.push("De UBO kon niet eenduidig via de aandeelhoudersketen worden vastgesteld. Voeg ontbrekende vervolguittreksels toe of vul de UBO handmatig in.");
  }
  // Follow directors separately: being an owner does not establish signing authority.
  const signers: Person[] = [];
  const visited = new Set<string>();
  const visitDirectors = (entity: Entity) => {
    if (visited.has(entity.kvk)) return;
    visited.add(entity.kvk);
    for (const director of entity.directors) {
      if (director.birthDate) {
        if (!signers.some(p => key(p.name) === key(director.name))) signers.push(director);
      } else {
        const matches = entities.filter(e => key(e.name) === key(director.name));
        if (matches.length === 1) visitDirectors(matches[0]);
      }
    }
  };
  visitDirectors(root);
  signers.slice(0, 2).forEach((p, index) => {
    result.text[index === 0 ? "1723.3.90.57.1.Druckbuchstaben" : "1723.3.90.60.1.Druckbuchstaben"] = `${p.firstName} ${p.lastName}`.trim();
  });
  const sameSigner = owner ? signers.findIndex(p => key(p.name) === key(owner!.name)) : -1;
  if (sameSigner >= 0 && sameSigner < 2) result.checks["1723.2.21.BO.1"] = String(sameSigner + 1);
  const otherDirectors = signers.filter((p, index) => index >= 2 && key(p.name) !== key(owner?.name ?? ""));
  if (otherDirectors.length) {
    putPerson(otherDirectors[0], "1723.3.31.DI", "Date-2-30-1", "1723.3.34.DI.2", "1723.3.34.DI.3");
    result.text["1723.3.31.DI.3"] = "Bestuurder";
  }
  if (otherDirectors.length > 1 || signers.length > 2) result.warnings.push("Niet alle bestuurders passen op het formulier; voeg hun gegevens op een extra blad toe.");
  result.checks["1723.3.11.EN.1"] = "Yes";
  result.warnings.push("Controleer het formulier en laat de klant datum, plaats en handtekening invullen.");
  return result;
}
