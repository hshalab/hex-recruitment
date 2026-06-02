interface ThriveMarkProps {
  size?: number
  className?: string
}

// The Thrive monogram — yellow rounded tile (#FFE500) with cut-out navy "T"
// (#0A1628). Sourced from /public/logo/thrive-mark.svg so the file is
// browser-cacheable and the visual is identical everywhere it appears.
export default function ThriveMark({ size = 32, className }: ThriveMarkProps) {
  return (
    <img
      src="/logo/thrive-mark.svg"
      alt="Thrive"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block' }}
    />
  )
}
