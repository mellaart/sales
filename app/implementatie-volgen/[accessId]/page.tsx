import type { Metadata } from "next";
import Image from "next/image";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  MapPin,
  Monitor,
  PackageCheck,
  UserRound,
} from "lucide-react";
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
  const completedMilestones = portal.milestones.filter((milestone) => milestone.completed).length;
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
            <span>{completedMilestones}/{portal.milestones.length} mijlpalen</span>
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
          <div className={styles.sectionHeading}>
            <div><span>Werkzaamheden</span><h2>Voortgang implementatie</h2></div>
            <p>Afgeronde stappen zijn groen gemarkeerd.</p>
          </div>
          <div className={styles.milestoneList}>
            {portal.milestones.map((milestone, index) => (
              <div key={milestone.key} className={milestone.completed ? styles.done : ""}>
                <span>{milestone.completed ? <Check size={18} /> : index + 1}</span>
                <strong>{milestone.label}</strong>
                <small>{milestone.completed ? "Afgerond" : "Openstaand"}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.content}>
          <div className={styles.sectionHeading}>
            <div><span>Onderdelen</span><h2>Modules en koppelingen</h2></div>
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
            <p className={styles.noItems}>Er zijn geen losse modules voor deze implementatie geregistreerd.</p>
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
