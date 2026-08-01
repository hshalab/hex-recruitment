ALTER TABLE employer_profiles
  ADD COLUMN IF NOT EXISTS ics_feed_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS gcal_access_token text,
  ADD COLUMN IF NOT EXISTS gcal_refresh_token text,
  ADD COLUMN IF NOT EXISTS gcal_calendar_id text;

UPDATE employer_profiles SET ics_feed_token = gen_random_uuid()::text WHERE ics_feed_token IS NULL;

CREATE TABLE IF NOT EXISTS employer_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  slot_start time NOT NULL, slot_end time NOT NULL,
  duration_minutes int NOT NULL DEFAULT 45,
  is_active bool NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_slot CHECK (slot_end > slot_start)
);

CREATE TABLE IF NOT EXISTS employer_availability_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  override_date date NOT NULL, is_blocked bool NOT NULL DEFAULT true,
  slot_start time, slot_end time, reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interview_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid REFERENCES interviews(id) ON DELETE CASCADE,
  employer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booked_date date NOT NULL, booked_time time NOT NULL,
  duration_minutes int NOT NULL DEFAULT 45,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled','rescheduled')),
  gcal_event_id_employer text, gcal_event_id_candidate text,
  ics_uid text UNIQUE DEFAULT gen_random_uuid()::text,
  booked_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz, cancel_reason text
);

ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES interview_bookings(id),
  ADD COLUMN IF NOT EXISTS duration_minutes int DEFAULT 45;

ALTER TABLE employer_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ea_own" ON employer_availability USING (employer_id = auth.uid());
CREATE POLICY "ea_insert" ON employer_availability FOR INSERT WITH CHECK (employer_id = auth.uid());
CREATE POLICY "eao_own" ON employer_availability_overrides USING (employer_id = auth.uid());
CREATE POLICY "eao_insert" ON employer_availability_overrides FOR INSERT WITH CHECK (employer_id = auth.uid());
CREATE POLICY "ib_employer" ON interview_bookings USING (employer_id = auth.uid());
CREATE POLICY "ib_candidate" ON interview_bookings USING (candidate_id = auth.uid());
CREATE POLICY "ib_insert" ON interview_bookings FOR INSERT WITH CHECK (employer_id = auth.uid() OR candidate_id = auth.uid());
CREATE POLICY "ib_update" ON interview_bookings FOR UPDATE USING (employer_id = auth.uid() OR candidate_id = auth.uid());
