-- Additive only: preserve existing employees and their credentials/payroll.
ALTER TABLE owner_staff ADD COLUMN IF NOT EXISTS job_title text;
ALTER TABLE owner_staff ADD COLUMN IF NOT EXISTS email text;
