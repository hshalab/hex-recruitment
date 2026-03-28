interface HoneycombLogoProps {
  size?: number
  className?: string
  color?: string
  strokeWidth?: number
}

export default function HoneycombLogo({
  size = 32,
  className,
}: HoneycombLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="100" cy="100" r="95" fill="#FFE500" />
      <path d="M100 35 C70 65, 55 100, 100 165 C145 100, 130 65, 100 35Z" fill="#0f172a" />
      <path d="M100 55 Q85 95, 100 145" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M100 80 Q85 72, 72 80" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M100 105 Q115 97, 128 105" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  )
}
