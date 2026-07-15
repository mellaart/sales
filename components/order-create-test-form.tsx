"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Plus, RotateCcw, Search, ShoppingCart, Trash2 } from "lucide-react";
import { StatusPill } from "@/components/ui";

type OrderLineForm = {
  key: string;
  articleId: string;
  quantity: string;
  description: string;
  remark: string;
  price: string;
};

type OrderForm = {
  debtorId: string;
  reference: string;
  commentAboveLines: string;
  internalComment: string;
};

type OrderResponse = {
  previewed?: boolean;
  created?: boolean;
  orderId?: string | null;
  error?: string;
};

type ArticleOption = {
  id: string;
  code: string;
  description: string;
  price: number | null;
};

type ArticleSearchResponse = {
  articles?: ArticleOption[];
  error?: string;
};

const EMPTY_FORM: OrderForm = {
  debtorId: "",
  reference: "API testorder - mag verwijderd worden",
  commentAboveLines: "",
  internalComment: "Aangemaakt via de Sales testpagina.",
};

const INITIAL_LINE: OrderLineForm = {
  key: "line-1",
  articleId: "",
  quantity: "1",
  description: "",
  remark: "",
  price: "0,00",
};

function newLine(): OrderLineForm {
  return {
    key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    articleId: "",
    quantity: "1",
    description: "",
    remark: "",
    price: "0,00",
  };
}

function formatPrice(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function formatArticlePrice(value: number | null) {
  if (value === null) return "";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function ArticleDescriptionField({
  line,
  disabled,
  onChange,
  onSelect,
}: {
  line: OrderLineForm;
  disabled: boolean;
  onChange: (value: string) => void;
  onSelect: (article: ArticleOption) => void;
}) {
  const [active, setActive] = useState(false);
  const [articles, setArticles] = useState<ArticleOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const query = line.description.trim();
  const inputId = `order-description-${line.key}`;

  useEffect(() => {
    if (!active || query.length < 2) {
      setArticles([]);
      setBusy(false);
      setError("");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setBusy(true);
      setError("");

      try {
        const response = await fetch(`/api/smart-trade/test/articles/search?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = (await response.json().catch(() => null)) as ArticleSearchResponse | null;
        if (!response.ok) {
          setArticles([]);
          setError(result?.error || "Artikelen ophalen mislukt.");
          return;
        }
        setArticles(Array.isArray(result?.articles) ? result.articles : []);
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setArticles([]);
        setError(fetchError instanceof Error ? fetchError.message : "Artikelen ophalen mislukt.");
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [active, query]);

  const showResults = active && query.length >= 2;

  return (
    <div
      className="input-wrap order-test-description order-test-article-field"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActive(false);
      }}
    >
      <label className="input-label" htmlFor={inputId}>Orderregel omschrijving</label>
      <div className="order-test-article-input">
        <Search size={17} aria-hidden="true" />
        <input
          id={inputId}
          className="input"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showResults}
          aria-controls={`${inputId}-results`}
          value={line.description}
          onFocus={() => setActive(true)}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Zoek en selecteer een artikel"
          required
          maxLength={240}
          disabled={disabled}
        />
      </div>

      {line.articleId ? (
        <span className="order-test-article-selected">Artikel geselecteerd</span>
      ) : null}

      {showResults ? (
        <div className="order-test-article-results" id={`${inputId}-results`} role="listbox">
          {busy ? <div className="order-test-article-message">Artikelen laden...</div> : null}
          {!busy && error ? <div className="order-test-article-message error">{error}</div> : null}
          {!busy && !error && articles.length === 0 ? (
            <div className="order-test-article-message">Geen artikelen gevonden.</div>
          ) : null}
          {!busy && !error ? articles.map((article) => (
            <button
              type="button"
              role="option"
              aria-selected="false"
              className="order-test-article-option"
              key={`${article.id}:${article.code}`}
              onClick={() => {
                onSelect(article);
                setActive(false);
              }}
            >
              <span>
                <strong>{article.description}</strong>
                {article.code ? <small>Artikel {article.code}</small> : null}
              </span>
              {article.price !== null ? <b>{formatArticlePrice(article.price)}</b> : null}
            </button>
          )) : null}
        </div>
      ) : null}
    </div>
  );
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
    setForm((current) => ({ ...current, [field]: value }));
    invalidatePreview();
  }

  function updateLine(key: string, field: keyof Omit<OrderLineForm, "key">, value: string) {
    setLines((current) => current.map((line) => line.key === key
      ? {
        ...line,
        [field]: value,
        ...(field === "description" ? { articleId: "" } : {}),
      }
      : line));
    invalidatePreview();
  }

  function selectArticle(key: string, article: ArticleOption) {
    setLines((current) => current.map((line) => line.key === key
      ? {
        ...line,
        articleId: article.id,
        description: article.description,
        price: article.price === null ? line.price : formatPrice(article.price),
      }
      : line));
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
          lines: lines.map(({ articleId, quantity, description, remark, price }) => ({
            article: articleId,
            quantity,
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
              <ArticleDescriptionField
                line={line}
                disabled={Boolean(busyMode) || Boolean(createdOrderId)}
                onChange={(value) => updateLine(line.key, "description", value)}
                onSelect={(article) => selectArticle(line.key, article)}
              />
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
