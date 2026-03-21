import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  const { count, error } = await supabase
    .from('employer_profiles')
    .select('*', { count: 'exact', head: true })

  const employerCount = error ? 0 : (count ?? 0)

  return NextResponse.json({ employerCount }, {
    headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate' },
  })
}
