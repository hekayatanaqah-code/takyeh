-- Run after the reviewed schema.sql import, before starting the native server.
-- Required by the application model, absent from the old source catalog.
ALTER TABLE external_services ADD COLUMN owner_id VARCHAR(191) NULL;
