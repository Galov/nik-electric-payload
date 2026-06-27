'use client'

import { useAuth } from '@/providers/Auth'
import Link from 'next/link'
import React, { Fragment, useEffect, useRef, useState } from 'react'

export const LogoutPage: React.FC = () => {
  const { logout, status, user } = useAuth()
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [phase, setPhase] = useState<'done' | 'loggingOut'>('loggingOut')
  const logoutStartedRef = useRef(false)

  useEffect(() => {
    if (logoutStartedRef.current) {
      return
    }

    logoutStartedRef.current = true

    const performLogout = async () => {
      try {
        await logout()
        setSuccess('Излязохте успешно.')
      } catch (_) {
        setError('Вече сте излезли от профила си.')
      } finally {
        setPhase('done')
      }
    }

    void performLogout()
  }, [logout])

  useEffect(() => {
    if (phase === 'done' && status === 'loggedIn' && user) {
      window.location.replace('/shop')
    }
  }, [phase, status, user])

  if (phase === 'done' && status === 'loggedIn' && user) {
    return (
      <div>
        <h1 className="mb-4 text-3xl font-normal text-primary/85">Вече сте вписани.</h1>
        <p className="text-sm leading-7 text-primary/65">
          Пренасочваме ви към магазина.
        </p>
      </div>
    )
  }

  if (phase === 'loggingOut') {
    return (
      <div>
        <h1 className="mb-4 text-3xl font-normal text-primary/85">Излизане от профила</h1>
        <p className="text-sm leading-7 text-primary/65">
          Изчакaйте, обработваме заявката ви.
        </p>
      </div>
    )
  }

  return (
    <Fragment>
      {(error || success) && (
        <div>
          <h1 className="mb-4 text-3xl font-normal text-primary/85">{error || success}</h1>
          <p className="text-sm leading-7 text-primary/65">
            Какво искате да направите сега?
            <Fragment>
              {' '}
              <Link className="text-[rgb(0,126,229)] hover:text-[rgb(0,113,206)]" href="/shop">
                Натиснете тук
              </Link>
              {` за да разгледате каталога.`}
            </Fragment>
            {` За нов вход `}
            <Link className="text-[rgb(0,126,229)] hover:text-[rgb(0,113,206)]" href="/login">
              натиснете тук
            </Link>
            .
          </p>
        </div>
      )}
    </Fragment>
  )
}
