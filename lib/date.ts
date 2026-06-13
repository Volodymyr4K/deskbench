// Small, pure date helpers for the operator board's day navigation.
// Dates are handled at local midnight (matching the rest of the app's
// server-local-time simplification).

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Parse a `YYYY-MM-DD` param to a local-midnight Date; fall back to today. */
export function parseDateParam(s: string | undefined): Date {
  if (s) {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const y = +m[1];
      const mo = +m[2];
      const d = +m[3];
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        const date = new Date(y, mo - 1, d);
        // Reject overflow (e.g. 2026-02-31 rolling into March).
        if (date.getMonth() === mo - 1 && date.getDate() === d) return date;
      }
    }
  }
  return startOfDay(new Date());
}

/** Serialize a Date to a `YYYY-MM-DD` param in local time. */
export function toDateParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(d: Date, n: number): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function isToday(d: Date): boolean {
  return toDateParam(d) === toDateParam(new Date());
}
