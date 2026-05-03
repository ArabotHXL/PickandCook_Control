/**
 * Cron expression policy enforcement.
 *
 * node-cron supports six-field expressions (first field = seconds), which
 * allows schedules as aggressive as every second.  A write-admin who sets
 * such an expression on an import job can rapidly exhaust database capacity
 * and external-API quotas.
 *
 * Policy: only 5-field expressions (standard POSIX cron, minute granularity)
 * are accepted.  Six-field expressions are rejected regardless of the
 * individual field values.
 */

export type CronPolicyResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Returns `{ ok: true }` when `expr` is a 5-field cron expression that meets
 * the platform's minimum-granularity policy.
 *
 * Returns `{ ok: false, reason }` when the expression is syntactically valid
 * but violates policy (e.g. 6-field second-level schedule).
 *
 * This function does NOT replace `cron.validate()`; call that first to ensure
 * syntactic correctness, then call this to enforce policy.
 */
export function validateCronPolicy(expr: string): CronPolicyResult {
  const fields = expr.trim().split(/\s+/);

  if (fields.length === 6) {
    return {
      ok: false,
      reason:
        "six_field_expressions_not_allowed: schedules must use standard 5-field cron syntax (minute granularity only — no seconds field)",
    };
  }

  if (fields.length !== 5) {
    return {
      ok: false,
      reason: `invalid_field_count: expected 5 fields, got ${fields.length}`,
    };
  }

  return { ok: true };
}
