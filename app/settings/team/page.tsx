'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import {
  PERMISSIONS, PRESETS, DEFAULT_PRESET_ID, describePermissions,
  type Permissions, type PermissionKey,
} from '@/lib/teamPermissions'

interface Member {
  id: string
  role: 'owner' | 'member'
  status: 'invited' | 'active' | 'suspended'
  permissions: Permissions
  email: string
  name: string
  isSelf: boolean
}

const C = {
  border: '#e2e8f0',
  sub: '#64748b',
  faint: '#94a3b8',
  ink: '#0f172a',
  yellow: '#ffe500',
}

async function authFetch(url: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string> || {}) }
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  const res = await fetch(url, { ...init, headers })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, json }
}

function presetFor(perms: Permissions): string {
  const active = PERMISSIONS.filter(p => perms[p.key]).map(p => p.key).sort().join(',')
  const match = PRESETS.find(p => Object.keys(p.permissions).sort().join(',') === active)
  return match?.id || 'custom'
}

/** Preset buttons + per-capability toggles. ownerOnly caps are hidden for non-owner viewers. */
function PermissionPicker({
  value, onChange, viewerIsOwner,
}: { value: Permissions; onChange: (p: Permissions) => void; viewerIsOwner: boolean }) {
  const activePreset = presetFor(value)
  const visible = PERMISSIONS.filter(p => viewerIsOwner || !p.ownerOnly)
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {PRESETS.filter(p => viewerIsOwner || p.id !== 'admin').map(preset => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange({ ...preset.permissions })}
            title={preset.description}
            style={{
              padding: '6px 12px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${activePreset === preset.id ? C.ink : C.border}`,
              background: activePreset === preset.id ? C.ink : '#fff',
              color: activePreset === preset.id ? '#fff' : '#334155',
            }}
          >
            {preset.label}
          </button>
        ))}
        {activePreset === 'custom' && (
          <span style={{ padding: '6px 12px', fontSize: '0.8rem', color: C.faint }}>Custom</span>
        )}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {visible.map(p => (
          <label key={p.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!value[p.key]}
              onChange={e => onChange({ ...value, [p.key]: e.target.checked || undefined } as Permissions)}
              style={{ marginTop: 3 }}
            />
            <span>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>{p.label}</span>
              {p.ownerOnly && <span style={{ fontSize: '0.7rem', color: C.faint, marginLeft: 6 }}>owner-granted</span>}
              <span style={{ display: 'block', fontSize: '0.78rem', color: C.faint }}>{p.description}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

function Badge({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return <span style={{ fontSize: '0.7rem', fontWeight: 600, color, background: bg, padding: '0.15rem 0.5rem', borderRadius: 5 }}>{children}</span>
}

export default function TeamSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [viewerIsOwner, setViewerIsOwner] = useState(false)
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  // invite form
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitePerms, setInvitePerms] = useState<Permissions>(
    { ...(PRESETS.find(p => p.id === DEFAULT_PRESET_ID)!.permissions) },
  )
  const [inviteBusy, setInviteBusy] = useState(false)

  // per-row edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPerms, setEditPerms] = useState<Permissions>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const flash = (msg: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    const { ok, json } = await authFetch('/api/team/list')
    if (!ok) { setDenied(true); setLoading(false); return }
    setMembers(json.members || [])
    setViewerIsOwner(!!json.viewerIsOwner)
    setLoading(false)
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login/employer'); return }
      await load()
    }
    init()
  }, [router, load])

  const doInvite = async () => {
    setInviteBusy(true)
    const { ok, json } = await authFetch('/api/team/invite', {
      method: 'POST',
      body: JSON.stringify({ email: inviteEmail.trim(), permissions: invitePerms }),
    })
    setInviteBusy(false)
    if (!ok) { flash(json.error || 'Could not send the invitation.', 'err'); return }
    flash(json.emailSent === false ? 'Invitation created (email could not be sent).' : `Invitation sent to ${inviteEmail.trim()}.`)
    setShowInvite(false)
    setInviteEmail('')
    setInvitePerms({ ...(PRESETS.find(p => p.id === DEFAULT_PRESET_ID)!.permissions) })
    load()
  }

  const memberAction = async (memberId: string, action: string, extra: Record<string, unknown> = {}, okMsg = 'Done.') => {
    setBusyId(memberId)
    const { ok, json } = await authFetch('/api/team/member', {
      method: 'POST',
      body: JSON.stringify({ action, memberId, ...extra }),
    })
    setBusyId(null)
    if (!ok) { flash(json.error || 'Action failed.', 'err'); return }
    flash(okMsg)
    setEditingId(null)
    load()
  }

  const container: React.CSSProperties = { maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }

  if (loading) {
    return <main><Header /><div style={{ ...container, textAlign: 'center', color: C.faint }}>Loading your team…</div></main>
  }
  if (denied) {
    return (
      <main><Header />
        <div style={{ ...container, textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>Team</h1>
          <p style={{ color: C.sub }}>You don't have permission to manage this team. Ask the account owner for access.</p>
        </div>
      </main>
    )
  }

  const btn = (bg: string, color: string): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${bg === '#fff' ? C.border : bg}`, background: bg, color,
  })

  return (
    <main>
      <Header />
      <div style={container}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: '0.35rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Team</h1>
          {!showInvite && (
            <button onClick={() => setShowInvite(true)} style={{ ...btn(C.yellow, C.ink), padding: '9px 16px', fontSize: '0.9rem' }}>
              Invite teammate
            </button>
          )}
        </div>
        <p style={{ color: C.sub, marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          Invite colleagues to help with hiring and control what each person can do.
        </p>

        {toast && (
          <div style={{
            marginBottom: '1rem', padding: '0.7rem 1rem', borderRadius: 8, fontSize: '0.88rem',
            background: toast.kind === 'ok' ? '#f0fdf4' : '#fef2f2',
            color: toast.kind === 'ok' ? '#166534' : '#991b1b',
            border: `1px solid ${toast.kind === 'ok' ? '#bbf7d0' : '#fecaca'}`,
          }}>{toast.msg}</div>
        )}

        {showInvite && (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem', background: '#fbfcfd' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.9rem' }}>Invite a teammate</h2>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Email address</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              style={{ width: '100%', padding: '0.6rem 0.75rem', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: '0.9rem', marginBottom: '1rem' }}
            />
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>What can they do?</label>
            <PermissionPicker value={invitePerms} onChange={setInvitePerms} viewerIsOwner={viewerIsOwner} />
            <div style={{ display: 'flex', gap: 10, marginTop: '1.25rem' }}>
              <button disabled={inviteBusy || !inviteEmail.trim()} onClick={doInvite} style={{ ...btn(C.yellow, C.ink), padding: '9px 18px', fontSize: '0.9rem', opacity: inviteBusy || !inviteEmail.trim() ? 0.6 : 1 }}>
                {inviteBusy ? 'Sending…' : 'Send invitation'}
              </button>
              <button onClick={() => setShowInvite(false)} style={{ ...btn('#fff', '#334155'), padding: '9px 18px', fontSize: '0.9rem' }}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {members.map(m => {
            const isEditing = editingId === m.id
            const busy = busyId === m.id
            return (
              <div key={m.id} style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.9rem 1rem', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: C.ink, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {m.name || m.email || 'Pending teammate'}
                      {m.role === 'owner' && <Badge color="#92400e" bg="#fef3c7">Owner</Badge>}
                      {m.status === 'invited' && <Badge color="#3730a3" bg="#e0e7ff">Invite pending</Badge>}
                      {m.status === 'suspended' && <Badge color="#991b1b" bg="#fef2f2">Suspended</Badge>}
                      {m.isSelf && <span style={{ fontSize: '0.72rem', color: C.faint }}>you</span>}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: C.faint }}>{m.email}</div>
                    <div style={{ fontSize: '0.8rem', color: C.sub, marginTop: 2 }}>
                      {m.role === 'owner' ? 'Full access' : describePermissions(m.permissions)}
                    </div>
                  </div>
                  {m.role !== 'owner' && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {m.status === 'invited' ? (
                        <>
                          <button disabled={busy} onClick={() => memberAction(m.id, 'resend', {}, 'Invitation resent.')} style={btn('#fff', '#334155')}>Resend</button>
                          <button disabled={busy} onClick={() => memberAction(m.id, 'revoke', {}, 'Invitation revoked.')} style={btn('#fff', '#991b1b')}>Revoke</button>
                        </>
                      ) : (
                        <>
                          <button disabled={busy} onClick={() => { setEditingId(isEditing ? null : m.id); setEditPerms({ ...m.permissions }) }} style={btn('#fff', '#334155')}>
                            {isEditing ? 'Close' : 'Permissions'}
                          </button>
                          {m.status === 'active'
                            ? <button disabled={busy} onClick={() => memberAction(m.id, 'suspend', {}, 'Member suspended.')} style={btn('#fff', '#334155')}>Suspend</button>
                            : <button disabled={busy} onClick={() => memberAction(m.id, 'reactivate', {}, 'Member reactivated.')} style={btn('#fff', '#334155')}>Reactivate</button>}
                          <button disabled={busy} onClick={() => memberAction(m.id, 'remove', {}, 'Member removed.')} style={btn('#fff', '#991b1b')}>Remove</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {isEditing && m.role !== 'owner' && (
                  <div style={{ padding: '1rem', borderTop: `1px solid #f1f5f9`, background: '#fbfcfd' }}>
                    <PermissionPicker value={editPerms} onChange={setEditPerms} viewerIsOwner={viewerIsOwner} />
                    <div style={{ marginTop: '1rem' }}>
                      <button disabled={busy} onClick={() => memberAction(m.id, 'update', { permissions: editPerms }, 'Permissions updated.')} style={{ ...btn(C.yellow, C.ink), padding: '8px 16px', fontSize: '0.85rem' }}>
                        {busy ? 'Saving…' : 'Save permissions'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
