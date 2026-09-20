'use client'
import React, { useState } from 'react'
import { useDocumentInfo, useFormFields } from '@payloadcms/ui'

export const OrderDeliveryActions = () => {
  const { id } = useDocumentInfo()
  const state = useFormFields(([fields]) => ({
    mi: fields.miOrderExportStatus?.value,
    phase: fields.miOrderExportFailurePhase?.value,
    miAttempt: fields.miOrderExportAttemptId?.value,
    bg: fields.ibisStockSyncStatus?.value,
    bgAttempt: fields.ibisStockSyncAttemptId?.value,
  }))
  const [reason, setReason] = useState('')
  const [reconciled, setReconciled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!id) return null
  const send = async (action: string) => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(String(id))}/delivery-action`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            reason,
            reconciled,
            expectedAttemptId: (action === 'retry-bg' ? state.bgAttempt : state.miAttempt) || null,
          }),
        },
      )
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      window.location.reload()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Неуспешно действие. Обновете поръчката.')
      setBusy(false)
    }
  }
  const canSend = state.mi === 'pending' || (state.mi === 'failed' && state.phase === 'before-send')
  const uncertain =
    state.mi === 'unknown' ||
    state.mi === 'sending' ||
    (state.mi === 'failed' && state.phase !== 'before-send')
  const disabled = busy || !reason.trim()
  return (
    <div style={{ marginBottom: 24 }}>
      <h3>Възстановяване на изпращането</h3>
      <p>
        Действията се записват с Вашето име и часа. Те не създават поръчка и не променят
        наличността.
      </p>
      <label>
        Основание / резултат от сверяването
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      {canSend && (
        <button type="button" disabled={disabled} onClick={() => send('send-mi')}>
          Изпрати към МИ
        </button>
      )}
      {uncertain && (
        <div>
          <p>Първо сверете поръчката с МИ. За започнато изпращане изчакайте поне 60 секунди.</p>
          <label>
            <input
              type="checkbox"
              checked={reconciled}
              onChange={(e) => setReconciled(e.target.checked)}
            />
            Сверих резултата с МИ и записах основанието.
          </label>
          <button
            type="button"
            disabled={disabled || !reconciled}
            onClick={() => send('confirm-mi-accepted')}
          >
            Потвърди приемането от МИ
          </button>
          <button
            type="button"
            disabled={disabled || !reconciled}
            onClick={() => send('authorize-mi-retry')}
          >
            Разреши ново изпращане след сверяване
          </button>
        </div>
      )}
      {['pending', 'failed', 'sending'].includes(String(state.bg)) && (
        <button type="button" disabled={disabled} onClick={() => send('retry-bg')}>
          Изпрати текущите наличности към BG
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
