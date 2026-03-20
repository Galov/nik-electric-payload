'use client'

import { useAuth } from '@/providers/Auth'
import Link from 'next/link'
import React, { Fragment, useEffect, useState } from 'react'

export const LogoutPage: React.FC = () => {
  const { logout } = useAuth()
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const performLogout = async () => {
      try {
        await logout()
        setSuccess('Излязохте успешно.')
      } catch (_) {
        setError('Вече сте излезли от профила си.')
      }
    }

    void performLogout()
  }, [logout])

  return (
    <Fragment>
      {(error || success) && (
        <div className="prose dark:prose-invert">
          <h1>{error || success}</h1>
          <p>
            Какво искате да направите сега?
            <Fragment>
              {' '}
              <Link href="/shop">Натиснете тук</Link>
              {` за да разгледате каталога.`}
            </Fragment>
            {` За нов вход `}
            <Link href="/login">натиснете тук</Link>.
          </p>
        </div>
      )}
    </Fragment>
  )
}
