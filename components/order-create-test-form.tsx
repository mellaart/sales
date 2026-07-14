"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Plus, RotateCcw, ShoppingCart, Trash2 } from "lucide-react";
import { StatusPill } from "@/components/ui";

type OrderLineForm = {
  key: string;
  quantity: string;
  unit: string;
  description: string;
  remark: string;
  price: string;
};

type OrderForm = {
  debtorId: string;
  invoiceRelationId: string;
  employeeId: string;
  reference: string;
  commentAboveLines: string;
  commentBelowLines: string;
  internalComment: string;
};

type OrderResponse = {
  previewed?: boolean;
  created?: boolean;
  orderId?: string | null;
  error?: string;
};

const EMPTY_FORM: OrderForm = {
  debtorId: "",
  invoiceRelationId: "",
  employeeId: "",
  reference: "API testorder - mag verwijderd worden",
  commentAboveLines: "",
  commentBelowLines: "",
  internalComment: "Aangemaakt via de Sales testpagina.",
};

const INITIAL_LINE: OrderLineForm = {
  key: "line-1",
  quantity: "1",
  unit: "st",
  description: "API testregel - mag verwijderd worden",
  remark: "",
  price: "0,00",
};

function newLine(): OrderLineForm {
  return {
    key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    quantity: "1",
    unit: "st",
    description: "",
    remark: "",
    price: "0,00",
  };
}

