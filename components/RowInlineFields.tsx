import { Fragment, type ReactNode } from 'react'

/**
 * Shared compact-row inline text builder.
 *
 * The recurring "orphan em-dash" bug (e.g. "Warehouse Team Leader — London"
 * collapsing to "Gianna Lorandi —" when a field is absent) came from
 * rendering separators as fixed text *between slots*: an empty slot stranded
 * its dash. This builds the inline text STRUCTURALLY instead — it takes the
 * array of fields, drops the empty ones, then renders the separator ONLY
 * between two present fields. An absent field contributes nothing: no slot,
 * no separator. Orphan dashes become structurally impossible.
 *
 * Each page passes its own CSS-module separator class so the look stays
 * page-scoped while the composition logic is shared by every row on both
 * the Interviews and Manage Job Ads pages.
 *
 * A field is considered absent when it is null / undefined / false (so
 * callers can write `cond && <span/>`). Already-rendered nodes (e.g. a
 * styled <span>) are passed through untouched.
 */
export function RowInlineFields({
  fields,
  sepClassName,
  separator = '—',
}: {
  fields: ReactNode[]
  sepClassName: string
  separator?: string
}) {
  const present = fields.filter(
    (f) => f !== null && f !== undefined && f !== false && f !== '',
  )
  return (
    <>
      {present.map((field, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className={sepClassName} aria-hidden="true">
              {separator}
            </span>
          )}
          {field}
        </Fragment>
      ))}
    </>
  )
}
