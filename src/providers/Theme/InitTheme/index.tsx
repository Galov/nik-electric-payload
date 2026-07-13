import Script from 'next/script'
import React from 'react'

import { defaultTheme } from '../shared'

export const InitTheme: React.FC = () => {
  return (
    // eslint-disable-next-line @next/next/no-before-interactive-script-outside-document
    <Script
      dangerouslySetInnerHTML={{
        __html: `
  (function () {
    document.documentElement.setAttribute('data-theme', '${defaultTheme}')
  })();
  `,
      }}
      id="theme-script"
      strategy="beforeInteractive"
    />
  )
}
