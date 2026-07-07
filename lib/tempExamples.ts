// ============================================================================
// DISPLAY-ONLY example Temp Work posts — shown in the feed's empty state so the
// page looks alive before real posts exist.
//
// ⚠️ SAFETY CONTRACT (same rules as lib/example-data.ts):
//   - Fake, illustrative data. NEVER inserted into Supabase, NEVER public/real.
//   - Import ONLY from the /temp-work feed client component. Never from an API
//     route, a 'use server' action, or any DB writer.
//   - Every id is prefixed "example-" and carries isExample:true. The moment any
//     real post exists, the feed hides all of these.
// ============================================================================

import type { TempPost } from '@/lib/tempWork'

// A plausible upcoming multi-day window for the events example (display only).
const daysOut = (n: number) => new Date(Date.now() + n * 24 * 3600_000).toISOString().slice(0, 10)

export const EXAMPLE_TEMP_POSTS: TempPost[] = [
  {
    isExample: true,
    id: 'example-temp-1',
    employer_id: 'example',
    title: 'Chef de Partie needed — Saturday service',
    category: 'chef_de_partie',
    description: 'Busy Italian kitchen, one CDP needed for Saturday dinner service. Fresh pasta section — some experience preferred. Meal on shift.',
    date_from: null, date_to: null, start_time: '17:00', end_time: '23:30', is_ongoing: false,
    location_area: 'Soho, London', postcode: 'W1', hourly_rate: 16, rate_type: 'hour', headcount: 1,
    image_url: null, external_link: null,
    company_name: 'The Example Kitchen', company_logo: null, like_count: 9, comment_count: 3,
    status: 'open', created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  },
  {
    isExample: true,
    id: 'example-temp-2',
    employer_id: 'example',
    title: 'Waiting staff — weekend brunch shifts',
    category: 'waiting_staff',
    description: 'Friendly all-day café after reliable waiting staff for Sat & Sun brunch. Tips shared. Ongoing — pick the weekends that suit you.',
    date_from: null, date_to: null, start_time: null, end_time: null, is_ongoing: true,
    location_area: 'Bristol', postcode: 'BS1', hourly_rate: 12.5, rate_type: 'hour', headcount: 2,
    image_url: null, external_link: null,
    company_name: 'Example Café Co.', company_logo: null, like_count: 5, comment_count: 2,
    status: 'open', created_at: new Date(Date.now() - 26 * 3600_000).toISOString(),
  },
  {
    isExample: true,
    id: 'example-temp-3',
    employer_id: 'example',
    title: 'Events staff — three-day festival',
    category: 'events_staff',
    description: 'Outdoor food & music festival across a long weekend. Setup, service and pack-down. Smart black uniform. Great day rate — work one day or all three.',
    date_from: daysOut(10), date_to: daysOut(12), start_time: '11:00', end_time: '23:00', is_ongoing: false,
    location_area: 'Manchester', postcode: 'M2', hourly_rate: 130, rate_type: 'day', headcount: 8,
    image_url: null, external_link: null,
    company_name: 'Example Events Group', company_logo: null, like_count: 14, comment_count: 6,
    status: 'open', created_at: new Date(Date.now() - 3 * 24 * 3600_000).toISOString(),
  },
]
