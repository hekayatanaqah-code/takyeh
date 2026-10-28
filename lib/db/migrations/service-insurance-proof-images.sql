-- Additive: historical service appointments have no attachments until documented.
ALTER TABLE service_appointments
  ADD COLUMN IF NOT EXISTS insurance_proof_images jsonb NOT NULL DEFAULT '[]'::jsonb;
