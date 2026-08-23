import axios, { AxiosError } from 'axios'
import { auth } from '../firebase'
import type {
  CreateNoteRequest,
  CreateNoteResponse,
  NoteDetail,
  NotesListResponse,
  Review,
  SubmitReviewRequest,
} from '../types/api'

const RAW_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').trim()
const BASE_URL = RAW_BASE_URL.replace(/\/+$/, '')

const apiClient = axios.create({
  baseURL: BASE_URL,
})

// ── Auth interceptor ───────────────────────────────────────────────────────────
// Attach the Firebase ID token to every outgoing request.
apiClient.interceptors.request.use(async (config) => {
  const user = auth.currentUser
  if (user) {
    const token = await user.getIdToken()
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// ── Error normaliser ───────────────────────────────────────────────────────────
export function extractErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const detail = err.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) return detail.map((d: { msg: string }) => d.msg).join(', ')
  }
  if (err instanceof Error) return err.message
  return 'An unexpected error occurred.'
}

// ── API methods ────────────────────────────────────────────────────────────────

export async function createNote(body: CreateNoteRequest): Promise<CreateNoteResponse> {
  const res = await apiClient.post<CreateNoteResponse>('/api/notes', body)
  return res.data
}

export async function listNotes(
  page = 1,
  pageSize = 20,
): Promise<NotesListResponse> {
  const res = await apiClient.get<NotesListResponse>('/api/notes', {
    params: { page, pageSize },
  })
  return res.data
}

export async function getNote(noteId: string): Promise<NoteDetail> {
  const res = await apiClient.get<NoteDetail>(`/api/notes/${noteId}`)
  return res.data
}

export async function reanalyzeNote(noteId: string): Promise<CreateNoteResponse> {
  const res = await apiClient.post<CreateNoteResponse>(`/api/notes/${noteId}/analyze`)
  return res.data
}

export async function submitReview(
  analysisId: string,
  body: SubmitReviewRequest,
): Promise<Review> {
  const res = await apiClient.patch<Review>(`/api/analyses/${analysisId}/review`, body)
  return res.data
}
