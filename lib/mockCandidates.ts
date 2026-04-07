export interface WorkHistory {
  title: string
  company: string
  location: string
  startDate: string
  endDate: string | null
  description: string
}

export interface Education {
  institution: string
  qualification: string
  fieldOfStudy: string
  startDate: string
  endDate: string
  inProgress: boolean
  grade: string
}

export interface Language {
  name: string
  proficiency: 'Native' | 'Fluent' | 'Conversational' | 'Basic'
}

export interface Candidate {
  id: string
  userId: string
  fullName: string
  profilePictureUrl: string | null
  jobTitle: string
  jobSector?: string
  location: string
  yearsExperience: number
  bio: string
  personalBio?: string
  skills: string[]
  workHistory: WorkHistory[]
  education?: Education[]
  languages?: Language[]
  cvUrl: string | null
  cvFileName?: string
  availability: string
  email: string
  phone: string
  interests?: string[]
  certifications?: string[]
  createdAt: string
  // Extended profile fields
  dateOfBirth?: string
  age?: number
  nationality?: string
  desiredSalary?: string
  salaryMin?: string
  salaryMax?: string
  salaryPeriod?: 'hour' | 'year'
  preferredJobTypes?: string[]
  workLocationPreferences?: string[]
  preferredLocations?: string
  linkedinUrl?: string
  instagramUrl?: string
  facebookUrl?: string
  // Verification badges
  hasNiNumber?: boolean
  hasBankAccount?: boolean
  hasRightToWork?: boolean
  hasP45?: boolean
}

// Mock data removed — all candidates now come from Supabase candidate_profiles
export const mockCandidates: Candidate[] = []

// DEV_MODE fixture — used only when NEXT_PUBLIC_DEV_MODE=true so the
// candidate browse/detail pages render without a Supabase session.
export const devMockCandidates: Candidate[] = [
  {
    id: 'dev-1',
    userId: 'dev-1',
    fullName: 'Sarah Mitchell',
    profilePictureUrl: null,
    jobTitle: 'Senior Sous Chef',
    jobSector: 'hospitality',
    location: 'Manchester, UK',
    yearsExperience: 7,
    bio: 'Passionate sous chef with 7 years of experience in fine dining and gastropubs. Strong background in menu development, kitchen leadership, and seasonal British cuisine. Looking for a head chef role in a quality-led kitchen.',
    skills: ['Menu Development', 'Kitchen Management', 'Food Safety (Level 3)', 'Allergens', 'Pastry', 'Butchery', 'Stock Control'],
    workHistory: [
      { title: 'Senior Sous Chef', company: 'The Oak & Vine', location: 'Manchester', startDate: 'Jan 2022', endDate: null, description: 'Leading a brigade of 8 in a 2-AA-rosette gastropub. Responsible for menu changes, supplier relationships, and food cost.' },
      { title: 'Sous Chef', company: 'Hawksmoor', location: 'Manchester', startDate: 'Mar 2019', endDate: 'Dec 2021', description: 'Section management across grill and larder during a high-volume restaurant launch.' },
      { title: 'Chef de Partie', company: 'The Ivy', location: 'Manchester', startDate: 'Jun 2017', endDate: 'Feb 2019', description: 'Pastry and sauce sections in a 200-cover brasserie.' },
    ],
    education: [
      { institution: 'Manchester College', qualification: 'NVQ Level 3', fieldOfStudy: 'Professional Cookery', startDate: '2015', endDate: '2017', inProgress: false, grade: 'Distinction' },
    ],
    languages: [
      { name: 'English', proficiency: 'Native' },
      { name: 'French', proficiency: 'Conversational' },
    ],
    certifications: ['Food Hygiene Level 3', 'Allergens Awareness', 'First Aid at Work'],
    interests: ['Foraging', 'Food Photography', 'Running', 'Travel'],
    cvUrl: null,
    availability: 'Available immediately',
    email: 'sarah.mitchell@example.com',
    phone: '+44 7700 900123',
    createdAt: '2025-09-01',
    nationality: 'British',
    salaryMin: '38000',
    salaryMax: '45000',
    salaryPeriod: 'year',
    preferredJobTypes: ['Full-time', 'Permanent'],
    workLocationPreferences: ['On-site'],
    preferredLocations: 'Manchester, Stockport, Altrincham',
    linkedinUrl: 'linkedin.com/in/sarah-mitchell',
    hasNiNumber: true,
    hasBankAccount: true,
    hasRightToWork: true,
    hasP45: true,
  },
  {
    id: 'dev-2',
    userId: 'dev-2',
    fullName: 'James O\u2019Connor',
    profilePictureUrl: null,
    jobTitle: 'Bar Manager',
    jobSector: 'hospitality',
    location: 'Leeds, UK',
    yearsExperience: 5,
    bio: 'Cocktail-led bar manager with a track record of growing wet sales and building winning teams. WSET Level 2 Spirits.',
    skills: ['Cocktails', 'Stock Control', 'Team Leadership', 'Rotas', 'Cellar Management'],
    workHistory: [
      { title: 'Bar Manager', company: 'The Alchemist', location: 'Leeds', startDate: 'Apr 2021', endDate: null, description: 'Managing a 12-person bar team across two sites.' },
    ],
    education: [],
    languages: [{ name: 'English', proficiency: 'Native' }],
    cvUrl: null,
    availability: '2 weeks notice',
    email: 'james.oconnor@example.com',
    phone: '+44 7700 900456',
    createdAt: '2025-10-12',
    salaryMin: '30000',
    salaryMax: '36000',
    salaryPeriod: 'year',
    preferredJobTypes: ['Full-time'],
    workLocationPreferences: ['On-site'],
    hasRightToWork: true,
    hasNiNumber: true,
  },
  {
    id: 'dev-3',
    userId: 'dev-3',
    fullName: 'Priya Patel',
    profilePictureUrl: null,
    jobTitle: 'Front of House Supervisor',
    jobSector: 'hospitality',
    location: 'Birmingham, UK',
    yearsExperience: 4,
    bio: 'Service-led FOH supervisor with experience across boutique hotels and independent restaurants.',
    skills: ['Customer Service', 'Reservations', 'Cash Handling', 'Training', 'Wine Service'],
    workHistory: [],
    education: [],
    languages: [
      { name: 'English', proficiency: 'Native' },
      { name: 'Gujarati', proficiency: 'Fluent' },
    ],
    cvUrl: null,
    availability: '1 month notice',
    email: 'priya.patel@example.com',
    phone: '+44 7700 900789',
    createdAt: '2025-11-03',
    preferredJobTypes: ['Full-time', 'Part-time'],
    workLocationPreferences: ['On-site'],
    hasRightToWork: true,
  },
]
