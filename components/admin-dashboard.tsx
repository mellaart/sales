"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, KeyRound, RefreshCw, Save, ShieldCheck, UserPlus, Users2 } from "lucide-react";
import {
  canManageRoles,
  getSupabaseClient,
  type ProfileRecord,
  type UserRole,
} from "@/lib/supabase";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import {
  ROLE_LABELS,
  ROLE_TAB_ACCESS,
  USER_ROLES,
  normalizeRoleTabAccess,
  type AppTabKey,
  type RoleTabAccessMap,
  type TabPermission,
} from "@/lib/role-tabs";
import { useAuth } from "@/components/auth-provider";
import { RoleTabAccessOverview } from "@/components/role-tab-access-overview";
import { StatusPill } from "@/components/ui";

const roles: UserRole[] = USER_ROLES;
const ADMIN_LOAD_RETRY_MS = 650;
const ADMIN_LOAD_MAX_ATTEMPTS = 3;

type LoadProfilesOptions = {
  keepStatus?: boolean;
};

type RoleTabsResponse = {
  error?: string;
  roleTabAccess?: unknown;
  persisted?: boolean;
};

type PasswordResetResult = {
  profileId: string;
  email: string;
  temporaryPassword: string;
};

type RecoveryCodeStatus = {
  remaining: number;
  generatedAt: string | null;
};

type EditableProfileField = "job_title" | "workdays" | "mobile_phone";

