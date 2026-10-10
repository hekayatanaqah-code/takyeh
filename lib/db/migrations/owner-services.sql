BEGIN;
CREATE TABLE IF NOT EXISTS owner_services (
  id serial PRIMARY KEY,
  key text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'briefcase',
  kind text NOT NULL DEFAULT 'link' CHECK (kind IN ('photography', 'link')),
  state text NOT NULL DEFAULT 'coming_soon' CHECK (state IN ('available', 'coming_soon', 'hidden')),
  action_url text,
  sort_order integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS owner_services_photography_unique ON owner_services (kind) WHERE kind = 'photography';
INSERT INTO owner_services (key, title, description, icon, kind, state)
VALUES ('photography', 'التصوير والتوثيق الاحترافي', 'اختر باقة التصوير وموعداً مناسباً من تقويم المصور، وسدد مباشرة عبر بوابة الدفع.', 'camera', 'photography',
  CASE WHEN (SELECT value FROM site_settings WHERE key = 'photography_enabled') = 'true' THEN 'available' ELSE 'coming_soon' END)
ON CONFLICT (key) DO NOTHING;
COMMIT;
