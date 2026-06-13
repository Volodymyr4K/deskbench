import { prisma } from "@/lib/prisma";

// Business analytics. The headline metric is the no-show rate — you cannot
// honestly claim to "reduce no-shows" without measuring it first. Kept pure
// where it matters (computeStats) so the rates are unit-tested.

export interface StatusCounts {
  booked: number;
  completed: number;
  cancelled: number;
  noShow: number;
}

export interface Stats {
  rangeDays: number;
  total: number;
  counts: StatusCounts;
  /** no-show / (completed + no-show): of appointments that reached their time, the share missed. */
  noShowRate: number;
  /** cancelled / total in the window. */
  cancelRate: number;
  bySource: { manual: number; assistant: number };
}

/** Pure aggregation over appointment status/source rows. */
export function computeStats(appts: { status: string; source: string }[], rangeDays: number): Stats {
  const counts: StatusCounts = { booked: 0, completed: 0, cancelled: 0, noShow: 0 };
  let manual = 0;
  let assistant = 0;
  for (const a of appts) {
    if (a.status === "BOOKED") counts.booked++;
    else if (a.status === "COMPLETED") counts.completed++;
    else if (a.status === "CANCELLED") counts.cancelled++;
    else if (a.status === "NO_SHOW") counts.noShow++;
    if (a.source === "MANUAL") manual++;
    else if (a.source === "ASSISTANT") assistant++;
  }
  const total = appts.length;
  const reached = counts.completed + counts.noShow;
  return {
    rangeDays,
    total,
    counts,
    noShowRate: reached ? counts.noShow / reached : 0,
    cancelRate: total ? counts.cancelled / total : 0,
    bySource: { manual, assistant },
  };
}

export async function getBusinessStats(slug: string, rangeDays = 30) {
  const business = await prisma.business.findUnique({ where: { slug } });
  if (!business) return null;
  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
  const appts = await prisma.appointment.findMany({
    where: { businessId: business.id, startAt: { gte: since } },
    select: { status: true, source: true },
  });
  return { business, stats: computeStats(appts, rangeDays) };
}
