import Link from "next/link";
import { getOperatorBoard, type OperatorBoard } from "@/lib/schedule";
import { bookSlot, cancelAppointment, rescheduleAppointment, markCompleted, markNoShow } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { ruleBasedParse } from "@/lib/parse/rules";
import { resolveDay, filterSlotsByTime, appointmentMatchesRequest } from "@/lib/parse/resolve";
import type { ServiceKey } from "@/lib/parse/types";
import { toDateParam, addDays, isToday } from "@/lib/date";
import { todayInZone, formatTimeInZone, formatDayInZone, formatDateInstantInZone } from "@/lib/tz";

const DEMO_SLUG = "demo";

// Reads the DB per request — never statically prerendered (build has no DB).
export const dynamic = "force-dynamic";

function fmtPrice(cents: number): string {
  return new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}

type Service = OperatorBoard["services"][number];

function matchService(services: Service[], key: ServiceKey | null): Service | undefined {
  if (!key) return undefined;
  const tests: Record<ServiceKey, (n: string) => boolean> = {
    combo: (n) => n.includes("+") || n.includes("combo"),
    beard: (n) => n.includes("beard") && !n.includes("+"),
    haircut: (n) => n.includes("haircut") && !n.includes("+"),
  };
  return services.find((s) => tests[key](s.name.toLowerCase()));
}

type SP = {
  service?: string;
  q?: string;
  date?: string;
  cStaff?: string;
  cStart?: string;
  cService?: string;
  reschedule?: string;
};

