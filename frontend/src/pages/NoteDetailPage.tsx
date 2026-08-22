import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useNoteDetail } from '../hooks/useNoteDetail'
import { submitReview, extractErrorMessage } from '../api/client'
import type { ReviewedCondition, AnalysisCondition } from '../types/api'
import Spinner from '../components/Spinner'
import ErrorAlert from '../components/ErrorAlert'
import ConditionCard from '../components/ConditionCard'

function analysisConditionToReviewed(c: AnalysisCondition): ReviewedCondition {
  return { ...c, edited: false, rejected: false, addedByHuman: false }
}

export default function NoteDetailPage() {
  const { noteId } = useParams<{ noteId: string }>()
  const navigate = useNavigate()
  const { data, loading, error, reanalyzing, reanalyzeError, triggerReanalyze } =
    useNoteDetail(noteId ?? '')

  const [conditions, setConditions] = useState<ReviewedCondition[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Seed conditions when data loads
  useEffect(() => {
    if (!data) return
    if (data.review) {
      setConditions(data.review.reviewedConditions)
    } else if (data.analysis?.conditions) {
      setConditions(data.analysis.conditions.map(analysisConditionToReviewed))
    }
  }, [data])

  const handleConditionChange = (index: number, updated: ReviewedCondition) => {
    setConditions((prev) => prev.map((c, i) => (i === index ? updated : c)))
    setSaved(false)
  }

  const handleAddCondition = () => {
    const blank: ReviewedCondition = {
      name: '',
      evidenceQuote: '',
      quoteVerified: false,
      documentationStatus: 'documented',
      suggestedIcd10: '',
      confidence: 1.0,
      edited: false,
      rejected: false,
      addedByHuman: true,
    }
    setConditions((prev) => [...prev, blank])
    setSaved(false)
  }

  const handleSaveReview = async () => {
    if (!data?.analysis) return
    setSaving(true)
    setSaveError(null)
    try {
      await submitReview(data.analysis.id, { reviewedConditions: conditions })
      setSaved(true)
    } catch (err) {
      setSaveError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Loading note…" />
  if (error) return <ErrorAlert message={error} />
  if (!data) return null

  const { note, analysis, review } = data
  const analysisStatus = analysis?.status ?? 'failed'

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {note.pseudonym ?? 'Untitled Note'}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            {note.visitDate ? `Visit: ${note.visitDate}` : 'No visit date'}
            {' · '}
            Created: {new Date(note.createdAt).toLocaleDateString()}
            {' · '}
            <span className={`badge badge-${note.reviewStatus}`}>
              {note.reviewStatus}
            </span>
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>
          ← Back to History
        </button>
      </div>

      {/* Analysis status banner */}
      {analysisStatus !== 'success' && (
        <div className={`alert ${analysisStatus === 'failed' ? 'alert-error' : 'alert-warning'}`}>
          <strong>
            {analysisStatus === 'failed'
              ? '⚠ Analysis failed — '
              : '⚠ Analysis may be incomplete — '}
          </strong>
          {analysisStatus === 'failed'
            ? 'Gemini could not process this note. You can retry below.'
            : 'The model response could not be fully parsed. Results may be partial.'}
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: '0.75rem' }}
            onClick={() => void triggerReanalyze()}
            disabled={reanalyzing}
          >
            {reanalyzing ? 'Retrying…' : 'Retry Analysis'}
          </button>
        </div>
      )}

      {reanalyzeError && <ErrorAlert message={reanalyzeError} />}

      {/* Summary */}
      {analysis?.summary && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Encounter Summary</h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.6 }}>{analysis.summary}</p>
        </div>
      )}

      {/* Conditions */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>
            Conditions ({conditions.filter((c) => !c.rejected).length} active)
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={handleAddCondition}>
            + Add Condition
          </button>
        </div>

        {conditions.length === 0 && (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            No conditions extracted.
          </p>
        )}

        {conditions.map((cond, i) => (
          <ConditionCard
            key={i}
            condition={cond}
            index={i}
            onChange={handleConditionChange}
          />
        ))}
      </div>

      {/* Documentation Gaps */}
      {analysis?.documentationGaps && analysis.documentationGaps.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Documentation Gaps</h2>
          <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {analysis.documentationGaps.map((gap, i) => (
              <li key={i} style={{ fontSize: '0.875rem' }}>{gap}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Save Review */}
      <div className="card">
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Save Review</h2>
        {review && (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
            Last reviewed: {new Date(review.reviewedAt).toLocaleString()}
          </p>
        )}
        {saveError && <ErrorAlert message={saveError} onDismiss={() => setSaveError(null)} />}
        {saved && (
          <div className="alert" style={{ background: '#d1fae5', color: '#065f46', borderColor: '#6ee7b7', marginBottom: '0.75rem' }}>
            ✓ Review saved successfully.
          </div>
        )}
        <button
          className="btn btn-primary"
          onClick={() => void handleSaveReview()}
          disabled={saving || !analysis}
        >
          {saving ? 'Saving…' : 'Save Review'}
        </button>
      </div>
    </div>
  )
}
