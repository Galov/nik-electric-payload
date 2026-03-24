'use client'

import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'nik-cookie-consent'
const COOKIE_KEY = 'nik_cookie_consent'
const MAX_AGE = 60 * 60 * 24 * 365

const setConsent = (value: 'accepted' | 'essential') => {
  localStorage.setItem(STORAGE_KEY, value)
  document.cookie = `${COOKIE_KEY}=${value}; path=/; max-age=${MAX_AGE}; SameSite=Lax`
}

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    setIsVisible(!stored)
  }, [])

  const handleAccept = () => {
    setConsent('accepted')
    setIsVisible(false)
  }

  const handleEssentialOnly = () => {
    setConsent('essential')
    setIsVisible(false)
  }

  if (!isVisible) {
    return null
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-[90] sm:inset-x-6 lg:inset-x-auto lg:bottom-6 lg:right-6 lg:max-w-xl">
      <div className="rounded-xl border border-black/10 bg-white/96 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur-md">
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <p className="text-base font-medium text-primary/85">Използваме бисквитки</p>
            <p className="text-sm leading-6 text-primary/60">
              Използваме необходими бисквитки за вход, количка и нормална работа на сайта. Можете
              да приемете всички или да останете само с необходимите. Повече информация има в{' '}
              <Link className="text-[rgb(0,126,229)] hover:text-[rgb(0,113,206)]" href="/privacy">
                Политика за поверителност
              </Link>
              .
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              className="h-11 rounded-md border border-black/10 bg-white px-5 text-sm font-normal text-primary/75 hover:bg-black/5"
              onClick={handleEssentialOnly}
              type="button"
              variant="outline"
            >
              Само необходими
            </Button>
            <Button
              className="h-11 rounded-md bg-[rgb(0,126,229)] px-5 text-sm font-normal text-white hover:bg-[rgb(0,113,206)]"
              onClick={handleAccept}
              type="button"
            >
              Приемам
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
