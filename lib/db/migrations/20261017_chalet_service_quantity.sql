-- Optional per-booking cap; NULL preserves existing unlimited services.
ALTER TABLE chalet_services ADD COLUMN IF NOT EXISTS max_quantity integer;
