import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listNotes, extractErrorMessage, isNetworkError } from '../api/client'
import type { NoteListItem } from '../types/api'
import Spinner from '../components/Spinner'
import ErrorAlert from '../components/ErrorAlert'

export default function HistoryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<NoteListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isNetErr, setIsNetErr] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)

  const PAGE_SIZE = 20

  const fetchPage = async (p: number) => {
    setLoading(true)
    setError(null)
    setIsNetErr(false)
    try {
      const res = await listNotes(p, PAGE_SIZE)
      setItems(res.items)
      setHasMore(res.hasMore)
      setTotal(res.total)
      setPage(p)
    } catch (err) {
      setIsNetErr(isNetworkError(err))
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchPage(1)
  }, [])

  if (loading && items.length === 0) return <Spinner label="Loading history…" />

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Note History</h1>
        <button className="btn btn-primary" onClick={() => navigate('/notes/new')}>
          + New Note
        </button>
      </div>

      {error && (
        <ErrorAlert
          message={error}
          hint={isNetErr ? 'The server may be waking up (free-tier cold start). Please wait a moment and try again.' : undefined}
          onDismiss={() => { setError(null); setIsNetErr(false) }}
          onRetry={isNetErr ? () => void fetchPage(page) : undefined}
        />
      )}

      {total === 0 && !loading && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
            No notes yet. Create your first note to get started.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/notes/new')}>
            + New Note
          </button>
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Pseudonym</th>
                  <th>Visit Date</th>
                  <th>Created</th>
                  <th>Conditions</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} onClick={() => navigate(`/notes/${item.id}`)}>
                    <td>{item.pseudonym ?? <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</td>
                    <td>{item.visitDate ?? <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</td>
                    <td>{new Date(item.createdAt).toLocaleDateString()}</td>
                    <td>{item.conditionCount}</td>
                    <td>
                      <span className={`badge badge-${item.reviewStatus}`}>
                        {item.reviewStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} notes
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-ghost btn-sm"
                disabled={page === 1 || loading}
                onClick={() => void fetchPage(page - 1)}
              >
                ← Prev
              </button>
              <button
                className="btn btn-ghost btn-sm"
                disabled={!hasMore || loading}
                onClick={() => void fetchPage(page + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
