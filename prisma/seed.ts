import { PrismaClient, AppointmentStatus, AppointmentSource } from "../app/generated/prisma";
import { zonedDayMinutesToInstant, todayInZone } from "../lib/tz";
import { DateTime } from "luxon";

const prisma = new PrismaClient();

const TZ = "Europe/Kyiv";

/** Build the instant for today at a given wall-clock hour:minute in the demo tz. */
function todayAt(hour: number, minute = 0): Date {
  return zonedDayMinutesToInstant(todayInZone(TZ), hour * 60 + minute, TZ);
}

/** Instant for `daysAgo` days back at a wall-clock hour in the demo tz (DST-safe). */
function pastAt(daysAgo: number, hour: number): Date {
  return DateTime.now().setZone(TZ).minus({ days: daysAgo }).set({ hour, minute: 0, second: 0, millisecond: 0 }).toJSDate();
}

async function main() {
  // Idempotent-ish: clear the demo business and reseed.
  const existing = await prisma.business.findUnique({ where: { slug: "demo" } });
  if (existing) {
    await prisma.business.delete({ where: { id: existing.id } });
  }

  const business = await prisma.business.create({
    data: {
      name: "Demo Barbershop",
      slug: "demo",
      timezone: "Europe/Kyiv",
    },
  });

  const [haircut, beard, combo] = await Promise.all([
    prisma.service.create({ data: { businessId: business.id, name: "Haircut", durationMin: 30, priceCents: 35000 } }),
    prisma.service.create({ data: { businessId: business.id, name: "Beard trim", durationMin: 20, priceCents: 20000 } }),
    prisma.service.create({ data: { businessId: business.id, name: "Haircut + beard", durationMin: 45, priceCents: 50000 } }),
  ]);

  // Two barbers, working Mon–Sat 09:00–18:00 (dayOfWeek 1..6; 0 = Sunday).
  for (const name of ["Andriy", "Marko"]) {
    const staff = await prisma.staff.create({
      data: { businessId: business.id, name, role: "Barber" },
    });
    for (let day = 1; day <= 6; day++) {
      await prisma.staffHours.create({
        data: { staffId: staff.id, dayOfWeek: day, startMinutes: 9 * 60, endMinutes: 18 * 60 },
      });
    }
  }

  const andriy = await prisma.staff.findFirstOrThrow({ where: { businessId: business.id, name: "Andriy" } });

  const [olena, ihor] = await Promise.all([
    prisma.client.create({ data: { businessId: business.id, name: "Olena", phone: "+380501112233" } }),
    prisma.client.create({ data: { businessId: business.id, name: "Ihor", phone: "+380679998877" } }),
  ]);

  // A couple of existing appointments today so the operator view isn't empty.
  await prisma.appointment.create({
    data: {
      businessId: business.id,
      serviceId: haircut.id,
      staffId: andriy.id,
      clientId: olena.id,
      startAt: todayAt(11, 0),
      endAt: todayAt(11, 30),
      status: AppointmentStatus.BOOKED,
      source: AppointmentSource.MANUAL,
    },
  });
  await prisma.appointment.create({
    data: {
      businessId: business.id,
      serviceId: combo.id,
      staffId: andriy.id,
      clientId: ihor.id,
      startAt: todayAt(14, 0),
      endAt: todayAt(14, 45),
      status: AppointmentStatus.BOOKED,
      source: AppointmentSource.MANUAL,
    },
  });

  // Historical appointments over the last 30 days so the stats view has data.
  // Deterministic status/source mix (no randomness → reproducible).
  const marko = await prisma.staff.findFirstOrThrow({ where: { businessId: business.id, name: "Marko" } });
  const svcByIdx = [haircut, beard, combo];
  let history = 0;
  for (let d = 1; d <= 30; d++) {
    const nApp = d % 3 === 0 ? 2 : 1;
    for (let k = 0; k < nApp; k++) {
      const idx = d * 2 + k;
      const service = svcByIdx[idx % 3];
      const staffMember = idx % 2 === 0 ? andriy : marko;
      const client = idx % 2 === 0 ? olena : ihor;
      const status =
        idx % 7 === 0
          ? AppointmentStatus.NO_SHOW
          : idx % 5 === 0
            ? AppointmentStatus.CANCELLED
            : AppointmentStatus.COMPLETED;
      const source = idx % 4 === 0 ? AppointmentSource.ASSISTANT : AppointmentSource.MANUAL;
      const start = pastAt(d, 10 + (idx % 6)); // 10:00–15:00
      await prisma.appointment.create({
        data: {
          businessId: business.id,
          serviceId: service.id,
          staffId: staffMember.id,
          clientId: client.id,
          startAt: start,
          endAt: new Date(start.getTime() + service.durationMin * 60_000),
          status,
          source,
        },
      });
      history++;
    }
  }

  console.log(`Seeded business "${business.name}" (slug: ${business.slug})`);
  console.log(`  services: ${[haircut, beard, combo].map((s) => s.name).join(", ")}`);
  console.log(`  + ${history} historical appointments (for stats)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
