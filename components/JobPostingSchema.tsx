'use client'

import { Job } from '@/lib/mockJobs'
import { BRAND_NAME } from '@/lib/constants/brand'

function mapEmploymentType(types: string[]): string[] {
  const map: Record<string, string> = {
    'Full-time': 'FULL_TIME',
    'Part-time': 'PART_TIME',
    'Temporary': 'TEMPORARY',
    'Flexible': 'OTHER',
    'Permanent': 'FULL_TIME',
    // Was MISSING, and post-job has always offered it — so every fixed-term
    // role has been publishing employmentType OTHER to Google rather than
    // CONTRACTOR, which is schema.org's value for a role with an end date.
    'Fixed-term': 'CONTRACTOR',
    // Retired from the vocabulary; kept as a passthrough so any historical row
    // still maps to something sensible rather than falling to OTHER.
    'Contract': 'CONTRACTOR',
  }
  return types.map(t => map[t] || 'OTHER')
}

export default function JobPostingSchema({ job }: { job: Job }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://thrivecareer.co.uk'

  const salaryUnit = job.salaryPeriod === 'hour' ? 'HOUR' : 'YEAR'

  const schema = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description: job.fullDescription || job.description,
    datePosted: job.postedDate,
    ...(job.expiresDate && { validThrough: job.expiresDate }),
    employmentType: mapEmploymentType(Array.isArray(job.employmentType) ? job.employmentType : [job.employmentType]),
    hiringOrganization: {
      '@type': 'Organization',
      name: job.company,
      ...(job.companyLogo && { logo: job.companyLogo }),
      ...(job.companyWebsite && { sameAs: job.companyWebsite }),
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.fullLocation?.city || job.location,
        ...(job.area && { addressRegion: job.area }),
        addressCountry: 'GB',
        ...(job.fullLocation?.postcode && { postalCode: job.fullLocation.postcode }),
        ...(job.fullLocation?.addressLine1 && { streetAddress: job.fullLocation.addressLine1 }),
      },
    },
    baseSalary: {
      '@type': 'MonetaryAmount',
      currency: 'GBP',
      value: {
        '@type': 'QuantitativeValue',
        minValue: job.salaryMin,
        maxValue: job.salaryMax,
        unitText: salaryUnit,
      },
    },
    jobLocationType: job.workLocationType === 'Remote' ? 'TELECOMMUTE' : undefined,
    url: `${siteUrl}/job/${job.id}`,
    identifier: {
      '@type': 'PropertyValue',
      name: BRAND_NAME,
      value: job.jobReference || job.id,
    },
    ...(job.skillsRequired?.length && {
      skills: job.skillsRequired.join(', '),
    }),
    ...(job.educationRequired && {
      educationRequirements: {
        '@type': 'EducationalOccupationalCredential',
        credentialCategory: job.educationRequired,
      },
    }),
    ...(job.experienceRequired && {
      experienceRequirements: job.experienceRequired,
    }),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
