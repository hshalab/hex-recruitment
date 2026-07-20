-- Hiring-readiness flag: a single "right to work confirmed" boolean the employer
-- ticks once they've verified RTW through their own proper channel (Home Office
-- online service / usual checks). STATUS ONLY — Thrive stores no documents and
-- no special-category data. Additive: 3 new columns on job_offers, nothing else
-- altered. Existing offers default to false (= not yet confirmed). The Hired
-- step is gated on this being true (pipeline drag + the card's Confirm Hire).
-- RLS unchanged — the existing "Employers can update their own offers" policy
-- already lets the owning employer set the flag.
ALTER TABLE public.job_offers
  ADD COLUMN IF NOT EXISTS right_to_work_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS right_to_work_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS right_to_work_confirmed_by uuid;

COMMENT ON COLUMN public.job_offers.right_to_work_confirmed IS
  'Employer-confirmed right-to-work readiness flag (status only; no documents stored). Hire is gated on this being true.';