export default async function OperatorBoard({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;

  // Reschedule mode: an existing appointment is being moved.
  const rescheduling = sp.reschedule
    ? await prisma.appointment.findUnique({
        where: { id: sp.reschedule },
        include: { service: true, client: true, staff: true },
      })
    : null;

  // In reschedule mode the board uses the appointment's own service (its duration).
  const effectiveServiceId = rescheduling?.serviceId ?? sp.service;
  const board = await getOperatorBoard(DEMO_SLUG, sp.date, effectiveServiceId);

  if (!board) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-xl font-semibold">No demo business found</h1>
        <p className="mt-2 text-sm text-gray-600">
          Run <code className="rounded bg-gray-100 px-1">npm run db:seed</code> to create the demo data.
        </p>
      </main>
    );
  }

  const { business, tz, day, now, services, selectedService, staff } = board;
  const fmtTime = (i: Date) => formatTimeInZone(i, tz);
  const fmtDayInstant = (i: Date) => formatDateInstantInZone(i, tz);
  const nowMs = now.getTime();

  // URL helper that preserves the relevant params and overrides the given ones.
  const withParams = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      service: sp.service,
      date: toDateParam(day),
      reschedule: sp.reschedule,
      ...overrides,
    };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    return `/?${p.toString()}`;
  };
  const confirmHref = (staffId: string, serviceId: string, startISO: string) =>
    `/?${new URLSearchParams({ cStaff: staffId, cService: serviceId, cStart: startISO }).toString()}`;
  const rescheduleHref = (apptId: string) =>
    `/?${new URLSearchParams({ reschedule: apptId }).toString()}`;

  // Confirm step (only when not rescheduling).
  const confirm =
    !rescheduling && sp.cStaff && sp.cService && sp.cStart
      ? (() => {
          const svc = services.find((s) => s.id === sp.cService);
          const stf = staff.find((s) => s.id === sp.cStaff);
          const start = new Date(sp.cStart!);
          if (!svc || !stf || Number.isNaN(start.getTime())) return null;
          return { svc, stf, start };
        })()
      : null;

  // Intake (only when not rescheduling).
  type Candidate = { id: string; startAt: Date; serviceName: string; clientName?: string; staffName: string };
  let intake: null | {
    parsed: ReturnType<typeof ruleBasedParse>;
    resolvedDay: ReturnType<typeof todayInZone>;
    matched?: Service;
    slotMatches: { staffId: string; staffName: string; slots: Date[] }[];
    candidates: Candidate[];
  } = null;

  if (!rescheduling && sp.q && sp.q.trim()) {
    const parsed = ruleBasedParse(sp.q);
    const resolvedDay = resolveDay(parsed.day, tz) ?? todayInZone(tz);
    const matched = matchService(services, parsed.service);
    const dayBoard = await getOperatorBoard(DEMO_SLUG, toDateParam(resolvedDay), matched?.id);

    const slotMatches =
      parsed.intent === "BOOK" && dayBoard
        ? dayBoard.staff
            .map((st) => ({ staffId: st.id, staffName: st.name, slots: filterSlotsByTime(st.freeSlots, parsed.time, tz) }))
            .filter((m) => m.slots.length > 0)
        : [];

    const candidates: Candidate[] =
      (parsed.intent === "CANCEL" || parsed.intent === "RESCHEDULE") && dayBoard
        ? dayBoard.staff
            .flatMap((st) => st.appointments.map((a) => ({ a, staffName: st.name })))
            .filter(
              ({ a }) =>
                a.status === "BOOKED" &&
                appointmentMatchesRequest({ startAt: a.startAt, serviceId: a.serviceId }, { time: parsed.time, serviceId: matched?.id }, tz),
            )
            .map(({ a, staffName }) => ({
              id: a.id,
              startAt: a.startAt,
              serviceName: a.service.name,
              clientName: a.client?.name,
              staffName,
            }))
        : [];

    intake = { parsed, resolvedDay, matched, slotMatches, candidates };
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{business.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
            <a href={withParams({ date: toDateParam(addDays(day, -1)) })} className="rounded border border-gray-300 px-1.5 hover:border-gray-500" aria-label="Previous day">‹</a>
            <span className="capitalize">{formatDayInZone(day, tz)}</span>
            <a href={withParams({ date: toDateParam(addDays(day, 1)) })} className="rounded border border-gray-300 px-1.5 hover:border-gray-500" aria-label="Next day">›</a>
            {!isToday(day, tz) && (
              <a href={withParams({ date: toDateParam(todayInZone(tz)) })} className="text-xs text-gray-400 underline hover:text-gray-700">today</a>
            )}
            <span className="text-xs text-gray-300">{tz}</span>
            <Link href="/stats" className="text-xs text-gray-400 underline hover:text-gray-700">stats</Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {services.map((s) => {
            const active = s.id === selectedService?.id;
            return (
              <a
                key={s.id}
                href={withParams({ service: s.id })}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-700 hover:border-gray-400"
                } ${rescheduling ? "pointer-events-none opacity-40" : ""}`}
              >
                {s.name} · {s.durationMin}m · {fmtPrice(s.priceCents)}
              </a>
            );
          })}
        </div>
      </header>

      {/* Reschedule banner: free slots below become "move here" targets. */}
      {rescheduling && (
        <section className="mb-8 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="text-gray-700">
            Rescheduling <strong>{rescheduling.service.name}</strong>
            {rescheduling.client ? ` for ${rescheduling.client.name}` : ""} — currently{" "}
            <span className="tabular-nums">{fmtTime(rescheduling.startAt)}</span> on{" "}
            <span className="capitalize">{fmtDayInstant(rescheduling.startAt)}</span>. Pick a new slot below
            (navigate days if needed).
          </p>
          <a href={withParams({ reschedule: undefined })} className="mt-1 inline-block text-xs text-gray-500 underline hover:text-gray-800">
            cancel reschedule
          </a>
        </section>
      )}

      {/* Confirm a booking with optional client details */}
      {confirm && (
        <section className="mb-8 rounded-xl border border-emerald-300 bg-emerald-50/70 p-4">
          <p className="text-sm text-gray-700">
            Booking <strong>{confirm.svc.name}</strong> with <strong>{confirm.stf.name}</strong> on{" "}
            <span className="capitalize">{fmtDayInstant(confirm.start)}</span> at{" "}
            <span className="tabular-nums">{fmtTime(confirm.start)}</span>
          </p>
          <form action={bookSlot} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="businessId" value={business.id} />
            <input type="hidden" name="serviceId" value={confirm.svc.id} />
            <input type="hidden" name="staffId" value={confirm.stf.id} />
            <input type="hidden" name="startISO" value={confirm.start.toISOString()} />
            <label className="text-xs text-gray-500">
              Client name
              <input name="clientName" className="mt-0.5 block w-44 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="text-xs text-gray-500">
              Phone
              <input name="clientPhone" className="mt-0.5 block w-44 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm" />
            </label>
            <button type="submit" className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm text-white hover:bg-emerald-700">
              Confirm booking
            </button>
            <a href={withParams({})} className="px-2 py-1.5 text-sm text-gray-500 hover:text-gray-800">cancel</a>
          </form>
          <p className="mt-2 text-xs text-gray-400">Leave both blank for a walk-in.</p>
        </section>
      )}

      {/* Quick intake */}
      {!rescheduling && (
        <section className="mb-8 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <form method="get" className="flex flex-wrap gap-2">
            <input
              type="text"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder='e.g. "book a haircut tomorrow afternoon", "cancel my 3pm today", "move my beard trim to friday"'
              className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900"
            />
            <button type="submit" className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white">Parse</button>
          </form>

          {intake && (
            <div className="mt-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-gray-400">parsed →</span>
                <Chip label="intent" value={intake.parsed.intent} />
                <Chip label="service" value={intake.matched?.name ?? intake.parsed.service ?? "—"} />
                <Chip label="day" value={intake.parsed.day ?? "—"} />
                <Chip label="time" value={intake.parsed.time ?? "—"} />
                <span className="text-xs text-gray-400">(rule-based parser, $0 — no LLM)</span>
              </div>

              {intake.parsed.intent === "BOOK" && (
                <div className="mt-3">
                  <p className="mb-2 text-gray-600">
                    {intake.matched ? (
                      <>
                        <strong>{intake.matched.name}</strong> on <span className="capitalize">{formatDayInZone(intake.resolvedDay, tz)}</span>
                        {intake.parsed.time ? ` (${intake.parsed.time})` : ""}:
                      </>
                    ) : (
                      "Pick a service — the request didn't name one clearly."
                    )}
                  </p>
                  {intake.matched && intake.slotMatches.length === 0 && (
                    <p className="text-gray-400">No matching free slots for that request.</p>
                  )}
                  <div className="space-y-2">
                    {intake.matched &&
                      intake.slotMatches.map((m) => (
                        <div key={m.staffId} className="flex flex-wrap items-center gap-1.5">
                          <span className="w-16 text-gray-500">{m.staffName}</span>
                          {m.slots.map((slot) => (
                            <a
                              key={slot.toISOString()}
                              href={confirmHref(m.staffId, intake!.matched!.id, slot.toISOString())}
                              className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs tabular-nums text-emerald-800 transition hover:border-emerald-600 hover:bg-emerald-600 hover:text-white"
                            >
                              {fmtTime(slot)}
                            </a>
                          ))}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {(intake.parsed.intent === "CANCEL" || intake.parsed.intent === "RESCHEDULE") && (
                <div className="mt-3">
                  <p className="mb-2 text-gray-600">
                    Matching appointments on <span className="capitalize">{formatDayInZone(intake.resolvedDay, tz)}</span> to{" "}
                    {intake.parsed.intent === "CANCEL" ? "cancel" : "reschedule"}:
                  </p>
                  {intake.candidates.length === 0 && <p className="text-gray-400">No matching appointments found.</p>}
                  <ul className="space-y-1.5">
                    {intake.candidates.map((c) => (
                      <li key={c.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                        <span>
                          <span className="font-medium tabular-nums">{fmtTime(c.startAt)}</span>{" "}
                          <span className="text-gray-500">{c.serviceName}</span>
                          <span className="text-gray-400"> · {c.staffName}</span>
                          {c.clientName && <span className="text-gray-400"> · {c.clientName}</span>}
                        </span>
                        {intake.parsed.intent === "CANCEL" ? (
                          <form action={cancelAppointment}>
                            <input type="hidden" name="id" value={c.id} />
                            <button type="submit" className="text-xs text-red-500 hover:text-red-700">cancel</button>
                          </form>
                        ) : (
                          <a href={rescheduleHref(c.id)} className="text-xs text-amber-600 hover:text-amber-800">reschedule →</a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(intake.parsed.intent === "QUESTION" || intake.parsed.intent === "UNKNOWN") && (
                <p className="mt-3 text-gray-500">
                  Parsed as {intake.parsed.intent.toLowerCase()} — this demo actions booking, cancel, and reschedule;
                  questions are out of scope.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {staff.map((st) => (
          <section key={st.id} className="rounded-xl border border-gray-200 p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-medium">{st.name}</h2>
              {st.role && <span className="text-xs text-gray-400">{st.role}</span>}
            </div>

            <ul className="space-y-1.5">
              {st.appointments.length === 0 && <li className="text-sm text-gray-400">No appointments</li>}
              {st.appointments.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium tabular-nums">{fmtTime(a.startAt)}</span>{" "}
                    <span className="text-gray-500">{a.service.name}</span>
                    {a.client && <span className="text-gray-400"> · {a.client.name}</span>}
                  </span>
                  {!rescheduling &&
                    (a.status === "COMPLETED" ? (
                      <span className="text-xs text-emerald-600">✓ done</span>
                    ) : a.startAt.getTime() < nowMs ? (
                      // Past appointment: record the outcome.
                      <span className="flex gap-2">
                        <form action={markCompleted}>
                          <input type="hidden" name="id" value={a.id} />
                          <button type="submit" className="text-xs text-emerald-600 hover:text-emerald-800">done</button>
                        </form>
                        <form action={markNoShow}>
                          <input type="hidden" name="id" value={a.id} />
                          <button type="submit" className="text-xs text-gray-400 hover:text-red-600">no-show</button>
                        </form>
                      </span>
                    ) : (
                      // Upcoming appointment: move or cancel.
                      <span className="flex gap-2">
                        <a href={rescheduleHref(a.id)} className="text-xs text-amber-600 hover:text-amber-800">move</a>
                        <form action={cancelAppointment}>
                          <input type="hidden" name="id" value={a.id} />
                          <button type="submit" className="text-xs text-gray-400 hover:text-red-600">cancel</button>
                        </form>
                      </span>
                    ))}
                </li>
              ))}
            </ul>

            {selectedService && (
              <div className="mt-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-gray-400">
                  {rescheduling ? `Move here (${selectedService.name})` : `Free for ${selectedService.name}`}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {st.freeSlots.length === 0 && <span className="text-sm text-gray-400">No free slots</span>}
                  {st.freeSlots.map((slot) =>
                    rescheduling ? (
                      <form action={rescheduleAppointment} key={slot.toISOString()}>
                        <input type="hidden" name="id" value={rescheduling.id} />
                        <input type="hidden" name="newStaffId" value={st.id} />
                        <input type="hidden" name="newStartISO" value={slot.toISOString()} />
                        <button
                          type="submit"
                          className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs tabular-nums text-amber-800 transition hover:border-amber-600 hover:bg-amber-600 hover:text-white"
                        >
                          {fmtTime(slot)}
                        </button>
                      </form>
                    ) : (
                      <a
                        key={slot.toISOString()}
                        href={confirmHref(st.id, selectedService.id, slot.toISOString())}
                        className="rounded-md border border-gray-200 px-2 py-1 text-xs tabular-nums text-gray-700 transition hover:border-gray-900 hover:bg-gray-900 hover:text-white"
                      >
                        {fmtTime(slot)}
                      </a>
                    ),
                  )}
                </div>
              </div>
            )}
          </section>
        ))}
      </div>

      <footer className="mt-10 border-t border-gray-200 pt-4 text-xs text-gray-400">
        Intake (book / cancel / reschedule), free slots, and day navigation run on a plain rule-based
        parser + availability engine (<code>lib/parse/</code>, <code>lib/availability.ts</code>), all in the
        business timezone — $0, no LLM. This is the baseline the eval (<code>npm run eval</code>) measures
        the LLM path against.
      </footer>
    </main>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </span>
  );
}
