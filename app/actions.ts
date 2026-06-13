"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toDateParam } from "@/lib/date";
import { instantParts } from "@/lib/tz";

/**
 * Book a slot. Client name/phone are optional: if given, we find-or-create the
 * client (matched by phone within the business) and attach them; otherwise it's
 * a walk-in. Redirects to the board for the slot's day (in the business tz).
 */
export async function bookSlot(formData: FormData): Promise<void> {
  const businessId = String(formData.get("businessId"));
  const serviceId = String(formData.get("serviceId"));
  const staffId = String(formData.get("staffId"));
  const startISO = String(formData.get("startISO"));
  const clientName = String(formData.get("clientName") ?? "").trim();
  const clientPhone = String(formData.get("clientPhone") ?? "").trim();

  const start = new Date(startISO);
  if (Number.isNaN(start.getTime())) redirect("/");

  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId }, include: { business: true } });
  const end = new Date(start.getTime() + service.durationMin * 60_000);

  // Best-effort overlap check — NOT race-proof. Two concurrent bookings of the
  // same slot can both pass this find-then-create gap; a DB constraint or a
  // serializable transaction would be needed to fully prevent double-booking.
  const clash = await prisma.appointment.findFirst({
    where: {
      staffId,
      status: { in: ["BOOKED", "COMPLETED"] },
      startAt: { lt: end },
      endAt: { gt: start },
    },
  });
  if (!clash) {
    let clientId: string | undefined;
    if (clientName || clientPhone) {
      const existing = clientPhone
        ? await prisma.client.findFirst({ where: { businessId, phone: clientPhone } })
        : null;
      const client =
        existing ??
        (await prisma.client.create({
          data: { businessId, name: clientName || "Walk-in", phone: clientPhone || null },
        }));
      clientId = client.id;
    }

    await prisma.appointment.create({
      data: { businessId, serviceId, staffId, clientId, startAt: start, endAt: end, status: "BOOKED", source: "MANUAL" },
    });
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
  const end = new Date(start.getTime() + appt.service.durationMin * 60_000);

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
    await prisma.appointment.update({
      where: { id },
      data: { staffId: newStaffId, startAt: start, endAt: end },
    });
  }

  redirect(`/?date=${toDateParam(instantParts(start, appt.business.timezone))}`);
}
