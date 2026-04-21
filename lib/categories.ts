export interface Category {
  id: string
  label: string
}

export const categories: Category[] = [
  { id: 'accountancy', label: 'Accountancy, Banking & Finance' },
  { id: 'automotive', label: 'Automotive' },
  { id: 'aviation', label: 'Aviation & Aerospace' },
  { id: 'beauty', label: 'Beauty & Wellbeing' },
  { id: 'business', label: 'Business, Consulting & Management' },
  { id: 'charity', label: 'Charity & Voluntary Work' },
  { id: 'creative', label: 'Creative Arts & Design' },
  { id: 'customer-service', label: 'Customer Service & Call Centre' },
  { id: 'defence', label: 'Defence & Military' },
  { id: 'digital', label: 'Digital & Information Technology' },
  { id: 'energy', label: 'Energy & Utilities' },
  { id: 'engineering', label: 'Engineering & Manufacturing' },
  { id: 'environment', label: 'Environment & Agriculture' },
  { id: 'fashion', label: 'Fashion & Textiles' },
  { id: 'food', label: 'Food & FMCG' },
  { id: 'healthcare', label: 'Healthcare & Social Care' },
  { id: 'hospitality', label: 'Hospitality, Tourism & Sport' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'law', label: 'Law & Legal Services' },
  { id: 'leisure', label: 'Leisure & Fitness' },
  { id: 'marketing', label: 'Marketing, Advertising & PR' },
  { id: 'media', label: 'Media & Internet' },
  { id: 'property', label: 'Property & Construction' },
  { id: 'public', label: 'Public Services & Administration' },
  { id: 'recruitment', label: 'Recruitment & HR' },
  { id: 'retail', label: 'Retail & Sales' },
  { id: 'science', label: 'Science & Pharmaceuticals' },
  { id: 'security', label: 'Security & Protective Services' },
  { id: 'social-work', label: 'Social Work' },
  { id: 'teaching', label: 'Teaching & Education' },
  { id: 'telecoms', label: 'Telecoms' },
  { id: 'transport', label: 'Transport & Logistics' },
  { id: 'veterinary', label: 'Veterinary & Animal Care' },
]

export function getCategoryLabel(id: string): string {
  return categories.find(c => c.id === id)?.label || id
}
