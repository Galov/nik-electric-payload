'use client'

import type { Partner } from '@/payload-types'
import clsx from 'clsx'
import { ChevronDown, ExternalLink, Globe, MapPin, Phone, Search, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import React, { useEffect, useMemo, useRef, useState } from 'react'

type PartnersDirectoryProps = {
  initialPartnerSlug?: string
  partners: Partner[]
}

const normalizeWebsite = (website?: string | null) => {
  if (!website) return null
  if (/^https?:\/\//i.test(website)) return website
  return `https://${website}`
}

const mapUrlForPartner = (partner?: Partner) => {
  if (!partner) return 'https://www.google.com/maps?output=embed&q=Bulgaria'

  if (typeof partner.latitude === 'number' && typeof partner.longitude === 'number') {
    return `https://www.google.com/maps?output=embed&q=${partner.latitude},${partner.longitude}`
  }

  const query = [partner.title, partner.city, partner.address, 'България'].filter(Boolean).join(', ')
  return `https://www.google.com/maps?output=embed&q=${encodeURIComponent(query)}`
}

const infoRows = (partner: Partner) => [
  {
    icon: MapPin,
    label: 'Адрес',
    value: [partner.address, partner.postalCode, partner.city].filter(Boolean).join(', '),
  },
  {
    icon: Phone,
    label: 'Телефон',
    value: partner.phone,
    href: `tel:${partner.phone.replace(/\s+/g, '')}`,
  },
]

export const PartnersDirectory: React.FC<PartnersDirectoryProps> = ({
  initialPartnerSlug,
  partners,
}) => {
  const sortedPartners = useMemo(
    () =>
      [...partners].sort((left, right) =>
        (left.city || '').localeCompare(right.city || '', 'bg', { sensitivity: 'base' }),
      ),
    [partners],
  )

  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState('')
  const [selectedSlug, setSelectedSlug] = useState(initialPartnerSlug ?? '')
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const [listPanelHeight, setListPanelHeight] = useState<number | null>(null)

  const filteredPartners = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) return sortedPartners

    return sortedPartners.filter((partner) => {
      const haystack = [partner.city, partner.address]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }, [query, sortedPartners])

  useEffect(() => {
    const updateHeight = () => {
      if (!mapContainerRef.current || window.innerWidth < 1024) {
        setListPanelHeight(null)
        return
      }

      setListPanelHeight(mapContainerRef.current.clientHeight)
    }

    updateHeight()

    const observer = new ResizeObserver(() => updateHeight())

    if (mapContainerRef.current) {
      observer.observe(mapContainerRef.current)
    }

    window.addEventListener('resize', updateHeight)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateHeight)
    }
  }, [])

  const selectedPartner = useMemo(
    () => sortedPartners.find((partner) => partner.slug === selectedSlug),
    [selectedSlug, sortedPartners],
  )

  const selectPartner = (slug?: string | null) => {
    if (!slug) return

    const nextParams = new URLSearchParams(searchParams.toString())
    const isClosingCurrent = slug === selectedSlug

    if (isClosingCurrent) {
      setSelectedSlug('')
      nextParams.delete('partner')
    } else {
      setSelectedSlug(slug)
      nextParams.set('partner', slug)
    }

    const nextQuery = nextParams.toString()
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false })
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-10">
      <div
        className="min-w-0 rounded-xl bg-muted/20 p-3.5 md:p-3.5 lg:flex lg:flex-col"
        style={listPanelHeight ? { height: `${listPanelHeight}px` } : undefined}
      >
        <div className="mb-3.5 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/35" />
            <input
              className="h-12 w-full rounded-md border border-black/10 bg-white pl-11 pr-12 text-sm text-primary outline-none transition focus:border-[rgb(0,126,229)]/40"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Търси по град..."
              type="text"
              value={query}
            />
            {query ? (
              <button
                aria-label="Изчисти търсенето"
                className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-primary/35 transition hover:bg-black/[0.04] hover:text-primary/60"
                onClick={() => setQuery('')}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2 overflow-y-auto pr-1 lg:flex-1">
          {filteredPartners.map((partner) => {
            const isActive = partner.id === selectedPartner?.id

            return (
              <div
                key={partner.id}
                className={clsx(
                  'w-full cursor-pointer rounded-lg bg-white p-3 text-left transition duration-200 ease-in-out',
                  'hover:border-black/10 hover:shadow-[0_14px_34px_rgba(17,24,39,0.06)]',
                  isActive && 'border border-[rgb(0,126,229)]/15 shadow-[0_14px_34px_rgba(17,24,39,0.06)]',
                )}
              >
                <button
                  className="flex w-full cursor-pointer items-center justify-between gap-4 text-left"
                  onClick={() => selectPartner(partner.slug)}
                  type="button"
                >
                  <p className="text-base font-light tracking-[-0.01em] text-primary/88">
                    {partner.city}
                  </p>
                  <ChevronDown
                    className={clsx(
                      'h-5 w-5 shrink-0 text-[rgb(0,126,229)] transition-transform duration-200 ease-in-out',
                      isActive && 'rotate-180',
                    )}
                  />
                </button>

                <div
                  className={clsx(
                    'grid overflow-hidden transition-all duration-300 ease-in-out',
                    isActive ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                  )}
                >
                  <div className="min-h-0">
                    <div className="space-y-2 border-t border-black/6 pt-3">
                      <div className="space-y-1">
                        <p className="text-sm font-normal text-[rgb(0,126,229)]">{partner.title}</p>
                        <p className="text-sm leading-5 text-primary/58">{partner.workingHours}</p>
                      </div>

                      <div className="space-y-1 text-sm leading-5 text-primary/66">
                        {infoRows(partner).map((row) => {
                          const Icon = row.icon

                          return (
                            <div key={row.label} className="flex items-start gap-3">
                              <Icon className="mt-1 h-4 w-4 shrink-0 text-[rgb(0,126,229)]/75" />
                              {row.href ? (
                                <a className="hover:text-primary" href={row.href}>
                                  {row.value}
                                </a>
                              ) : (
                                <span>{row.value}</span>
                              )}
                            </div>
                          )
                        })}

                        {partner.website ? (
                          <div className="flex items-start gap-3">
                            <Globe className="mt-1 h-4 w-4 shrink-0 text-[rgb(0,126,229)]/75" />
                            <Link
                              className="inline-flex items-center gap-1.5 text-[rgb(0,126,229)] hover:text-[rgb(0,113,206)]"
                              href={normalizeWebsite(partner.website) || '#'}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Посети уебсайта
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        ) : null}

                        {partner.email ? (
                          <div className="flex items-start gap-3">
                            <Globe className="mt-1 h-4 w-4 shrink-0 text-[rgb(0,126,229)]/75" />
                            <a className="hover:text-primary" href={`mailto:${partner.email}`}>
                              {partner.email}
                            </a>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {filteredPartners.length === 0 ? (
            <div className="rounded-lg bg-white px-4 py-5 text-sm leading-6 text-primary/60">
              Няма намерени партньори по този критерий.
            </div>
          ) : null}
        </div>
      </div>

      <div className="lg:sticky lg:top-28 lg:self-start">
        <div ref={mapContainerRef} className="overflow-hidden rounded-xl border border-black/8 bg-white">
          <iframe
            className="aspect-square w-full"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={mapUrlForPartner(selectedPartner)}
            title={selectedPartner ? `Карта за ${selectedPartner.title}` : 'Карта с партньори'}
          />
        </div>
      </div>
    </div>
  )
}
