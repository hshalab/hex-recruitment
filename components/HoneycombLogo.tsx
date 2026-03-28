interface HoneycombLogoProps {
  size?: number
  className?: string
  color?: string
  strokeWidth?: number
}

export default function HoneycombLogo({
  size = 32,
  className,
  color = 'currentColor',
}: HoneycombLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="46" fill={color} />
      <path
        d="M50 20 C35 35, 30 55, 50 80 C70 55, 65 35, 50 20Z"
        fill="#0f172a"
      />
      <path
        d="M50 30 Q42 50, 50 70"
        stroke="#0f172a"
        strokeWidth="2.5"
        fill="none"
      />
      <path
        d="M50 42 Q42 38, 36 42"
        stroke="#0f172a"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M50 52 Q58 48, 64 52"
        stroke="#0f172a"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  )
}
