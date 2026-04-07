import { generatePayloadCookie } from 'payload'

import { verifyWordPressPassword } from '@/utilities/verifyWordPressPassword'

type LegacyAuthUser = {
  approved?: boolean | null
  email?: null | string
  id: number | string
  legacyWPPasswordHash?: null | string
}

const jsonError = (message: string, status: number) =>
  Response.json(
    {
      errors: [{ message }],
    },
    { status },
  )

export const legacyLogin = async (req: any) => {
  let body: { email?: unknown; password?: unknown } = {}

  try {
    body = (await req.json()) as { email?: unknown; password?: unknown }
  } catch {
    body = (req.data || {}) as { email?: unknown; password?: unknown }
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email) {
    return jsonError('Имейлът е задължителен.', 400)
  }

  if (!password.trim()) {
    return jsonError('Паролата е задължителна.', 400)
  }

  try {
    const result = await req.payload.login({
      collection: 'users',
      data: {
        email,
        password,
      },
      req,
    })

    const cookie = generatePayloadCookie({
      collectionAuthConfig: req.payload.collections.users.config.auth,
      cookiePrefix: req.payload.config.cookiePrefix,
      token: result.token!,
    })

    return Response.json(
      {
        message: req.t('authentication:passed'),
        ...result,
      },
      {
        headers: new Headers({
          'Set-Cookie': cookie,
        }),
        status: 200,
      },
    )
  } catch (error) {
    const legacyUser = (await req.payload.find({
      collection: 'users',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      select: {
        approved: true,
        email: true,
        legacyWPPasswordHash: true,
      },
      showHiddenFields: true,
      where: {
        email: {
          equals: email,
        },
      },
    })) as { docs: LegacyAuthUser[] }

    const user = legacyUser.docs[0]

    if (!user || !user.legacyWPPasswordHash || !verifyWordPressPassword(password, user.legacyWPPasswordHash)) {
      if (error instanceof Error) {
        return jsonError(error.message || 'Възникна проблем при входа.', 401)
      }

      return jsonError('Възникна проблем при входа.', 401)
    }

    await req.payload.update({
      id: user.id,
      collection: 'users',
      data: {
        legacyPasswordMigratedAt: new Date().toISOString(),
        legacyWPPasswordHash: null,
        password,
      },
      overrideAccess: true,
      req,
      showHiddenFields: true,
    })

    const result = await req.payload.login({
      collection: 'users',
      data: {
        email,
        password,
      },
      req,
    })

    const cookie = generatePayloadCookie({
      collectionAuthConfig: req.payload.collections.users.config.auth,
      cookiePrefix: req.payload.config.cookiePrefix,
      token: result.token!,
    })

    return Response.json(
      {
        message: req.t('authentication:passed'),
        ...result,
      },
      {
        headers: new Headers({
          'Set-Cookie': cookie,
        }),
        status: 200,
      },
    )
  }
}
