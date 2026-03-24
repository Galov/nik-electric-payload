'use client'

import { FormError } from '@/components/forms/FormError'
import { FormItem } from '@/components/forms/FormItem'
import { Message } from '@/components/Message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createUrl } from '@/utilities/createUrl'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import React, { useCallback, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'

type FormData = {
  companyAddress: string
  companyCity: string
  companyEIK: string
  companyName: string
  email: string
  firstName: string
  lastName: string
  password: string
  passwordConfirm: string
  phone: string
}

export const CreateAccountForm: React.FC = () => {
  const searchParams = useSearchParams()
  const allParams = searchParams.toString() ? `?${searchParams.toString()}` : ''
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<null | string>(null)

  const {
    formState: { errors },
    handleSubmit,
    register,
    watch,
  } = useForm<FormData>()

  const password = useRef({})
  password.current = watch('password', '')

  const onSubmit = useCallback(
    async (data: FormData) => {
      setError(null)

      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/users`, {
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      if (!response.ok) {
        let message = response.statusText || 'Възникна проблем при създаването на профила.'

        try {
          const result = (await response.json()) as {
            errors?: Array<{ message?: string }>
            message?: string
          }

          message = result?.errors?.[0]?.message || result?.message || message
        } catch {
          // noop
        }

        setError(message)
        return
      }

      const redirect = searchParams.get('redirect')
      const nextParams = new URLSearchParams({
        success:
          'Профилът е създаден успешно и чака одобрение от администратор. Ще можете да влезете след потвърждение.',
      })

      if (redirect) {
        nextParams.set('redirect', redirect)
      }

      const timer = setTimeout(() => {
        setLoading(true)
      }, 1000)

      try {
        clearTimeout(timer)
        router.push(createUrl('/login', nextParams))
      } catch (_) {
        clearTimeout(timer)
        setError('Възникна проблем при създаването на профила. Опитайте отново.')
      }
    },
    [router, searchParams],
  )

  return (
    <form className="max-w-lg" onSubmit={handleSubmit(onSubmit)}>
      <Message error={error} />
      <Message
        className="mb-8"
        message="Регистрацията е предназначена за фирми и сервизни партньори. След изпращане профилът ще бъде активиран след проверка от администратор."
      />

      <div className="mb-8 flex flex-col gap-6">
        <section className="space-y-5">
          <div>
            <h2 className="text-lg font-medium text-primary">Фирмени данни</h2>
            <p className="mt-1 text-sm text-primary/60">
              Данните ще бъдат използвани за одобрение на профила и последващо обслужване.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <FormItem>
              <Label htmlFor="companyName" className="mb-2">
                Име на фирма
              </Label>
              <Input
                id="companyName"
                {...register('companyName', { required: 'Името на фирмата е задължително.' })}
                type="text"
              />
              {errors.companyName && <FormError message={errors.companyName.message} />}
            </FormItem>

            <FormItem>
              <Label htmlFor="companyEIK" className="mb-2">
                ЕИК
              </Label>
              <Input
                id="companyEIK"
                {...register('companyEIK', { required: 'ЕИК е задължителен.' })}
                type="text"
              />
              {errors.companyEIK && <FormError message={errors.companyEIK.message} />}
            </FormItem>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <FormItem>
              <Label htmlFor="companyCity" className="mb-2">
                Град
              </Label>
              <Input
                id="companyCity"
                {...register('companyCity', { required: 'Градът е задължителен.' })}
                type="text"
              />
              {errors.companyCity && <FormError message={errors.companyCity.message} />}
            </FormItem>

            <FormItem>
              <Label htmlFor="phone" className="mb-2">
                Телефон
              </Label>
              <Input
                id="phone"
                {...register('phone', { required: 'Телефонът е задължителен.' })}
                type="tel"
              />
              {errors.phone && <FormError message={errors.phone.message} />}
            </FormItem>
          </div>

          <FormItem>
            <Label htmlFor="companyAddress" className="mb-2">
              Адрес
            </Label>
            <Textarea
              id="companyAddress"
              {...register('companyAddress', { required: 'Адресът е задължителен.' })}
              rows={3}
            />
            {errors.companyAddress && <FormError message={errors.companyAddress.message} />}
          </FormItem>
        </section>

        <section className="space-y-5 border-t border-primary/10 pt-6">
          <div>
            <h2 className="text-lg font-medium text-primary">Лице за контакт</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <FormItem>
              <Label htmlFor="firstName" className="mb-2">
                Име
              </Label>
              <Input
                id="firstName"
                {...register('firstName', { required: 'Името е задължително.' })}
                type="text"
              />
              {errors.firstName && <FormError message={errors.firstName.message} />}
            </FormItem>

            <FormItem>
              <Label htmlFor="lastName" className="mb-2">
                Фамилия
              </Label>
              <Input
                id="lastName"
                {...register('lastName', { required: 'Фамилията е задължителна.' })}
                type="text"
              />
              {errors.lastName && <FormError message={errors.lastName.message} />}
            </FormItem>
          </div>

          <FormItem>
            <Label htmlFor="email" className="mb-2">
              Имейл адрес
            </Label>
            <Input
              id="email"
              {...register('email', { required: 'Имейлът е задължителен.' })}
              type="email"
            />
            {errors.email && <FormError message={errors.email.message} />}
          </FormItem>

          <div className="grid gap-6 md:grid-cols-2">
            <FormItem>
              <Label htmlFor="password" className="mb-2">
                Нова парола
              </Label>
              <Input
                id="password"
                {...register('password', { required: 'Паролата е задължителна.' })}
                type="password"
              />
              {errors.password && <FormError message={errors.password.message} />}
            </FormItem>

            <FormItem>
              <Label htmlFor="passwordConfirm" className="mb-2">
                Потвърди паролата
              </Label>
              <Input
                id="passwordConfirm"
                {...register('passwordConfirm', {
                  required: 'Моля, потвърдете паролата.',
                  validate: (value) => value === password.current || 'Паролите не съвпадат',
                })}
                type="password"
              />
              {errors.passwordConfirm && <FormError message={errors.passwordConfirm.message} />}
            </FormItem>
          </div>
        </section>
      </div>
      <Button
        className="h-12 rounded-md bg-[rgb(0,126,229)] px-9 text-sm font-normal text-white hover:bg-[rgb(0,113,206)]"
        disabled={loading}
        type="submit"
        variant="default"
      >
        {loading ? 'Обработва се' : 'Създай профил'}
      </Button>

      <div className="mt-8 text-sm text-primary/65">
        <p>
          {'Вече имате профил? '}
          <Link
            className="text-[rgb(0,126,229)] hover:text-[rgb(0,113,206)]"
            href={`/login${allParams}`}
          >
            Вход
          </Link>
        </p>
      </div>
    </form>
  )
}
