'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import styles from './EmptyState.module.css'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?:
    | { label: string; href: string }
    | { label: string; onClick: () => void }
}

/**
 * Shared empty state — used in place of emoji + one-liner stand-ins.
 * Lucide icon, dark title, muted description, optional ghost-style CTA.
 */
export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.wrap}>
      <div className={styles.iconWrap}>
        <Icon size={28} strokeWidth={1.5} />
      </div>
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
      {action && (
        'href' in action ? (
          <Link href={action.href} className={styles.action}>
            {action.label} <span aria-hidden>→</span>
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={styles.action}>
            {action.label} <span aria-hidden>→</span>
          </button>
        )
      )}
    </div>
  )
}
