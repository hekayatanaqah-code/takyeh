-- Additive only: no data, column, or table removal.
CREATE INDEX IF NOT EXISTS owner_bookings_customer_history_idx
  ON owner_bookings (owner_id, client_phone, booking_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS service_appointments_customer_history_idx
  ON service_appointments (owner_id, provider_id, client_phone, date_str DESC, id DESC);
CREATE INDEX IF NOT EXISTS owner_reschedule_logs_customer_history_idx
  ON owner_reschedule_logs (owner_id, booking_id, rescheduled_at DESC, id DESC);
