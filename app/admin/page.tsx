"use client";

import { useEffect, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { useAuth } from "@/components/auth-provider";

const roles = [
  "sales",
  "support",
  "consultant",
  "manager",
  "admin",
];

type UserRecord = {
  id: string;
  email: string;
  role: string;
  created_at: string;
};

export default function AdminPage() {
  const { role, loading } = useAuth();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState("sales");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadUsers() {
    const response = await fetch("/api/admin/users/list");
    const json = await response.json();

    if (response.ok) {
      setUsers(json.users || []);
    }
  }

  useEffect(() => {
    if (role === "admin") {
      void loadUsers();
    }
  }, [role]);

  if (loading) return null;

  if (role !== "admin") {
    return (
      <div className="page-shell">
        <div className="container">
          <section className="card panel">
            <h1>Geen toegang</h1>
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        role: newRole,
      }),
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

    await loadUsers();
  }

  async function deleteUser(userId: string) {
    const confirmed = confirm("Weet je zeker dat je deze gebruiker wilt verwijderen?");

    if (!confirmed) return;

    const response = await fetch("/api/admin/users/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
      }),
    });

    if (response.ok) {
      await loadUsers();
    }
  }

  return (
    <div className="page-shell">
      <div className="container stack-4">

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Admin</div>
              <h1 className="headline">Gebruikersbeheer</h1>
              <p className="subtext">
                Voeg collega’s toe en beheer toegang binnen Smart Trade.
              </p>
            </div>
          </div>

          <form onSubmit={createUser} className="modern-auth-form">
            <label>
              <span>E-mailadres</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
              />
            </label>

            <label>
              <span>Tijdelijk wachtwoord</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                minLength={6}
              />
            </label>

            <label>
              <span>Rol</span>

              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="modern-auth-primary"
              disabled={busy}
            >
              <UserPlus size={18} />
              {busy ? "Aanmaken..." : "Gebruiker aanmaken"}
            </button>
          </form>

          {status ? (
            <div className="modern-auth-status">{status}</div>
          ) : null}
        </section>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Overzicht</div>
              <h2 className="headline">Alle gebruikers</h2>
            </div>
          </div>

          <div className="table-card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>E-mail</th>
                    <th>Rol</th>
                    <th>Aangemaakt</th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.email}</td>

                      <td>
                        <span className="status-pill success">
                          {user.role}
                        </span>
                      </td>

                      <td>
                        {new Date(user.created_at).toLocaleDateString("nl-NL")}
                      </td>

                      <td>
                        <button
                          className="secondary-button"
                          onClick={() => deleteUser(user.id)}
                        >
                          <Trash2 size={14} />
                          Verwijderen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}