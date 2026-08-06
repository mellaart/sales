import type { Metadata } from "next";
import Image from "next/image";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Globe2,
  LockKeyhole,
  MapPin,
  Monitor,
  PackageCheck,
  UserRound,
} from "lucide-react";
import PublicDnsRefreshButton from "@/components/public-dns-refresh-button";
import {
  IMPLEMENTATION_DNS_RECORDS,
  type DnsCheckItem,
} from "@/lib/implementation-dns";
import { getPublicImplementationPortal } from "@/lib/implementation-portal-server";
import styles from "./implementation-progress.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Voortgang implementatie | Smart Trade",
  description: "Bekijk de voortgang en afspraken van uw Smart Trade-implementatie.",
  robots: { index: false, follow: false },
};

const dateFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value: string | null) {
  if (!value) return "Nog niet gepland";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "Nog niet gepland" : dateFormatter.format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateTimeFormatter.format(date);
}

function appointmentTime(startTime: string, endTime: string) {
  if (startTime && endTime) return `${startTime} - ${endTime}`;
  if (startTime) return `Vanaf ${startTime}`;
  return "Tijd volgt";
}

function DnsResultRow({
  label,
  value,
  result,
}: {
  label?: string;
  value: string;
  result?: DnsCheckItem;
}) {
  const toneClass = result?.status === "pass"
    ? styles.dnsRowPass
    : result?.status === "fail"
      ? styles.dnsRowFail
      : result?.status === "error"
        ? styles.dnsRowError
        : styles.dnsRowPending;

  return (
    <div className={`${styles.dnsRow} ${toneClass}`}>
      <span className={styles.dnsStatus} aria-hidden="true">
        {result?.status === "pass" ? <CheckCircle2 size={18} /> : null}
        {result?.status === "fail" || result?.status === "error"
          ? <AlertTriangle size={18} />
          : null}
        {!result ? <Clock3 size={18} /> : null}
      </span>
      <div>
        {label ? <span>{label}</span> : null}
        <strong>{value}</strong>
        {result?.message ? <small>{result.message}</small> : null}
      </div>
    </div>
  );
}

