'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  regionToken,
  countyToken,
  parsePreferredAreas,
  regionName,
  countyName,
} from '@/lib/areas'
import styles from './PreferredAreasPicker.module.css'

// "Where are you willing to work?" — the candidate side of preferred-areas
// matching. Two ways in, because candidates arrive with very different
// knowledge of UK geography:
//
//   1. TOWN TYPE-AHEAD — they type a place they know ("Guildford", "Henley")
//      and we resolve it to the right county/region for them. This is the
//      inclusive path: an overseas candidate cannot be expected to know that
//      Guildford is in Surrey, and shouldn't have to.
//   2. REGION LIST — regions first, expandable to counties, so someone who
//      does know the geography can pick broadly or precisely.
//
// Regions that currently have jobs lead; empty ones are tucked behind a
// disclosure. That ordering comes from live job data via /api/areas, so it
// tracks reality instead of a hardcoded list.
//
// No map: deliberate. A map is a poor fit on a phone and worse for someone who
// doesn't recognise UK place names.

interface CountyOption {
  id: string
  name: string
  jobCount: number
}
interface RegionOption {
  id: string
  name: string
  jobCount: number
  hasJobs: boolean
  counties: CountyOption[]
}

interface AreaSuggestion {
  token: string
  label: string
  place: string | null
  region: string
  county: string | null
  source: string
}
interface LookupResult {
  found: boolean
  query?: string
  suggestions?: AreaSuggestion[]
}

interface Props {
  /** Canonical tokens: 'region:south-east' / 'county:surrey'. */
  value: string[]
  onChange: (areas: string[]) => void
  /** Rendered under the heading; omit for the default. */
  hint?: string
  disabled?: boolean
}