function isProtectedProfile(profile: Pick<ProfileRecord, "email">) {
  return isProtectedAdminEmail(profile.email);
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function formatRecoveryCodeDate(value: string | null) {
  if (!value) return "Nog niet aangemaakt";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function setRoleTabPermission(
  currentAccess: RoleTabAccessMap,
  selectedRole: UserRole,
  tabKey: AppTabKey,
  permission: TabPermission,
) {
  return normalizeRoleTabAccess({
    ...currentAccess,
    [selectedRole]: {
      ...currentAccess[selectedRole],
      [tabKey]: permission,
    },
  });
}

export default function AdminDashboard() {
  const { user, role, loading: authLoading, refreshProfile } = useAuth();
  const router = useRouter();
  const supabase = getSupabaseClient();
  const isProtectedCurrentAdmin = isProtectedAdminEmail(user?.email);

  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [createStatus, setCreateStatus] = useState("");

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("sales");
  const [busy, setBusy] = useState(false);
  const [profileSavingId, setProfileSavingId] = useState<string | null>(null);
  const [twoFactorResettingId, setTwoFactorResettingId] = useState<string | null>(null);
  const [passwordResettingId, setPasswordResettingId] = useState<string | null>(null);
  const [passwordResetResult, setPasswordResetResult] = useState<PasswordResetResult | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [recoveryCodeStatus, setRecoveryCodeStatus] = useState<RecoveryCodeStatus>({
    remaining: 0,
    generatedAt: null,
  });
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryTotpCode, setRecoveryTotpCode] = useState("");
  const [recoveryCodesBusy, setRecoveryCodesBusy] = useState(false);
  const [recoveryCodesCopied, setRecoveryCodesCopied] = useState(false);
  const [recoveryCodesMessage, setRecoveryCodesMessage] = useState("");

  const [roleTabAccess, setRoleTabAccess] = useState<RoleTabAccessMap>(ROLE_TAB_ACCESS);
  const [roleTabsLoading, setRoleTabsLoading] = useState(true);
  const [roleTabStatus, setRoleTabStatus] = useState("");
  const [roleTabSavingKey, setRoleTabSavingKey] = useState<string | null>(null);

  const loadProfiles = useCallback(async (options: LoadProfilesOptions = {}) => {
    setLoading(true);
    if (!options.keepStatus) {
      setStatus("");
    }
    try {
      if (!supabase) {
        setStatus("Supabase client ontbreekt.");
        return;
      }

      for (let attempt = 1; attempt <= ADMIN_LOAD_MAX_ATTEMPTS; attempt += 1) {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (!accessToken) {
          if (attempt < ADMIN_LOAD_MAX_ATTEMPTS) {
            await wait(ADMIN_LOAD_RETRY_MS);
            continue;
          }

          setStatus("Je sessie is verlopen. Log opnieuw in.");
          return;
        }

        const response = await fetch("/api/admin/users/list", {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });

        const json = (await response.json().catch(() => ({}))) as { error?: string; users?: ProfileRecord[] };

        const shouldRetry =
          attempt < ADMIN_LOAD_MAX_ATTEMPTS &&
          (!response.ok || (json.users ?? []).length === 0);

        if (shouldRetry) {
          await wait(ADMIN_LOAD_RETRY_MS);
          continue;
        }

        if (!response.ok) {
          setStatus(json.error || "Profielen laden mislukt.");
          return;
        }

        const loadedProfiles = ((json.users ?? []) as ProfileRecord[])
          .map((profile) => ({
            ...profile,
            full_name: profile.full_name ?? null,
            job_title: profile.job_title ?? null,
            workdays: profile.workdays ?? null,
            mobile_phone: profile.mobile_phone ?? null,
            employee_relation_id: profile.employee_relation_id ?? null,
            two_factor_enabled: profile.two_factor_enabled ?? false,
            two_factor_enabled_at: profile.two_factor_enabled_at ?? null,
            two_factor_last_verified_at: profile.two_factor_last_verified_at ?? null,
            updated_at: profile.updated_at ?? null,
          }))
          .sort((a, b) => (a.email || "").localeCompare(b.email || ""));

        setProfiles(loadedProfiles);
        return;
      }
    } catch {
      setStatus("Er ging iets mis bij het laden van de profielen.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const loadRoleTabs = useCallback(async () => {
    setRoleTabsLoading(true);
    setRoleTabStatus("");

    try {
      const response = await fetch("/api/admin/role-tabs", { cache: "no-store" });
      const json = (await response.json().catch(() => ({}))) as RoleTabsResponse;

      if (!response.ok) {
        setRoleTabStatus(json.error || "Rolrechten laden mislukt.");
        return;
      }

      const nextAccess = normalizeRoleTabAccess(json.roleTabAccess);
      setRoleTabAccess(nextAccess);
      window.dispatchEvent(new CustomEvent("role-tab-access-updated", { detail: nextAccess }));

      if (!json.persisted) {
        setRoleTabStatus("Standaardrechten geladen. Wijzig een selectie om deze instellingen op te slaan.");
      }
    } catch {
      setRoleTabAccess(ROLE_TAB_ACCESS);
      setRoleTabStatus("Rolrechten laden mislukt; standaardrechten zijn actief.");
    } finally {
      setRoleTabsLoading(false);
    }
  }, []);

  const loadRecoveryCodeStatus = useCallback(async () => {
    if (!isProtectedCurrentAdmin || !supabase) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setRecoveryCodesMessage("Je sessie is verlopen. Log opnieuw in.");
        return;
      }

      const response = await fetch("/api/admin/2fa-recovery-codes", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const json = (await response.json().catch(() => ({}))) as RecoveryCodeStatus & { error?: string };

      if (!response.ok) {
        setRecoveryCodesMessage(json.error || "Herstelcodes laden mislukt.");
        return;
      }

      setRecoveryCodeStatus({
        remaining: Number(json.remaining || 0),
        generatedAt: json.generatedAt || null,
      });
    } catch {
      setRecoveryCodesMessage("Herstelcodes laden mislukt.");
    }
  }, [isProtectedCurrentAdmin, supabase]);

  useEffect(() => {
    if (canManageRoles(role)) {
      void loadProfiles();
      void loadRoleTabs();
      void loadRecoveryCodeStatus();
    }
  }, [role, loadProfiles, loadRecoveryCodeStatus, loadRoleTabs]);

  async function refreshAdminData() {
    await Promise.all([
      loadProfiles(),
      loadRoleTabs(),
      isProtectedCurrentAdmin ? loadRecoveryCodeStatus() : Promise.resolve(),
    ]);
  }

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setCreateStatus("Gebruiker wordt aangemaakt...");

    try {
      if (!supabase) {
        setCreateStatus("Supabase client ontbreekt.");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setCreateStatus("Je sessie is verlopen. Log opnieuw in.");
        return;
      }

      const response = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ email, fullName, role: newRole }),
      });

      const json = (await response.json().catch(() => ({}))) as {
        error?: string;
        existing?: boolean;
        temporaryPassword?: string | null;
      };

      if (!response.ok) {
        setCreateStatus(json.error || `Gebruiker aanmaken mislukt (${response.status}).`);
        return;
      }

      setEmail("");
      setFullName("");
      setNewRole("sales");
      if (json.temporaryPassword) {
        setCreateStatus(
          json.existing
            ? `Gebruiker bestond al. Profiel is bijgewerkt. Tijdelijk wachtwoord: ${json.temporaryPassword}`
            : `Gebruiker aangemaakt. Tijdelijk wachtwoord: ${json.temporaryPassword}`,
        );
      } else {
        setCreateStatus(
          json.existing
            ? "Gebruiker bestond al. Profiel en rol zijn bijgewerkt."
            : "Gebruiker uitgenodigd. Er is een activatiemail verstuurd.",
        );
      }
      await loadProfiles({ keepStatus: true });
      router.refresh();
    } catch {
      setCreateStatus("Er ging iets mis bij het aanmaken van de gebruiker.");
    } finally {
      setBusy(false);
    }
  }

  async function updateRole(profileId: string, nextRole: UserRole) {
    if (!supabase) return;

    const profile = profiles.find((item) => item.id === profileId);
    if (profile && isProtectedProfile(profile)) {
      setStatus("Deze beschermde admin-gebruiker kan niet worden aangepast.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setStatus("Je sessie is verlopen. Log opnieuw in.");
      return;
    }

    const response = await fetch("/api/admin/users/update-role", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ userId: profileId, role: nextRole }),
    });

    const json = await response.json();

    if (!response.ok) {
      setStatus(json.error || "Rol wijzigen mislukt.");
      return;
    }

    setStatus("Rol bijgewerkt.");
    await loadProfiles({ keepStatus: true });
    await refreshProfile();
  }

  function updateProfileField(profileId: string, field: EditableProfileField, value: string) {
    setProfiles((currentProfiles) =>
      currentProfiles.map((profile) =>
        profile.id === profileId && !isProtectedProfile(profile)
          ? {
              ...profile,
              [field]: value,
            }
          : profile,
      ),
    );
  }

  function updateEmployeeRelationId(profileId: string, value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 12);
    setProfiles((currentProfiles) =>
      currentProfiles.map((profile) =>
        profile.id === profileId
          ? {
              ...profile,
              employee_relation_id: digits ? Number(digits) : null,
            }
          : profile,
      ),
    );
  }

  async function saveProfile(profile: ProfileRecord) {
    if (!supabase) return;

    setProfileSavingId(profile.id);
    setStatus("Profielgegevens worden opgeslagen...");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setStatus("Je sessie is verlopen. Log opnieuw in.");
        return;
      }

      const response = await fetch("/api/admin/users/update-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          userId: profile.id,
          jobTitle: profile.job_title,
          workdays: profile.workdays,
          mobilePhone: profile.mobile_phone,
          employeeRelationId: profile.employee_relation_id,
        }),
      });

      const json = (await response.json().catch(() => ({}))) as { error?: string; metadataWarning?: string | null };

      if (!response.ok) {
        setStatus(json.error || "Profielgegevens opslaan mislukt.");
        return;
      }

      setStatus(json.metadataWarning ? `Profiel opgeslagen. Metadata waarschuwing: ${json.metadataWarning}` : "Profielgegevens opgeslagen.");
      await loadProfiles({ keepStatus: true });
      await refreshProfile();
    } catch {
      setStatus("Er ging iets mis bij het opslaan van de profielgegevens.");
    } finally {
      setProfileSavingId(null);
    }
  }

  async function updateRoleTab(selectedRole: UserRole, tabKey: AppTabKey, permission: TabPermission) {
    if (!supabase) {
      setRoleTabStatus("Supabase client ontbreekt.");
      return;
    }

    const previousAccess = roleTabAccess;
    const nextAccess = setRoleTabPermission(roleTabAccess, selectedRole, tabKey, permission);
    const savingKey = `${selectedRole}:${tabKey}`;

    setRoleTabAccess(nextAccess);
    setRoleTabSavingKey(savingKey);
    setRoleTabStatus("Rolrechten worden opgeslagen...");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error("Je sessie is verlopen. Log opnieuw in.");
      }

      const response = await fetch("/api/admin/role-tabs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ roleTabAccess: nextAccess }),
      });

      const json = (await response.json().catch(() => ({}))) as RoleTabsResponse;

      if (!response.ok) {
        throw new Error(json.error || "Rolrechten opslaan mislukt.");
      }

      const savedAccess = normalizeRoleTabAccess(json.roleTabAccess ?? nextAccess);
      setRoleTabAccess(savedAccess);
      window.dispatchEvent(new CustomEvent("role-tab-access-updated", { detail: savedAccess }));
      setRoleTabStatus("Rolrechten opgeslagen. De navigatie is bijgewerkt.");
    } catch (error) {
      setRoleTabAccess(previousAccess);
      setRoleTabStatus(error instanceof Error ? error.message : "Rolrechten opslaan mislukt.");
    } finally {
      setRoleTabSavingKey(null);
    }
  }

  async function deleteUser(profileId: string) {
    if (!supabase) return;

    const profile = profiles.find((item) => item.id === profileId);
    if (profile && isProtectedProfile(profile)) {
      setStatus("Deze beschermde admin-gebruiker kan niet worden verwijderd.");
      return;
    }

    const confirmed = confirm("Weet je zeker dat je deze gebruiker wilt verwijderen?");
    if (!confirmed) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setStatus("Je sessie is verlopen. Log opnieuw in.");
      return;
    }

    const response = await fetch("/api/admin/users/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ userId: profileId }),
    });

    const json = await response.json();

    if (!response.ok) {
      setStatus(json.error || "Gebruiker verwijderen mislukt.");
      return;
    }

    setStatus("Gebruiker verwijderd.");
    await loadProfiles({ keepStatus: true });
  }

  async function resetTwoFactor(profileId: string) {
    if (!supabase) return;

    const profile = profiles.find((item) => item.id === profileId);
    const confirmed = confirm(`2FA resetten voor ${profile?.email || "deze gebruiker"}? Bij de volgende login moet 2FA opnieuw ingesteld worden.`);
    if (!confirmed) return;

    setTwoFactorResettingId(profileId);
    setStatus("2FA wordt gereset...");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setStatus("Je sessie is verlopen. Log opnieuw in.");
        return;
      }

      const response = await fetch("/api/admin/users/reset-2fa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userId: profileId }),
      });

      const json = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setStatus(json.error || "2FA resetten mislukt.");
        return;
      }

      setStatus("2FA is gereset. De gebruiker moet bij de volgende login opnieuw scannen.");
      await loadProfiles({ keepStatus: true });
    } catch {
      setStatus("Er ging iets mis bij het resetten van 2FA.");
    } finally {
      setTwoFactorResettingId(null);
    }
  }

  async function resetPassword(profileId: string) {
    if (!supabase) return;

    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) return;

    if (isProtectedProfile(profile)) {
      setStatus("Het wachtwoord van de beschermde admin wijzig je via het accountmenu.");
      return;
    }

    const confirmed = confirm(
      `Wachtwoord resetten voor ${profile.email || "deze gebruiker"}? De gebruiker wordt uitgelogd en moet het tijdelijke wachtwoord direct wijzigen.`,
    );
    if (!confirmed) return;

    setPasswordResettingId(profileId);
    setPasswordResetResult(null);
    setPasswordCopied(false);
    setStatus("Wachtwoord wordt gereset...");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setStatus("Je sessie is verlopen. Log opnieuw in.");
        return;
      }

      const response = await fetch("/api/admin/users/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userId: profileId }),
      });

      const json = (await response.json().catch(() => ({}))) as {
        error?: string;
        temporaryPassword?: string;
      };

      if (!response.ok || !json.temporaryPassword) {
        setStatus(json.error || "Wachtwoord resetten mislukt.");
        return;
      }

      setPasswordResetResult({
        profileId,
        email: profile.email || "de gebruiker",
        temporaryPassword: json.temporaryPassword,
      });
      setStatus("Wachtwoord is gereset. Deel het tijdelijke wachtwoord veilig met de gebruiker.");
    } catch {
      setStatus("Er ging iets mis bij het resetten van het wachtwoord.");
    } finally {
      setPasswordResettingId(null);
    }
  }

  async function copyTemporaryPassword() {
    if (!passwordResetResult) return;

    try {
      await navigator.clipboard.writeText(passwordResetResult.temporaryPassword);
      setPasswordCopied(true);
      setStatus(`Tijdelijk wachtwoord voor ${passwordResetResult.email} is gekopieerd.`);
    } catch {
      setStatus("Kopieren lukt niet automatisch. Selecteer het tijdelijke wachtwoord handmatig.");
    }
  }

  async function generateRecoveryCodes() {
    if (!supabase || !isProtectedCurrentAdmin) return;

    if (!/^\d{6}$/.test(recoveryTotpCode)) {
      setRecoveryCodesMessage("Vul eerst je huidige 6-cijferige 2FA-code in.");
      return;
    }

    if (
      recoveryCodeStatus.remaining > 0 &&
      !confirm("Nieuwe herstelcodes maken? Alle bestaande herstelcodes worden direct ongeldig.")
    ) {
      return;
    }

    setRecoveryCodesBusy(true);
    setRecoveryCodes([]);
    setRecoveryCodesCopied(false);
    setRecoveryCodesMessage("Nieuwe herstelcodes worden gemaakt...");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setRecoveryCodesMessage("Je sessie is verlopen. Log opnieuw in.");
        return;
      }

      const response = await fetch("/api/admin/2fa-recovery-codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ currentTwoFactorCode: recoveryTotpCode }),
      });
      const json = (await response.json().catch(() => ({}))) as RecoveryCodeStatus & {
        codes?: string[];
        error?: string;
      };

      if (!response.ok || !json.codes?.length) {
        setRecoveryCodesMessage(json.error || "Herstelcodes maken mislukt.");
        return;
      }

      setRecoveryCodes(json.codes);
      setRecoveryCodeStatus({
        remaining: Number(json.remaining || json.codes.length),
        generatedAt: json.generatedAt || new Date().toISOString(),
      });
      setRecoveryTotpCode("");
      setRecoveryCodesMessage("Herstelcodes aangemaakt. Bewaar ze nu; na het verlaten van deze pagina worden ze niet meer getoond.");
    } catch {
      setRecoveryCodesMessage("Herstelcodes maken mislukt.");
    } finally {
      setRecoveryCodesBusy(false);
    }
  }

  async function copyRecoveryCodes() {
    if (recoveryCodes.length === 0) return;

    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setRecoveryCodesCopied(true);
      setRecoveryCodesMessage("Alle herstelcodes zijn gekopieerd.");
    } catch {
      setRecoveryCodesMessage("Kopieren lukt niet automatisch. Download de codes als tekstbestand.");
    }
  }

  function downloadRecoveryCodes() {
    if (recoveryCodes.length === 0) return;

    const content = [
      "Smart Trade Sales - 2FA-herstelcodes",
      `Account: ${user?.email || "erik@smarttrade.nl"}`,
      `Aangemaakt: ${formatRecoveryCodeDate(recoveryCodeStatus.generatedAt)}`,
      "",
      ...recoveryCodes,
      "",
      "Elke code kan maar een keer worden gebruikt.",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "smart-trade-2fa-herstelcodes.txt";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setRecoveryCodesMessage("Herstelcodes gedownload.");
  }

  if (authLoading) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <h1>Admin laden</h1>
            <p className="subtext">Je sessie en rechten worden gecontroleerd.</p>
          </section>
        </div>
      </div>
    );
  }

  if (!canManageRoles(role)) {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <h1>Geen toegang</h1>
            <p className="subtext">Alleen admins mogen gebruikers beheren.</p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="container stack-4">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Smart Trade</div>
            <h1>Admin en rollen</h1>
            <p>Voeg collega&apos;s toe en beheer hun toegang binnen Smart Trade.</p>
          </div>

          <div className="brand-actions">
            <StatusPill tone="success">Rollen actief</StatusPill>
            <button type="button" className="primary-button" onClick={() => void refreshAdminData()}>
              <RefreshCw size={16} />
              Vernieuwen
            </button>
          </div>
        </header>

        {isProtectedCurrentAdmin ? (
          <section className="card panel recovery-codes-card">
            <div className="top-row">
              <div>
                <div className="brand-mark">Accountbeveiliging</div>
                <h2>2FA-herstelcodes</h2>
                <p className="subtext">Voor toegang wanneer je authenticator tijdelijk niet beschikbaar is.</p>
              </div>
              <StatusPill tone={recoveryCodeStatus.remaining > 0 ? "success" : "warning"}>
                {recoveryCodeStatus.remaining} beschikbaar
              </StatusPill>
            </div>

            <div className="recovery-code-controls">
              <label className="input-wrap recovery-code-verification">
                <span className="input-label">Huidige 2FA-code</span>
                <input
                  className="input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={recoveryTotpCode}
                  onChange={(event) => setRecoveryTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  minLength={6}
                  maxLength={6}
                />
              </label>

              <button
                type="button"
                className="primary-button"
                disabled={recoveryCodesBusy}
                onClick={() => void generateRecoveryCodes()}
              >
                <KeyRound size={16} />
                {recoveryCodesBusy
                  ? "Herstelcodes maken..."
                  : recoveryCodeStatus.remaining > 0
                    ? "Nieuwe codes maken"
                    : "Herstelcodes maken"}
              </button>
            </div>

            <div className="recovery-code-meta">
              <span>Laatst aangemaakt</span>
              <strong>{formatRecoveryCodeDate(recoveryCodeStatus.generatedAt)}</strong>
            </div>

            {recoveryCodes.length > 0 ? (
              <div className="recovery-code-result">
                <div className="recovery-code-warning">
                  Deze codes worden alleen nu getoond. Bewaar ze buiten de website.
                </div>
                <div className="recovery-code-grid">
                  {recoveryCodes.map((code) => <code key={code}>{code}</code>)}
                </div>
                <div className="button-row">
                  <button type="button" className="secondary-button" onClick={() => void copyRecoveryCodes()}>
                    {recoveryCodesCopied ? <Check size={16} /> : <Copy size={16} />}
                    {recoveryCodesCopied ? "Gekopieerd" : "Alles kopieren"}
                  </button>
                  <button type="button" className="secondary-button" onClick={downloadRecoveryCodes}>
                    <Download size={16} />
                    Download tekstbestand
                  </button>
                </div>
              </div>
            ) : null}

            {recoveryCodesMessage ? <div className="save-status">{recoveryCodesMessage}</div> : null}
          </section>
        ) : null}

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="brand-mark">Nieuwe gebruiker</div>
              <h2>Collega toegang geven</h2>
              <p className="subtext">Nodig een collega uit en kies direct de juiste rol.</p>
            </div>
            <div className="icon-badge">
              <UserPlus size={24} />
            </div>
          </div>

          <form onSubmit={createUser} className="field-grid-2">
            <label className="input-wrap">
              <span className="input-label">E-mailadres</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label className="input-wrap">
              <span className="input-label">Naam</span>
              <input
                className="input"
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Bijv. Erik"
              />
            </label>

            <label className="input-wrap">
              <span className="input-label">Rol</span>
              <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)}>
                {roles.map((item) => (
                  <option key={item} value={item}>
                    {ROLE_LABELS[item]}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit" className="primary-button create-user-button" disabled={busy}>
              <UserPlus size={16} />
              {busy ? "Aanmaken..." : "Gebruiker aanmaken"}
            </button>
          </form>

          {createStatus ? <div className="save-status">{createStatus}</div> : null}
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="brand-mark">Rollen overzicht</div>
              <h2>Wat mag je per rol?</h2>
              <p className="subtext">Kies per tabblad of een rol geen toegang, alleen lezen of schrijven krijgt.</p>
            </div>
          </div>

          <RoleTabAccessOverview
            access={roleTabAccess}
            disabled={roleTabsLoading || roleTabSavingKey !== null}
            roles={roles}
            savingKey={roleTabSavingKey}
            onChange={updateRoleTab}
          />

          <div className="save-status">
            {roleTabStatus ||
              "Wijzig een selectie om de rechten voor Calculator, Deals, Assets, Implementatie, Testen, Prijzen, Werkzaamheden en Admin per rol te beheren."}
          </div>
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="brand-mark">Gebruikers</div>
              <h2>Rolbeheer</h2>
            </div>
            <StatusPill tone="success">{profiles.length} profielen</StatusPill>
          </div>

          {loading ? <div className="save-status">Profielen worden geladen...</div> : null}
          {status ? <div className="save-status">{status}</div> : null}

          <div className="admin-user-list">
            {profiles.map((profile) => {
              const protectedProfile = isProtectedProfile(profile);

              return (
              <div key={profile.id} className="admin-user-card">
                <div>
                  <div className="package-name">
                    {profile.full_name || profile.email || profile.id}
                  </div>
                  <div className="subtext">{profile.email || "Geen e-mail"}</div>
                  <div className="subtext">
                    {profile.two_factor_enabled ? "2FA actief" : "2FA nog niet ingesteld"}
                  </div>
                  {protectedProfile ? <div className="subtext">Beschermde admin - rol en profielnaam niet aanpasbaar</div> : null}
                </div>

                <div className="field-grid-2">
                  <label className="input-wrap">
                    <span className="input-label">Functie</span>
                    <input
                      className="input"
                      type="text"
                      value={profile.job_title ?? ""}
                      disabled={protectedProfile}
                      onChange={(event) => updateProfileField(profile.id, "job_title", event.target.value)}
                      placeholder="IT Sales Consultant"
                    />
                  </label>

                  <label className="input-wrap">
                    <span className="input-label">Werkdagen</span>
                    <input
                      className="input"
                      type="text"
                      value={profile.workdays ?? ""}
                      disabled={protectedProfile}
                      onChange={(event) => updateProfileField(profile.id, "workdays", event.target.value)}
                      placeholder="di - wo - do - vr"
                    />
                  </label>

                  <label className="input-wrap">
                    <span className="input-label">Mobiel</span>
                    <input
                      className="input"
                      type="tel"
                      value={profile.mobile_phone ?? ""}
                      disabled={protectedProfile}
                      onChange={(event) => updateProfileField(profile.id, "mobile_phone", event.target.value)}
                      placeholder="+31 630 050 413"
                    />
                  </label>

                  <label className="input-wrap">
                    <span className="input-label">Medewerker relatie-ID</span>
                    <input
                      className="input"
                      type="text"
                      inputMode="numeric"
                      value={profile.employee_relation_id ?? ""}
                      onChange={(event) => updateEmployeeRelationId(profile.id, event.target.value)}
                      placeholder="Bijv. 2498"
                      maxLength={12}
                    />
                  </label>
                </div>

                <div className="button-row">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={profileSavingId === profile.id}
                    onClick={() => void saveProfile(profile)}
                  >
                    <Save size={16} />
                    {profileSavingId === profile.id ? "Opslaan..." : "Profiel opslaan"}
                  </button>

                  <span className="secondary-button">
                    <Users2 size={15} />
                    Huidig: {ROLE_LABELS[profile.role]}
                  </span>

                  {roles.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`secondary-button ${profile.role === item ? "active" : ""}`}
                      disabled={protectedProfile}
                      onClick={() => updateRole(profile.id, item)}
                    >
                      <ShieldCheck size={15} />
                      {ROLE_LABELS[item]}
                    </button>
                  ))}

                  <button
                    type="button"
                    className="secondary-button danger-button"
                    disabled={protectedProfile}
                    onClick={() => deleteUser(profile.id)}
                  >
                    Verwijderen
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!profile.two_factor_enabled || twoFactorResettingId === profile.id}
                    onClick={() => void resetTwoFactor(profile.id)}
                  >
                    <ShieldCheck size={15} />
                    {twoFactorResettingId === profile.id ? "2FA resetten..." : "2FA resetten"}
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    disabled={protectedProfile || passwordResettingId === profile.id}
                    onClick={() => void resetPassword(profile.id)}
                  >
                    <KeyRound size={15} />
                    {passwordResettingId === profile.id ? "Wachtwoord resetten..." : "Wachtwoord resetten"}
                  </button>
                </div>

                {passwordResetResult?.profileId === profile.id ? (
                  <div className="temporary-password-panel">
                    <div>
                      <div className="input-label">Tijdelijk wachtwoord voor {passwordResetResult.email}</div>
                      <code className="temporary-password-value">{passwordResetResult.temporaryPassword}</code>
                      <div className="subtext">Dit wachtwoord wordt alleen nu getoond en moet bij de eerste login worden gewijzigd.</div>
                    </div>
                    <button type="button" className="secondary-button" onClick={() => void copyTemporaryPassword()}>
                      {passwordCopied ? <Check size={16} /> : <Copy size={16} />}
                      {passwordCopied ? "Gekopieerd" : "Kopieren"}
                    </button>
                  </div>
                ) : null}
              </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
