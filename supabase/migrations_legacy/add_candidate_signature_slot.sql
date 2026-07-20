-- Add signature slot columns to job_offers.
--
-- Each slot stores the (page, x, y, width) where a signature image should be
-- stamped on the body of the offer letter PDF. Captured at PDF build time in
-- jsPDF mm units (top-left origin) so we never have to coordinate-search
-- inside the PDF later. The signature block layout is deterministic — slots
-- come from build-time constants, not text detection — so every new offer
-- has both slots populated by construction.
--
-- Shape: { page: int, x_mm: number, y_mm: number, width_mm: number, page_height_mm: number }
--
-- employer_signature_slot is consumed immediately at offer creation (the
-- employer signs in the same flow) but persisted for audit / dispute
-- resolution / future re-stamping (e.g. rescinded watermarks).
--
-- candidate_signature_slot is consumed at counter-sign time. The candidate
-- flow loads the slot, converts mm -> pdf-lib points using page_height_mm
-- to flip the y-axis (pdf-lib uses bottom-left origin, points), and stamps
-- the candidate signature image at the right spot in the body of the letter.
--
-- Nullable: existing offers (created before this change) stay null. Their
-- counter-sign flow falls back to the legacy "append signature certificate
-- page only" behavior. New offers always have both slots populated.
alter table job_offers
  add column if not exists employer_signature_slot jsonb,
  add column if not exists candidate_signature_slot jsonb;