export default async function ImplementationProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{ accessId: string }>;
  searchParams: Promise<{ token?: string; v?: string }>;
}) {
  const { accessId } = await params;
  const query = await searchParams;
  const result = await getPublicImplementationPortal(
    accessId,
    Number(query.v ?? 0),
    query.token ?? "",
  );

  if (!result.ok) {
    return (
      <main className={styles.page}>
        <section className={styles.unavailable}>
          <Image src="/smart-trade-logo.png" alt="Smart Trade" width={244} height={170} priority />
          <LockKeyhole size={34} aria-hidden="true" />
          <h1>Klantpagina niet beschikbaar</h1>
          <p>{result.error}</p>
          <p>Vraag uw contactpersoon om een nieuwe beveiligde link.</p>
        </section>
      </main>
    );
  }

  const { portal } = result;
  const completedBaseItems = portal.baseItems.filter((item) => item.completed).length;
  const completedItems = portal.items.filter((item) => item.completed).length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Image
            src="/smart-trade-logo.png"
            alt="Smart Trade"
            width={244}
            height={170}
            className={styles.logo}
            priority
          />
          <span className={styles.secureLabel}><LockKeyhole size={16} /> Beveiligde klantpagina</span>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.content}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Implementatie voor {portal.customerName}</span>
            <h1>Uw voortgang bij Smart Trade</h1>
            <p>{portal.quoteTitle}</p>
          </div>
          <div className={styles.statusBlock}>
            <span>Huidige status</span>
            <strong>{portal.statusLabel}</strong>
            <small>Laatst bijgewerkt: {formatDateTime(portal.updatedAt)}</small>
          </div>
        </div>
      </section>

      <section className={styles.progressBand}>
        <div className={styles.content}>
          <div className={styles.progressHeading}>
            <div>
              <span>Totale voortgang</span>
              <strong>{portal.progressPercentage}% afgerond</strong>
            </div>
            <span>Planning en uitvoering</span>
          </div>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-label="Voortgang implementatie"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={portal.progressPercentage}
          >
            <span style={{ width: `${portal.progressPercentage}%` }} />
          </div>

          <dl className={styles.summaryGrid}>
            <div><dt><PackageCheck size={18} /> Pakket</dt><dd>{portal.packageName}</dd></div>
            <div><dt><UserRound size={18} /> Contactpersoon</dt><dd>{portal.consultantName}</dd></div>
            <div><dt><CalendarDays size={18} /> Start implementatie</dt><dd>{formatDate(portal.implementationStartDate)}</dd></div>
            <div><dt><CheckCircle2 size={18} /> Geplande livegang</dt><dd>{formatDate(portal.plannedGoLiveDate)}</dd></div>
          </dl>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.content}>
          <div className={styles.sectionHeading}>
            <div><span>Planning</span><h2>Afspraken</h2></div>
            <p>De ingeplande momenten worden hier direct bijgewerkt.</p>
          </div>

          {portal.appointments.length > 0 ? (
            <div className={styles.appointmentList}>
              {portal.appointments.map((appointment) => (
                <article key={appointment.id} className={styles.appointment}>
                  <time dateTime={appointment.appointmentDate}>
                    <strong>{formatDate(appointment.appointmentDate)}</strong>
                    <span>{appointmentTime(appointment.startTime, appointment.endTime)}</span>
                  </time>
                  <div className={styles.appointmentCopy}>
                    <strong>{appointment.title}</strong>
                    <span>
                      {appointment.appointmentType === "on_site"
                        ? <><MapPin size={16} /> Op locatie</>
                        : <><Monitor size={16} /> Online / op afstand</>}
                    </span>
                    {appointment.customerNote ? <p>{appointment.customerNote}</p> : null}
                  </div>
                  <span className={`${styles.appointmentStatus} ${appointment.status === "completed" ? styles.completed : ""}`}>
                    {appointment.status === "completed" ? "Afgerond" : "Gepland"}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.emptyAppointments}>
              <Clock3 size={24} />
              <div><strong>Nog geen afspraken gepland</strong><span>Uw consultant vult de planning hier aan.</span></div>
            </div>
          )}
        </div>
      </section>

      <section className={`${styles.section} ${styles.altSection}`}>
        <div className={styles.content}>
          <article className={styles.dnsCard}>
            <header className={styles.dnsHeader}>
              <span className={styles.dnsIcon}><Globe2 size={24} /></span>
              <div>
                <span>DNS-instructies</span>
                <h2>{portal.dnsDomain || "Website nog niet ontvangen"}</h2>
                <p>Automatische controle van de verplichte SPF- en DKIM-records.</p>
              </div>
              <PublicDnsRefreshButton
                className={styles.dnsRefreshButton}
                disabled={!portal.dnsDomain}
              />
            </header>

            <div className={styles.dnsResults}>
              <div className={styles.dnsGroup}>
                <h3>SPF-record</h3>
                <DnsResultRow
                  value={IMPLEMENTATION_DNS_RECORDS.spfSmartsoft}
                  result={portal.dnsCheck?.checks.spfSmartsoft}
                />
                <DnsResultRow
                  value={IMPLEMENTATION_DNS_RECORDS.spfTroublefree}
                  result={portal.dnsCheck?.checks.spfTroublefree}
                />
              </div>

              <div className={styles.dnsGroup}>
                <h3>DKIM-record 1</h3>
                <DnsResultRow
                  label={`Naam: ${IMPLEMENTATION_DNS_RECORDS.dkimSmartsoftName}`}
                  value={`Type: CNAME | Waarde: ${IMPLEMENTATION_DNS_RECORDS.dkimSmartsoftTarget}`}
                  result={portal.dnsCheck?.checks.dkimSmartsoft}
                />
              </div>

              <div className={styles.dnsGroup}>
                <h3>DKIM-record 2</h3>
                <DnsResultRow
                  label={`Naam: ${IMPLEMENTATION_DNS_RECORDS.dkimTroublefreeName}`}
                  value={`Type: CNAME | Waarde: ${IMPLEMENTATION_DNS_RECORDS.dkimTroublefreeTarget}`}
                  result={portal.dnsCheck?.checks.dkimTroublefree}
                />
              </div>
            </div>

            <footer className={styles.dnsSummary}>
              {portal.dnsCheck?.checkedAt
                ? `Laatst gecontroleerd: ${formatDateTime(portal.dnsCheck.checkedAt)}`
                : portal.dnsCheckMessage}
            </footer>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.content}>
          <div className={styles.sectionHeading}>
            <div><span>Uw pakket</span><h2>Basisfunctionaliteiten</h2></div>
            <p>{completedBaseItems}/{portal.baseItems.length} basisfunctionaliteiten afgerond</p>
          </div>
          <div className={styles.baseFeatureGrid}>
            {portal.baseItems.map((feature) => (
              <article
                key={feature.key}
                className={`${styles.baseFeatureCard} ${feature.completed ? styles.baseFeatureDone : ""}`}
              >
                <div>
                  <span className={styles.baseFeatureStatus}>
                    {feature.completed
                      ? <Check size={18} aria-hidden="true" />
                      : <PackageCheck size={18} aria-hidden="true" />}
                  </span>
                  <strong>{feature.label}</strong>
                </div>
                <p>{feature.description}</p>
                <small>{feature.completed ? "Afgerond" : "In voorbereiding"}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.altSection}`}>
        <div className={styles.content}>
          <div className={styles.sectionHeading}>
            <div><span>Uitbreidingen</span><h2>Modules en koppelingen</h2></div>
            <p>{completedItems}/{portal.items.length} onderdelen afgerond</p>
          </div>
          {portal.items.length > 0 ? (
            <div className={styles.itemGrid}>
              {portal.items.map((item) => (
                <div key={item.key} className={item.completed ? styles.done : ""}>
                  <span>{item.completed ? <Check size={17} /> : <PackageCheck size={17} />}</span>
                  <strong>{item.label}</strong>
                  <small>{item.completed ? "Afgerond" : "In voorbereiding"}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.noItems}>Er zijn geen aanvullende modules of koppelingen voor deze implementatie geregistreerd.</p>
          )}
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.content}>
          <strong>Smart Trade</strong>
          <span>Pletterij 1A, 2211 JT Noordwijkerhout</span>
          <span>0252 250 260 | support@smarttrade.nl</span>
        </div>
      </footer>
    </main>
  );
}
