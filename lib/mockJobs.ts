export interface JobLocation {
  addressLine1: string
  addressLine2?: string
  city: string
  postcode: string
  coordinates?: { lat: number; lng: number }
}

export interface Job {
  id: string
  company: string
  companyLogo: string
  companyBanner?: string
  companyWebsite?: string
  companyDescription?: string
  employerId?: string  // ID of the employer who posted the job
  title: string
  jobReference: string
  salaryMin: number
  salaryMax: number
  salaryPeriod: 'hour' | 'year'
  employmentType: ('Full-time' | 'Part-time' | 'Permanent' | 'Contract' | 'Temporary' | 'Flexible')[]
  location: string
  area: string
  /** Optional property/site name for multi-venue operators (e.g. "The Ember", "Ember Soho").
   *  Null for single-site operators or multi-site roles. Surfaced on /my-jobs row + card. */
  venue?: string
  fullLocation: JobLocation
  shiftSchedule: string
  description: string
  fullDescription: string
  responsibilities: string[]
  requirements: string[]
  benefits: string[]
  skillsRequired: string[]
  educationRequired?: string
  experienceRequired: string
  workAuthorization: string[]
  workLocationType: 'In person' | 'Remote' | 'Hybrid'
  tags: string[]
  urgent: boolean
  noExperience: boolean
  postedAt: string
  postedDate: string
  expiresDate?: string
  category: string
  viewCount: number
  applicationCount: number
  status: 'active' | 'expired' | 'filled'
  screeningQuestions?: { id: string; question: string; required: boolean }[]
  isRecruiterPosting?: boolean
}

// Mock data removed — all jobs now come from Supabase
export const mockJobs: Job[] = []
