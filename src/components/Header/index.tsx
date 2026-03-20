'use client'

import './index.css'
import Link from 'next/link'
import { Cart } from '@/components/Cart'
import { SiteLogo } from '@/components/Logo/SiteLogo'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

const navItems = [
  {
    href: '/shop',
    isActive: (pathname: string) => pathname.startsWith('/shop') || pathname.startsWith('/products'),
    label: 'Каталог',
  },
  {
    href: '/orders',
    isActive: (pathname: string) => pathname.startsWith('/orders'),
    label: 'Поръчки',
  },
  {
    href: '/account',
    isActive: (pathname: string) => pathname.startsWith('/account'),
    label: 'Профил',
  },
] as const

export function Header() {
  const pathname = usePathname()
  const navRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({})
  const [indicatorStyle, setIndicatorStyle] = useState({ opacity: 0, width: 0, x: 0 })

  useEffect(() => {
    const updateIndicator = () => {
      const activeItem = navItems.find((item) => item.isActive(pathname))
      const navElement = navRef.current
      const activeElement = activeItem ? itemRefs.current[activeItem.href] : null

      if (!navElement || !activeElement) {
        setIndicatorStyle((current) => ({ ...current, opacity: 0 }))
        return
      }

      const navRect = navElement.getBoundingClientRect()
      const activeRect = activeElement.getBoundingClientRect()

      setIndicatorStyle({
        opacity: 1,
        width: activeRect.width,
        x: activeRect.left - navRect.left,
      })
    }

    updateIndicator()
    window.addEventListener('resize', updateIndicator)

    return () => {
      window.removeEventListener('resize', updateIndicator)
    }
  }, [pathname])

  return (
    <div className="relative z-20 border-b-2 border-[rgb(0,126,229)]">
      <nav className="container flex items-center justify-between py-8">
        <div className="flex items-center gap-14">
          <Link className="flex items-center" href="/">
            <SiteLogo className="h-auto w-44" priority />
          </Link>
          <div className="hidden items-center pl-6 md:flex">
            <div className="headerNav relative flex items-center gap-6 text-sm" ref={navRef}>
              <span
                className="headerNavIndicator"
                style={{
                  opacity: indicatorStyle.opacity,
                  transform: `translateX(${indicatorStyle.x}px)`,
                  width: `${indicatorStyle.width}px`,
                }}
              />
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  className="headerNavLink text-primary/80 transition-colors hover:text-primary"
                  href={item.href}
                  ref={(element) => {
                    itemRefs.current[item.href] = element
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
        <Cart />
      </nav>
    </div>
  )
}
