ALTER TABLE interview_bookings
  ADD COLUMN IF NOT EXISTS reminder_24h_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent boolean DEFAULT false;
