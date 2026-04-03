'use client'
import { useAuth } from '@/providers/Auth'
import { createUrl } from '@/utilities/createUrl'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import React from 'react'

const EUR_TO_BGN_RATE = 1.95583

type BaseProps = {
  className?: string
  currencyCodeClassName?: string
  as?: 'span' | 'p'
  priceGroup1?: null | number
  priceWholesale?: null | number
}

type PriceFixed = {
  amount: number
  currencyCode?: string
  highestAmount?: never
  lowestAmount?: never
}

type PriceRange = {
  amount?: never
  currencyCode?: string
  highestAmount: number
  lowestAmount: number
}

type Props = BaseProps & (PriceFixed | PriceRange)

export const Price = ({
  amount,
  className,
  highestAmount,
  lowestAmount,
  priceGroup1,
  priceWholesale,
  currencyCode = 'EUR',
  as = 'p',
}: Props & React.ComponentProps<'p'>) => {
  const Element = as
  const { user } = useAuth()
  const priceTier = (user as typeof user & { priceTier?: 'general' | 'group1' | null })?.priceTier
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const formatCurrency = (value: number, code = currencyCode) =>
    new Intl.NumberFormat('bg-BG', {
      currency: code,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      style: 'currency',
    }).format(value)

  const formatDualCurrency = (value: number) => {
    const eurValue = currencyCode === 'EUR' ? value : value / EUR_TO_BGN_RATE
    const bgnValue = eurValue * EUR_TO_BGN_RATE

    return `${formatCurrency(eurValue, 'EUR')} / ${formatCurrency(bgnValue, 'BGN')}`
  }

  if (!user) {
    const currentURL = createUrl(pathname, new URLSearchParams(searchParams.toString()))
    const loginURL = createUrl('/login', new URLSearchParams({ redirect: currentURL }))

    return (
      <Element className={className} suppressHydrationWarning>
        <Link className="transition hover:opacity-75 underline underline-offset-4" href={loginURL}>
          Поръчай
        </Link>
      </Element>
    )
  }

  const resolvedAmount =
    typeof priceWholesale === 'number' || typeof priceGroup1 === 'number'
      ? priceTier === 'group1'
        ? typeof priceGroup1 === 'number' && priceGroup1 > 0
          ? priceGroup1
          : (priceWholesale ?? amount)
        : (priceWholesale ?? amount)
      : amount

  if (typeof resolvedAmount === 'number') {
    return (
      <Element className={className} suppressHydrationWarning>
        {currencyCode === 'EUR' ? formatDualCurrency(resolvedAmount) : formatCurrency(resolvedAmount)}
      </Element>
    )
  }

  if (highestAmount && highestAmount !== lowestAmount) {
    return (
      <Element className={className} suppressHydrationWarning>
        {currencyCode === 'EUR'
          ? `${formatDualCurrency(lowestAmount)} - ${formatDualCurrency(highestAmount)}`
          : `${formatCurrency(lowestAmount)} - ${formatCurrency(highestAmount)}`}
      </Element>
    )
  }

  if (lowestAmount) {
    return (
      <Element className={className} suppressHydrationWarning>
        {currencyCode === 'EUR' ? formatDualCurrency(lowestAmount) : `${formatCurrency(lowestAmount)}`}
      </Element>
    )
  }

  return null
}
