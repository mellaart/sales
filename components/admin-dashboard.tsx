"use client";

import { useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, UserPlus, Users2 } from "lucide-react";
import {
  canManageRoles,
  getSupabaseClient,
  type ProfileRecord,
  type UserRole,
} from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { StatusPill } from "@/components/ui";

const roles: UserRole[] = ["sales", "support", "consultant", "manager", "admin"];

export default function AdminDashboard() {
  const { role, refreshProfile } = useAuth();
  const supabase = getSupabaseClient();

  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("sales");
  const [busy, setBusy] = useState(false);

  async function loadProfiles() {
    if (!supabase) return;

    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,full_name,role,created_at,updated_at")
      .order("email");

    if (error) {
      setStatus(`Profielen laden mislukt: ${error.message}`);
      setLoading(false);
      return;
    }

    setProfiles((data ?? []) as ProfileRecord[]);
    setLoading(false);
  }

  useEffect(() => {
    if (canManageRoles(role)) {
      void loadProfiles();
    }
  }, [role]);

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("");

    const response = await fetch("/api/admin/users/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role: newRole }),
    });

    const json = await response.json();
    setBusy(false);

    if (!response.ok) {
      setStatus(json.error || "Gebruiker aanmaken mislukt.");
      return;
    }

    setEmail("");
    setPassword("");
    setNewRole("sales");
    setStatus("Gebruiker aangemaakt.");
    await loadProfiles();
  }

  async function updateRole(profileId: string, nextRole: UserRole) {
    if (!supabase) return;

    const { error } = await supabase
      .from("profiles")
      .update({ role: nextRole } as never)
      .eq("id", profileId);

    if (error) {
      setStatus(`Rol wijzigen mislukt: ${error.message}`);
      return;
    }

    setStatus("Rol bijgewerkt.");
    await loadProfiles();
    await refreshProfile();
  }

  async function deleteUser(profileId: string) {
    const confirmed = confirm("Weet je zeker dat je deze gebruiker wilt verwijderen?");
    if (!confirmed) return;

    const response = await fetch("/api/admin/users/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: profileId }),
    });

    const json = await response.json();

    if (!response.ok) {
      setStatus(json.error || "Gebruiker verwijderen mislukt.");
      return;
    }

    setStatus("Gebruiker verwijderd.");
    await loadProfiles();
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
            <p>Voeg collega’s toe en beheer hun toegang binnen Smart Trade.</p>
          </div>

          <div className="brand-actions">
            <StatusPill tone="success">Rollen actief</StatusPill>
            <button type="button" className="primary-button" onClick={loadProfiles}>
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
              <p className="subtext">Maak een account aan en kies direct de juiste rol.</p>
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
              <span className="input-label">Tijdelijk wachtwoord</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
              />
            </label>

            <label className="input-wrap">
              <span className="input-label">Rol</span>
              <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)}>
                {roles.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit" className="primary-button" disabled={busy}>
              <UserPlus size={16} />
              {busy ? "Aanmaken..." : "Gebruiker aanmaken"}
            </button>
          </form>
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
            {profiles.map((profile) => (
              <div key={profile.id} className="admin-user-card">
                <div>
                  <div className="package-name">
                    {profile.full_name || profile.email || profile.id}
                  </div>
                  <div className="subtext">{profile.email || "Geen e-mail"}</div>
                </div>

                <div className="button-row">
                  <span className="secondary-button">
                    <Users2 size={15} />
                    Huidig: {profile.role}
                  </span>

                  {roles.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`secondary-button ${profile.role === item ? "active" : ""}`}
                      onClick={() => updateRole(profile.id, item)}
                    >
                      <ShieldCheck size={15} />
                      {item}
                    </button>
                  ))}

                  <button
                    type="button"
                    className="secondary-button danger-button"
                    onClick={() => deleteUser(profile.id)}
                  >
                    Verwijderen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}