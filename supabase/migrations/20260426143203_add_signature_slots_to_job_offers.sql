alter table job_offers
  add column if not exists employer_signature_slot jsonb,
  add column if not exists candidate_signature_slot jsonb;
