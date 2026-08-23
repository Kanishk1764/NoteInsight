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

function getBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '')
  }
  // Smart fallback when deployed on Render if build env var was missed
  if (typeof window !== 'undefined' && window.location.hostname.includes('onrender.com')) {
    return 'https://note-insight-backend.onrender.com'
  }
  return 'http://localhost:8000'
}

const BASE_URL = getBaseUrl()

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
    if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
      return `Network Error: Unable to connect to backend at ${BASE_URL}. Please check CORS and backend status.`
    }
    const detail = err.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) return detail.map((d: { msg: string }) => d.msg).join(', ')
    if (err.response?.status === 401) return 'Authentication error. Please sign in again.'
    if (err.response?.status === 403) return 'Access denied. You do not have permission to access this note.'
    if (err.response?.status === 404) return 'Note or analysis not found.'
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
