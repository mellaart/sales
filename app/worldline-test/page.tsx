import type { Metadata } from "next";
import Image from "next/image";
import {
  CheckCircle2,
  Download,
  FileCheck2,
  MonitorCheck,
  Network,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import styles from "./worldline-test.module.css";

export const metadata: Metadata = {
  title: "Worldline netwerkcontrole | Smart Trade",
  description: "Controleer vanaf het klantnetwerk de verbinding met de Worldline-diensten.",
  robots: {
    index: false,
    follow: false,
  },
};

const CONNECTIONS = [
  {
    name: "WIPay",
    host: "wt.worldline-solutions.com",
    port: 9001,
  },
  {
    name: "Transactiehost",
    host: "ctapccawl.payment.banksys.be",
    port: 20013,
  },
  {
    name: "Securityhost",
    host: "sp.payment.banksys.be",
    port: 5461,
  },
];

export default function WorldlineConnectivityTestPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.logoFrame}>
            <Image
              src="/smart-trade-logo.png"
              alt="Smart Trade"
              width={244}
              height={170}
              className={styles.logo}
              priority
            />
          </div>

          <div className={styles.headingCopy}>
            <span className={styles.kicker}>Worldline ondersteuning</span>
            <h1>Controleer uw netwerk voor de betaalterminal</h1>
            <p>
              Test vanaf een Windows-computer op hetzelfde netwerk als de betaalterminal of de vereiste
              Worldline-verbindingen bereikbaar zijn.
            </p>
          </div>

          <div className={styles.privacyNote}>
            <ShieldCheck size={22} aria-hidden="true" />
            <div>
              <strong>De test blijft lokaal</strong>
              <span>Er worden geen wachtwoorden, documenten of klantgegevens verstuurd.</span>
            </div>
          </div>
        </header>

        <section className={styles.downloadSection} aria-labelledby="download-heading">
          <div>
            <span className={styles.sectionLabel}>Windows 10 en 11</span>
            <h2 id="download-heading">Worldline Connectivity Test</h2>
            <p>
              De tool controleert DNS, uitgaande TCP-connectiviteit en reactietijd. Uw firewall wordt niet
              gewijzigd.
            </p>
          </div>

          <a
            className={styles.downloadButton}
            href="/downloads/Worldline-Connectivity-Test.zip"
            download
          >
            <Download size={20} aria-hidden="true" />
            Download Windows-test
          </a>
        </section>

        <section className={styles.stepsSection} aria-labelledby="steps-heading">
          <div className={styles.sectionHeading}>
            <MonitorCheck size={23} aria-hidden="true" />
            <h2 id="steps-heading">Uitvoeren op het klantnetwerk</h2>
          </div>

          <ol className={styles.steps}>
            <li>
              <span>1</span>
              <div>
                <strong>Download en pak het ZIP-bestand uit</strong>
                <p>Bewaar beide bestanden uit de map bij elkaar.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Start de controle</strong>
                <p>Dubbelklik op <code>Start-Worldline-Test.cmd</code> en kies vervolgens <em>Start test</em>.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Bewaar de uitslag</strong>
                <p>Sla het rapport op wanneer een verbinding rood wordt weergegeven.</p>
              </div>
            </li>
          </ol>
        </section>

        <section className={styles.connectionsSection} aria-labelledby="connections-heading">
          <div className={styles.sectionHeading}>
            <Network size={23} aria-hidden="true" />
            <h2 id="connections-heading">Geteste verbindingen</h2>
          </div>

          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Doel</th>
                  <th>Host</th>
                  <th>Protocol</th>
                  <th>Poort</th>
                </tr>
              </thead>
              <tbody>
                {CONNECTIONS.map((connection) => (
                  <tr key={connection.port}>
                    <td>{connection.name}</td>
                    <td><code>{connection.host}</code></td>
                    <td>TCP uitgaand</td>
                    <td>{connection.port}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.resultSection} aria-labelledby="result-heading">
          <div className={styles.sectionHeading}>
            <FileCheck2 size={23} aria-hidden="true" />
            <h2 id="result-heading">Betekenis van de uitslag</h2>
          </div>

          <div className={styles.resultRows}>
            <div className={styles.resultOk}>
              <CheckCircle2 size={22} aria-hidden="true" />
              <div>
                <strong>Bereikbaar</strong>
                <p>De computer kan vanaf dit netwerk een uitgaande TCP-verbinding opbouwen.</p>
              </div>
            </div>
            <div className={styles.resultWarning}>
              <TriangleAlert size={22} aria-hidden="true" />
              <div>
                <strong>Geblokkeerd, geweigerd of time-out</strong>
                <p>Laat de netwerkbeheerder de betreffende host en uitgaande TCP-poort controleren.</p>
              </div>
            </div>
          </div>
        </section>

        <footer className={styles.footer}>
          <span>Smart Trade · Troublefree B.V.</span>
          <span>support@smarttrade.nl · 0252 250 260</span>
        </footer>
      </div>
    </main>
  );
}
