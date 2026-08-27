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

export function getBaseUrl(): string {
  // 1. Dynamic check in browser runtime
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname
    if (host && (host.includes('onrender.com') || host.includes('render.com'))) {
      return 'https://note-insight-backend.onrender.com'
    }
  }
  // 2. Build-time environment variable
  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '' && !envUrl.includes('localhost')) {
    return envUrl.trim().replace(/\/+$/, '')
  }
  return 'http://localhost:8000'
}

const apiClient = axios.create()

// ── Auth & URL interceptor ───────────────────────────────────────────────────
// Attach the dynamic baseURL and the Firebase ID token to every outgoing request.
apiClient.interceptors.request.use(async (config) => {
  config.baseURL = getBaseUrl()
  const user = auth.currentUser
  if (user) {
    const token = await user.getIdToken()
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// ── Error normaliser ───────────────────────────────────────────────────────────
export function extractErrorMessage(err: unknown): string {
  const currentBaseUrl = getBaseUrl()
  if (err instanceof AxiosError) {
    if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
      return `Network Error: Unable to reach backend API at ${currentBaseUrl}.`
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

// ── Backend wake-up ────────────────────────────────────────────────────────────
// Render free-tier services spin down after ~15 min of inactivity.
// Pinging /healthz on app load gives the service time to wake before the user
// makes a real request, avoiding the "Unable to reach backend" error.
export function pingBackend(): void {
  fetch(`${getBaseUrl()}/healthz`).catch(() => {
    // Intentionally silent – this is just a warm-up ping.
  })
}

/** Returns true when the error is a raw network failure (backend unreachable / sleeping). */
export function isNetworkError(err: unknown): boolean {
  return (
    err instanceof AxiosError &&
    (err.code === 'ERR_NETWORK' || err.message === 'Network Error')
  )
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
