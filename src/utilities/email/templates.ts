import { fromMinorUnits } from '@/utilities/money'

type EmailAction = {
  href: string
  label: string
}

type EmailRow = {
  label: string
  value?: null | number | string
}

type EmailTemplate = {
  html: string
  subject: string
  text: string
}

type OrderItem = {
  product?: string | { title?: null | string } | null
  productMIId?: null | number
  productSKU?: null | string
  productUnitPrice?: null | number
  quantity?: null | number
}

type OrderLike = {
  accessToken?: null | string
  amount?: null | number
  createdAt?: null | string
  customerEmail?: null | string
  id?: number | string
  items?: null | OrderItem[]
  miOrderExportLastError?: null | string
  partnerCode?: null | string
}

type UserLike = {
  companyCity?: null | string
  companyEIK?: null | string
  companyName?: null | string
  email?: null | string
  firstName?: null | string
  id?: number | string
  lastName?: null | string
  phone?: null | string
}

const brandName = 'Ник Електрик'
const brandColor = '#0f4c3a'
const ink = '#1f2933'
const muted = '#667085'
const surface = '#f4f0e8'

const escapeHTML = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const formatMoney = (value?: null | number) =>
  new Intl.NumberFormat('bg-BG', {
    currency: 'EUR',
    style: 'currency',
  }).format(fromMinorUnits(value))

const formatDate = (value?: null | string) => {
  if (!value) return ''

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) return ''

  return new Intl.DateTimeFormat('bg-BG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Sofia',
  }).format(parsed)
}

const getOrderLabel = (order: OrderLike) => `#${String(order.id || '').toUpperCase()}`

const getProductTitle = (item: OrderItem) => {
  if (item.product && typeof item.product === 'object' && item.product.title) {
    return item.product.title
  }

  return item.productSKU || 'Артикул'
}

const renderRows = (rows: EmailRow[]) =>
  rows
    .filter((row) => row.value !== null && row.value !== undefined && String(row.value).trim() !== '')
    .map(
      (row) => `
        <tr>
          <td style="padding: 10px 0; color: ${muted}; font-size: 14px;">${escapeHTML(row.label)}</td>
          <td style="padding: 10px 0; color: ${ink}; font-size: 14px; font-weight: 600; text-align: right;">${escapeHTML(row.value)}</td>
        </tr>
      `,
    )
    .join('')

