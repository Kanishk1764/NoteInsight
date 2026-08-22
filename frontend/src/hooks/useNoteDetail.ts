import { useState, useEffect, useCallback } from 'react'
import { getNote, reanalyzeNote, extractErrorMessage } from '../api/client'
import type { NoteDetail, CreateNoteResponse } from '../types/api'

export interface NoteDetailState {
  data: NoteDetail | null
  loading: boolean
  error: string | null
  reanalyzing: boolean
  reanalyzeError: string | null
  refetch: () => void
  triggerReanalyze: () => Promise<void>
}

export function useNoteDetail(noteId: string): NoteDetailState {
  const [data, setData] = useState<NoteDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const detail = await getNote(noteId)
      setData(detail)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [noteId])

  useEffect(() => {
    void fetch()
  }, [fetch])

  const triggerReanalyze = async (): Promise<void> => {
    setReanalyzing(true)
    setReanalyzeError(null)
    try {
      const result: CreateNoteResponse = await reanalyzeNote(noteId)
      setData((prev) =>
        prev
          ? { ...prev, note: result.note, analysis: result.analysis, review: null }
          : null,
      )
    } catch (err) {
      setReanalyzeError(extractErrorMessage(err))
    } finally {
      setReanalyzing(false)
    }
  }

  return {
    data,
    loading,
    error,
    reanalyzing,
    reanalyzeError,
    refetch: () => void fetch(),
    triggerReanalyze,
  }
}
