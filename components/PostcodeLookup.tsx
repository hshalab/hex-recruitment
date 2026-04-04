'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { lookupPostcode, autocompletePostcode, normalizePostcode, isValidPostcodeFormat } from '@/lib/postcodeLookup'
import styles from './PostcodeLookup.module.css'

export interface AddressData {
  addressLine1: string
  addressLine2: string
  city: string
  county: string
  postcode: string
}

interface PostcodeLookupProps {
  onAddressFound: (address: AddressData) => void
  initialPostcode?: string
  className?: string
  error?: string
}

export default function PostcodeLookup({
  onAddressFound,
  initialPostcode = '',
  className = '',
  error,
}: PostcodeLookupProps) {
  const [postcode, setPostcode] = useState(initialPostcode)
  const [isLooking, setIsLooking] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [lookupSuccess, setLookupSuccess] = useState(false)
  const [foundAddress, setFoundAddress] = useState<{ city: string; county: string; postcode: string } | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [manualMode, setManualMode] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Handle click outside to close dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Debounced autocomplete
  const fetchSuggestions = useCallback(async (value: string) => {
    if (value.length < 2) {
      setSuggestions([])
      return
    }

    const results = await autocompletePostcode(value)
    setSuggestions(results)
    setShowSuggestions(results.length > 0)
  }, [])

  const handlePostcodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase()
    setPostcode(value)
    setLookupError('')
    setLookupSuccess(false)
    setFoundAddress(null)
    setHighlightedIndex(-1)

    // Debounce autocomplete
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value)
    }, 300)
  }

  const performLookup = async (postcodeToLookup: string) => {
    const normalized = normalizePostcode(postcodeToLookup)

    if (!isValidPostcodeFormat(normalized)) {
      setLookupError('Please enter a valid UK postcode')
      return
    }

    setIsLooking(true)
    setLookupError('')
    setLookupSuccess(false)
    setShowSuggestions(false)

    const areaResult = await lookupPostcode(normalized)

    if (areaResult) {
      setPostcode(areaResult.postcode)
      setFoundAddress({
        city: areaResult.city,
        county: areaResult.county,
        postcode: areaResult.postcode,
      })
      const addressData = {
        addressLine1: '',
        addressLine2: '',
        city: areaResult.city,
        county: areaResult.county,
        postcode: areaResult.postcode,
      }
      onAddressFound(addressData)
      setLookupSuccess(true)
    } else {
      setLookupError('Postcode not found. Please check and try again.')
      setLookupSuccess(false)
    }

    setIsLooking(false)
  }

  const handleFindAddress = () => {
    performLookup(postcode)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (highlightedIndex >= 0) {
          selectSuggestion(suggestions[highlightedIndex])
        } else {
          performLookup(postcode)
        }
      } else if (e.key === 'Escape') {
        setShowSuggestions(false)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      performLookup(postcode)
    }
  }

  const selectSuggestion = (suggestion: string) => {
    setPostcode(suggestion)
    setSuggestions([])
    setShowSuggestions(false)
    setHighlightedIndex(-1)
    performLookup(suggestion)
  }

  const handleBlur = () => {
    // Delay to allow click on suggestion
    setTimeout(() => {
      if (postcode && isValidPostcodeFormat(postcode) && !showSuggestions) {
        performLookup(postcode)
      }
    }, 200)
  }

  const handleManualMode = () => {
    setManualMode(true)
    setShowSuggestions(false)
    onAddressFound({
      addressLine1: '',
      addressLine2: '',
      city: '',
      county: '',
      postcode: postcode,
    })
  }

  if (manualMode) {
    return (
      <div className={`${styles.container} ${className}`}>
        <div className={styles.manualModeHeader}>
          <span className={styles.manualModeText}>Entering address manually</span>
          <button
            type="button"
            className={styles.useLookupLink}
            onClick={() => setManualMode(false)}
          >
            Use postcode lookup
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.container} ${className}`} ref={containerRef}>
      <div className={styles.lookupRow}>
        <div className={styles.inputWrapper}>
          <input
            ref={inputRef}
            type="text"
            value={postcode}
            onChange={handlePostcodeChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onFocus={() => postcode.length >= 2 && suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Enter postcode (e.g. SW1A 1AA)"
            className={`${styles.input} ${error || lookupError ? styles.inputError : ''}`}
            autoComplete="postal-code"
            aria-label="Postcode"
            aria-expanded={showSuggestions}
            aria-autocomplete="list"
            aria-controls="postcode-suggestions"
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul
              id="postcode-suggestions"
              className={styles.suggestions}
              role="listbox"
            >
              {suggestions.map((suggestion, index) => (
                <li
                  key={suggestion}
                  className={`${styles.suggestionItem} ${index === highlightedIndex ? styles.highlighted : ''}`}
                  onClick={() => selectSuggestion(suggestion)}
                  role="option"
                  aria-selected={index === highlightedIndex}
                >
                  <span className={styles.suggestionIcon}>📍</span>
                  {suggestion}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={handleFindAddress}
          disabled={isLooking || !postcode.trim()}
          className={styles.findButton}
        >
          {isLooking ? (
            <>
              <span className={styles.spinner}></span>
              Looking...
            </>
          ) : (
            <>
              <span className={styles.searchIcon}>🔍</span>
              Find Address
            </>
          )}
        </button>
      </div>

      {(error || lookupError) && (
        <p className={styles.errorText}>{error || lookupError}</p>
      )}

      {lookupSuccess && !lookupError && foundAddress && (
        <div className={styles.foundAddressCard}>
          <div className={styles.foundAddressHeader}>
            <span className={styles.checkIcon}>✓</span>
            <span className={styles.foundTitle}>Postcode found!</span>
          </div>
          <div className={styles.foundAddressDetails}>
            <p className={styles.foundLocation}>
              {[foundAddress.city, foundAddress.county].filter(Boolean).join(', ')}
            </p>
            <p className={styles.foundPostcode}>{foundAddress.postcode}</p>
          </div>
          <p className={styles.enterStreetPrompt}>
            Please enter your street address (house number and street name) in the Address Line 1 field below.
          </p>
        </div>
      )}

      <button
        type="button"
        className={styles.manualLink}
        onClick={handleManualMode}
      >
        Enter address manually
      </button>
    </div>
  )
}