export default function OrderCreateTestForm() {
  const [form, setForm] = useState<OrderForm>(EMPTY_FORM);
  const [lines, setLines] = useState<OrderLineForm[]>([INITIAL_LINE]);
  const [busyMode, setBusyMode] = useState<"preview" | "create" | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  function invalidatePreview() {
    setPreviewReady(false);
    setCreatedOrderId(null);
    setStatus("");
  }

  function updateForm(field: keyof OrderForm, value: string) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "debtorId" && (!current.invoiceRelationId || current.invoiceRelationId === current.debtorId)) {
        next.invoiceRelationId = value;
      }
      return next;
    });
    invalidatePreview();
  }

  function updateLine(key: string, field: keyof Omit<OrderLineForm, "key">, value: string) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, [field]: value } : line));
    invalidatePreview();
  }

  function addLine() {
    setLines((current) => [...current, newLine()]);
    invalidatePreview();
  }

  function removeLine(key: string) {
    setLines((current) => current.length > 1 ? current.filter((line) => line.key !== key) : current);
    invalidatePreview();
  }

  async function sendOrder(mode: "preview" | "create") {
    if (busyMode || (mode === "create" && !previewReady) || createdOrderId) return;
    setBusyMode(mode);
    setStatus(mode === "preview" ? "Testorder wordt gecontroleerd..." : "Testorder wordt aangemaakt...");

    try {
      const response = await fetch("/api/smart-trade/test/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          mode,
          lines: lines.map(({ quantity, unit, description, remark, price }) => ({
            quantity,
            unit,
            description,
            remark,
            price,
          })),
        }),
      });
      const result = (await response.json().catch(() => null)) as OrderResponse | null;

      if (!response.ok) {
        setPreviewReady(false);
        setStatus(result?.error || "Testorder verwerken mislukt.");
        return;
      }

      if (mode === "preview" && result?.previewed) {
        setPreviewReady(true);
        setStatus("Ordercontrole geslaagd. De testorder kan nu worden aangemaakt.");
        return;
      }

      if (mode === "create" && result?.created) {
        setCreatedOrderId(result.orderId ?? "aangemaakt");
        setStatus(
          result.orderId
            ? `Testorder ${result.orderId} is aangemaakt.`
            : "De testorder is aangemaakt, maar de API gaf geen order-ID terug. Maak hem niet opnieuw aan.",
        );
        return;
      }

      setStatus("De Smart Trade API gaf geen herkenbaar resultaat terug.");
    } catch (error) {
      setPreviewReady(false);
      setStatus(error instanceof Error ? error.message : "Testorder verwerken mislukt.");
    } finally {
      setBusyMode(null);
    }
  }

  function previewOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendOrder("preview");
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setLines([INITIAL_LINE]);
    setBusyMode(null);
    setPreviewReady(false);
    setCreatedOrderId(null);
    setStatus("");
  }

  return (
    <section className="card panel stack-4 order-test-create">
      <div className="top-row">
        <div>
          <div className="eyebrow">Testadministratie</div>
          <h2 className="headline"><ShoppingCart size={25} />Nieuwe order</h2>
          <p className="subtext">Controleer de order eerst met de voorvertoning en maak hem daarna aan in troublefree_erik.</p>
        </div>
        <StatusPill tone={createdOrderId ? "success" : previewReady ? "success" : "warning"}>
          {createdOrderId ? "Order aangemaakt" : previewReady ? "Controle geslaagd" : "Nog niet gecontroleerd"}
        </StatusPill>
      </div>

      <form onSubmit={previewOrder} className="stack-4">
        <div className="field-grid-2">
          <label className="input-wrap">
            <span className="input-label">Debiteur relatie-ID</span>
            <input className="input" inputMode="numeric" value={form.debtorId} onChange={(event) => updateForm("debtorId", event.target.value)} required maxLength={12} />
          </label>
          <label className="input-wrap">
            <span className="input-label">Factuurrelatie-ID</span>
            <input className="input" inputMode="numeric" value={form.invoiceRelationId} onChange={(event) => updateForm("invoiceRelationId", event.target.value)} required maxLength={12} />
          </label>
          <label className="input-wrap">
            <span className="input-label">Medewerker relatie-ID</span>
            <input className="input" inputMode="numeric" value={form.employeeId} onChange={(event) => updateForm("employeeId", event.target.value)} required maxLength={12} />
          </label>
          <label className="input-wrap">
            <span className="input-label">Referentie</span>
            <input className="input" value={form.reference} onChange={(event) => updateForm("reference", event.target.value)} maxLength={180} />
          </label>
        </div>

        <div className="order-test-lines stack-3">
          <div className="top-row">
            <div>
              <div className="section-title">Orderregels</div>
              <p className="subtext">Prijzen worden exclusief btw naar de testadministratie gestuurd.</p>
            </div>
            <button type="button" className="secondary-button" onClick={addLine} disabled={Boolean(busyMode) || Boolean(createdOrderId)}>
              <Plus size={17} />Regel toevoegen
            </button>
          </div>

          {lines.map((line, index) => (
            <div className="order-test-line" key={line.key}>
              <label className="input-wrap">
                <span className="input-label">Aantal</span>
                <input className="input" inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(line.key, "quantity", event.target.value)} required />
              </label>
              <label className="input-wrap">
                <span className="input-label">Eenheid</span>
                <input className="input" value={line.unit} onChange={(event) => updateLine(line.key, "unit", event.target.value)} maxLength={30} />
              </label>
              <label className="input-wrap order-test-description">
                <span className="input-label">Omschrijving</span>
                <input className="input" value={line.description} onChange={(event) => updateLine(line.key, "description", event.target.value)} required maxLength={240} />
              </label>
              <label className="input-wrap">
                <span className="input-label">Prijs per stuk</span>
                <input className="input" inputMode="decimal" value={line.price} onChange={(event) => updateLine(line.key, "price", event.target.value)} required />
              </label>
              <label className="input-wrap order-test-remark">
                <span className="input-label">Opmerking</span>
                <input className="input" value={line.remark} onChange={(event) => updateLine(line.key, "remark", event.target.value)} maxLength={500} />
              </label>
              <button
                type="button"
                className="icon-button order-test-remove"
                title={`Orderregel ${index + 1} verwijderen`}
                aria-label={`Orderregel ${index + 1} verwijderen`}
                onClick={() => removeLine(line.key)}
                disabled={lines.length === 1 || Boolean(busyMode) || Boolean(createdOrderId)}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>

        <div className="field-grid-2">
          <label className="input-wrap">
            <span className="input-label">Tekst boven orderregels</span>
            <textarea className="input" value={form.commentAboveLines} onChange={(event) => updateForm("commentAboveLines", event.target.value)} rows={3} maxLength={1000} />
          </label>
          <label className="input-wrap">
            <span className="input-label">Tekst onder orderregels</span>
            <textarea className="input" value={form.commentBelowLines} onChange={(event) => updateForm("commentBelowLines", event.target.value)} rows={3} maxLength={1000} />
          </label>
          <label className="input-wrap">
            <span className="input-label">Interne opmerking</span>
            <textarea className="input" value={form.internalComment} onChange={(event) => updateForm("internalComment", event.target.value)} rows={3} maxLength={1000} />
          </label>
        </div>

        <div className="button-row">
          <button type="submit" className="secondary-button" disabled={Boolean(busyMode) || Boolean(createdOrderId)}>
            <CheckCircle2 size={17} />{busyMode === "preview" ? "Controleren..." : "Order controleren"}
          </button>
          <button type="button" className="primary-button" onClick={() => void sendOrder("create")} disabled={Boolean(busyMode) || !previewReady || Boolean(createdOrderId)}>
            <ShoppingCart size={17} />{busyMode === "create" ? "Aanmaken..." : createdOrderId ? `Order ${createdOrderId}` : "Order aanmaken in test"}
          </button>
          <button type="button" className="secondary-button" onClick={resetForm} disabled={Boolean(busyMode)}>
            <RotateCcw size={17} />Leegmaken
          </button>
        </div>

        {status ? <div className={`save-status ${previewReady || createdOrderId ? "success" : ""}`}>{status}</div> : null}
      </form>
    </section>
  );
}
