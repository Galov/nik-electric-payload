import type { Metadata } from 'next'

import React from 'react'

import { LoginForm } from '@/components/forms/LoginForm'
import { getNoIndexMetadata } from '@/utilities/getNoIndexMetadata'

export default async function Login() {
  return (
    <div className="container">
      <div className="mx-auto my-12 max-w-xl bg-muted/20 px-5 py-6 md:px-7 md:py-8">
        <h1 className="mb-4 text-3xl font-normal text-primary/85">Вход</h1>
        <p className="mb-8 text-sm leading-7 text-primary/65">
          Влез в профила си, за да преглеждаш поръчките и настройките си. Ако още нямаш профил,
          можеш да си създадеш нов.
        </p>
        <LoginForm />
      </div>
    </div>
  )
}

export const metadata: Promise<Metadata> = getNoIndexMetadata({
  description: 'Влезте в профила си или създайте нов.',
  path: '/login',
  title: 'Вход',
})
