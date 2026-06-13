import Link from "next/link";
import { getBusinessStats } from "@/lib/stats";

const DEMO_SLUG = "demo";
const RANGE_DAYS = 30;

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

export default async function StatsPage() {
  const data = await getBusinessStats(DEMO_SLUG, RANGE_DAYS);
  if (!data) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-xl font-semibold">No demo business found</h1>
        <p className="mt-2 text-sm text-gray-600">
          Run <code className="rounded bg-gray-100 px-1">npm run db:seed</code> first.
        </p>
      </main>
    );
  }

  const { business, stats } = data;
  const { counts } = stats;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6 flex items-end justify-between border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{business.name} — stats</h1>
          <p className="text-sm text-gray-500">Last {stats.rangeDays} days · {stats.total} appointments</p>
        </div>
        <Link href="/" className="text-sm text-gray-400 underline hover:text-gray-700">← board</Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Metric label="No-show rate" value={pct(stats.noShowRate)} hint="of appointments that reached their time" emphasis />
        <Metric label="Cancellation rate" value={pct(stats.cancelRate)} hint="of all appointments in the window" />
      </div>

      <h2 className="mt-8 mb-2 text-xs uppercase tracking-wide text-gray-400">Status breakdown</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Booked" value={String(counts.booked)} small />
        <Metric label="Completed" value={String(counts.completed)} small />
        <Metric label="Cancelled" value={String(counts.cancelled)} small />
        <Metric label="No-show" value={String(counts.noShow)} small />
      </div>

      <h2 className="mt-8 mb-2 text-xs uppercase tracking-wide text-gray-400">By source</h2>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Manual" value={String(stats.bySource.manual)} small />
        <Metric label="Assistant" value={String(stats.bySource.assistant)} small />
      </div>

      <p className="mt-8 text-xs text-gray-400">
        No-show rate = no-show / (completed + no-show). You can&rsquo;t honestly claim to reduce
        no-shows without measuring this first — reminders that aim to reduce it come later, and
        their effect will be measured against this baseline.
      </p>
    </main>
  );
}

function Metric({
  label,
  value,
  hint,
  emphasis,
  small,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  small?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-gray-200 p-4 ${emphasis ? "bg-gray-50" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-1 font-semibold tabular-nums ${small ? "text-xl" : "text-3xl"}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}
