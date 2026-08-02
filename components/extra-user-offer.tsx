"use client";

import { NumberStepper } from "@/components/number-stepper";
import { StatusPill } from "@/components/ui";
import { euro } from "@/lib/pricing";

type ExtraUserOfferProps = {
  packageName: string;
  licenseExtra: number;
  supportExtra: number;
  includeSupport: boolean;
  extraUsers: number;
  chauffeurExtraUsers: number;
  planningAppUsers: number;
  planningAppUserMonthly: number;
  onExtraUsersChange: (value: number) => void;
  onChauffeurExtraUsersChange: (value: number) => void;
  onPlanningAppUsersChange: (value: number) => void;
};

function safeCount(value: number) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export default function ExtraUserOffer({
  packageName,
  licenseExtra,
  supportExtra,
  includeSupport,
  extraUsers,
  chauffeurExtraUsers,
  planningAppUsers,
  planningAppUserMonthly,
  onExtraUsersChange,
  onChauffeurExtraUsersChange,
  onPlanningAppUsersChange,
}: ExtraUserOfferProps) {
  const regularCount = safeCount(extraUsers);
  const chauffeurCount = safeCount(chauffeurExtraUsers);
  const planningCount = safeCount(planningAppUsers);
  const regularLicenseTotal = regularCount * licenseExtra;
  const regularSupportTotal = includeSupport ? regularCount * supportExtra : 0;
  const chauffeurLicenseTotal = chauffeurCount * licenseExtra;
  const chauffeurSupportTotal = includeSupport ? chauffeurCount * supportExtra : 0;
  const planningTotal = planningCount * planningAppUserMonthly;
  const monthlyTotal = regularLicenseTotal
    + regularSupportTotal
    + chauffeurLicenseTotal
    + chauffeurSupportTotal
    + planningTotal;

  const rows = [
    {
      key: "regular-license",
      count: regularCount,
      label: `Smart Trade ${packageName} Extra gebruiker`,
      price: licenseExtra,
      total: regularLicenseTotal,
    },
    ...(includeSupport
      ? [{
          key: "regular-support",
          count: regularCount,
          label: `Smart Trade ${packageName} Supportcontract Extra gebruiker`,
          price: supportExtra,
          total: regularSupportTotal,
        }]
      : []),
    {
      key: "chauffeur-license",
      count: chauffeurCount,
      label: "Licentie extra gebruiker (chauffeursmodule)",
      price: licenseExtra,
      total: chauffeurLicenseTotal,
    },
    ...(includeSupport
      ? [{
          key: "chauffeur-support",
          count: chauffeurCount,
          label: "Supportcontract extra gebruiker (chauffeursmodule)",
          price: supportExtra,
          total: chauffeurSupportTotal,
        }]
      : []),
    {
      key: "planning-app",
      count: planningCount,
      label: "Planningapp gebruiker",
      price: planningAppUserMonthly,
      total: planningTotal,
    },
  ];

  return (
    <div className="extra-user-offer">
      <div className="extra-user-offer-header">
        <div>
          <strong>Extra gebruiker offerte</strong>
          <span>Pakket: Smart Trade {packageName}</span>
        </div>
        <StatusPill tone={includeSupport ? "success" : "warning"}>
          {includeSupport ? "met support" : "zonder support"}
        </StatusPill>
      </div>

      <div className="extra-user-offer-inputs">
        <label className="input-wrap">
          <span className="input-label">Aantal extra gebruikers</span>
          <NumberStepper
            ariaLabel="Aantal extra gebruikers"
            min={0}
            value={regularCount}
            onChange={(value) => onExtraUsersChange(safeCount(value))}
          />
        </label>
        <label className="input-wrap">
          <span className="input-label">Aantal extra gebruikers chauffeursmodule</span>
          <NumberStepper
            ariaLabel="Aantal extra gebruikers chauffeursmodule"
            min={0}
            value={chauffeurCount}
            onChange={(value) => onChauffeurExtraUsersChange(safeCount(value))}
          />
        </label>
        <label className="input-wrap">
          <span className="input-label">Aantal planningsapp-gebruikers</span>
          <NumberStepper
            ariaLabel="Aantal planningsapp-gebruikers"
            min={0}
            value={planningCount}
            onChange={(value) => onPlanningAppUsersChange(safeCount(value))}
          />
        </label>
      </div>

      <div className="extra-user-offer-rows">
        {rows.map((row) => (
          <div key={row.key} className="extra-user-offer-row">
            <span className="extra-user-offer-count">{row.count}x</span>
            <strong>{row.label}</strong>
            <span>{euro.format(row.price)} p/m</span>
            <strong>{euro.format(row.total)} p/m</strong>
          </div>
        ))}
      </div>

      <div className="extra-user-offer-total">
        <span>Maandelijkse uitbreiding</span>
        <strong>{euro.format(monthlyTotal)} p/m</strong>
      </div>
    </div>
  );
}
