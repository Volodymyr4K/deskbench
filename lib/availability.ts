// Pure slot-availability logic — the heart of deskbench.
//
// This is deliberately a plain, dependency-free function: it is the rule-based
// baseline that any "smart" (ML / LLM) scheduling must be measured against.
// Keeping it pure makes it trivial to unit-test and to benchmark.
//
// KNOWN SIMPLIFICATION (stated honestly, per project rules): all times are
// computed in the server's local timezone. Per-business timezone handling and
// DST correctness are a real TODO before this is production-grade.

/** A working interval within a day, in minutes from local midnight. */
export interface Interval {
  start: number;
  end: number;
}

/** An already-occupied time range (e.g. an existing appointment). */
export interface BusyRange {
  start: Date;
  end: Date;
}

export interface FreeSlotsOptions {
  /** Any Date within the target day; only its local Y/M/D are used. */
  date: Date;
  /** Staff working intervals for that weekday (minutes from midnight). */
  workingMinutes: Interval[];
  /** Existing appointments / blocks that overlap the day. */
  busy: BusyRange[];
  /** Length of the service being booked, in minutes. */
  durationMin: number;
  /** Candidate start granularity in minutes. Default 15. */
  stepMin?: number;
  /** Slots starting before `now` are excluded. Defaults to no filtering. */
  now?: Date;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Returns the list of valid start times for a service of `durationMin`,
 * given working intervals and existing busy ranges. A slot is valid when the
 * whole [start, start+duration] window fits inside a working interval and does
 * not overlap any busy range.
 */
export function freeSlots(opts: FreeSlotsOptions): Date[] {
  const { date, workingMinutes, busy, durationMin, stepMin = 15, now } = opts;
  if (durationMin <= 0) return [];

  const dayMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  // Convert busy ranges into minute offsets from this day's midnight.
  const busyMinutes = busy.map((b) => ({
    start: (b.start.getTime() - dayMidnight) / 60_000,
    end: (b.end.getTime() - dayMidnight) / 60_000,
  }));

  const nowMinutes = now ? (now.getTime() - dayMidnight) / 60_000 : -Infinity;

  const slots: Date[] = [];
  for (const work of workingMinutes) {
    for (let s = work.start; s + durationMin <= work.end; s += stepMin) {
      const e = s + durationMin;
      if (s < nowMinutes) continue;
      const clash = busyMinutes.some((b) => overlaps(s, e, b.start, b.end));
      if (clash) continue;
      slots.push(new Date(dayMidnight + s * 60_000));
    }
  }
  return slots;
}