const renderItems = (items?: null | OrderItem[]) => {
  if (!items?.length) {
    return '<p style="margin: 0; color: #667085; font-size: 14px;">Няма артикули.</p>'
  }

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
      <thead>
        <tr>
          <th align="left" style="border-bottom: 1px solid #e4ded2; color: ${muted}; font-size: 12px; font-weight: 700; padding: 0 0 10px; text-transform: uppercase;">Артикул</th>
          <th align="right" style="border-bottom: 1px solid #e4ded2; color: ${muted}; font-size: 12px; font-weight: 700; padding: 0 0 10px; text-transform: uppercase;">Бр.</th>
          <th align="right" style="border-bottom: 1px solid #e4ded2; color: ${muted}; font-size: 12px; font-weight: 700; padding: 0 0 10px; text-transform: uppercase;">Цена</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (item) => `
              <tr>
                <td style="border-bottom: 1px solid #eee9df; color: ${ink}; font-size: 14px; padding: 12px 0;">
                  <div style="font-weight: 700;">${escapeHTML(getProductTitle(item))}</div>
                  ${
                    item.productSKU || item.productMIId
                      ? `<div style="color: ${muted}; font-size: 12px; margin-top: 3px;">${escapeHTML([item.productSKU, item.productMIId ? `MI ${item.productMIId}` : ''].filter(Boolean).join(' / '))}</div>`
                      : ''
                  }
                </td>
                <td align="right" style="border-bottom: 1px solid #eee9df; color: ${ink}; font-size: 14px; padding: 12px 0;">${escapeHTML(item.quantity ?? '')}</td>
                <td align="right" style="border-bottom: 1px solid #eee9df; color: ${ink}; font-size: 14px; padding: 12px 0;">${escapeHTML(typeof item.productUnitPrice === 'number' ? `${item.productUnitPrice.toFixed(2)} EUR` : '-')}</td>
              </tr>
            `,
          )
          .join('')}
      </tbody>
    </table>
  `
}

const renderLayout = ({
  action,
  children,
  eyebrow,
  intro,
  title,
}: {
  action?: EmailAction
  children: string
  eyebrow: string
  intro: string
  title: string
}) => `
  <!doctype html>
  <html lang="bg">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHTML(title)}</title>
    </head>
    <body style="margin: 0; background: ${surface}; color: ${ink}; font-family: Georgia, 'Times New Roman', serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: ${surface}; padding: 32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #fffaf2; border: 1px solid #e5dccc; border-radius: 22px; max-width: 680px; overflow: hidden;">
              <tr>
                <td style="background: ${brandColor}; padding: 28px 32px;">
                  <div style="color: #d9f2df; font-family: Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;">${escapeHTML(eyebrow)}</div>
                  <h1 style="color: #fffaf2; font-size: 34px; font-weight: 400; line-height: 1.12; margin: 14px 0 0;">${escapeHTML(title)}</h1>
                </td>
              </tr>
              <tr>
                <td style="padding: 30px 32px 34px;">
                  <p style="color: ${ink}; font-family: Arial, sans-serif; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">${escapeHTML(intro)}</p>
                  ${children}
                  ${
                    action
                      ? `<div style="margin-top: 28px;"><a href="${escapeHTML(action.href)}" style="background: ${brandColor}; border-radius: 999px; color: #fffaf2; display: inline-block; font-family: Arial, sans-serif; font-size: 14px; font-weight: 700; padding: 13px 20px; text-decoration: none;">${escapeHTML(action.label)}</a></div>`
                      : ''
                  }
                  <p style="border-top: 1px solid #e5dccc; color: ${muted}; font-family: Arial, sans-serif; font-size: 12px; line-height: 1.6; margin: 30px 0 0; padding-top: 18px;">
                    ${escapeHTML(brandName)} изпраща това служебно съобщение автоматично.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
`

const renderSummaryCard = (rows: EmailRow[]) => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #fff; border: 1px solid #e5dccc; border-radius: 16px; margin: 0 0 24px; padding: 8px 18px;">
    ${renderRows(rows)}
  </table>
`

export const buildAdminOrderCreatedEmail = ({
  adminURL,
  order,
}: {
  adminURL: string
  order: OrderLike
}): EmailTemplate => {
  const orderLabel = getOrderLabel(order)
  const subject = `Нова поръчка ${orderLabel}`
  const text = `Има нова поръчка ${orderLabel}. Клиент: ${order.customerEmail || '-'}`

  return {
    subject,
    text,
    html: renderLayout({
      action: { href: adminURL, label: 'Отвори поръчката' },
      eyebrow: 'Нова поръчка',
      intro: 'В сайта е изпратена нова поръчка. Прегледайте я в админа и следете статуса на Microinvest export-а.',
      title: subject,
      children: `
        ${renderSummaryCard([
          { label: 'Клиент', value: order.customerEmail },
          { label: 'Партньор код', value: order.partnerCode },
          { label: 'Сума', value: formatMoney(order.amount) },
          { label: 'Създадена', value: formatDate(order.createdAt) },
        ])}
        ${renderItems(order.items)}
      `,
    }),
  }
}

export const buildCustomerOrderCreatedEmail = ({
  order,
  orderURL,
}: {
  order: OrderLike
  orderURL: string
}): EmailTemplate => {
  const orderLabel = getOrderLabel(order)
  const subject = `Получихме поръчка ${orderLabel}`
  const text = `Получихме поръчка ${orderLabel}. Можете да я прегледате тук: ${orderURL}`

  return {
    subject,
    text,
    html: renderLayout({
      action: { href: orderURL, label: 'Преглед на поръчката' },
      eyebrow: 'Поръчката е получена',
      intro: 'Благодарим Ви. Получихме заявката и ще я обработим възможно най-скоро.',
      title: subject,
      children: `
        ${renderSummaryCard([
          { label: 'Номер', value: orderLabel },
          { label: 'Сума', value: formatMoney(order.amount) },
          { label: 'Създадена', value: formatDate(order.createdAt) },
        ])}
        ${renderItems(order.items)}
      `,
    }),
  }
}

