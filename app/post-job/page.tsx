'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import Header from '@/components/Header'
import PostcodeLookup, { type AddressData } from '@/components/PostcodeLookup'
import { supabase } from '@/lib/supabase'
import { useJobs } from '@/lib/JobsContext'
import { getTagsByCategory, TAG_CATEGORIES, getTagCategory, type TagCategory } from '@/lib/jobTags'
import { categories } from '@/lib/categories'
import { isEmployerEntitled } from '@/lib/foundingEntitlement'
import { PHOTO_TIPS } from '@/lib/photoTips'
import type { WorkType } from '@/lib/workTypes'
import { employerLoginPath } from '@/lib/loginRedirect'
import styles from './page.module.css'

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })

const defaultImages = [
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&h=627&fit=crop',
  'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1200&h=627&fit=crop',
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&h=627&fit=crop',
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&h=627&fit=crop',
]

type GuidedFields = { whatIsJob: string; dayToDay: string; experienceNeeded: string; whatWeOffer: string }
type UndoState =
  | { source: 'guided'; fields: GuidedFields }
  | { source: 'editor'; description: string }

function PostJobContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { jobs, addJob, updateJob, getJobById } = useJobs()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [logoError, setLogoError] = useState('')
  const [logoSuccess, setLogoSuccess] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoUploadError, setLogoUploadError] = useState('')
  const [logoFileName, setLogoFileName] = useState('')
  const [bannerUploading, setBannerUploading] = useState(false)
  const [bannerUploadError, setBannerUploadError] = useState('')
  const [bannerFileName, setBannerFileName] = useState('')

  const [showPreview, setShowPreview] = useState(false)
  const [enhancing, setEnhancing] = useState(false)
  const [enhanceError, setEnhanceError] = useState('')
  const [showUndo, setShowUndo] = useState(false)
  // Guided description fields
  const [guidedFields, setGuidedFields] = useState<GuidedFields>({
    whatIsJob: '',
    dayToDay: '',
    experienceNeeded: '',
    whatWeOffer: '',
  })
  // 'guided' = show four fields, 'editor' = show Tiptap editor
  const [descView, setDescView] = useState<'guided' | 'editor'>('guided')

  // "Draft my advert" — the generator, above the guided fields.
  const [aiPanelOpen, setAiPanelOpen] = useState(true)
  const [aiSentence, setAiSentence] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState('')
  const [drafted, setDrafted] = useState(false)
  const [undoState, setUndoState] = useState<UndoState | null>(null)

  const [formData, setFormData] = useState({
    company: '',
    companyWebsite: '',
    companyLogo: '',
    companyBanner: '',
    title: '',
    category: '',
    // NOTHING PRE-SELECTED. These two used to default to Full-time and
    // Permanent, so an employer who never touched them published an advert
    // asserting a permanent full-time job — and since the AI generator repeats
    // what the form tells it, that assertion started appearing as a SENTENCE in
    // the advert, in her voice.
    //
    // The next real employer to use this form runs a temp agency. Ongoing
    // agency work is neither permanent nor necessarily full-time. She would have
    // filled in a title, a rate and a sentence, never thought to touch two chips
    // that already looked answered, and published the opposite of what she was
    // advertising.
    //
    // Fixing this in the prompt would have treated the symptom: the wrong value
    // still lands in the row, still shows on the card, still drives matching.
    employmentType: '' as '' | 'Full-time' | 'Part-time' | 'Flexible',
    contractType: '' as '' | 'Permanent' | 'Temporary' | 'Fixed-term',
    workLocationType: 'In person' as 'In person' | 'Remote' | 'Hybrid',
    salaryMin: '',
    salaryMax: '',
    salaryPeriod: 'hour' as 'hour' | 'year',
    location: '',
    area: '',
    venue: '',
    postcode: '',
    city: '',
    description: '',
    // Additional Information fields
    shiftSchedule: '',
    experienceRequired: '',
    jobReference: '',
    expiresAt: '',
    tags: new Set<string>(),
  })

  const [screeningQuestions, setScreeningQuestions] = useState<{ id: string; question: string; required: boolean }[]>([])

  const [isEmployer, setIsEmployer] = useState(false)
  const [hasSubscription, setHasSubscription] = useState(false)
  const [isOwnCompany, setIsOwnCompany] = useState(true)
  const [employerProfile, setEmployerProfile] = useState<any>(null)
  const [hideSalary, setHideSalary] = useState(false)
  const [salaryNegotiable, setSalaryNegotiable] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string; companyName: string } | null>(null)
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false)
  const [editJobId, setEditJobId] = useState<string | null>(null)
  const [loadingJobData, setLoadingJobData] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push(employerLoginPath())
        return
      }

      // Entitlement is paying-sub OR in-window founding cohort —
      // see lib/foundingEntitlement.ts. approval_status MUST be fetched
      // alongside the subscription fields so isEmployerEntitled can see
      // it; without it the helper fails closed (was previously a
      // silent-pass back-compat hole — pending freemail users wrongly
      // reached this page).
      const [subRes, profileRes] = await Promise.all([
        supabase
          .from('employer_subscriptions')
          .select('subscription_status, subscription_tier, founding_period_ends_at')
          .eq('user_id', session.user.id)
          .maybeSingle(),
        supabase
          .from('employer_profiles')
          .select('approval_status')
          .eq('user_id', session.user.id)
          .maybeSingle(),
      ])
      const approvalStatus: string | null | undefined = (profileRes.data as { approval_status?: string | null } | null)?.approval_status ?? null
      const subWithApproval = subRes.data ? { ...subRes.data, approval_status: approvalStatus } : null

      // Pending / rejected / waitlisted employers belong on the
      // under-review screen, not on /post-job.
      if (approvalStatus === 'pending' || approvalStatus === 'rejected' || approvalStatus === 'waitlisted') {
        router.push('/account-under-review')
        return
      }

      const userRole = session.user.user_metadata?.role
      const hasActiveSub = isEmployerEntitled(subWithApproval)

      // Accept as employer if: metadata says employer, OR they have an
      // active employer subscription (covers stale session metadata)
      if (userRole !== 'employer' && !hasActiveSub) {
        setIsEmployer(false)
        setCheckingAuth(false)
        return
      }

      setIsEmployer(true)
      setHasSubscription(!!hasActiveSub)

      const companyName = session.user.user_metadata?.company_name || 'Your Company'
      setCurrentUser({
        id: session.user.id,
        companyName
      })

      // Fetch employer profile for auto-fill
      const { data: empProfile } = await supabase
        .from('employer_profiles')
        .select('company_name, logo_url, description, website, business_address, location')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (empProfile) {
        setEmployerProfile(empProfile)
        // Auto-fill company fields if not in edit mode (location left blank — varies per job)
        if (!searchParams.get('edit')) {
          setFormData(prev => ({
            ...prev,
            company: empProfile.company_name || prev.company,
            companyLogo: empProfile.logo_url || prev.companyLogo,
            companyWebsite: empProfile.website || prev.companyWebsite,
          }))
        }
      }

      setCheckingAuth(false)
    }
    checkAuth()
  }, [router, jobs])

  // Check for edit mode and load job data
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (editId && jobs.length > 0) {
      setIsEditMode(true)
      setEditJobId(editId)
      setLoadingJobData(true)
      const jobToEdit = getJobById(editId)
      if (jobToEdit) {
        // Determine employment type from array
        // Empty, not 'Full-time'. Editing a row whose array is missing would
        // otherwise re-assert Full-time on save — the same default this change
        // removes, arriving through the back door.
        const employmentType = Array.isArray(jobToEdit.employmentType) && jobToEdit.employmentType.length > 0
          ? jobToEdit.employmentType[0]
          : ''

        // Build tags set from tags array
        const tags = new Set<string>(jobToEdit.tags || [])
        if (jobToEdit.noExperience && !tags.has('No experience required')) tags.add('No experience required')
        if (jobToEdit.urgent && !tags.has('Interviews this week') && !tags.has('Urgent hire')) tags.add('Urgent hire')

        // Build single description from all available fields
        let combinedDescription = jobToEdit.fullDescription || jobToEdit.description || ''
        const oldResponsibilities = Array.isArray(jobToEdit.responsibilities) && jobToEdit.responsibilities.length > 0
          ? jobToEdit.responsibilities : []
        const oldRequirements = Array.isArray(jobToEdit.requirements) && jobToEdit.requirements.length > 0
          ? jobToEdit.requirements : []
        const oldSkills = Array.isArray(jobToEdit.skillsRequired) && jobToEdit.skillsRequired.length > 0
          ? jobToEdit.skillsRequired : []
        const oldBenefits = Array.isArray(jobToEdit.benefits) && jobToEdit.benefits.length > 0
          ? jobToEdit.benefits : []
        if (oldResponsibilities.length > 0) {
          combinedDescription += '\n\nResponsibilities:\n' + oldResponsibilities.join('\n')
        }
        if (oldRequirements.length > 0) {
          combinedDescription += '\n\nRequirements:\n' + oldRequirements.join('\n')
        }
        if (oldSkills.length > 0) {
          combinedDescription += '\n\nSkills Required:\n' + oldSkills.join('\n')
        }
        if (oldBenefits.length > 0) {
          combinedDescription += '\n\nBenefits:\n' + oldBenefits.join('\n')
        }

        // Determine contract type from employmentType array
        const contractTypes = ['Permanent', 'Temporary', 'Fixed-term']
        const foundContract = (jobToEdit.employmentType || []).find((t: string) => contractTypes.includes(t))

        setFormData({
          company: jobToEdit.company || '',
          companyWebsite: jobToEdit.companyWebsite || '',
          companyLogo: jobToEdit.companyLogo || '',
          companyBanner: jobToEdit.companyBanner || '',
          title: jobToEdit.title || '',
          category: jobToEdit.category || '',
          employmentType: employmentType as 'Full-time' | 'Part-time' | 'Flexible',
          // Same reasoning as employmentType above: no contract word in the
          // row means the employer must pick one, not inherit 'Permanent'.
          contractType: (foundContract || '') as '' | 'Permanent' | 'Temporary' | 'Fixed-term',
          workLocationType: (jobToEdit.workLocationType || 'In person') as 'In person' | 'Remote' | 'Hybrid',
          salaryMin: jobToEdit.salaryMin?.toString() || '',
          salaryMax: jobToEdit.salaryMax?.toString() || '',
          salaryPeriod: jobToEdit.salaryPeriod || 'hour',
          location: jobToEdit.location || '',
          area: jobToEdit.area || '',
          venue: jobToEdit.venue || '',
          postcode: jobToEdit.fullLocation?.postcode || '',
          city: jobToEdit.fullLocation?.city || '',
          description: combinedDescription,
          shiftSchedule: jobToEdit.shiftSchedule || '',
          experienceRequired: jobToEdit.experienceRequired || '',
          jobReference: jobToEdit.jobReference || '',
          expiresAt: jobToEdit.expiresDate || '',
          tags,
        })

        // Load screening questions
        if (jobToEdit.screeningQuestions && jobToEdit.screeningQuestions.length > 0) {
          setScreeningQuestions(jobToEdit.screeningQuestions)
        }

        // Set logo success if there's a logo
        if (jobToEdit.companyLogo && !jobToEdit.companyLogo.includes('unsplash.com')) {
          setLogoSuccess(true)
        }
      } else {
        console.error('[PostJob] Job not found for editing:', editId)
        setError('Job not found. It may have been deleted.')
      }

      setLoadingJobData(false)
      // Go straight to editor view when loading an existing job description
      setDescView('editor')
    }
  }, [searchParams, jobs, getJobById])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handlePostcodeFound = (address: AddressData) => {
    setFormData(prev => ({
      ...prev,
      area: `${address.city} ${address.postcode}`.trim(),
      postcode: address.postcode,
      city: address.city,
      location: prev.location || address.city,
    }))
  }

  const handleTagChange = (tagLabel: string) => {
    setFormData(prev => {
      const newTags = new Set(prev.tags)
      if (newTags.has(tagLabel)) {
        newTags.delete(tagLabel)
      } else {
        newTags.add(tagLabel)
      }
      return { ...prev, tags: newTags }
    })
  }

  const tagsByCategory = getTagsByCategory()

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLogoUploading(true)
    setLogoUploadError('')
    setLogoError('')
    setLogoSuccess(false)

    try {
      // Resize to 200x200 square on client before storing
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const img = new window.Image()
          img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = 200
            canvas.height = 200
            const ctx = canvas.getContext('2d')!
            // Draw white background for transparent PNGs
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, 200, 200)
            // Fit image inside 200x200 (contain)
            const scale = Math.min(200 / img.width, 200 / img.height)
            const w = img.width * scale
            const h = img.height * scale
            ctx.drawImage(img, (200 - w) / 2, (200 - h) / 2, w, h)
            resolve(canvas.toDataURL('image/png'))
          }
          img.onerror = reject
          img.src = reader.result as string
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      setFormData(prev => ({ ...prev, companyLogo: dataUrl }))
      setLogoFileName(file.name)
      setLogoSuccess(true)
    } catch {
      setLogoUploadError('Failed to process logo image.')
    } finally {
      setLogoUploading(false)
      e.target.value = ''
    }
  }

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setBannerUploading(true)
    setBannerUploadError('')

    try {
      const uploadFormData = new FormData()
      uploadFormData.append('image', file)

      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: uploadFormData,
      })

      const result = await response.json()

      if (!response.ok) {
        setBannerUploadError(result.error || 'Upload failed')
        return
      }

      setFormData(prev => ({ ...prev, companyBanner: result.url || result.dataUrl }))
      setBannerFileName(file.name)
    } catch {
      setBannerUploadError('Failed to upload image. Please try again.')
    } finally {
      setBannerUploading(false)
      e.target.value = ''
    }
  }

  // Strip HTML tags and decode basic entities to plain text for the AI
  const htmlToPlainText = (html: string) =>
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

  // Robust empty check for Tiptap HTML (handles <p></p>, <p><br></p>, whitespace-only)
  const descriptionHasContent = (html: string) =>
    html ? htmlToPlainText(html).length > 0 : false

  /**
   * One sentence in, three drafted fields out.
   *
   * Calls the EXISTING 'job-ad' branch of /api/ai-assist — the generate mode
   * has been there since March and simply lost its caller when the old
   * assistant panel was replaced by the inline enhance button.
   *
   * THE TITLE SHE TYPED IS NEVER TOUCHED. It goes IN as context so the copy
   * knows what the role is, and the prompt is explicitly forbidden from
   * returning one. Overwriting a decision she already made, on the screen where
   * she is trusting us with the words, is the kind of small betrayal that stops
   * someone using a feature twice.
   *
   * The result lands as ordinary editable text in the three textareas — never
   * read-only, never a preview she has to accept.
   */
  const handleDraftAdvert = async () => {
    const sentence = aiSentence.trim()
    if (!sentence || drafting) return
    setDrafting(true)
    setDraftError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          type: 'job-ad',
          data: {
            sentence,
            title: formData.title,
            company: formData.company,
            location: formData.location,
            salaryMin: hideSalary ? '' : formData.salaryMin,
            salaryMax: hideSalary ? '' : formData.salaryMax,
            salaryPeriod: formData.salaryPeriod,
            employmentType: formData.employmentType,
            contractType: formData.contractType,
            category: formData.category,
            companyDescription: employerProfile?.description || '',
          },
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not draft the advert')

      const ad = json.jobAd || {}
      // Defensive: if the model ever returns a title despite the prompt, it is
      // dropped here as well. Two locks on the same door, because this is the
      // one field we promised not to touch.
      const next = {
        dayToDay: typeof ad.dayToDay === 'string' ? ad.dayToDay.trim() : '',
        experienceNeeded: typeof ad.experienceNeeded === 'string' ? ad.experienceNeeded.trim() : '',
        whatWeOffer: typeof ad.whatWeOffer === 'string' ? ad.whatWeOffer.trim() : '',
      }
      if (!next.dayToDay && !next.experienceNeeded && !next.whatWeOffer) {
        throw new Error('The draft came back empty — try describing the role in a bit more detail.')
      }

      setGuidedFields(prev => ({ ...prev, ...next }))
      setDrafted(true)
      setAiPanelOpen(false)
    } catch (err: unknown) {
      setDraftError(err instanceof Error ? err.message : 'Could not draft the advert')
    } finally {
      setDrafting(false)
    }
  }

  const handleEnhanceDescription = async () => {
    setEnhancing(true)
    setEnhanceError('')
    setShowUndo(false)

    // Build the description text to send — from guided fields or existing editor content
    const descriptionText = descView === 'guided'
      ? [
          formData.title ? `What is the job: ${formData.title}` : '',
          guidedFields.dayToDay ? `Day to day: ${guidedFields.dayToDay}` : '',
          guidedFields.experienceNeeded ? `Experience needed: ${guidedFields.experienceNeeded}` : '',
          guidedFields.whatWeOffer ? `What we offer: ${guidedFields.whatWeOffer}` : '',
        ].filter(Boolean).join('\n')
      : htmlToPlainText(formData.description)

    // Store undo snapshot
    const snap: UndoState = descView === 'guided'
      ? { source: 'guided', fields: { ...guidedFields } }
      : { source: 'editor', description: formData.description }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          type: 'job-ad-enhance',
          data: {
            title: formData.title,
            category: formData.category,
            location: formData.location,
            salaryMin: formData.salaryMin,
            salaryMax: formData.salaryMax,
            salaryPeriod: formData.salaryPeriod,
            employmentType: formData.employmentType,
            workLocationType: formData.workLocationType,
            description: descriptionText,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setEnhanceError(json.error || 'Enhancement failed. Please try again.')
        return
      }
      const enhanced = json.jobAd?.description
      if (enhanced) {
        const htmlOut = /^<(p|ul|ol|h[1-6]|div)/i.test(enhanced.trimStart())
          ? enhanced
          : `<p>${enhanced}</p>`
        setFormData(prev => ({ ...prev, description: htmlOut }))
        setUndoState(snap)
        setDescView('editor')
        setShowUndo(true)
        setTimeout(() => setShowUndo(false), 30000)
      }
    } catch {
      setEnhanceError('Failed to connect to AI service.')
    } finally {
      setEnhancing(false)
    }
  }

  const handleUndo = () => {
    if (!undoState) return
    if (undoState.source === 'guided') {
      setGuidedFields(undoState.fields)
      setFormData(prev => ({ ...prev, description: '' }))
      setDescView('guided')
    } else {
      setFormData(prev => ({ ...prev, description: undoState.description }))
      setDescView('editor')
    }
    setUndoState(null)
    setShowUndo(false)
  }

  const guidedHasContent = Object.values(guidedFields).some(v => v.trim().length > 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Validation
    if (!formData.company || !formData.title || !formData.category || !formData.location) {
      setError('Please fill in all required fields')
      setLoading(false)
      return
    }

    // BOTH ARE A CHOICE NOW, NOT A DEFAULT. Named separately from the generic
    // message above so the employer is told WHICH answer is missing — these are
    // two chips that previously looked answered, so "required fields" alone
    // would send someone hunting.
    if (!formData.employmentType || !formData.contractType) {
      setError(
        !formData.employmentType && !formData.contractType
          ? 'Please choose the employment type and the contract type'
          : !formData.employmentType
            ? 'Please choose an employment type — full-time, part-time or flexible'
            : 'Please choose a contract type — permanent, temporary or fixed-term',
      )
      setLoading(false)
      return
    }

    if (!hideSalary) {
      // A SINGLE FIGURE IS A VALID ANSWER, and until now it wasn't allowed.
      // This required BOTH boxes, so an employer paying a flat £32,000 had no
      // way to say so — the only way past the validation was to type the same
      // number twice. 210 of the 247 live rows have salary_min equal to
      // salary_max, which is what that looks like at scale. The renderers all
      // already collapse min == max to one figure; the form was the thing
      // manufacturing the ranges.
      if (!formData.salaryMin) {
        setError('Please enter a salary, or tick "Competitive salary" to hide it')
        setLoading(false)
        return
      }
      if (formData.salaryMax && parseInt(formData.salaryMin) > parseInt(formData.salaryMax)) {
        setError('Minimum salary cannot be higher than maximum salary')
        setLoading(false)
        return
      }
    }

    if (descView === 'guided' && !guidedHasContent) {
      setError('Please add a job description before posting')
      setLoading(false)
      return
    }

    if (descView === 'editor' && !descriptionHasContent(formData.description)) {
      setError('Please add a job description before posting')
      setLoading(false)
      return
    }

    try {
      // Build tags array from Set
      const tags: string[] = Array.from(formData.tags)

      // Logo: use provided or empty (CompanyLogo component handles fallback)
      const companyLogo = formData.companyLogo || ''
      // Banner: use provided or empty (detail panel hides if empty)
      const companyBanner = formData.companyBanner || ''

      // Auto-generate short description from first 150 characters (strip HTML tags)
      const plainText = formData.description.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\n+/g, ' ').trim()
      const shortDescription = plainText.slice(0, 150) + (plainText.length > 150 ? '...' : '')

      // Build employment type array: e.g. ["Full-time", "Permanent"]
      // Filtered rather than assumed: validation above guarantees both are set,
      // but this array is what lands in the row and drives the card, the filters
      // and matching. An empty string reaching it would be a silent bad value in
      // the one field this whole change exists to keep honest.
      const employmentType: string[] = [formData.employmentType, formData.contractType]
        .filter(v => Boolean(v))

      const jobReference = formData.jobReference || `JOB-${Date.now().toString(36).toUpperCase()}`
      const employerId = currentUser?.id || 'unknown'

      const jobPayload = {
        company: formData.company,
        companyLogo,
        companyWebsite: formData.companyWebsite || '',
        employerId,
        companyBanner,
        title: formData.title,
        jobReference,
        salaryMin: hideSalary ? 0 : parseInt(formData.salaryMin || '0'),
        salaryMax: hideSalary ? 0 : parseInt(formData.salaryMax || '0'),
        salaryPeriod: formData.salaryPeriod,
        employmentType: employmentType as WorkType[],
        location: formData.location,
        area: formData.area || 'London',
        venue: formData.venue.trim() || undefined,
        fullLocation: {
          addressLine1: formData.location,
          city: formData.city || formData.area?.split(' ')[0] || 'London',
          postcode: formData.postcode || '',
        },
        description: shortDescription,
        fullDescription: formData.description || '',
        tags: [...tags, ...(salaryNegotiable ? ['Salary negotiable'] : []), ...(hideSalary ? ['Competitive salary'] : [])],
        urgent: formData.tags.has('Urgent hire') || formData.tags.has('Immediate start') || formData.tags.has('Interviews this week'),
        noExperience: formData.tags.has('No experience required'),
        category: formData.category,
        shiftSchedule: formData.shiftSchedule || '',
        experienceRequired: formData.experienceRequired || '',
        requirements: [],
        benefits: [],
        responsibilities: [],
        skillsRequired: [],
        workAuthorization: ['UK work authorization required'],
        workLocationType: formData.workLocationType,
        postedDate: new Date().toISOString().split('T')[0],
        expiresDate: formData.expiresAt || undefined,
        viewCount: 0,
        applicationCount: 0,
        status: 'active' as const,
        screeningQuestions: screeningQuestions.filter(q => q.question.trim()),
        isRecruiterPosting: !isOwnCompany,
      }

      let newJob: any = null
      if (isEditMode && editJobId) {
        await updateJob(editJobId, jobPayload)
      } else {
        newJob = await addJob(jobPayload, employerId)

        // Mark employer as recruiter if posting for another company
        if (!isOwnCompany) {
          supabase.from('employer_profiles')
            .update({ is_recruiter: true })
            .eq('user_id', employerId)
            .then()
        }
      }

      // Trigger job alert matching for new jobs (non-blocking).
      // The endpoint requires a Bearer token — either CRON_SECRET or a
      // user session — so without one we silently 401 and alerts never
      // fire. Resolve the session here and pass its access token.
      if (!isEditMode && newJob?.id) {
        ;(async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token
            if (!token) return
            await fetch('/api/job-alerts/match', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ jobId: newJob.id }),
            })
            // Resolve the new job's location to a canonical area (region +
            // county) for preferred-areas matching (non-blocking; a null area is
            // fine and never hides the job).
            await fetch('/api/jobs/resolve-area', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ jobId: newJob.id }),
            })
          } catch (err) {
            console.error('[PostJob] Alert matching / area resolve failed (non-blocking):', err)
          }
        })()
      }

      setSuccess(true)

      // Redirect after short delay
      setTimeout(() => {
        router.push('/my-jobs')
      }, 1500)

    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <p>Loading...</p>
        </div>
      </main>
    )
  }

  if (!isEmployer) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <div className={styles.formCard} style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔒</div>
            <h2 style={{ marginBottom: '1rem' }}>Employer Account Required</h2>
            <p style={{ color: '#666', marginBottom: '2rem' }}>
              You need an employer account to post jobs on Thrive.
            </p>
            <a href="/register/employer-free" className="btn btn-primary">
              Sign up for free
            </a>
          </div>
        </div>
      </main>
    )
  }

  if (!hasSubscription) {
    // ?from=post-job triggers a contextual banner on /dashboard/subscription
    // explaining why the user landed there (audit U5).
    router.push('/dashboard/subscription?from=post-job')
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <p>Redirecting...</p>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />

      <div className={styles.hero}>
        <button className={styles.backBtn} onClick={() => router.push('/employer/dashboard')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Back to Dashboard
        </button>
        <h1 className={styles.heroTitle}>{isEditMode ? 'Edit Job' : 'Post a Job'}</h1>
        <p className={styles.heroSubtitle}>
          {isEditMode
            ? 'Update your job listing details'
            : 'Reach thousands of professionals across the UK'}
        </p>
      </div>

      {/* Form */}
      <div className={styles.container}>
        <form className={styles.formCard} onSubmit={handleSubmit}>
          {error && <div className={styles.error}>{error}</div>}
          {success && (
            <div className={styles.success}>
              <span>✓</span> {isEditMode ? 'Job updated successfully! Redirecting...' : 'Job posted successfully! Redirecting to jobs page...'}
            </div>
          )}
          {loadingJobData && (
            <div className={styles.loading}>
              Loading job data...
            </div>
          )}

          {/* Company Information */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>🏢</span>
                Company Information
              </h2>
            </div>

            {!isEditMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500, flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={isOwnCompany}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setIsOwnCompany(checked)
                      if (checked && employerProfile) {
                        // Auto-fill from profile (location left blank — varies per job)
                        setFormData(prev => ({
                          ...prev,
                          company: employerProfile.company_name || '',
                          companyLogo: employerProfile.logo_url || '',
                          companyWebsite: employerProfile.website || '',
                        }))
                      } else {
                        // Clear for third-party posting
                        setFormData(prev => ({
                          ...prev,
                          company: '', companyLogo: '', companyWebsite: '',
                          location: '', city: '', postcode: '',
                        }))
                      }
                    }}
                    style={{ accentColor: '#16a34a', width: 18, height: 18 }}
                  />
                  Posting for my own company
                </label>
                {!isOwnCompany && (
                  <span style={{ fontSize: '0.7rem', color: '#d97706', background: '#fffbeb', padding: '0.15rem 0.5rem', borderRadius: 99, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    Recruiter posting
                  </span>
                )}
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="company">
                {isOwnCompany ? 'Company Name' : 'Client Company Name'} <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="company"
                name="company"
                value={formData.company}
                onChange={handleChange}
                placeholder="e.g., The Ivy Collection"
                className={styles.input}
                autoComplete="organization"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="companyWebsite">Company Website</label>
              <input
                type="text"
                id="companyWebsite"
                name="companyWebsite"
                value={formData.companyWebsite}
                onChange={handleChange}
                placeholder="e.g., marriott.com or https://marriott.com"
                className={styles.input}
                autoComplete="url"
              />
              <p className={styles.helperText}>
                Your company website will be shown as a clickable link on the job listing.
              </p>
            </div>

            {/* Logo Upload */}
            <div className={styles.formGroup}>
              <label className={styles.label}>
                Upload Company Logo
                {logoSuccess && <span className={styles.autoFilledBadge}>Auto-filled</span>}
              </label>
              <p className={styles.helperText} style={{ marginBottom: '0.5rem' }}>
                Upload your company logo (PNG or JPG, recommended 200x200px, square format). This will appear on job listings.
              </p>
              <div className={styles.uploadArea}>
                <input
                  type="file"
                  id="logoUpload"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleLogoUpload}
                  disabled={logoUploading}
                  className={styles.fileInput}
                />
                <label htmlFor="logoUpload" className={styles.uploadLabel}>
                  {logoUploading ? (
                    <span>Processing logo...</span>
                  ) : formData.companyLogo ? (
                    <>
                      <span className={styles.uploadIcon}>🔄</span>
                      <span>Replace logo image</span>
                      <span className={styles.uploadHint}>A logo is already set — choose a new image to replace it</span>
                    </>
                  ) : (
                    <>
                      <span className={styles.uploadIcon}>📁</span>
                      <span>Choose a logo image</span>
                      <span className={styles.uploadHint}>PNG or JPG — resized to 200x200px square</span>
                    </>
                  )}
                </label>
              </div>
              {logoFileName && !logoUploadError && (
                <p className={styles.logoSuccess}>Uploaded: {logoFileName}</p>
              )}
              {logoUploadError && (
                <p className={styles.uploadError}>{logoUploadError}</p>
              )}
            </div>

            <div className={styles.logoDivider}>
              <span>or</span>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="companyLogo">
                Company Logo URL
              </label>
              <input
                type="url"
                id="companyLogo"
                name="companyLogo"
                value={formData.companyLogo}
                onChange={handleChange}
                placeholder="https://example.com/logo.png"
                className={styles.input}
                autoComplete="off"
              />
              <p className={styles.helperText}>
                Leave blank to use a letter placeholder on job cards.
              </p>
            </div>

            {/* Square Logo Preview */}
            {formData.companyLogo && (
              <div className={styles.logoPreviewContainer}>
                <div className={styles.logoPreview} style={{ width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', background: '#f3f4f6', border: '1px solid #e5e7eb' }}>
                  <img
                    src={formData.companyLogo}
                    alt="Company logo preview"
                    className={styles.logoPreviewImage}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                      setLogoError('Preview unavailable. A letter placeholder will be used instead.')
                    }}
                    onLoad={(e) => {
                      (e.target as HTMLImageElement).style.display = 'block'
                    }}
                  />
                </div>
                <div className={styles.logoPreviewActions}>
                  <button
                    type="button"
                    onClick={() => { setFormData(prev => ({ ...prev, companyLogo: '' })); setLogoSuccess(false); setLogoFileName('') }}
                    className={styles.clearLogoBtn}
                  >
                    ✕ Remove Logo
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Job Banner Image */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>🖼️</span>
              Job Banner Image
            </h2>
            <p className={styles.helperText} style={{ marginBottom: '0.75rem' }}>
              Landscape cover photo shown on your job card and detail page. Optional — if you skip it, we show a branded Thrive cover instead.
            </p>

            {/* Photo-quality tips — candidates notice the image first, so meet
                employers with guidance right where they choose the photo. */}
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '0.75rem 0.9rem', marginBottom: '0.9rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#92400e', marginBottom: '0.4rem' }}>
                📸 A great photo gets more applicants
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                {PHOTO_TIPS.map((tip, i) => (
                  <li key={i} style={{ fontSize: '0.8rem', lineHeight: 1.45, color: '#78350f' }}>{tip}</li>
                ))}
              </ul>
            </div>

            <div className={styles.formGroup}>
              <div className={styles.uploadArea}>
                <input
                  type="file"
                  id="bannerUpload"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleBannerUpload}
                  disabled={bannerUploading}
                  className={styles.fileInput}
                />
                <label htmlFor="bannerUpload" className={styles.uploadLabel}>
                  {bannerUploading ? (
                    <span>Processing image...</span>
                  ) : (
                    <>
                      <span className={styles.uploadIcon}>📁</span>
                      <span>Choose a banner image</span>
                      <span className={styles.uploadHint}>JPEG, PNG, WebP or GIF — landscape, ideally 1200×825px. We crop to fit.</span>
                    </>
                  )}
                </label>
              </div>
              {bannerFileName && !bannerUploadError && (
                <p className={styles.logoSuccess}>Uploaded: {bannerFileName}</p>
              )}
              {bannerUploadError && (
                <p className={styles.uploadError}>{bannerUploadError}</p>
              )}
            </div>

            {formData.companyBanner && (
              <div className={styles.logoPreviewContainer}>
                <div className={styles.logoPreview} style={{ width: '100%', maxWidth: '400px', aspectRatio: '16 / 11' }}>
                  <img
                    src={formData.companyBanner}
                    alt="Banner preview"
                    className={styles.logoPreviewImage}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <div className={styles.logoPreviewActions}>
                  <button
                    type="button"
                    onClick={() => { setFormData(prev => ({ ...prev, companyBanner: '' })); setBannerFileName('') }}
                    className={styles.clearLogoBtn}
                  >
                    ✕ Remove Banner
                  </button>
                </div>
              </div>
            )}
            {!formData.companyBanner && (
              <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: '0.5rem 0 0', lineHeight: 1.5 }}>
                💡 A cover photo and a few lines of description make your job stand out — candidates see them first. Both are optional (we&apos;ll use a tasteful default image if you skip the photo), but they really help.
              </p>
            )}
          </div>

          {/* Job Details */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>💼</span>
              Job Details
            </h2>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="title">
                Job Title <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="e.g., Waiter / Waitress, Kitchen Porter, Head Chef"
                className={styles.input}
                autoComplete="off"
                required
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="category">
                  Category <span className={styles.required}>*</span>
                </label>
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className={styles.select}
                  required
                >
                  <option value="">Select a category</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="location">
                  Location <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  id="location"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="e.g. London, Manchester, Edinburgh"
                  className={styles.input}
                  autoComplete="off"
                  required
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Area / Postcode</label>
              <PostcodeLookup
                onAddressFound={handlePostcodeFound}
                initialPostcode={formData.postcode}
              />
              {/* SAYS WHAT THE FIELD BUYS HER, because it isn't required and
                  without this it reads as equally fine to skip.
                  The area filter is the ONE hard filter in candidate matching —
                  the only thing that can empty a candidate's list — and it runs
                  on a resolved area. There is an escape hatch that never hides
                  an unplaceable job, but all 247 live rows currently resolve, so
                  a postcodeless ad would be the first row ever to depend on it. */}
              {!formData.area && (
                <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.375rem' }}>
                  Optional, but it&apos;s what lets us show this role to chefs who can
                  actually get there — we match on travel, not just the town name.
                </p>
              )}
              {formData.area && (
                <p style={{ fontSize: '0.85rem', color: '#22c55e', marginTop: '0.375rem', fontWeight: 500 }}>
                  Area set to: {formData.area}
                </p>
              )}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="venue">Venue (optional)</label>
              <input
                type="text"
                id="venue"
                name="venue"
                value={formData.venue}
                onChange={handleChange}
                placeholder="e.g. Shoreditch House, LSEG, Ham Yard Hotel"
                className={styles.input}
                autoComplete="off"
                maxLength={80}
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="employmentType">Employment Type <span className={styles.required}>*</span></label>
                <select
                  id="employmentType"
                  name="employmentType"
                  value={formData.employmentType}
                  onChange={handleChange}
                  className={styles.select}
                >
                  <option value="">Select employment type</option>
                  <option value="Full-time">Full-time</option>
                  <option value="Part-time">Part-time</option>
                  <option value="Flexible">Flexible</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="contractType">Contract Type <span className={styles.required}>*</span></label>
                <select
                  id="contractType"
                  name="contractType"
                  value={formData.contractType}
                  onChange={handleChange}
                  className={styles.select}
                >
                  <option value="">Select contract type</option>
                  <option value="Permanent">Permanent</option>
                  <option value="Temporary">Temporary</option>
                  <option value="Fixed-term">Fixed-term</option>
                </select>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="workLocationType">Work Location</label>
              <select
                id="workLocationType"
                name="workLocationType"
                value={formData.workLocationType}
                onChange={handleChange}
                className={styles.select}
              >
                <option value="">Select work location</option>
                <option value="In person">In person</option>
                <option value="Remote">Remote</option>
                <option value="Hybrid">Hybrid</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="salaryMin">
                Salary Range {!hideSalary && <span className={styles.required}>*</span>}
              </label>

              <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.85rem', cursor: 'pointer', color: '#334155' }}>
                  <input type="checkbox" checked={hideSalary} onChange={e => { setHideSalary(e.target.checked); if (e.target.checked) setSalaryNegotiable(false) }} style={{ accentColor: '#0f172a' }} />
                  Competitive salary (don&apos;t show)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.85rem', cursor: 'pointer', color: '#334155' }}>
                  <input type="checkbox" checked={salaryNegotiable} onChange={e => setSalaryNegotiable(e.target.checked)} disabled={hideSalary} style={{ accentColor: '#0f172a' }} />
                  Salary negotiable
                </label>
              </div>

              {!hideSalary && (
              <div className={styles.salaryGroup}>
                <div className={styles.salaryInputs}>
                  <input
                    type="number"
                    id="salaryMin"
                    name="salaryMin"
                    value={formData.salaryMin}
                    onChange={handleChange}
                    placeholder="e.g. 12"
                    className={styles.salaryInput}
                    autoComplete="off"
                  />
                  <span className={styles.salaryDivider}>to</span>
                  <input
                    type="number"
                    id="salaryMax"
                    name="salaryMax"
                    value={formData.salaryMax}
                    onChange={handleChange}
                    placeholder="optional"
                    className={styles.salaryInput}
                    autoComplete="off"
                  />
                </div>
                <select
                  id="salaryPeriod"
                  name="salaryPeriod"
                  value={formData.salaryPeriod}
                  onChange={handleChange}
                  className={`${styles.select} ${styles.salaryPeriodSelect}`}
                >
                  <option value="hour">Per hour (£)</option>
                  <option value="year">Per year (£)</option>
                </select>
              </div>
              )}

              {/* Says what the now-optional second box does, at the moment the
                  decision is made. Without this the empty box reads as an
                  unfinished field rather than a deliberate single figure. */}
              {!hideSalary && (
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.4rem 0 0' }}>
                  Leave the second box empty for a single figure — the ad will read{' '}
                  <strong style={{ color: '#334155' }}>
                    {/* Grouped, because this line exists to demonstrate what the
                        ad will read — "£32000/yr" undercuts its own point. */}
                    £{formData.salaryMin
                      ? Number(formData.salaryMin).toLocaleString('en-GB')
                      : '32,000'}{formData.salaryPeriod === 'year' ? '/yr' : '/hr'}
                  </strong>
                  , not a range.
                </p>
              )}

              {hideSalary && (
                <p style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', margin: '0.25rem 0 0' }}>
                  Salary will show as &quot;Competitive&quot; on the job listing.
                </p>
              )}
            </div>
          </div>

          {/* Description */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>📄</span>
              Job Description
            </h2>

            {descView === 'guided' ? (
              <div>
                {/* THE AI GOES FIRST. It used to sit BELOW these three boxes,
                    disabled until they had content — an enhancer of work
                    already done, which is after the work it was meant to save.
                    This is the primary path: one sentence in, three drafted
                    fields out, with writing it yourself as the alternative
                    beside it rather than the default.
                    "Enhance with AI" below is kept deliberately — different
                    job, for tidying a draft rather than starting one. */}
                {aiPanelOpen ? (
                  <div className={styles.aiPanel}>
                    <div className={styles.aiPanelHead}>
                      <span className={styles.aiPanelBadge}>FASTEST</span>
                      <h3 className={styles.aiPanelTitle}>
                        Tell us about it in a sentence and we&apos;ll draft the ad
                      </h3>
                    </div>
                    <input
                      type="text"
                      className={styles.aiPanelInput}
                      value={aiSentence}
                      onChange={e => setAiSentence(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleDraftAdvert() } }}
                      placeholder="e.g. Sous chef for a 60-cover country pub, four days, no late finishes, £32k"
                      disabled={drafting}
                    />
                    <div className={styles.aiPanelActions}>
                      <button
                        type="button"
                        className={styles.aiPanelPrimary}
                        onClick={handleDraftAdvert}
                        disabled={!aiSentence.trim() || drafting}
                        style={!aiSentence.trim() || drafting ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
                      >
                        {drafting ? 'Drafting…' : 'Draft my advert'}
                      </button>
                      <button
                        type="button"
                        className={styles.aiPanelQuiet}
                        onClick={() => setAiPanelOpen(false)}
                        disabled={drafting}
                      >
                        I&apos;ll write it myself
                      </button>
                    </div>
                    {draftError && <p className={styles.aiPanelError}>{draftError}</p>}
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.aiPanelReopen}
                    onClick={() => setAiPanelOpen(true)}
                  >
                    ✨ Draft it for me instead
                  </button>
                )}

                {drafted && (
                  <p className={styles.aiDraftedLabel}>DRAFTED — EDIT ANYTHING</p>
                )}

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="desc_dayToDay">
                    What will they be doing day to day?
                  </label>
                  <textarea
                    id="desc_dayToDay"
                    className={`${styles.textarea} ${drafting ? styles.aiSkeleton : ''}`}
                    disabled={drafting}
                    rows={3}
                    placeholder="e.g. Leading the kitchen team, managing suppliers, creating seasonal menus..."
                    value={guidedFields.dayToDay}
                    onChange={e => setGuidedFields(prev => ({ ...prev, dayToDay: e.target.value }))}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="desc_experienceNeeded">
                    Experience or skills needed?
                  </label>
                  <textarea
                    id="desc_experienceNeeded"
                    className={`${styles.textarea} ${drafting ? styles.aiSkeleton : ''}`}
                    disabled={drafting}
                    rows={3}
                    placeholder="e.g. 3+ years in a similar role, strong leadership skills, food hygiene certificate..."
                    value={guidedFields.experienceNeeded}
                    onChange={e => setGuidedFields(prev => ({ ...prev, experienceNeeded: e.target.value }))}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="desc_whatWeOffer">
                    What do you offer?
                  </label>
                  <textarea
                    id="desc_whatWeOffer"
                    className={`${styles.textarea} ${drafting ? styles.aiSkeleton : ''}`}
                    disabled={drafting}
                    rows={3}
                    placeholder="e.g. £35,000 salary, 28 days holiday, staff meals, flexible hours, great team..."
                    value={guidedFields.whatWeOffer}
                    onChange={e => setGuidedFields(prev => ({ ...prev, whatWeOffer: e.target.value }))}
                  />
                </div>

                <div className={styles.enhanceRow}>
                  <button
                    type="button"
                    className={styles.enhanceBtn}
                    onClick={handleEnhanceDescription}
                    disabled={!guidedHasContent || enhancing}
                    style={!guidedHasContent ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                  >
                    {enhancing ? (
                      <><span className={styles.enhanceSpinner} />Enhancing...</>
                    ) : (
                      <>✨ Enhance with AI</>
                    )}
                  </button>
                </div>

                {enhanceError && <p className={styles.enhanceError}>{enhanceError}</p>}

                <button
                  type="button"
                  className={styles.manualEditLink}
                  onClick={() => setDescView('editor')}
                >
                  Edit manually instead
                </button>
              </div>
            ) : (
              <div className={styles.formGroup}>
                <div className={styles.editorViewHeader}>
                  <label className={styles.label}>
                    Job Description <span className={styles.required}>*</span>
                  </label>
                  <div className={styles.editorViewActions}>
                    {showUndo && (
                      <button type="button" className={styles.undoBtn} onClick={handleUndo}>
                        Undo
                      </button>
                    )}
                    {!isEditMode && (
                      <button
                        type="button"
                        className={styles.manualEditLink}
                        onClick={() => { setDescView('guided'); setFormData(prev => ({ ...prev, description: '' })) }}
                      >
                        Back to guided view
                      </button>
                    )}
                  </div>
                </div>
                <RichTextEditor
                  value={formData.description}
                  onChange={(html) => setFormData(prev => ({ ...prev, description: html }))}
                  placeholder="Describe the role, day-to-day responsibilities, the team, and what success looks like in this position..."
                />
                <div className={styles.enhanceRow}>
                  <button
                    type="button"
                    className={styles.enhanceBtn}
                    onClick={handleEnhanceDescription}
                    disabled={!descriptionHasContent(formData.description) || enhancing}
                    style={!descriptionHasContent(formData.description) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                  >
                    {enhancing ? (
                      <><span className={styles.enhanceSpinner} />Enhancing...</>
                    ) : (
                      <>✨ Enhance with AI</>
                    )}
                  </button>
                </div>
                {enhanceError && <p className={styles.enhanceError}>{enhanceError}</p>}
                <p className={styles.helperText}>
                  A short summary will be auto-generated for job cards from the first 150 characters
                </p>
              </div>
            )}
          </div>

          {/* Requirements & Details */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>ℹ️</span>
              Requirements & Details
            </h2>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="experienceRequired">Experience Required</label>
                <select
                  id="experienceRequired"
                  name="experienceRequired"
                  value={formData.experienceRequired}
                  onChange={handleChange}
                  className={styles.select}
                >
                  <option value="">Select experience level</option>
                  <option value="No experience needed">No experience needed</option>
                  <option value="Entry level (0-1 years)">Entry level (0-1 years)</option>
                  <option value="1-2 years">1-2 years</option>
                  <option value="2-3 years">2-3 years</option>
                  <option value="3-5 years">3-5 years</option>
                  <option value="5+ years">5+ years</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="shiftSchedule">Shift & Schedule</label>
                <input
                  type="text"
                  id="shiftSchedule"
                  name="shiftSchedule"
                  value={formData.shiftSchedule}
                  onChange={handleChange}
                  placeholder="e.g., Rotating shifts including weekends"
                  className={styles.input}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="jobReference">Job Reference</label>
                <input
                  type="text"
                  id="jobReference"
                  name="jobReference"
                  value={formData.jobReference}
                  onChange={handleChange}
                  placeholder="Auto-generated if left blank"
                  className={styles.input}
                  autoComplete="off"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="expiresAt">Expiry Date</label>
                <input
                  type="date"
                  id="expiresAt"
                  name="expiresAt"
                  value={formData.expiresAt}
                  onChange={handleChange}
                  className={styles.input}
                />
              </div>
            </div>
          </div>

          {/* Pre-screening Questions */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>❓</span>
              Pre-screening Questions (optional)
            </h2>
            {/* THE EXAMPLE IS ABOUT THE CRAFT, DELIBERATELY. The form had no
                suggested question at all, and the obvious one to reach for is
                right-to-work — which is the line we drew when those tags came
                out of the alert filters: Thrive is a recruitment product, not
                HR and compliance software. Naming a good question here is
                cheaper than removing a bad one later. */}
            <p className={styles.helperText} style={{ marginBottom: '1rem' }}>
              One question filters out most of the applications you&apos;d reject anyway.
              Something about the craft works best — &quot;Do you have experience running
              a section?&quot;
            </p>
            {screeningQuestions.map((q, i) => (
              <div key={q.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                <input
                  type="text"
                  value={q.question}
                  onChange={e => {
                    const updated = [...screeningQuestions]
                    updated[i] = { ...q, question: e.target.value }
                    setScreeningQuestions(updated)
                  }}
                  placeholder={i === 0 ? "e.g. Do you have experience running a section?" : `Question ${i + 1}`}
                  className={styles.input}
                  style={{ flex: 1 }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={e => {
                      const updated = [...screeningQuestions]
                      updated[i] = { ...q, required: e.target.checked }
                      setScreeningQuestions(updated)
                    }}
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={() => setScreeningQuestions(prev => prev.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.1rem', padding: '0.25rem' }}
                  title="Remove question"
                >
                  ✕
                </button>
              </div>
            ))}
            {screeningQuestions.length < 5 && (
              <button
                type="button"
                onClick={() => setScreeningQuestions(prev => [...prev, { id: crypto.randomUUID(), question: '', required: false }])}
                className={styles.uploadLabel}
                style={{ fontSize: '0.85rem' }}
              >
                + Add question
              </button>
            )}
            {screeningQuestions.length >= 5 && (
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.5rem' }}>Maximum 5 questions reached</p>
            )}
          </div>

          {/* Tags */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>🏷️</span>
              Job Tags
            </h2>
            <p className={styles.helperText} style={{ marginBottom: '1rem' }}>
              Select tags that apply to this role. These help candidates find your job.
            </p>

            {(Object.keys(TAG_CATEGORIES) as TagCategory[]).map(catKey => (
              <div key={catKey} className={styles.tagCategoryGroup}>
                <h4 className={styles.tagCategoryTitle}>
                  {TAG_CATEGORIES[catKey].icon} {TAG_CATEGORIES[catKey].title}
                </h4>
                <div className={styles.checkboxGroup}>
                  {tagsByCategory[catKey].map(tagDef => (
                    <div key={tagDef.label}>
                      <input
                        type="checkbox"
                        id={`tag-${tagDef.label}`}
                        checked={formData.tags.has(tagDef.label)}
                        onChange={() => handleTagChange(tagDef.label)}
                        className={styles.checkboxInput}
                      />
                      <label htmlFor={`tag-${tagDef.label}`} className={styles.checkboxLabel}>
                        <span className={styles.checkboxBox}></span>
                        {tagDef.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Preview Section */}
          {showPreview && (
            <div className={styles.previewSection}>
              <div className={styles.previewSectionHeader}>
                <h2 className={styles.sectionTitle}>
                  <span className={styles.sectionIcon}>👁️</span>
                  Job Preview
                </h2>
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className={styles.closePreviewBtn}
                >
                  ✕ Close Preview
                </button>
              </div>

              <div className={styles.previewCard}>
                <div className={styles.previewCompanyRow}>
                  {formData.companyLogo && (
                    <img
                      src={formData.companyLogo}
                      alt={formData.company}
                      className={styles.previewLogo}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  )}
                  <div>
                    <h3 className={styles.previewJobTitle}>{formData.title || 'Job Title'}</h3>
                    <p className={styles.previewCompany}>{formData.company || 'Company Name'}</p>
                  </div>
                </div>

                <div className={styles.previewDetails}>
                  <span className={styles.previewDetail}>📍 {formData.location || 'Location'}{formData.area ? `, ${formData.area}` : ''}</span>
                  {/* Collapses to one figure exactly as the board and the detail
                      page do. It printed "£0 - £0" before either box was
                      touched, and would have contradicted the helper text
                      underneath the field it previews. */}
                  <span className={styles.previewDetail}>💰 {hideSalary
                    ? 'Competitive salary'
                    : !formData.salaryMin
                      ? 'Pay not set yet'
                      : (!formData.salaryMax || formData.salaryMax === formData.salaryMin)
                        ? `£${formData.salaryMin} / ${formData.salaryPeriod}`
                        : `£${formData.salaryMin} - £${formData.salaryMax} / ${formData.salaryPeriod}`
                  }{salaryNegotiable ? ' (negotiable)' : ''}</span>
                  <span className={styles.previewDetail}>📋 {formData.employmentType} · {formData.contractType}</span>
                  <span className={styles.previewDetail}>🏢 {formData.workLocationType}</span>
                </div>

                {formData.tags.size > 0 && (
                  <div className={styles.previewTags}>
                    {Array.from(formData.tags).map(tag => {
                      const cat = getTagCategory(tag)
                      const colorClass = cat ? styles[`previewTag_${cat}`] || '' : ''
                      return (
                        <span key={tag} className={`${styles.previewTag} ${colorClass}`}>
                          {tag}
                        </span>
                      )
                    })}
                  </div>
                )}

                {formData.description && (
                  <div className={styles.previewBlock}>
                    <h4>Job Description</h4>
                    <p style={{ whiteSpace: 'pre-line' }}>{formData.description}</p>
                  </div>
                )}

                <div className={styles.previewMeta}>
                  {formData.experienceRequired && <span>Experience: {formData.experienceRequired}</span>}
                  {formData.shiftSchedule && <span>Schedule: {formData.shiftSchedule}</span>}
                  {formData.jobReference && <span>Reference: {formData.jobReference}</span>}
                  {formData.expiresAt && <span>Expires: {formData.expiresAt}</span>}
                  {formData.category && <span>Category: {categories.find(c => c.id === formData.category)?.label || formData.category}</span>}
                </div>
              </div>
            </div>
          )}

          {/* Submit */}
          <div className={styles.submitGroup}>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className={styles.previewBtn}
            >
              {showPreview ? '✏️ Back to Edit' : '👁️ Preview Job'}
            </button>
            <button type="submit" className={styles.submitBtn} disabled={loading || success || loadingJobData}>
              {loading
                ? (isEditMode ? 'Updating...' : 'Posting...')
                : success
                  ? (isEditMode ? 'Updated!' : 'Posted!')
                  : (isEditMode ? '⬡ Update Job' : '⬡ Post Job')}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}

// Wrap in Suspense for useSearchParams
export default function PostJobPage() {
  return (
    <Suspense fallback={
      <main>
        <Header />
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          Loading...
        </div>
      </main>
    }>
      <PostJobContent />
    </Suspense>
  )
}
