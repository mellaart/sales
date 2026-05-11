"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useAuth } from "@/components/auth-provider";

const roles = [
  { value: "sales", label: "Sales" },
  { value: "support", label: "Support" },
  { value: "consultant", label: "Consultant" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
];

export default function AdminPage() {
  const { role, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState("sales");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return null;

  if (role !== "admin") {
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
      setStatus(`Fout: ${json.error}`);
      return;
    }

    setStatus("Gebruiker aangemaakt.");
    setEmail("");
    setPassword("");
    setNewRole("sales");
  }

  return (
    <div className="page-shell">
      <div className="container">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Admin</div>
            <h1>Gebruikersbeheer</h1>
            <p>Maak collega’s aan en geef ze direct de juiste rol binnen Smart Trade.</p>
          </div>
        </header>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Nieuwe gebruiker</div>
              <h2 className="headline">Collega toegang geven</h2>
              <p className="subtext">De gebruiker kan daarna direct inloggen met het ingestelde wachtwoord.</p>
            </div>
          </div>

          <form onSubmit={createUser} className="modern-auth-form">
            <label>
              <span>E-mailadres</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
            </label>

            <label>
              <span>Tijdelijk wachtwoord</span>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={6} />
            </label>

            <label>
              <span>Rol</span>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                {roles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit" className="modern-auth-primary" disabled={busy}>
              <UserPlus size={18} />
              {busy ? "Aanmaken..." : "Gebruiker aanmaken"}
            </button>
          </form>

          {status ? <div className="modern-auth-status">{status}</div> : null}
        </section>
      </div>
    </div>
  );
}