export default function PreferredAreasPicker({ value, onChange, hint, disabled }: Props) {
  const [regions, setRegions] = useState<RegionOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showEmptyRegions, setShowEmptyRegions] = useState(false)

  // town type-ahead
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<LookupResult | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestSeq = useRef(0)

  const selected = useMemo(() => parsePreferredAreas(value), [value])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/areas')
        if (!res.ok) throw new Error('failed')
        const data = await res.json()
        if (cancelled) return
        setRegions(data.regions || [])
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ── selection helpers ────────────────────────────────────────────
  // A region covers all of its counties, so selecting one drops the now-
  // redundant county tokens rather than storing both.

  const emit = useCallback((regionIds: Set<string>, countyIds: Set<string>) => {
    onChange([
      ...Array.from(regionIds).sort().map(regionToken),
      ...Array.from(countyIds).sort().map(countyToken),
    ])
  }, [onChange])

  const toggleRegion = (region: RegionOption) => {
    if (disabled) return
    const nextRegions = new Set(selected.regions)
    const nextCounties = new Set(selected.counties)
    if (nextRegions.has(region.id)) {
      nextRegions.delete(region.id)
    } else {
      nextRegions.add(region.id)
      for (const c of region.counties) nextCounties.delete(c.id)
    }
    emit(nextRegions, nextCounties)
  }

  const toggleCounty = (countyId: string) => {
    if (disabled) return
    const nextCounties = new Set(selected.counties)
    if (nextCounties.has(countyId)) nextCounties.delete(countyId)
    else nextCounties.add(countyId)
    emit(new Set(selected.regions), nextCounties)
  }

  const removeToken = (token: string) => {
    if (disabled) return
    onChange(value.filter(v => v !== token))
  }

  const regionOf = useCallback((countyId: string): string => {
    for (const r of regions) {
      if (r.counties.some(c => c.id === countyId)) return r.id
    }
    return ''
  }, [regions])

  const addToken = (token: string) => {
    if (disabled) return
    const parsed = parsePreferredAreas([token])
    const nextRegions = new Set(selected.regions)
    const nextCounties = new Set(selected.counties)
    for (const r of Array.from(parsed.regions)) nextRegions.add(r)
    for (const c of Array.from(parsed.counties)) {
      // Already covered by a selected region — nothing to add.
      if (!nextRegions.has(regionOf(c))) nextCounties.add(c)
    }
    emit(nextRegions, nextCounties)
  }

  const toggleExpand = (regionId: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(regionId)) next.delete(regionId)
      else next.add(regionId)
      return next
    })
  }

  // ── town type-ahead ──────────────────────────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) {
      setResult(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const seq = ++requestSeq.current
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/areas/lookup?q=${encodeURIComponent(q)}`)
        const data: LookupResult = await res.json()
        // Ignore out-of-order responses from earlier keystrokes.
        if (seq !== requestSeq.current) return
        setResult(data)
      } catch {
        if (seq === requestSeq.current) setResult({ found: false })
      } finally {
        if (seq === requestSeq.current) setSearching(false)
      }
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  const acceptSuggestion = (s: AreaSuggestion) => {
    addToken(s.token)
    setQuery('')
    setResult(null)
  }

  // Enter takes the top suggestion — the common case is one obvious answer.
  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const top = result?.suggestions?.[0]
      if (top) acceptSuggestion(top)
    }
  }

  // ── chips ────────────────────────────────────────────────────────

  const chips = useMemo(() => {
    const out: { token: string; label: string; sub: string }[] = []
    for (const r of Array.from(selected.regions).sort()) {
      out.push({ token: regionToken(r), label: regionName(r) || r, sub: 'whole region' })
    }
    for (const c of Array.from(selected.counties).sort()) {
      const parentName = regionName(regionOf(c))
      out.push({ token: countyToken(c), label: countyName(c) || c, sub: parentName || 'county' })
    }
    return out
    // regionOf depends on `regions` being loaded for the sub-label
  }, [selected, regionOf])

  const visibleRegions = showEmptyRegions ? regions : regions.filter(r => r.hasJobs)
  const emptyCount = regions.length - regions.filter(r => r.hasJobs).length

  return (
    <div className={styles.wrap}>
      <p className={styles.hint}>
        {hint ?? 'Pick the areas you’d travel to for work. Leave this empty to see jobs everywhere — we’ll never hide a job just because we couldn’t work out where it is.'}
      </p>

      {/* selected areas */}
      {chips.length > 0 && (
        <div className={styles.chips} aria-label="Selected areas">
          {chips.map(chip => (
            <span key={chip.token} className={styles.chip}>
              <span className={styles.chipLabel}>
                {chip.label}
                <span className={styles.chipSub}>{chip.sub}</span>
              </span>
              <button
                type="button"
                className={styles.chipRemove}
                onClick={() => removeToken(chip.token)}
                aria-label={`Remove ${chip.label}`}
                disabled={disabled}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* town type-ahead */}
      <div className={styles.searchBlock}>
        <label className={styles.searchLabel} htmlFor="area-town-search">
          Know a town? Type it and we&apos;ll find the right area
        </label>
        <input
          id="area-town-search"
          type="text"
          className={styles.searchInput}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="e.g. Guildford, Henley, Bath"
          autoComplete="off"
          disabled={disabled}
        />

        {searching && <p className={styles.searchStatus}>Looking that up…</p>}

        {!searching && result?.found && !!result.suggestions?.length && (
          <div className={styles.suggestionList}>
            {result.suggestions!.length > 1 && (
              <p className={styles.searchStatus}>
                More than one place matches — pick the one you mean:
              </p>
            )}
            {result.suggestions!.map(s => {
              const already = value.includes(s.token)
              return (
                <button
                  key={`${s.token}-${s.place || ''}`}
                  type="button"
                  className={styles.suggestion}
                  onClick={() => acceptSuggestion(s)}
                  disabled={disabled || already}
                >
                  <span className={styles.suggestionMain}>
                    {s.place && (
                      <>
                        {s.place} <span className={styles.suggestionArrow}>→</span>{' '}
                      </>
                    )}
                    {s.label}
                  </span>
                  <span className={styles.suggestionAction}>
                    {already ? 'Added' : 'Add'}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {!searching && result && !result.found && query.trim().length >= 2 && (
          <p className={styles.searchStatus}>
            We couldn&apos;t place “{query.trim()}”. Try a nearby town or pick a region below.
          </p>
        )}
      </div>

      {/* region / county list */}
      {loading && <p className={styles.searchStatus}>Loading areas…</p>}

      {loadError && (
        <p className={styles.searchStatus}>
          Couldn&apos;t load the area list. You can still save the rest of your profile.
        </p>
      )}

      {!loading && !loadError && (
        <div className={styles.regionList}>
          {visibleRegions.map(region => {
            const regionSelected = selected.regions.has(region.id)
            const isOpen = expanded.has(region.id)
            const pickedCounties = region.counties.filter(c => selected.counties.has(c.id)).length

            return (
              <div key={region.id} className={styles.regionBlock}>
                <div className={`${styles.regionRow} ${regionSelected ? styles.regionRowActive : ''}`}>
                  <label className={styles.regionMain}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={regionSelected}
                      onChange={() => toggleRegion(region)}
                      disabled={disabled}
                    />
                    <span className={styles.regionName}>
                      {region.name}
                      {region.jobCount > 0 && (
                        <span className={styles.jobCount}>
                          {region.jobCount} job{region.jobCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </span>
                  </label>

                  <button
                    type="button"
                    className={styles.expandBtn}
                    onClick={() => toggleExpand(region.id)}
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? 'Hide' : 'Show'} counties in ${region.name}`}
                  >
                    {pickedCounties > 0 && !regionSelected && (
                      <span className={styles.pickedBadge}>{pickedCounties}</span>
                    )}
                    <span className={isOpen ? styles.caretOpen : styles.caret}>▾</span>
                  </button>
                </div>

                {isOpen && (
                  <div className={styles.countyList}>
                    {regionSelected ? (
                      <p className={styles.coveredNote}>
                        All of {region.name} is selected. Untick it above to choose
                        individual counties.
                      </p>
                    ) : (
                      region.counties.map(county => (
                        <label key={county.id} className={styles.countyRow}>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={selected.counties.has(county.id)}
                            onChange={() => toggleCounty(county.id)}
                            disabled={disabled}
                          />
                          <span className={styles.countyName}>
                            {county.name}
                            {county.jobCount > 0 && (
                              <span className={styles.jobCountSmall}>{county.jobCount}</span>
                            )}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {emptyCount > 0 && (
            <button
              type="button"
              className={styles.showMore}
              onClick={() => setShowEmptyRegions(v => !v)}
            >
              {showEmptyRegions
                ? 'Hide areas with no jobs right now'
                : `Show ${emptyCount} more area${emptyCount === 1 ? '' : 's'} (no jobs right now)`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
