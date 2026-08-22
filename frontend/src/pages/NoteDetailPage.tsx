import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useNoteDetail } from '../hooks/useNoteDetail'
import { submitReview, extractErrorMessage } from '../api/client'
import type { ReviewedCondition, AnalysisCondition } from '../types/api'
import Spinner from '../components/Spinner'
import ErrorAlert from '../components/ErrorAlert'
import ConditionCard from '../components/ConditionCard'
import ConfidenceBar from '../components/ConfidenceBar'

function analysisConditionToReviewed(c: AnalysisCondition): ReviewedCondition {
  return { ...c, edited: false, rejected: false, addedByHuman: false }
}

type TabType = 'review' | 'diff' | 'ai_snapshot' | 'raw_note'

export default function NoteDetailPage() {
  const { noteId } = useParams<{ noteId: string }>()
  const navigate = useNavigate()
  const { data, loading, error, reanalyzing, reanalyzeError, triggerReanalyze } =
    useNoteDetail(noteId ?? '')

  const [activeTab, setActiveTab] = useState<TabType>('review')
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
      const res = await submitReview(data.analysis.id, { reviewedConditions: conditions })
      setSaved(true)
      if (data) {
        data.note.reviewStatus = 'reviewed'
        data.review = res
      }
    } catch (err) {
      setSaveError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Loading note & analysis…" />
  if (error) return <ErrorAlert message={error} />
  if (!data) return null

  const { note, analysis, review } = data
  const analysisStatus = analysis?.status ?? 'failed'

  const activeCount = conditions.filter((c) => !c.rejected).length
  const editedCount = conditions.filter((c) => c.edited).length
  const rejectedCount = conditions.filter((c) => c.rejected).length
  const addedCount = conditions.filter((c) => c.addedByHuman).length

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {note.pseudonym || 'Untitled Note'}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
            {note.visitDate ? `Visit: ${note.visitDate}` : 'No visit date'}
            {' · '}
            Submitted: {new Date(note.createdAt).toLocaleDateString()}
            {' · '}
            <span className={`badge badge-${note.reviewStatus}`}>
              {note.reviewStatus}
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>
            ← Back to History
          </button>
          <Link to="/notes/new" className="btn btn-primary btn-sm">
            + New Note
          </Link>
        </div>
      </div>

      {/* Post-Save Success Notification Banner */}
      {saved && (
        <div
          className="alert"
          style={{
            background: '#ecfdf5',
            color: '#065f46',
            borderColor: '#a7f3d0',
            marginBottom: '1.5rem',
            padding: '1rem 1.25rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <strong style={{ fontSize: '0.9375rem' }}>✓ Review Saved Successfully!</strong>
              <p style={{ fontSize: '0.8125rem', marginTop: '0.25rem', color: '#047857' }}>
                Your corrections have been recorded. You can return to history or process the next note.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-ghost btn-sm" style={{ background: '#ffffff' }} onClick={() => navigate('/')}>
                ← View Note History
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/notes/new')}>
                + Next Note
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* ── Tabs Navigation ────────────────────────────────────────────── */}
      <div className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'review' ? 'active' : ''}`}
          onClick={() => setActiveTab('review')}
        >
          Clinician Review
          <span className="badge badge-reviewed" style={{ fontSize: '0.6875rem' }}>
            {activeCount} active
          </span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'diff' ? 'active' : ''}`}
          onClick={() => setActiveTab('diff')}
        >
          AI vs Human Diff
          {(editedCount > 0 || rejectedCount > 0 || addedCount > 0) && (
            <span className="badge" style={{ background: '#ede9fe', color: '#6d28d9', fontSize: '0.6875rem' }}>
              {editedCount + rejectedCount + addedCount} changes
            </span>
          )}
        </button>

        <button
          className={`tab-btn ${activeTab === 'ai_snapshot' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai_snapshot')}
        >
          Original AI Snapshot
        </button>

        <button
          className={`tab-btn ${activeTab === 'raw_note' ? 'active' : ''}`}
          onClick={() => setActiveTab('raw_note')}
        >
          Raw Clinical Note
        </button>
      </div>

      {/* ── TAB 1: CLINICIAN REVIEW ───────────────────────────────────── */}
      {activeTab === 'review' && (
        <div>
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
                Conditions ({activeCount} active{rejectedCount > 0 ? `, ${rejectedCount} rejected` : ''})
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={handleAddCondition}>
                + Add Missing Condition
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
                  <li key={i} style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>{gap}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Save Review Section */}
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Save & Finalize Review</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.875rem' }}>
              Saving preserves your changes in a separate <code>reviews</code> record while keeping the original AI snapshot untouched.
              {review && ` Last reviewed: ${new Date(review.reviewedAt).toLocaleString()}`}
            </p>
            {saveError && <ErrorAlert message={saveError} onDismiss={() => setSaveError(null)} />}
            
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button
                className="btn btn-primary"
                onClick={() => void handleSaveReview()}
                disabled={saving || !analysis}
              >
                {saving ? 'Saving…' : 'Save Review'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => navigate('/')}
              >
                Back to History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: AI VS HUMAN DIFF ───────────────────────────────────── */}
      {activeTab === 'diff' && (
        <div className="card">
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Audit Trail: Model vs. Human Review
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
            Comparing the original AI model predictions against clinician adjustments.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div style={{ padding: '0.75rem', background: 'var(--color-bg)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{analysis?.conditions.length ?? 0}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>AI Extracted</div>
            </div>
            <div style={{ padding: '0.75rem', background: 'var(--color-bg)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0284c7' }}>{editedCount}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Edited by Human</div>
            </div>
            <div style={{ padding: '0.75rem', background: 'var(--color-bg)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#dc2626' }}>{rejectedCount}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Rejected by Human</div>
            </div>
            <div style={{ padding: '0.75rem', background: 'var(--color-bg)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#7c3aed' }}>{addedCount}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Added by Human</div>
            </div>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Condition</th>
                  <th>Status / ICD-10</th>
                  <th>Origin</th>
                  <th>Human Action</th>
                </tr>
              </thead>
              <tbody>
                {conditions.map((c, i) => (
                  <tr key={i} style={{ opacity: c.rejected ? 0.5 : 1 }}>
                    <td>
                      <strong>{c.name || 'Unnamed condition'}</strong>
                      {c.humanCorrectedFields?.name && (
                        <div style={{ fontSize: '0.75rem', color: '#0284c7' }}>
                          Renamed from: <em>{c.name}</em>
                        </div>
                      )}
                    </td>
                    <td>
                      <code>{c.suggestedIcd10 || '—'}</code>
                      {' · '}
                      <span className="badge" style={{ fontSize: '0.65rem' }}>{c.documentationStatus}</span>
                    </td>
                    <td>
                      {c.addedByHuman ? (
                        <span className="badge" style={{ background: '#ede9fe', color: '#6d28d9' }}>Clinician Added</span>
                      ) : (
                        <span className="badge" style={{ background: '#dbeafe', color: '#1e40af' }}>AI Predicted</span>
                      )}
                    </td>
                    <td>
                      {c.rejected ? (
                        <span className="badge badge-failed">Rejected</span>
                      ) : c.edited ? (
                        <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1' }}>Edited</span>
                      ) : c.addedByHuman ? (
                        <span className="badge" style={{ background: '#ede9fe', color: '#6d28d9' }}>Added</span>
                      ) : (
                        <span className="badge badge-reviewed">Accepted As-Is</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 3: ORIGINAL AI SNAPSHOT ───────────────────────────────── */}
      {activeTab === 'ai_snapshot' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>
              Immutable AI Snapshot
            </h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              Model: <code>{analysis?.modelVersion}</code> · Prompt: <code>v{analysis?.promptVersion}</code>
            </span>
          </div>

          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
            This record is frozen and never mutated by human edits. It represents the exact original output from Gemini.
          </p>

          {analysis?.conditions && analysis.conditions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {analysis.conditions.map((cond, i) => (
                <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{cond.name}</strong>
                    <span className="badge" style={{ fontSize: '0.7rem' }}>{cond.documentationStatus}</span>
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                    Suggested ICD-10: <code>{cond.suggestedIcd10}</code>
                  </div>
                  <ConfidenceBar value={cond.confidence} />
                  <div className={`evidence-quote${cond.quoteVerified ? '' : ' unverified'}`} style={{ marginTop: '0.5rem' }}>
                    "{cond.evidenceQuote}"
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>No AI conditions recorded.</p>
          )}
        </div>
      )}

      {/* ── TAB 4: RAW CLINICAL NOTE ──────────────────────────────────── */}
      {activeTab === 'raw_note' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Raw Clinical Note Text</h2>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => void navigator.clipboard.writeText(note.rawText)}
            >
              Copy Text
            </button>
          </div>
          <pre
            style={{
              background: 'var(--color-bg)',
              padding: '1.25rem',
              borderRadius: 'var(--radius)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.875rem',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              border: '1px solid var(--color-border)',
            }}
          >
            {note.rawText}
          </pre>
        </div>
      )}
    </div>
  )
}

