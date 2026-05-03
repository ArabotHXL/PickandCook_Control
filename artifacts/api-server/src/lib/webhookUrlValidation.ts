/**
 * Server-side validation for outbound webhook URLs.
 *
 * Enforces:
 *  1. Scheme must be HTTPS (never HTTP, file://, etc.)
 *  2. Hostname must not be an IP literal in a private/reserved range
 *  3. After DNS resolution the resolved address(es) must not fall in any
 *     private, loopback, link-local, or otherwise non-routable range
 *
 * This prevents the alert-webhook endpoint from being used as a blind
 * server-side request forgery primitive to probe internal services.
 */

import dns from "node:dns/promises";

function ipv4ToUint32(ip: string): number {
  const parts = ip.split(".").map(Number);
  return (
    ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0
  );
}

const IPV4_BLOCKED: Array<{ base: number; mask: number }> = (
  [
    ["0.0.0.0", 8],       // "this" network
    ["10.0.0.0", 8],      // RFC 1918
    ["100.64.0.0", 10],   // Shared address space (RFC 6598)
    ["127.0.0.0", 8],     // Loopback
    ["169.254.0.0", 16],  // Link-local
    ["172.16.0.0", 12],   // RFC 1918
    ["192.0.0.0", 24],    // IETF Protocol Assignments
    ["192.0.2.0", 24],    // TEST-NET-1 (documentation)
    ["192.168.0.0", 16],  // RFC 1918
    ["198.18.0.0", 15],   // Benchmarking
    ["198.51.100.0", 24], // TEST-NET-2 (documentation)
    ["203.0.113.0", 24],  // TEST-NET-3 (documentation)
    ["240.0.0.0", 4],     // Reserved / future
    ["255.255.255.255", 32], // Broadcast
  ] as [string, number][]
).map(([base, bits]) => ({
  base: ipv4ToUint32(base),
  mask: bits === 32 ? 0xffffffff : (~(0xffffffff >>> bits)) >>> 0,
}));

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToUint32(ip);
  return IPV4_BLOCKED.some(({ base, mask }) => (n & mask) === (base & mask));
}

function isBlockedIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (addr === "::1") return true; // loopback
  if (addr === "::") return true;  // unspecified
  // fc00::/7  unique-local (fc** and fd**)
  if (/^f[cd]/i.test(addr)) return true;
  // fe80::/10  link-local (fe8*, fe9*, fea*, feb*)
  if (/^fe[89ab]/i.test(addr)) return true;
  // :: mapped IPv4 (::ffff:a.b.c.d)
  const v4Mapped = addr.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Mapped) return isBlockedIpv4(v4Mapped[1]!);
  return false;
}

const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Validates a webhook URL for safe outbound use.
 *
 * - Synchronously rejects non-HTTPS URLs and IP literals in blocked ranges.
 * - Performs a DNS lookup to reject hostnames that resolve to internal ranges.
 *
 * @throws Never — all error paths are returned as `{ valid: false }`.
 */
export async function validateWebhookUrl(
  rawUrl: string
): Promise<ValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, reason: "invalid_url" };
  }

  if (parsed.protocol !== "https:") {
    return { valid: false, reason: "scheme_must_be_https" };
  }

  const hostname = parsed.hostname;

  if (!hostname) {
    return { valid: false, reason: "missing_hostname" };
  }

  // Reject bare IPv4 literals in blocked ranges
  if (IPV4_RE.test(hostname)) {
    if (isBlockedIpv4(hostname)) {
      return { valid: false, reason: "private_ip_not_allowed" };
    }
    // Public IPv4 literal — no DNS lookup needed, accept as-is
    return { valid: true };
  }

  // Reject IPv6 literals (bracketed or raw hex) in blocked ranges
  const ipv6Raw = hostname.startsWith("[")
    ? hostname.slice(1, -1)
    : /^[0-9a-fA-F:]+$/.test(hostname)
    ? hostname
    : null;
  if (ipv6Raw !== null) {
    if (isBlockedIpv6(ipv6Raw)) {
      return { valid: false, reason: "private_ip_not_allowed" };
    }
    return { valid: true };
  }

  // DNS resolution — reject if any resolved address is in a blocked range
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    return { valid: false, reason: "dns_resolution_failed" };
  }

  if (addresses.length === 0) {
    return { valid: false, reason: "dns_no_results" };
  }

  for (const { address, family } of addresses) {
    if (family === 4 && isBlockedIpv4(address)) {
      return { valid: false, reason: "resolves_to_private_ip" };
    }
    if (family === 6 && isBlockedIpv6(address)) {
      return { valid: false, reason: "resolves_to_private_ip" };
    }
  }

  return { valid: true };
}
