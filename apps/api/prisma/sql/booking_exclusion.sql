-- plan.md §6.2 — double-booking is impossible at the DB level.
-- A room cannot have two reservations whose date ranges overlap while either
-- is in a blocking status (HELD, CONFIRMED, CHECKED_IN).
-- Enforced with a GiST exclusion constraint (requires btree_gist for the "=" on roomId).
-- This is applied IN ADDITION to the application-level availability check.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Reservation"
  ADD CONSTRAINT reservation_no_overlap
  EXCLUDE USING gist (
    "roomId" WITH =,
    tsrange("checkInDate", "checkOutDate", '[)') WITH &&
  )
  WHERE ("roomId" IS NOT NULL AND "status" IN ('HELD', 'CONFIRMED', 'CHECKED_IN'));
