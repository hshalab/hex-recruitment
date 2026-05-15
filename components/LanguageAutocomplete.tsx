'use client'

import { useEffect, useRef, useState } from 'react'
import { canonicaliseLanguage, searchLanguages } from '@/lib/languages'
import styles from './LanguageAutocomplete.module.css'

interface LanguageAutocompleteProps {
  id?: string
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}

export default function LanguageAutocomplete({
  id,
  value,
  onChange,
  className,
  placeholder,
}: LanguageAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const listboxId = id ? `${id}-listbox` : undefined

  const suggestions = searchLanguages(value, 8)

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
        setHighlighted(-1)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
    setOpen(true)
    setHighlighted(-1)
  }

  const handleSelect = (suggestion: string) => {
    onChange(suggestion)
    setOpen(false)
    setHighlighted(-1)
  }

  // Snap free text to canonical capitalisation when the user finishes editing
  // (blur / Enter). If the typed value doesn't match any known language, keep
  // it as-is so we accept rare languages we didn't list.
  const commit = () => {
    const canonical = canonicaliseLanguage(value)
    if (canonical !== value) onChange(canonical)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (suggestions.length === 0) return
      setOpen(true)
      setHighlighted((prev) => (prev + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (suggestions.length === 0) return
      setOpen(true)
      setHighlighted((prev) =>
        prev <= 0 ? suggestions.length - 1 : prev - 1,
      )
    } else if (e.key === 'Enter') {
      if (open && highlighted >= 0 && suggestions[highlighted]) {
        e.preventDefault()
        handleSelect(suggestions[highlighted])
      } else {
        commit()
        setOpen(false)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setHighlighted(-1)
    }
  }

  const showList = open && suggestions.length > 0

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <input
        type="text"
        id={id}
        value={value}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          commit()
          // Slight delay so click on a suggestion still registers
          setTimeout(() => setOpen(false), 120)
        }}
        onKeyDown={handleKeyDown}
        className={className}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-activedescendant={
          highlighted >= 0 && listboxId ? `${listboxId}-${highlighted}` : undefined
        }
      />
      {showList && (
        <ul id={listboxId} role="listbox" className={styles.list}>
          {suggestions.map((s, i) => (
            <li
              key={s}
              id={listboxId ? `${listboxId}-${i}` : undefined}
              role="option"
              aria-selected={i === highlighted}
              className={`${styles.item} ${i === highlighted ? styles.itemActive : ''}`}
              onMouseDown={(e) => {
                // mousedown fires before input's blur, so the click registers
                e.preventDefault()
                handleSelect(s)
              }}
              onMouseEnter={() => setHighlighted(i)}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
