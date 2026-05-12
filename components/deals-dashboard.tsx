"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, RefreshCw, Search, Trash2 } from "lucide-react";
import { euro } from "@/lib/pricing";
import { canViewAllDeals, type DealRecord, getSupabaseClient } from "@/lib/supabase";
import { StatusPill } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";

export default function DealsDashboard() {
  const { user, role } = useAuth();
  const supabase = getSupabaseClient();
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  async function loadDeals() {
    if (!user) {
      setStatus("Je moet ingelogd zijn om deals te bekijken.");
      setLoading(false);
      return;
    }

    if (!supabase) {
      setStatus("Supabase keys ontbreken. Vul NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY in.");
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.from("deals").select("*").order("created_at", { ascending: false });
    if (error) {
      setStatus(`Deals laden mislukt: ${error.message}`);
      setLoading(false);
      return;
    }

    setDeals((data ?? []) as DealRecord[]);
    setStatus("");
    setLoading(false);
  }

  useEffect(() => {
    void loadDeals();
  }, [user, role]);

  const filteredDeals = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return deals;
    return deals.filter((deal) =>
      [
  deal.customer_name,
  deal.quote_title,
  deal.contact_name,
  deal.package_key,
  deal.sales_name,
]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [deals, query]);

  const handleDelete = async (deal: DealRecord) => {
    if (!supabase) return;
    const confirmed = window.confirm(`Weet je zeker dat je deal van ${deal.customer_name || deal.quote_title} wilt verwijderen?`);
    if (!confirmed) return;

    const { error } = await supabase.from("deals").delete().eq("id", deal.id);
    if (error) {
      setStatus(`Verwijderen mislukt: ${error.message}`);
      return;
    }

    setStatus("Deal verwijderd.");
    await loadDeals();
  };

  return (
    <div className="page-shell">
      <div className="container">
        <header className="brand-hero card">
          <div>
            <div className="brand-mark">Smart Trade</div>
            <h1>Deal overzicht</h1>
            <p>
              {canViewAllDeals(role)
                ? "Je ziet alle deals dankzij je manager/admin rol. Zoek op klant, pakket of sales consultant en open een deal voor herberekening."
                : "Je ziet alleen je eigen opgeslagen deals. Zoek op klant of pakket en open elke deal als volledige calculator voor herberekening."}
            </p>
          </div>
          <div className="brand-actions">
            <Link href="/" className="secondary-button"><ArrowLeft size={16} /> Terug naar calculator</Link>
            <button type="button" className="primary-button" onClick={() => void loadDeals()}><RefreshCw size={16} /> Vernieuwen</button>
          </div>
        </header>

        <section className="card panel">
          <div className="top-row">
            <div>
              <div className="eyebrow">Deals</div>
              <h2 className="headline">Overzicht</h2>
            </div>
            <StatusPill tone="neutral">{filteredDeals.length} resultaten</StatusPill>
          </div>

          <div className="search-row">
            <div className="search-box">
              <Search size={16} />
              <input className="search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek op klant, voorstel, contact, pakket of sales" />
            </div>
          </div>

          {loading ? <div className="save-status">Deals worden geladen...</div> : null}
          {status ? <div className="save-status">{status}</div> : null}

          <div className="deal-list">
            {filteredDeals.map((deal) => (
              <div key={deal.id} className="deal-row">
                <div>
                  <div className="package-name">{deal.customer_name || "Onbekende klant"}</div>
                  <div className="muted small-gap">{deal.quote_title} · {deal.package_name} · {deal.total_users} gebruikers</div>
                  <div className="muted small-gap">Sales: {deal.sales_name || "-"} · Maand: {euro.format(Number(deal.monthly_total || 0))}</div>
                </div>
                <div className="button-row compact">
                  <Link href={`/deals/${deal.id}`} className="primary-button"><ExternalLink size={16} /> Open detail</Link>
                  <button type="button" className="secondary-button danger" onClick={() => void handleDelete(deal)}><Trash2 size={16} /> Verwijder</button>
                </div>
              </div>
            ))}
            {!loading && filteredDeals.length === 0 ? <div className="save-status">Geen deals gevonden.</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
