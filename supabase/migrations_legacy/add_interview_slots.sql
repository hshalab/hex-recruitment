-- Add proposed_slots column to interviews table
alter table interviews
add column if not exists proposed_slots jsonb default '[]'::jsonb;

-- Update the status check constraint to allow 'pending_selection'
alter table interviews
drop constraint if exists interviews_status_check;

alter table interviews
add constraint interviews_status_check
check (status in ('pending_selection', 'scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled'));
