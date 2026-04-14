const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function deleteUser(email) {
  console.log(`\nDeleting ${email}...`)

  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers()
  if (listErr) throw listErr
  const user = users.find(u => u.email === email)
  if (!user) { console.log(`  Not found — skipping`); return }

  const userId = user.id
  console.log(`  Found user: ${userId}`)

  const tables = [
    { table: 'notifications', column: 'user_id' },
    { table: 'messages', column: 'sender_id' },
    { table: 'interview_bookings', column: 'employer_id' },
    { table: 'interview_bookings', column: 'candidate_id' },
    { table: 'interviews', column: 'employer_id' },
    { table: 'interviews', column: 'candidate_id' },
    { table: 'job_offers', column: 'employer_id' },
    { table: 'job_offers', column: 'candidate_id' },
    { table: 'job_applications', column: 'candidate_id' },
    { table: 'saved_jobs', column: 'candidate_id' },
    { table: 'saved_candidates', column: 'employer_id' },
    { table: 'saved_candidates', column: 'candidate_id' },
    { table: 'job_alerts', column: 'candidate_id' },
    { table: 'boosts', column: 'user_id' },
    { table: 'company_reviews', column: 'reviewer_id' },
    { table: 'company_reviews', column: 'employer_id' },
    { table: 'candidate_cvs', column: 'user_id' },
    { table: 'conversations', column: 'participant_1' },
    { table: 'conversations', column: 'participant_2' },
    { table: 'jobs', column: 'employer_id' },
    { table: 'employer_availability', column: 'employer_id' },
    { table: 'employer_availability_overrides', column: 'employer_id' },
    { table: 'employer_subscriptions', column: 'user_id' },
    { table: 'employer_profiles', column: 'user_id' },
    { table: 'candidate_profiles', column: 'user_id' },
  ]

  for (const { table, column } of tables) {
    const { error, count } = await supabase.from(table).delete().eq(column, userId)
    if (error && !error.message.includes('does not exist')) {
      console.log(`  Warning on ${table}.${column}: ${error.message}`)
    } else {
      console.log(`  Cleared ${table}.${column}`)
    }
  }

  const { error: deleteErr } = await supabase.auth.admin.deleteUser(userId)
  if (deleteErr) throw deleteErr
  console.log(`  Auth user deleted ✓`)
}

async function main() {
  await deleteUser('pauldavies.gbr@gmail.com')
  await deleteUser('gicalorandi@gmail.com')
  console.log('\nAll done.')
}

main().catch(console.error)
