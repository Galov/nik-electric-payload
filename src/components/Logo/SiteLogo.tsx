import Image from 'next/image'
import React from 'react'

type Props = {
  className?: string
  priority?: boolean
}

export function SiteLogo({ className, priority = false }: Props) {
  return (
    <Image
      alt="Ник Електрик"
      className={className}
      height={48}
      priority={priority}
      src="/logo.png"
      width={160}
    />
  )
}
