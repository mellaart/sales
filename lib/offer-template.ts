import type { PricingResult } from "@/lib/pricing";
import { euro, IMPLEMENTATION_DAY_RATE } from "@/lib/pricing";
import type { ExpansionWorkItemConfig } from "@/lib/price-config";
import type { QuoteLayoutKey } from "@/lib/quote-layouts";
import type { AssetExpansionSummary } from "@/lib/supabase";

export type OfferModule = {
  key: string;
  name: string;
  monthlyPrice: number;
  qty: number;
  total: number;
  workItems?: string[];
};

export type OfferMonthlyRow = {
  amount: string;
  description: string;
  price: number;
  total: number;
};

export type OfferTemplateInput = {
  quoteTitle: string;
  customerName: string;
  contactName: string;
  salesName: string;
  salesEmail?: string;
  salesPhone?: string;
  salesTitle?: string;
  salesWorkdays?: string;
  notes?: string;
  includeVat: boolean;
  totalUsers: number;
  selectedModules: OfferModule[];
  extraMonthlyRows?: OfferMonthlyRow[];
  result: PricingResult;
  quoteLayout?: QuoteLayoutKey;
  assetsExpansion?: AssetExpansionSummary | null;
  expansionWorkItems?: ExpansionWorkItemConfig[];
};

export function getGreeting(contactName?: string) {
  if (!contactName?.trim()) return "Goedemiddag,";

  const firstName = contactName.trim().split(/\s+/)[0];
  return `Goedemiddag ${firstName},`;
}

export function getSelectedPaidModules(selectedModules: OfferModule[]) {
  return selectedModules.filter((module) => module.monthlyPrice > 0);
}

export function getFreeModules(selectedModules: OfferModule[]) {
  return selectedModules.filter((module) => module.monthlyPrice === 0);
}

export function getBillableModulesForPackage(selectedModules: OfferModule[], result: PricingResult) {
  const paidModules = getSelectedPaidModules(selectedModules);
  return paidModules.slice(result.includedModules);
}

export function getIncludedModulesForPackage(selectedModules: OfferModule[], result: PricingResult) {
  const paidModules = getSelectedPaidModules(selectedModules);
  return paidModules.slice(0, result.includedModules);
}

export function getModuleSummaryText(selectedModules: OfferModule[], result: PricingResult) {
  const included = getIncludedModulesForPackage(selectedModules, result);
  const billable = getBillableModulesForPackage(selectedModules, result);
  const free = getFreeModules(selectedModules);

  const lines: string[] = [];

  if (included.length > 0) {
    lines.push(`Inbegrepen betaalde modules: ${included.map((module) => module.name).join(", ")}.`);
  }

  if (billable.length > 0) {
    lines.push(`Extra betaalde modules: ${billable.map((module) => module.name).join(", ")}.`);
  }

  if (free.length > 0) {
    lines.push(`Gratis modules: ${free.map((module) => module.name).join(", ")}.`);
  }

  return lines.length > 0 ? lines : ["Er zijn geen losse modules geselecteerd."];
}

export function getLicenseRows(input: OfferTemplateInput) {
  const extraUsers = Math.max(0, input.totalUsers - 1);

  return [
    {
      amount: "1x",
      description: `Smart Trade ${input.result.name} 1ste gebruiker`,
      price: input.result.licenseFirst,
      total: input.result.licenseFirst,
    },
    ...(extraUsers > 0
      ? [
          {
            amount: `${extraUsers}x`,
            description: `Smart Trade ${input.result.name} Extra gebruiker`,
            price: input.result.licenseExtra,
            total: input.result.licenseExtra * extraUsers,
          },
        ]
      : []),
  ];
}

