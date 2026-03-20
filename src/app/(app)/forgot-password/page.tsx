import type { Metadata } from 'next'

import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import React from 'react'

import { ForgotPasswordForm } from '@/components/forms/ForgotPasswordForm'

export default async function ForgotPasswordPage() {
  return (
    <div className="container py-16">
      <ForgotPasswordForm />
    </div>
  )
}

export const metadata: Metadata = {
  description: 'Въведете имейла си, за да възстановите паролата.',
  openGraph: mergeOpenGraph({
    title: 'Забравена парола',
    url: '/forgot-password',
  }),
  title: 'Забравена парола',
}
