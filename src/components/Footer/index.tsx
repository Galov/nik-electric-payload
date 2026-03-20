import { SiteLogo } from '@/components/Logo/SiteLogo'
import Link from 'next/link'
import React from 'react'

const { SITE_NAME } = process.env

export async function Footer() {
  return (
    <footer className="bg-[rgb(0,126,229)] text-sm text-white">
      <div className="container">
        <div className="flex w-full flex-col gap-6 py-12 text-sm md:flex-row md:gap-12">
          <div>
            <Link className="flex items-center gap-2 md:pt-1" href="/">
              <SiteLogo className="h-auto w-28 brightness-0 invert" />
              <span className="sr-only">{SITE_NAME}</span>
            </Link>
          </div>
          <div className="flex flex-row gap-6 text-white md:ml-auto">
            <Link href="/shop">Каталог</Link>
            <Link href="/orders">Поръчки</Link>
            <Link href="/account">Профил</Link>
          </div>
        </div>
      </div>
      <div className="border-t border-white/20 py-6 text-sm">
        <div className="container mx-auto flex w-full flex-col items-center gap-1 md:flex-row md:gap-0">
          <p>&copy; 2026 Ник Електрик. Всички права запазени.</p>
          <hr className="mx-4 hidden h-4 w-px border-l border-white/30 md:inline-block" />
          <p className="md:ml-auto">
            Създаден от{' '}
            <a
              className="text-white"
              href="https://nevoweb.dev"
              rel="noreferrer"
              target="_blank"
            >
              Nevo Web
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
