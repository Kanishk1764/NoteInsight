import { useState, useRef, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createNote, extractErrorMessage, isNetworkError } from '../api/client'
import ErrorAlert from '../components/ErrorAlert'

const MAX_WORDS = 5000

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export default function NewNotePage() {
  const navigate = useNavigate()
  const [rawText, setRawText] = useState('')
  const [pseudonym, setPseudonym] = useState('')
  const [visitDate, setVisitDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isNetErr, setIsNetErr] = useState(false)
  // Stores the last submitted payload so the Retry button can re-send it.
  const lastSubmitRef = useRef<{ rawText: string; pseudonym: string; visitDate: string } | null>(null)

  const wordCount = countWords(rawText)
  const isOverLimit = wordCount > MAX_WORDS

  const submit = async (payload: { rawText: string; pseudonym: string; visitDate: string }) => {
    setLoading(true)
    setError(null)
    setIsNetErr(false)
    try {
      const result = await createNote({
        rawText: payload.rawText,
        pseudonym: payload.pseudonym || undefined,
        visitDate: payload.visitDate || undefined,
      })
      navigate(`/notes/${result.note.id}`)
    } catch (err) {
      setIsNetErr(isNetworkError(err))
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!rawText.trim()) {
      setError('Please paste a clinical note before submitting.')
      return
    }
    const payload = { rawText, pseudonym, visitDate }
    lastSubmitRef.current = payload
    await submit(payload)
  }

  const handleRetry = () => {
    if (lastSubmitRef.current) {
      void submit(lastSubmitRef.current)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">New Clinical Note</h1>
      </div>

      {error && (
        <ErrorAlert
          message={error}
          hint={isNetErr ? 'The server may be waking up (free-tier cold start). Please wait a moment and try again.' : undefined}
          onDismiss={() => { setError(null); setIsNetErr(false) }}
          onRetry={isNetErr ? handleRetry : undefined}
        />
      )}

      {loading && (
        <div className="alert alert-info">
          <strong>Analysing…</strong> Sending your note to Gemini for structured extraction.
          This usually takes 5–10 seconds. Please do not close this page.
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)}>
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Patient Info (optional)</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="pseudonym">Pseudonym / Reference</label>
              <input
                id="pseudonym"
                type="text"
                className="input"
                value={pseudonym}
                onChange={(e) => setPseudonym(e.target.value)}
                placeholder="e.g. Patient-A, Case-001"
                maxLength={200}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="visitDate">Visit Date</label>
              <input
                id="visitDate"
                type="date"
                className="input"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <label htmlFor="rawText" style={{ fontSize: '1rem', fontWeight: 600 }}>Clinical Note</label>
            <span style={{ fontSize: '0.8125rem', color: isOverLimit ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
              {wordCount.toLocaleString()} / {MAX_WORDS.toLocaleString()} words
            </span>
          </div>
          <textarea
            id="rawText"
            className="input"
            style={{ minHeight: '300px' }}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste the free-text clinical note here…"
            disabled={loading}
          />
          {isOverLimit && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--color-warning)' }}>
              ⚠ Note exceeds {MAX_WORDS} words. The backend will truncate it before sending to Gemini.
            </p>
          )}
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !rawText.trim()}
          >
            {loading ? 'Analysing…' : 'Analyse Note'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate('/')}
            disabled={loading}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