export const buildMicroinvestExportFailedEmail = ({
  adminURL,
  order,
}: {
  adminURL: string
  order: OrderLike
}): EmailTemplate => {
  const orderLabel = getOrderLabel(order)
  const subject = `Грешка при Microinvest export ${orderLabel}`
  const text = `Поръчка ${orderLabel} не беше изпратена към Microinvest. Грешка: ${order.miOrderExportLastError || '-'}`

  return {
    subject,
    text,
    html: renderLayout({
      action: { href: adminURL, label: 'Провери поръчката' },
      eyebrow: 'Нужна е проверка',
      intro: 'Поръчката не беше изпратена към Microinvest. Трябва човек да я провери в админа и да реши как да я обработи.',
      title: subject,
      children: `
        ${renderSummaryCard([
          { label: 'Клиент', value: order.customerEmail },
          { label: 'Партньор код', value: order.partnerCode },
          { label: 'Грешка', value: order.miOrderExportLastError },
        ])}
      `,
    }),
  }
}

export const buildCustomerRegistrationEmail = ({
  adminURL,
  user,
}: {
  adminURL: string
  user: UserLike
}): EmailTemplate => {
  const companyName = user.companyName || 'Нов клиент'
  const subject = `Нова регистрация: ${companyName}`
  const contactName = [user.firstName, user.lastName].filter(Boolean).join(' ')
  const text = `Има нова клиентска регистрация: ${companyName}. Имейл: ${user.email || '-'}`

  return {
    subject,
    text,
    html: renderLayout({
      action: { href: adminURL, label: 'Прегледай клиента' },
      eyebrow: 'Нова регистрация',
      intro: 'В сайта има нова регистрация. Клиентът трябва да бъде прегледан и одобрен от администратор.',
      title: subject,
      children: renderSummaryCard([
        { label: 'Фирма', value: companyName },
        { label: 'ЕИК', value: user.companyEIK },
        { label: 'Лице за контакт', value: contactName },
        { label: 'Имейл', value: user.email },
        { label: 'Телефон', value: user.phone },
        { label: 'Град', value: user.companyCity },
      ]),
    }),
  }
}

export const buildOrderAccessEmail = ({
  order,
  orderURL,
}: {
  order: OrderLike
  orderURL: string
}): EmailTemplate => {
  const orderLabel = getOrderLabel(order)
  const subject = `Достъп до поръчка ${orderLabel}`
  const text = `Можете да прегледате поръчка ${orderLabel} тук: ${orderURL}`

  return {
    subject,
    text,
    html: renderLayout({
      action: { href: orderURL, label: 'Отвори поръчката' },
      eyebrow: 'Преглед на поръчка',
      intro: 'Използвайте този линк, за да видите детайлите за поръчката си.',
      title: subject,
      children: renderSummaryCard([
        { label: 'Номер', value: orderLabel },
        { label: 'Създадена', value: formatDate(order.createdAt) },
        { label: 'Сума', value: formatMoney(order.amount) },
      ]),
    }),
  }
}

export const buildCustomerApprovedEmail = ({
  loginURL,
  user,
}: {
  loginURL: string
  user: UserLike
}): EmailTemplate => {
  const companyName = user.companyName || 'Вашият профил'
  const subject = 'Вашият акаунт е одобрен и активиран'
  const text = `Вашият акаунт в ${brandName} е одобрен и активиран. Можете да влезете от тук: ${loginURL}`

  return {
    subject,
    text,
    html: renderLayout({
      action: { href: loginURL, label: 'Вход в профила' },
      eyebrow: 'Акаунтът е активен',
      intro: 'Вашият акаунт беше прегледан, одобрен и активиран. Вече можете да влезете в сайта и да правите поръчки.',
      title: subject,
      children: renderSummaryCard([
        { label: 'Фирма', value: companyName },
        { label: 'Имейл', value: user.email },
      ]),
    }),
  }
}
