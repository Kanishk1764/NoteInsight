import { useState } from 'react'
import type { ReviewedCondition, DocumentationStatus } from '../types/api'
import ConfidenceBar from './ConfidenceBar'

interface Props {
  condition: ReviewedCondition
  index: number
  onChange: (index: number, updated: ReviewedCondition) => void
}

export default function ConditionCard({ condition, index, onChange }: Props) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(condition.name)
  const [editIcd10, setEditIcd10] = useState(condition.suggestedIcd10)
  const [editStatus, setEditStatus] = useState<DocumentationStatus>(condition.documentationStatus)

  const handleReject = () => {
    onChange(index, { ...condition, rejected: !condition.rejected })
  }

  const handleSaveEdit = () => {
    onChange(index, {
      ...condition,
      name: editName,
      suggestedIcd10: editIcd10,
      documentationStatus: editStatus,
      edited: true,
      humanCorrectedFields: {
        name: editName !== condition.name ? editName : undefined,
        suggestedIcd10: editIcd10 !== condition.suggestedIcd10 ? editIcd10 : undefined,
        documentationStatus: editStatus !== condition.documentationStatus ? editStatus : undefined,
      },
    })
    setEditing(false)
  }

  const displayName = condition.humanCorrectedFields?.name ?? condition.name
  const displayIcd10 = condition.humanCorrectedFields?.suggestedIcd10 ?? condition.suggestedIcd10
  const displayStatus = condition.humanCorrectedFields?.documentationStatus ?? condition.documentationStatus

  return (
    <div className={`condition-card${condition.rejected ? ' rejected' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ flex: 1 }}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <input
                className="input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Condition name"
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  className="input"
                  value={editIcd10}
                  onChange={(e) => setEditIcd10(e.target.value)}
                  placeholder="ICD-10 code"
                  style={{ flex: 1 }}
                />
                <select
                  className="input"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as DocumentationStatus)}
                  style={{ flex: 1 }}
                >
                  <option value="documented">Documented</option>
                  <option value="implied">Implied</option>
                  <option value="absent">Absent</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary btn-sm" onClick={handleSaveEdit}>Save</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.9375rem' }}>{displayName}</strong>
                {condition.addedByHuman && (
                  <span className="badge" style={{ background: '#ede9fe', color: '#5b21b6', fontSize: '0.7rem' }}>Added by clinician</span>
                )}
                {condition.edited && (
                  <span className="badge" style={{ background: '#e0f2fe', color: '#075985', fontSize: '0.7rem' }}>Edited</span>
                )}
                <span className="badge" style={{
                  background: displayStatus === 'documented' ? '#d1fae5' : displayStatus === 'implied' ? '#fef3c7' : '#fee2e2',
                  color: displayStatus === 'documented' ? '#065f46' : displayStatus === 'implied' ? '#92400e' : '#991b1b',
                  fontSize: '0.7rem'
                }}>
                  {displayStatus}
                </span>
              </div>
              <div style={{ marginTop: '0.25rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                ICD-10: <code>{displayIcd10}</code>
              </div>
              <ConfidenceBar value={condition.confidence} />
            </>
          )}
        </div>

        {!editing && (
          <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setEditing(true)}
              disabled={condition.rejected}
            >
              Edit
            </button>
            <button
              className={`btn btn-sm ${condition.rejected ? 'btn-ghost' : 'btn-danger'}`}
              onClick={handleReject}
            >
              {condition.rejected ? 'Restore' : 'Reject'}
            </button>
          </div>
        )}
      </div>

      {/* Evidence quote */}
      {!editing && (
        <div>
          {!condition.quoteVerified && (
            <div className="badge badge-unverified" style={{ marginBottom: '0.25rem', borderRadius: 'var(--radius)' }}>
              ⚠ Quote not verified — may not appear verbatim in the note
            </div>
          )}
          <div className={`evidence-quote${condition.quoteVerified ? '' : ' unverified'}`}>
            "{condition.evidenceQuote}"
          </div>
        </div>
      )}
    </div>
  )
}
