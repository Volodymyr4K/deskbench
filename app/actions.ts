"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toDateParam } from "@/lib/date";

/**
 * Book a slot. Client name/phone are optional: if given, we find-or-create the
 * client (matched by phone within the business) and attach them; otherwise it's
 * a walk-in. Redirects to the board for the slot's day.
 */
export async function bookSlot(formData: FormData): Promise<void> {
  const businessId = String(formData.get("businessId"));
  const serviceId = String(formData.get("serviceId"));
  const staffId = String(formData.get("staffId"));
  const startISO = String(formData.get("startISO"));
  const clientName = String(formData.get("clientName") ?? "").trim();
  const clientPhone = String(formData.get("clientPhone") ?? "").trim();

  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
  const start = new Date(startISO);
  const end = new Date(start.getTime() + service.durationMin * 60_000);

  // Guard against a double-book race: refuse if this staff already overlaps.
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

  redirect(`/?date=${toDateParam(start)}`);
}

/** Mark an appointment cancelled (kept in history, not deleted). */
export async function cancelAppointment(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  await prisma.appointment.update({ where: { id }, data: { status: "CANCELLED" } });
  revalidatePath("/");
}

/** Move an existing appointment to a new staff member and/or start time. */
export async function rescheduleAppointment(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const newStaffId = String(formData.get("newStaffId"));
  const newStartISO = String(formData.get("newStartISO"));

  const appt = await prisma.appointment.findUniqueOrThrow({ where: { id }, include: { service: true } });
  const start = new Date(newStartISO);
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

  redirect(`/?date=${toDateParam(start)}`);
}
