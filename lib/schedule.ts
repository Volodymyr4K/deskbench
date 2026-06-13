import { prisma } from "@/lib/prisma";
import { freeSlots, type Interval, type BusyRange } from "@/lib/availability";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Everything the operator board needs for one business on one day:
 * the active services, and per-staff booked appointments + free slots
 * for the selected service (computed by the rule-based `freeSlots`).
 */
export async function getOperatorBoard(slug: string, date: Date, serviceId?: string) {
  const business = await prisma.business.findUnique({
    where: { slug },
    include: {
      services: { where: { active: true }, orderBy: { durationMin: "asc" } },
      staff: { where: { active: true }, include: { hours: true }, orderBy: { name: "asc" } },
    },
  });
  if (!business) return null;

  const selectedService =
    (serviceId && business.services.find((s) => s.id === serviceId)) || business.services[0];

  const appointments = await prisma.appointment.findMany({
    where: {
      businessId: business.id,
      startAt: { gte: startOfDay(date), lte: endOfDay(date) },
      status: { in: ["BOOKED", "COMPLETED"] },
    },
    include: { service: true, client: true },
    orderBy: { startAt: "asc" },
  });

  const dow = date.getDay();
  const now = new Date();

  const staff = business.staff.map((st) => {
    const myAppointments = appointments.filter((a) => a.staffId === st.id);
    const workingMinutes: Interval[] = st.hours
      .filter((h) => h.dayOfWeek === dow)
      .map((h) => ({ start: h.startMinutes, end: h.endMinutes }));
    const busy: BusyRange[] = myAppointments.map((a) => ({ start: a.startAt, end: a.endAt }));

    const slots = selectedService
      ? freeSlots({
          date,
          workingMinutes,
          busy,
          durationMin: selectedService.durationMin,
          stepMin: 15,
          now: isSameDay(date, now) ? now : undefined,
        })
      : [];

    return { id: st.id, name: st.name, role: st.role, appointments: myAppointments, freeSlots: slots };
  });

  return { business, date, services: business.services, selectedService, staff };
}

export type OperatorBoard = NonNullable<Awaited<ReturnType<typeof getOperatorBoard>>>;
