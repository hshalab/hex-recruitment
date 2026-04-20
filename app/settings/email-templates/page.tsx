'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'

const TEMPLATE_TYPES = [
  { id: 'shortlisted', label: 'Shortlisted', description: 'Sent when you shortlist a candidate', defaultSubject: 'Application Shortlisted \u2014 {{jobTitle}}', defaultBody: "Great news! Your application for {{jobTitle}} at {{companyName}} has been shortlisted. We'll be in touch with next steps." },
  { id: 'rejected', label: 'Not Selected', description: 'Sent when a candidate is not selected', defaultSubject: 'Application Update \u2014 {{jobTitle}}', defaultBody: 'Thank you for your interest in {{jobTitle}} at {{companyName}}. After careful consideration, we have decided not to proceed with your application at this time. We wish you the best in your job search.' },
  { id: 'reviewing', label: 'Under Review', description: 'Sent when you start reviewing', defaultSubject: 'Application Under Review \u2014 {{jobTitle}}', defaultBody: "Your application for {{jobTitle}} at {{companyName}} is currently being reviewed. We'll be in touch soon." },
  { id: 'interview_invite', label: 'Interview Invite', description: 'Sent with interview invitation', defaultSubject: 'Interview Invitation \u2014 {{jobTitle}}', defaultBody: 'We would like to invite you for an interview for {{jobTitle}} at {{companyName}}. Please check your Thrive dashboard for details and to confirm your attendance.' },
  { id: 'offered', label: 'Job Offer', description: 'Sent when you make an offer', defaultSubject: 'Job Offer \u2014 {{jobTitle}}', defaultBody: 'Congratulations! We are pleased to offer you the position of {{jobTitle}} at {{companyName}}. Please check your messages for full details.' },
  { id: 'hired', label: 'Hired Confirmation', description: 'Sent when candidate is marked as hired', defaultSubject: 'Welcome to {{companyName}}!', defaultBody: 'Congratulations! You have been hired for {{jobTitle}} at {{companyName}}. We look forward to working with you.' },
]

const VARIABLES = ['{{candidateName}}', '{{jobTitle}}', '{{companyName}}']

interface Template {
  id?: string
  template_type: string
  subject: string
  body: string
  is_active: boolean
}

export default function EmailTemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Record<string, Template>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login/employer'); return }

      const { data } = await supabase
        .from('employer_email_templates')
        .select('*')
        .eq('employer_id', session.user.id)

      const map: Record<string, Template> = {}
      for (const row of data || []) {
        map[row.template_type] = row
      }
      setTemplates(map)
      setLoading(false)
    }
    load()
  }, [router])

  const handleSave = async (type: string) => {
    setSaving(type)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const tpl = templates[type]
    const defaultTpl = TEMPLATE_TYPES.find(t => t.id === type)!

    await supabase
      .from('employer_email_templates')
      .upsert({
        employer_id: session.user.id,
        template_type: type,
        subject: tpl?.subject || defaultTpl.defaultSubject,
        body: tpl?.body || defaultTpl.defaultBody,
        is_active: tpl?.is_active ?? true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'employer_id,template_type' })

    setSaving(null)
    setSaved(type)
    setTimeout(() => setSaved(null), 2000)
  }

  const updateTemplate = (type: string, field: 'subject' | 'body' | 'is_active', value: string | boolean) => {
    setTemplates(prev => ({
      ...prev,
      [type]: { ...prev[type], template_type: type, [field]: value, is_active: prev[type]?.is_active ?? true } as Template,
    }))
  }

  if (loading) {
    return (
      <main>
        <Header />
        <div style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem', textAlign: 'center', color: '#94a3b8' }}>Loading templates...</div>
      </main>
    )
  }

  return (
    <main>
      <Header />
      <div style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>Email Templates</h1>
        <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          Customise the emails sent to candidates at each stage. Use variables: {VARIABLES.map(v => <code key={v} style={{ background: '#f1f5f9', padding: '0.1rem 0.35rem', borderRadius: 3, fontSize: '0.8rem', marginLeft: 4 }}>{v}</code>)}
        </p>

        {TEMPLATE_TYPES.map(type => {
          const tpl = templates[type.id]
          const isEditing = editing === type.id
          const subject = tpl?.subject ?? type.defaultSubject
          const body = tpl?.body ?? type.defaultBody

          return (
            <div key={type.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: '1rem', overflow: 'hidden' }}>
              <div
                onClick={() => setEditing(isEditing ? null : type.id)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1rem', cursor: 'pointer', background: isEditing ? '#f8fafc' : '#fff' }}
              >
                <div>
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{type.label}</span>
                  <span style={{ color: '#94a3b8', fontSize: '0.8rem', marginLeft: '0.75rem' }}>{type.description}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {saved === type.id && <span style={{ color: '#16a34a', fontSize: '0.8rem', fontWeight: 500 }}>Saved!</span>}
                  {tpl && <span style={{ fontSize: '0.7rem', color: '#16a34a', background: '#f0fdf4', padding: '0.15rem 0.4rem', borderRadius: 4 }}>Customised</span>}
                  <span style={{ color: '#94a3b8' }}>{isEditing ? '▲' : '▼'}</span>
                </div>
              </div>

              {isEditing && (
                <div style={{ padding: '1rem', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Subject</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={e => updateTemplate(type.id, 'subject', e.target.value)}
                      style={{ width: '100%', padding: '0.5rem 0.625rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }}
                    />
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Body</label>
                    <textarea
                      value={body}
                      onChange={e => updateTemplate(type.id, 'body', e.target.value)}
                      rows={5}
                      style={{ width: '100%', padding: '0.5rem 0.625rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem', resize: 'vertical' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <button
                      onClick={() => {
                        updateTemplate(type.id, 'subject', type.defaultSubject)
                        updateTemplate(type.id, 'body', type.defaultBody)
                      }}
                      style={{ fontSize: '0.8rem', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Reset to default
                    </button>
                    <button
                      onClick={() => handleSave(type.id)}
                      disabled={saving === type.id}
                      style={{ padding: '0.5rem 1.25rem', background: saving === type.id ? '#94a3b8' : '#0f172a', color: '#FFE500', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                      {saving === type.id ? 'Saving...' : 'Save Template'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <button onClick={() => router.push('/employer/dashboard')} style={{ color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </main>
  )
}
