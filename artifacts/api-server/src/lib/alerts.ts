/**
 * Generic outbound alert webhook. Posts a Slack-compatible JSON payload to a
 * URL configured via the `system_flags` table (scope `system`, keys
 * `alert_webhook_url` + `alert_webhook_enabled`).
 *
 * Slack incoming webhooks accept `{text}` with optional `blocks`. Most
 * generic webhook receivers (Discord, Mattermost, custom HTTP collectors)
 * also accept this shape, so it's a reasonable lowest-common-denominator.
 *
 * Failure mode: alert delivery never throws to its caller. We log and move on
 * — an alert pipeline failing should not cascade into the thing that was
 * trying to alert (e.g. a failing job).
 *
 * SSRF mitigations applied here:
 *  1. Redirect following is disabled — the connection target is fixed to the
 *     validated URL and any 3xx response is treated as a delivery failure,
 *     preventing a redirect-based bypass of validateWebhookUrl().
 *  2. DNS is pinned — after validateWebhookUrl() resolves and approves the
 *     hostname, that same resolved IP is used for the TCP connection via
 *     https.request() with the original hostname supplied as the TLS SNI and
 *     Host header.  This closes the TOCTOU window between validation-time DNS
 *     and delivery-time DNS that enables DNS-rebinding attacks.
 */
import https from "node:https";
import { URL } from "node:url";
import { queryOne } from "../routes/ops/db.js";
import { logger } from "./logger.js";
import { validateWebhookUrl } from "./webhookUrlValidation.js";

const TIMEOUT_MS = 5000;

interface AlertWebhookConfig {
  url: string | null;
  enabled: boolean;
}

async function getConfig(): Promise<AlertWebhookConfig> {
  const row = await queryOne<{ flags: Record<string, unknown> }>(
    `SELECT flags FROM system_flags WHERE id = 'system'`
  );
  const flags = row?.flags ?? {};
  const url = typeof flags["alert_webhook_url"] === "string" ? (flags["alert_webhook_url"] as string) : null;
  const enabled = flags["alert_webhook_enabled"] === true;
  return { url, enabled };
}

export type AlertSeverity = "info" | "warn" | "error";

export interface AlertPayload {
  severity: AlertSeverity;
  title: string;
  body?: string;
  fields?: Array<{ label: string; value: string }>;
  link?: { label: string; url: string };
}

const SEVERITY_PREFIX: Record<AlertSeverity, string> = {
  info: ":information_source:",
  warn: ":warning:",
  error: ":rotating_light:",
};

export function toSlackBlocks(payload: AlertPayload): Record<string, unknown> {
  const lines: string[] = [`${SEVERITY_PREFIX[payload.severity]} *${payload.title}*`];
  if (payload.body) lines.push(payload.body);
  if (payload.fields && payload.fields.length) {
    lines.push(
      payload.fields.map((f) => `• *${f.label}:* ${f.value}`).join("\n")
    );
  }
  if (payload.link) lines.push(`<${payload.link.url}|${payload.link.label}>`);
  return {
    text: lines.join("\n"),
  };
}

/**
 * Posts `body` to `targetUrl` over HTTPS with the TCP connection pinned to
 * `pinnedIp` (from the pre-validated DNS lookup).
 *
 * - `servername` is set to the URL hostname so the TLS handshake uses the
 *   correct SNI and the certificate is checked against the hostname rather
 *   than the IP literal.
 * - `Host` header is the original hostname so the server receives a valid
 *   HTTP/1.1 request.
 * - Redirects are NOT followed: any 3xx response returns `{ ok: false }`.
 */
function pinnedHttpsPost(
  targetUrl: string,
  pinnedIp: string,
  body: string,
  timeoutMs: number
): Promise<{ ok: boolean; status: number }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const port = parsed.port ? parseInt(parsed.port, 10) : 443;

    const req = https.request(
      {
        hostname: pinnedIp,
        port,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          host: parsed.hostname,
        },
        servername: parsed.hostname,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          resolve({ ok: false, status });
          res.resume();
          return;
        }
        resolve({ ok: status >= 200 && status < 300, status });
        res.resume();
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("webhook request timed out"));
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function sendAlert(payload: AlertPayload): Promise<{ delivered: boolean; reason?: string }> {
  let cfg: AlertWebhookConfig;
  try {
    cfg = await getConfig();
  } catch (err) {
    logger.warn({ err }, "[alerts] failed to read config");
    return { delivered: false, reason: "config_read_failed" };
  }

  if (!cfg.enabled) return { delivered: false, reason: "disabled" };
  if (!cfg.url) return { delivered: false, reason: "no_url" };

  // Guard against SSRF: validate the URL before every outbound request.
  // An admin may have stored a URL that was valid at write-time but whose
  // DNS record has since changed to a private address, so we re-check here.
  // The returned `pinnedAddress` is the IP resolved during this check; it is
  // used for the actual connection to close the TOCTOU / DNS-rebinding window.
  const urlCheck = await validateWebhookUrl(cfg.url);
  if (!urlCheck.valid) {
    logger.warn(
      { reason: urlCheck.reason },
      "[alerts] webhook URL failed SSRF validation — delivery skipped"
    );
    return { delivered: false, reason: `url_blocked:${urlCheck.reason}` };
  }

  const bodyJson = JSON.stringify(toSlackBlocks(payload));

  try {
    const pinnedAddress = urlCheck.pinnedAddress;
    let result: { ok: boolean; status: number };

    if (pinnedAddress) {
      // Hostname-based URL: connect using the pre-validated, pinned IP so
      // that a DNS change between validation and delivery cannot redirect the
      // request to a private host.  Redirects are not followed (any 3xx is
      // treated as failure).
      result = await pinnedHttpsPost(cfg.url, pinnedAddress, bodyJson, TIMEOUT_MS);
    } else {
      // IP-literal URL (already validated as public): use a straightforward
      // HTTPS request.  No redirect following.
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      try {
        const r = await fetch(cfg.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: bodyJson,
          signal: ctl.signal,
          redirect: "error",
        });
        result = { ok: r.ok, status: r.status };
      } finally {
        clearTimeout(t);
      }
    }

    if (!result.ok) {
      logger.warn(
        { status: result.status, alertTitle: payload.title },
        "[alerts] webhook returned non-2xx or redirect"
      );
      return { delivered: false, reason: `http_${result.status}` };
    }
    return { delivered: true };
  } catch (err) {
    logger.warn({ err, alertTitle: payload.title }, "[alerts] webhook POST failed");
    return { delivered: false, reason: "network_error" };
  }
}
