"use client";

import { useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, Users2 } from "lucide-react";
import { canManageRoles, getSupabaseClient, type ProfileRecord, type UserRole } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { StatusPill } from "@/components/ui";

const ROLES: UserRole[] = ["sales", "manager", "admin"];

export default function AdminDashboard() {
  const { role, refreshProfile } = useAuth();
  const supabase = getSupabaseClient();
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  async function loadProfiles() {
    if (!supabase) {
      setStatus("Supabase keys ontbreken. Vul NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY in.");
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) {
      setStatus(`Profielen laden mislukt: ${error.message}`);
      setLoading(false);
      return;
    }

    setProfiles((data ?? []) as ProfileRecord[]);
    setStatus("");
    setLoading(false);
  }

  useEffect(() => {
    if (canManageRoles(role)) {
      void loadProfiles();
    } else {
      setLoading(false);
    }
  }, [role]);

  async function updateRole(profileId: string, nextRole: UserRole) {
    if (!supabase) return;
    const { error } = await supabase.from("profiles").update({ role: nextRole }).eq("id", profileId);
    if (error) {
      setStatus(`Rol wijzigen mislukt: ${error.message}`);
      return;
    }
    setStatus("Rol bijgewerkt.");
    await loadProfiles();
    await refreshProfile();
  }

  if (!canManageRoles(role)) {
    return <div className="save-status">Alleen admins mogen rollen beheren.</div>;
  }

  return (
    <div className="page-shell">
      <div className="container">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Smart Trade</div>
            <h1>Admin en rollen</h1>
            <p>Beheer gebruikersrollen voor sales, managers en admins. Managers mogen alle deals zien; admins beheren ook rollen.</p>
          </div>
          <div className="brand-actions">
            <StatusPill tone="success">Rollen actief</StatusPill>
            <button type="button" className="primary-button" onClick={() => void loadProfiles()}><RefreshCw size={16} /> Vernieuwen</button>
          </div>
        </header>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Gebruikers</div>
              <h2 className="headline">Rolbeheer</h2>
            </div>
            <StatusPill tone="neutral">{profiles.length} profielen</StatusPill>
          </div>

          {loading ? <div className="save-status">Profielen worden geladen...</div> : null}
          {status ? <div className="save-status">{status}</div> : null}

          <div className="deal-list">
            {profiles.map((profile) => (
              <div key={profile.id} className="deal-row">
                <div>
                  <div className="package-name">{profile.full_name || profile.email || profile.id}</div>
                  <div className="muted small-gap">{profile.email || "Geen e-mail"}</div>
                </div>
                <div className="button-row compact">
                  <div className="user-chip"><Users2 size={14} /> Huidig: {profile.role}</div>
                  {ROLES.map((nextRole) => (
                    <button
                      key={nextRole}
                      type="button"
                      className={`secondary-button ${profile.role === nextRole ? "active" : ""}`}
                      onClick={() => void updateRole(profile.id, nextRole)}
                      disabled={profile.role === nextRole}
                    >
                      <ShieldCheck size={14} /> {nextRole}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
