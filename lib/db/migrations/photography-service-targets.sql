BEGIN;
-- Preserve all historical property bookings. New service bookings use their
-- approved submission identity, never an unrelated property/provider ID.
ALTER TABLE photography_bookings ADD COLUMN IF NOT EXISTS service_submission_id integer;
ALTER TABLE photography_bookings ALTER COLUMN property_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'photography_bookings'::regclass
      AND conname = 'photography_booking_one_target'
  ) THEN
    ALTER TABLE photography_bookings
      ADD CONSTRAINT photography_booking_one_target
      CHECK (num_nonnulls(property_id, service_submission_id) = 1);
  END IF;
END $$;
COMMIT;
