'use client'

import type { TextFieldClientComponent } from 'payload'

import { Button, FieldLabel, TextInput, useField, useTranslation } from '@payloadcms/ui'
import React, { useState } from 'react'

export const LockableTextField: TextFieldClientComponent = ({
  field,
  path,
  readOnly: readOnlyFromProps,
}) => {
  const { t } = useTranslation()
  const resolvedPath = path || field.name
  const { setValue, value } = useField<string>({ path: resolvedPath })
  const [isLocked, setIsLocked] = useState(true)
  const isReadOnly = Boolean(readOnlyFromProps)

  return (
    <div className="field-type">
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: '0.75rem',
          justifyContent: 'space-between',
          marginBottom: '0.5rem',
        }}
      >
        <FieldLabel htmlFor={`field-${resolvedPath}`} label={field.label || field.name} />
        {!isReadOnly && (
          <Button
            buttonStyle="none"
            className="lock-button"
            onClick={(event) => {
              event.preventDefault()
              setIsLocked((current) => !current)
            }}
          >
            {isLocked ? t('general:unlock') : t('general:lock')}
          </Button>
        )}
      </div>
      <TextInput
        onChange={setValue}
        path={resolvedPath}
        readOnly={isReadOnly || isLocked}
        value={value}
      />
    </div>
  )
}
