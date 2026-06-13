import { getOperatorBoard } from "@/lib/schedule";
import { bookSlot, cancelAppointment } from "@/app/actions";

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

export default async function OperatorBoard({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const { service: serviceId } = await searchParams;
  const today = new Date();
  const board = await getOperatorBoard(DEMO_SLUG, today, serviceId);

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

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{business.name}</h1>
          <p className="text-sm text-gray-500 capitalize">{fmtDate(board.date)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {services.map((s) => {
            const active = s.id === selectedService?.id;
            return (
              <a
                key={s.id}
                href={`/?service=${s.id}`}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  active
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-300 text-gray-700 hover:border-gray-400"
                }`}
              >
                {s.name} · {s.durationMin}m · {fmtPrice(s.priceCents)}
              </a>
            );
          })}
        </div>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        {staff.map((st) => (
          <section key={st.id} className="rounded-xl border border-gray-200 p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-medium">{st.name}</h2>
              {st.role && <span className="text-xs text-gray-400">{st.role}</span>}
            </div>

            {/* Booked appointments */}
            <ul className="space-y-1.5">
              {st.appointments.length === 0 && (
                <li className="text-sm text-gray-400">No appointments yet</li>
              )}
              {st.appointments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium tabular-nums">{fmtTime(a.startAt)}</span>{" "}
                    <span className="text-gray-500">{a.service.name}</span>
                    {a.client && <span className="text-gray-400"> · {a.client.name}</span>}
                  </span>
                  <form action={cancelAppointment}>
                    <input type="hidden" name="id" value={a.id} />
                    <button
                      type="submit"
                      className="text-xs text-gray-400 hover:text-red-600"
                      title="Cancel"
                    >
                      cancel
                    </button>
                  </form>
                </li>
              ))}
            </ul>

            {/* Free slots for the selected service */}
            {selectedService && (
              <div className="mt-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-gray-400">
                  Free for {selectedService.name}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {st.freeSlots.length === 0 && (
                    <span className="text-sm text-gray-400">No free slots today</span>
                  )}
                  {st.freeSlots.map((slot) => (
                    <form action={bookSlot} key={slot.toISOString()}>
                      <input type="hidden" name="businessId" value={business.id} />
                      <input type="hidden" name="serviceId" value={selectedService.id} />
                      <input type="hidden" name="staffId" value={st.id} />
                      <input type="hidden" name="startISO" value={slot.toISOString()} />
                      <button
                        type="submit"
                        className="rounded-md border border-gray-200 px-2 py-1 text-xs tabular-nums text-gray-700 transition hover:border-gray-900 hover:bg-gray-900 hover:text-white"
                      >
                        {fmtTime(slot)}
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            )}
          </section>
        ))}
      </div>

      <footer className="mt-10 border-t border-gray-200 pt-4 text-xs text-gray-400">
        Free slots are computed by a plain rule-based function (<code>lib/availability.ts</code>) — the
        baseline any &ldquo;smart&rdquo; scheduling will be measured against.
      </footer>
    </main>
  );
}
