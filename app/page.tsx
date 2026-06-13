import { getOperatorBoard, type OperatorBoard } from "@/lib/schedule";
import { bookSlot, cancelAppointment } from "@/app/actions";
import { ruleBasedParse } from "@/lib/parse/rules";
import { resolveDay, filterSlotsByTime } from "@/lib/parse/resolve";
import type { ServiceKey } from "@/lib/parse/types";
import { parseDateParam, toDateParam, addDays, startOfDay, isToday } from "@/lib/date";

const DEMO_SLUG = "demo";

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
}
function fmtPrice(cents: number): string {
  return new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" });
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

type SP = { service?: string; q?: string; date?: string; cStaff?: string; cStart?: string; cService?: string };

export default async function OperatorBoard({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const boardDate = parseDateParam(sp.date);
  const board = await getOperatorBoard(DEMO_SLUG, boardDate, sp.service);

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

  const { business, services, selectedService, staff } = board;

  const navHref = (date: Date) => {
    const p = new URLSearchParams();
    if (sp.service) p.set("service", sp.service);
    p.set("date", toDateParam(date));
    return `/?${p.toString()}`;
  };
  const confirmHref = (staffId: string, serviceId: string, startISO: string) => {
    const p = new URLSearchParams({ cStaff: staffId, cService: serviceId, cStart: startISO });
    return `/?${p.toString()}`;
  };

  // --- Confirm step: book a chosen slot, capturing client name/phone. ---
  const confirm =
    sp.cStaff && sp.cService && sp.cStart
      ? (() => {
          const svc = services.find((s) => s.id === sp.cService);
          const stf = staff.find((s) => s.id === sp.cStaff);
          const start = new Date(sp.cStart!);
          if (!svc || !stf || Number.isNaN(start.getTime())) return null;
          return { svc, stf, start };
        })()
      : null;

  // --- Intake: parse a free-text request and resolve it to concrete slots. ---
  let intake: null | {
    parsed: ReturnType<typeof ruleBasedParse>;
    resolvedDate: Date;
    matched?: Service;
    matches: { staffId: string; staffName: string; slots: Date[] }[];
  } = null;

  if (sp.q && sp.q.trim()) {
    const parsed = ruleBasedParse(sp.q);
    const resolvedDate = resolveDay(parsed.day, new Date()) ?? startOfDay(new Date());
    const matched = matchService(services, parsed.service);
    const dayBoard = await getOperatorBoard(DEMO_SLUG, resolvedDate, matched?.id);
    const matches =
      parsed.intent === "BOOK" && dayBoard
        ? dayBoard.staff
            .map((st) => ({ staffId: st.id, staffName: st.name, slots: filterSlotsByTime(st.freeSlots, parsed.time) }))
            .filter((m) => m.slots.length > 0)
        : [];
    intake = { parsed, resolvedDate, matched, matches };
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{business.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
            <a href={navHref(addDays(boardDate, -1))} className="rounded border border-gray-300 px-1.5 hover:border-gray-500" aria-label="Previous day">‹</a>
            <span className="capitalize">{fmtDate(boardDate)}</span>
            <a href={navHref(addDays(boardDate, 1))} className="rounded border border-gray-300 px-1.5 hover:border-gray-500" aria-label="Next day">›</a>
            {!isToday(boardDate) && (
              <a href={navHref(startOfDay(new Date()))} className="text-xs text-gray-400 underline hover:text-gray-700">today</a>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {services.map((s) => {
            const active = s.id === selectedService?.id;
            const p = new URLSearchParams({ service: s.id, date: toDateParam(boardDate) });
            return (
              <a
                key={s.id}
                href={`/?${p.toString()}`}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-700 hover:border-gray-400"
                }`}
              >
                {s.name} · {s.durationMin}m · {fmtPrice(s.priceCents)}
              </a>
            );
          })}
        </div>
      </header>

      {/* Confirm a booking with optional client details */}
      {confirm && (
        <section className="mb-8 rounded-xl border border-emerald-300 bg-emerald-50/70 p-4">
          <p className="text-sm text-gray-700">
            Booking <strong>{confirm.svc.name}</strong> with <strong>{confirm.stf.name}</strong> on{" "}
            <span className="capitalize">{fmtDate(confirm.start)}</span> at{" "}
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
            <a href={navHref(confirm.start)} className="px-2 py-1.5 text-sm text-gray-500 hover:text-gray-800">
              cancel
            </a>
          </form>
          <p className="mt-2 text-xs text-gray-400">Leave both blank for a walk-in.</p>
        </section>
      )}

      {/* Quick intake — type a request as a customer would phrase it. */}
      <section className="mb-8 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
        <form method="get" className="flex flex-wrap gap-2">
          <input
            type="text"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder='e.g. "haircut tomorrow afternoon" or "combo friday at 2pm"'
            className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900"
          />
          <button type="submit" className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
            Parse
          </button>
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

            {intake.parsed.intent !== "BOOK" && (
              <p className="mt-3 text-gray-500">
                This demo wires up <strong>booking</strong> only; {intake.parsed.intent.toLowerCase()} requests are
                parsed but not yet actioned.
              </p>
            )}

            {intake.parsed.intent === "BOOK" && (
              <div className="mt-3">
                <p className="mb-2 text-gray-600">
                  {intake.matched ? (
                    <>
                      <strong>{intake.matched.name}</strong> on <span className="capitalize">{fmtDate(intake.resolvedDate)}</span>
                      {intake.parsed.time ? ` (${intake.parsed.time})` : ""}:
                    </>
                  ) : (
                    "Pick a service — the request didn't name one clearly."
                  )}
                </p>
                {intake.matched && intake.matches.length === 0 && (
                  <p className="text-gray-400">No matching free slots for that request.</p>
                )}
                <div className="space-y-2">
                  {intake.matched &&
                    intake.matches.map((m) => (
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
          </div>
        )}
      </section>

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
                  <form action={cancelAppointment}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className="text-xs text-gray-400 hover:text-red-600" title="Cancel">
                      cancel
                    </button>
                  </form>
                </li>
              ))}
            </ul>

            {selectedService && (
              <div className="mt-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-gray-400">Free for {selectedService.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {st.freeSlots.length === 0 && <span className="text-sm text-gray-400">No free slots</span>}
                  {st.freeSlots.map((slot) => (
                    <a
                      key={slot.toISOString()}
                      href={confirmHref(st.id, selectedService.id, slot.toISOString())}
                      className="rounded-md border border-gray-200 px-2 py-1 text-xs tabular-nums text-gray-700 transition hover:border-gray-900 hover:bg-gray-900 hover:text-white"
                    >
                      {fmtTime(slot)}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </section>
        ))}
      </div>

      <footer className="mt-10 border-t border-gray-200 pt-4 text-xs text-gray-400">
        Intake, free slots, and day navigation run on a plain rule-based parser + availability engine
        (<code>lib/parse/</code>, <code>lib/availability.ts</code>) — $0, no LLM. This is the baseline
        the eval (<code>npm run eval</code>) measures the LLM path against.
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
