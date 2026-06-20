"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Save, ShieldCheck, UserPlus, Users2 } from "lucide-react";
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

type EditableProfileField = "job_title" | "workdays" | "mobile_phone";

function isProtectedProfile(profile: Pick<ProfileRecord, "email">) {
  return isProtectedAdminEmail(profile.email);
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
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
  const { role, loading: authLoading, refreshProfile } = useAuth();
  const router = useRouter();
  const supabase = getSupabaseClient();

  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [createStatus, setCreateStatus] = useState("");

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("sales");
  const [busy, setBusy] = useState(false);
  const [profileSavingId, setProfileSavingId] = useState<string | null>(null);

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

  useEffect(() => {
    if (canManageRoles(role)) {
      void loadProfiles();
      void loadRoleTabs();
    }
  }, [role, loadProfiles, loadRoleTabs]);

  async function refreshAdminData() {
    await Promise.all([loadProfiles(), loadRoleTabs()]);
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

      const json = (await response.json().catch(() => ({}))) as { error?: string; existing?: boolean };

      if (!response.ok) {
        setCreateStatus(json.error || `Gebruiker aanmaken mislukt (${response.status}).`);
        return;
      }

      setEmail("");
      setFullName("");
      setNewRole("sales");
      setCreateStatus(
        json.existing
          ? "Gebruiker bestond al. Profiel en rol zijn bijgewerkt."
          : "Gebruiker uitgenodigd. Er is een activatiemail verstuurd.",
      );
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

  async function saveProfileSignature(profile: ProfileRecord) {
    if (!supabase) return;

    if (isProtectedProfile(profile)) {
      setStatus("Deze beschermde admin-gebruiker kan niet worden aangepast.");
      return;
    }

    setProfileSavingId(profile.id);
    setStatus("Handtekeninggegevens worden opgeslagen...");

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
        }),
      });

      const json = (await response.json().catch(() => ({}))) as { error?: string; metadataWarning?: string | null };

      if (!response.ok) {
        setStatus(json.error || "Handtekeninggegevens opslaan mislukt.");
        return;
      }

      setStatus(json.metadataWarning ? `Profiel opgeslagen. Metadata waarschuwing: ${json.metadataWarning}` : "Handtekeninggegevens opgeslagen.");
      await loadProfiles({ keepStatus: true });
      await refreshProfile();
    } catch {
      setStatus("Er ging iets mis bij het opslaan van de handtekeninggegevens.");
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
              "Wijzig een selectie om de rechten voor Calculator, Deals, Assets, Testen, Prijzen en Admin per rol te beheren."}
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
                  {protectedProfile ? <div className="subtext">Beschermde admin - niet aanpasbaar</div> : null}
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

                  <button
                    type="button"
                    className="secondary-button create-user-button"
                    disabled={protectedProfile || profileSavingId === profile.id}
                    onClick={() => void saveProfileSignature(profile)}
                  >
                    <Save size={16} />
                    {profileSavingId === profile.id ? "Opslaan..." : "Handtekening opslaan"}
                  </button>
                </div>

                <div className="button-row">
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
                </div>
              </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
