import { createClient } from '@supabase/supabase-js'
import { buildJobsFeedXml, type FeedJobRow } from '@/lib/jobsFeed'

// Aggregator jobs feed for Adzuna / Jooble / Jora / Talent.com. Reuses the same
// status='active' jobs query the sitemap uses — so filled (reconciled) and
// expired (60-day cron) roles drop out automatically. Cached ~1h; aggregators
// re-pull on their own schedule, so a closed role leaves the feed promptly.
//
// NOT a Google for Jobs feed — that's the on-page JobPosting structured data,
// a separate channel that happens to reuse the same job data.
export const revalidate = 3600

const FIELDS =
  'id,title,description,full_description,company,location,area,full_location,' +
  'salary_min,salary_max,salary_type,employment_type,category,posted_at,' +
  'expires_at,job_reference,source_url'

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://thrivecareer.co.uk'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  let rows: FeedJobRow[] = []
  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { data } = await supabase
      .from('jobs')
      .select(FIELDS)
      .eq('status', 'active')
      .order('posted_at', { ascending: false })
      .limit(5000)
    rows = (data as unknown as FeedJobRow[]) || []
  }

  const xml = buildJobsFeedXml(rows, siteUrl)
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
