import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function base64Lines(value: string) {
  return Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
}

export async function sendPasswordResetEmail(recipient: string, token: string) {
  const sender = (process.env.SALES_NOTIFICATION_FROM_EMAIL || "notifications@sales.troublefree.nl").trim();
  const emailPattern = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
  if (!emailPattern.test(sender) || !emailPattern.test(recipient)) throw new Error("Ongeldig mailadres.");
  // Never derive a recovery link from a caller-controlled Host or redirectTo value.
  const url = new URL("/reset-password", process.env.SALES_PUBLIC_URL || "https://sales.troublefree.nl");
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("SALES_PUBLIC_URL moet een veilige HTTPS-URL zijn.");
  // A fragment keeps the secret out of access logs and referrer headers.
  url.hash = new URLSearchParams({ recovery_token: token }).toString();
  const text = [
    "Beste collega,", "",
    "Je hebt een nieuw wachtwoord aangevraagd voor Smart Trade Sales.",
    "Open de onderstaande link om je wachtwoord te wijzigen:", "", url.href, "",
    "Deze link is 30 minuten geldig en kan eenmalig worden gebruikt.",
    "Log daarna opnieuw in met je nieuwe wachtwoord en de gebruikelijke 2FA-verificatie.", "",
    "Heb je dit niet aangevraagd? Negeer deze e-mail. Je huidige wachtwoord blijft ongewijzigd.", "",
    "Met vriendelijke groet,", "Smart Trade Sales",
  ].join("\r\n");
  const html = `<div style="font-family:Calibri,Arial,sans-serif;font-size:16px;line-height:1.6;color:#172033">
    <h2>Wachtwoord herstellen</h2><p>Beste collega,</p>
    <p>Je hebt een nieuw wachtwoord aangevraagd voor Smart Trade Sales.</p>
    <p><a href="${escapeHtml(url.href)}" style="display:inline-block;padding:12px 20px;background:#215ce5;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:bold">Nieuw wachtwoord instellen</a></p>
    <p>Deze link is 30 minuten geldig en kan eenmalig worden gebruikt. Log daarna opnieuw in met je nieuwe wachtwoord en de gebruikelijke 2FA-verificatie.</p>
    <p>Heb je dit niet aangevraagd? Negeer deze e-mail. Je huidige wachtwoord blijft ongewijzigd.</p>
    <p>Werkt de knop niet? Open deze link:<br><a href="${escapeHtml(url.href)}">${escapeHtml(url.href)}</a></p>
    <p>Met vriendelijke groet,<br>Smart Trade Sales</p></div>`;
  const boundary = `password-reset-${randomUUID()}`;
  const message = [
    `From: Smart Trade Sales <${sender}>`, `To: ${recipient}`,
    "Subject: Wachtwoord herstellen - Smart Trade Sales",
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${sender.split("@")[1]}>`,
    "MIME-Version: 1.0", `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
    `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", base64Lines(text), "",
    `--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", base64Lines(html), "",
    `--${boundary}--`, "",
  ].join("\r\n");

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.env.SALES_SENDMAIL_PATH || "/usr/sbin/sendmail", ["-i", "-t", "-f", sender], {
      stdio: ["pipe", "ignore", "ignore"],
    });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Mailserver timeout."));
    }, 15_000);
    child.on("error", () => {
      clearTimeout(timeout);
      reject(new Error("Mailserver niet beschikbaar."));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error("Mailserver heeft de herstelmail niet geaccepteerd."));
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(message, "utf8");
  });
}
