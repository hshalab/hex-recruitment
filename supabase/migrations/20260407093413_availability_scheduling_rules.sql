ALTER TABLE employer_availability
  ADD COLUMN IF NOT EXISTS buffer_minutes int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_notice_hours int NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS max_advance_days int NOT NULL DEFAULT 28;
