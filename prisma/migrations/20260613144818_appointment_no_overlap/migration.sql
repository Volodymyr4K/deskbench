-- Make double-booking impossible at the database level (not just a best-effort
-- find-then-create check in app code). An exclusion constraint atomically rejects
-- any two active appointments for the same staff whose time ranges overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "appointment_no_overlap"
  EXCLUDE USING gist (
    "staffId" WITH =,
    tsrange("startAt", "endAt") WITH &&
  )
  WHERE (status IN ('BOOKED', 'COMPLETED'));
