"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toDateParam } from "@/lib/date";
import { instantParts } from "@/lib/tz";
import { startWithinHours, type Interval } from "@/lib/availability";

/** Working intervals (minutes-from-midnight) for a staff member on the weekday of `start`, in `tz`. */
function workingMinutesFor(hours: { dayOfWeek: number; startMinutes: number; endMinutes: number }[], start: Date, tz: string): Interval[] {
  const weekday = instantParts(start, tz).weekday;
  return hours.filter((h) => h.dayOfWeek === weekday).map((h) => ({ start: h.startMinutes, end: h.endMinutes }));
}

/**
 * Book a slot. Client name/phone are optional: if given, we find-or-create the
 * client (matched by phone within the business) and attach them; otherwise it's
 * a walk-in. Redirects to the board for the slot's day (in the business tz).
 */
export async function bookSlot(formData: FormData): Promise<void> {
  const serviceId = String(formData.get("serviceId"));
  const staffId = String(formData.get("staffId"));
  const startISO = String(formData.get("startISO"));
  const clientName = String(formData.get("clientName") ?? "").trim();
  const clientPhone = String(formData.get("clientPhone") ?? "").trim();

  const start = new Date(startISO);
  if (Number.isNaN(start.getTime())) redirect("/");

  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId }, include: { business: true } });
  const staff = await prisma.staff.findUnique({ where: { id: staffId }, include: { hours: true } });
  const tz = service.business.timezone;
  const end = new Date(start.getTime() + service.durationMin * 60_000);

  // Validate server-side — never trust the posted time. Reject if staff/service
  // are from different businesses, the slot is in the past, or it falls outside
  // the staff member's working hours. (The UI only offers valid slots, but the
  // action must not rely on that.)
  const valid =
    !!staff &&
    staff.businessId === service.businessId &&
    start.getTime() >= Date.now() &&
    startWithinHours(start, service.durationMin, tz, workingMinutesFor(staff.hours, start, tz));
  if (!valid) redirect(`/?date=${toDateParam(instantParts(start, tz))}`);

  // Fast, friendly pre-check for the common case. The hard guarantee against
  // double-booking is the Postgres exclusion constraint `appointment_no_overlap`
  // (see the migration), which the create below is wrapped to catch — so the rare
  // concurrent race is handled atomically by the DB, not by this check.
  const clash = await prisma.appointment.findFirst({
    where: {
      staffId,
      status: { in: ["BOOKED", "COMPLETED"] },
      startAt: { lt: end },
      endAt: { gt: start },
    },
  });
  if (!clash) {
    const bizId = service.businessId;
    try {
      let clientId: string | undefined;
      if (clientName || clientPhone) {
        const existing = clientPhone
          ? await prisma.client.findFirst({ where: { businessId: bizId, phone: clientPhone } })
          : null;
        const client =
          existing ??
          (await prisma.client.create({
            data: { businessId: bizId, name: clientName || "Walk-in", phone: clientPhone || null },
          }));
        clientId = client.id;
      }

      await prisma.appointment.create({
        data: { businessId: bizId, serviceId, staffId, clientId, startAt: start, endAt: end, status: "BOOKED", source: "MANUAL" },
      });
    } catch (e) {
      // A concurrent booking won the slot first: the DB exclusion constraint
      // rejects the overlap atomically (this is the race-proof guarantee). Treat
      // as "slot taken" and fall through. Re-throw anything else.
      if (!(e instanceof Error) || !e.message.includes("appointment_no_overlap")) throw e;
    }
  }

  redirect(`/?date=${toDateParam(instantParts(start, service.business.timezone))}`);
}

/** Mark an appointment cancelled (kept in history, not deleted). */
export async function cancelAppointment(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  await prisma.appointment.update({ where: { id }, data: { status: "CANCELLED" } });
  revalidatePath("/");
}

/** Mark a past appointment as completed (the client showed up). */
export async function markCompleted(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  await prisma.appointment.update({ where: { id }, data: { status: "COMPLETED" } });
  revalidatePath("/");
}

/** Mark a past appointment as a no-show (the client did not come). */
export async function markNoShow(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  await prisma.appointment.update({ where: { id }, data: { status: "NO_SHOW" } });
  revalidatePath("/");
}

/** Move an existing appointment to a new staff member and/or start time. */
export async function rescheduleAppointment(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const newStaffId = String(formData.get("newStaffId"));
  const newStartISO = String(formData.get("newStartISO"));

  const start = new Date(newStartISO);
  if (Number.isNaN(start.getTime())) redirect("/");

  const appt = await prisma.appointment.findUniqueOrThrow({ where: { id }, include: { service: true, business: true } });
  const newStaff = await prisma.staff.findUnique({ where: { id: newStaffId }, include: { hours: true } });
  const tz = appt.business.timezone;
  const end = new Date(start.getTime() + appt.service.durationMin * 60_000);

  // Same server-side guard as booking: target staff must be in this business, the
  // new time must be in the future and inside that staff's working hours.
  const valid =
    !!newStaff &&
    newStaff.businessId === appt.businessId &&
    start.getTime() >= Date.now() &&
    startWithinHours(start, appt.service.durationMin, tz, workingMinutesFor(newStaff.hours, start, tz));
  if (!valid) redirect(`/?date=${toDateParam(instantParts(start, tz))}`);

  // Refuse if the target overlaps another appointment for that staff (not this one).
  const clash = await prisma.appointment.findFirst({
    where: {
      id: { not: id },
      staffId: newStaffId,
      status: { in: ["BOOKED", "COMPLETED"] },
      startAt: { lt: end },
      endAt: { gt: start },
    },
  });
  if (!clash) {
    try {
      await prisma.appointment.update({
        where: { id },
        data: { staffId: newStaffId, startAt: start, endAt: end },
      });
    } catch (e) {
      // Concurrent booking took the target slot — exclusion constraint rejects it.
      if (!(e instanceof Error) || !e.message.includes("appointment_no_overlap")) throw e;
    }
  }

  redirect(`/?date=${toDateParam(instantParts(start, appt.business.timezone))}`);
}
