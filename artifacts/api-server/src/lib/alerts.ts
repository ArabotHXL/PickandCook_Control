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
 */
import { queryOne } from "../routes/ops/db.js";
import { logger } from "./logger.js";

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

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(cfg.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toSlackBlocks(payload)),
      signal: ctl.signal,
    });
    if (!r.ok) {
      logger.warn(
        { status: r.status, alertTitle: payload.title },
        "[alerts] webhook returned non-2xx"
      );
      return { delivered: false, reason: `http_${r.status}` };
    }
    return { delivered: true };
  } catch (err) {
    logger.warn({ err, alertTitle: payload.title }, "[alerts] webhook POST failed");
    return { delivered: false, reason: "network_error" };
  } finally {
    clearTimeout(t);
  }
}