export function getSupportRows(input: OfferTemplateInput) {
  const extraUsers = Math.max(0, input.totalUsers - 1);

  return [
    {
      amount: "1x",
      description: `Smart Trade ${input.result.name} Supportcontract 1ste gebruiker`,
      price: input.result.supportFirst,
      total: input.result.supportFirst,
    },
    ...(extraUsers > 0
      ? [
          {
            amount: `${extraUsers}x`,
            description: `Smart Trade ${input.result.name} Supportcontract Extra gebruiker`,
            price: input.result.supportExtra,
            total: input.result.supportExtra * extraUsers,
          },
        ]
      : []),
  ];
}

export function getModuleRows(input: OfferTemplateInput) {
  const billableModules = getBillableModulesForPackage(input.selectedModules, input.result);

  return billableModules.map((module) => ({
    amount: `${module.qty}x`,
    description: `${module.name}`,
    price: module.monthlyPrice,
    total: module.total,
  }));
}

export function getImplementationText(input: OfferTemplateInput) {
  return `Implementatie Smart Trade ${input.result.name} – ${input.totalUsers} gebruikers – implementatieplan: ${euro.format(
    input.result.implementationAfterAdjustment,
  )} exclusief reiskosten`;
}

export function getOfferTextBlocks(input: OfferTemplateInput) {
  return {
    greeting: getGreeting(input.contactName),
    intro: "Naar aanleiding van ons overleg hierbij wat wij besproken hebben:",
    packageChoice: `Op basis van jullie wensen kwamen wij uit bij Smart Trade ${input.result.name}. In deze offerte ga ik uit van een compleet ERP systeem voor ${input.totalUsers} gelijktijdig ingelogde gebruikers.`,
    supportIntro:
      "Bij Troublefree hebben wij de licentieprijs van Smart Trade losgekoppeld van de prijs van support. U kunt zelf kiezen of u de support per uur betaalt of in een vast bedrag per maand, dit laatste noemen wij een supportcontract.",
    supportBullets: [
      "Gebruikers op weg helpen in de software",
      "Het beantwoorden van vragen over al in gebruik genomen functionaliteiten",
      "Kleine lay-out-aanpassingen",
    ],
    implementation:
      "Voor iedere implementatie maken wij gebruik van ons implementatieplan. Dit implementatieplan bestaat uit een vooraf vastgesteld aantal bezoeken om de meest voorkomende functies van Smart Trade in te stellen. In principe is het altijd mogelijk om binnen het vooraf vastgestelde aantal bezoeken het pakket op een goede manier in gebruik te nemen.",
    implementationOptions: [
      "Er worden wensen geschrapt zodat de implementatie wel past in het vooraf vastgestelde aantal bezoeken",
      `Er worden extra dagen bijgeboekt tegen een tarief van ${euro.format(IMPLEMENTATION_DAY_RATE)} per dag exclusief reiskosten`,
      `De implementatie en aankoop wordt geannuleerd, alleen de eerste dag wordt in rekening gebracht á ${euro.format(IMPLEMENTATION_DAY_RATE)} exclusief reiskosten`,
    ],
    finance:
      "Wij hebben een prima koppeling met diverse financiële pakketten. Een financieel pakket dien je zelf te betrekken en in te richten.",
    consultancy:
      "Aanvullend ontwikkelwerk en extra toekomstige consultancy zijn niet inbegrepen in het supportcontract. Wanneer er consultancy of ontwikkelwerkzaamheden nodig zijn, dan zullen wij jullie van tevoren vertellen dat hier kosten aan verbonden zijn. Het tarief voor consultancy werk is € 135,00 per uur.",
    hardware:
      "De Troublefree consultant zal in overleg afstemmen wat voor hardware handig is en desgewenst hiervoor offertes bij moederbedrijf PWA opvragen.",
    closing:
      "Deze offerte is onder voorbehoud van typefouten en/of calculatiefouten. De getoonde prijzen zijn exclusief 21% btw. Ook zijn onze algemene voorwaarden van toepassing.",
    contact:
      "Mochten er nog vragen zijn, dan kan je altijd contact met ons opnemen.",
  };
}
