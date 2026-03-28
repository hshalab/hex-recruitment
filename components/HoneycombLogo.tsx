import { Leaf } from 'lucide-react'

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
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: '#FFE500',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Leaf size={size * 0.55} color="#0f172a" strokeWidth={2.5} />
    </div>
  )
}
