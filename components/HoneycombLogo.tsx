import { Sprout } from 'lucide-react'

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
    <Sprout size={size} color="#FFE500" strokeWidth={2} className={className} />
  )
}
