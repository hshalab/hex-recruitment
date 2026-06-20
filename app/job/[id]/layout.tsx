import type { Metadata } from 'next'
import { getJobForMeta, formatSalaryShort } from '@/lib/jobMeta'

interface Props {
  params: { id: string }
}

// Per-job metadata so a shared /job/<id> link previews as the ROLE (title +
// branded image), reading as a candidate invite — not the generic root
// employer pitch the client page would otherwise inherit. The matching
// opengraph-image.tsx in this segment supplies the preview image; Next wires
// og:image / twitter:image to it automatically.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const job = await getJobForMeta(params.id)
  const url = `/job/${params.id}`

  if (!job) {
    return {
      title: 'Job',
      description: 'Browse hospitality roles and apply on Thrive.',
      alternates: { canonical: url },
    }
  }

  const title = `${job.title} at ${job.company}`
  const salary = formatSalaryShort(job)
  const bits = [job.company, job.location, salary].filter(Boolean).join(' · ')
  const description = `${job.title} — ${bits}. View the role and apply on Thrive.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: { canonical: url },
  }
}

export default function JobLayout({ children }: { children: React.ReactNode }) {
  return children
}
