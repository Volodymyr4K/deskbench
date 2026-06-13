import { type CalendarDay, zonedDayMinutesToInstant } from "@/lib/tz";

// Pure slot-availability logic — the heart of deskbench, and the rule-based
// baseline any "smart" (ML / LLM) scheduling must be measured against.
//
// Timezone-correct: a working day is a CalendarDay interpreted in the business
// timezone, working hours are wall-clock minutes in that zone, and the returned
// slots (and the `busy` ranges they avoid) are UTC instants. Overlap is checked
// in instant space, so DST never distorts it.

/** A working interval within a day, in minutes from local midnight. */
export interface Interval {
  start: number;
  end: number;
}

/** An already-occupied time range (UTC instants). */
export interface BusyRange {
  start: Date;
  end: Date;
}

export interface FreeSlotsOptions {
  /** The target day, interpreted in `tz`. */
  day: CalendarDay;
  /** IANA timezone the working hours are expressed in. */
  tz: string;
  /** Staff working intervals for that weekday (minutes from midnight, in `tz`). */
  workingMinutes: Interval[];
  /** Existing appointments / blocks (UTC instants). */
  busy: BusyRange[];
  /** Length of the service being booked, in minutes. */
  durationMin: number;
  /** Candidate start granularity in minutes. Default 15. */
  stepMin?: number;
  /** Slots starting before this instant are excluded. */
  now?: Date;
}

/**
 * Valid start instants for a service of `durationMin`, given working intervals
 * (wall-clock in `tz`) and existing busy instants. A slot is valid when the
 * whole [start, start+duration] window fits inside a working interval and does
 * not overlap any busy range.
 */
export function freeSlots(opts: FreeSlotsOptions): Date[] {
  const { day, tz, workingMinutes, busy, durationMin, stepMin = 15, now } = opts;
  if (durationMin <= 0) return [];

  const slots: Date[] = [];
  for (const work of workingMinutes) {
    for (let s = work.start; s + durationMin <= work.end; s += stepMin) {
      const start = zonedDayMinutesToInstant(day, s, tz);
      const end = new Date(start.getTime() + durationMin * 60_000);
      if (now && start < now) continue;
      const clash = busy.some((b) => start < b.end && b.start < end);
      if (clash) continue;
      slots.push(start);
    }
  }
  return slots;
}
