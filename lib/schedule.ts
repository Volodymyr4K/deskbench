import { prisma } from "@/lib/prisma";
import { freeSlots, type Interval, type BusyRange } from "@/lib/availability";
import { type CalendarDay, zonedDayMinutesToInstant, weekdayOf } from "@/lib/tz";
import { parseDateParam } from "@/lib/date";

/**
 * Everything the operator board needs for one business on one day, all in the
 * business's timezone: the active services, and per-staff booked appointments +
 * free slots for the selected service (computed by the rule-based `freeSlots`).
 *
 * `dateParam` is the raw `YYYY-MM-DD` from the URL (or undefined → today in tz).
 */
export async function getOperatorBoard(slug: string, dateParam?: string, serviceId?: string) {
  const business = await prisma.business.findUnique({
    where: { slug },
    include: {
      services: { where: { active: true }, orderBy: { durationMin: "asc" } },
      staff: { where: { active: true }, include: { hours: true }, orderBy: { name: "asc" } },
    },
  });
  if (!business) return null;

  const tz = business.timezone;
  const day: CalendarDay = parseDateParam(dateParam, tz);

  const selectedService =
    (serviceId && business.services.find((s) => s.id === serviceId)) || business.services[0];

  // Day window in instant space: [start of day, start of next day) in tz.
  const dayStart = zonedDayMinutesToInstant(day, 0, tz);
  const dayEnd = zonedDayMinutesToInstant(day, 24 * 60, tz);

  const appointments = await prisma.appointment.findMany({
    where: {
      businessId: business.id,
      startAt: { gte: dayStart, lt: dayEnd },
      status: { in: ["BOOKED", "COMPLETED"] },
    },
    include: { service: true, client: true },
    orderBy: { startAt: "asc" },
  });

  const dow = weekdayOf(day, tz);
  const now = new Date();

  const staff = business.staff.map((st) => {
    const myAppointments = appointments.filter((a) => a.staffId === st.id);
    const workingMinutes: Interval[] = st.hours
      .filter((h) => h.dayOfWeek === dow)
      .map((h) => ({ start: h.startMinutes, end: h.endMinutes }));
    const busy: BusyRange[] = myAppointments.map((a) => ({ start: a.startAt, end: a.endAt }));

    const slots = selectedService
      ? freeSlots({ day, tz, workingMinutes, busy, durationMin: selectedService.durationMin, stepMin: 15, now })
      : [];

    return { id: st.id, name: st.name, role: st.role, appointments: myAppointments, freeSlots: slots };
  });

  return { business, tz, day, now, services: business.services, selectedService, staff };
}

export type OperatorBoard = NonNullable<Awaited<ReturnType<typeof getOperatorBoard>>>;
