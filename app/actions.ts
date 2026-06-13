"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/** Book a free slot (walk-in: no client attached). Manual source. */
export async function bookSlot(formData: FormData): Promise<void> {
  const businessId = String(formData.get("businessId"));
  const serviceId = String(formData.get("serviceId"));
  const staffId = String(formData.get("staffId"));
  const startISO = String(formData.get("startISO"));

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
  if (clash) {
    revalidatePath("/");
    return;
  }

  await prisma.appointment.create({
    data: { businessId, serviceId, staffId, startAt: start, endAt: end, status: "BOOKED", source: "MANUAL" },
  });
  revalidatePath("/");
}

/** Mark an appointment cancelled (kept in history, not deleted). */
export async function cancelAppointment(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  await prisma.appointment.update({ where: { id }, data: { status: "CANCELLED" } });
  revalidatePath("/");
}
