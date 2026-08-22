/**
 * Shared TypeScript interfaces that mirror the Pydantic models on the backend.
 * These are the single source of truth for the full API contract on the client side.
 * No `any` types — all shapes are explicitly defined.
 */

export type ReviewStatus = 'pending' | 'reviewed'
export type AnalysisStatus = 'success' | 'malformed' | 'failed'
export type DocumentationStatus = 'documented' | 'implied' | 'absent'

// ── Condition ──────────────────────────────────────────────────────────────────

export interface ConditionBase {
  name: string
  evidenceQuote: string
  quoteVerified: boolean
  documentationStatus: DocumentationStatus
  suggestedIcd10: string
  confidence: number
}

export interface AnalysisCondition extends ConditionBase {
  // Same fields as ConditionBase — typed separately to distinguish AI vs human
}

export interface HumanCorrectedFields {
  name?: string
  evidenceQuote?: string
  documentationStatus?: DocumentationStatus
  suggestedIcd10?: string
  confidence?: number
}

export interface ReviewedCondition extends ConditionBase {
  edited: boolean
  rejected: boolean
  addedByHuman: boolean
  humanCorrectedFields?: HumanCorrectedFields
}

// ── Analysis ───────────────────────────────────────────────────────────────────

export interface Analysis {
  id: string
  noteId: string
  userId: string
  createdAt: string
  modelVersion: string
  promptVersion: string
  status: AnalysisStatus
  conditions: AnalysisCondition[]
  documentationGaps: string[]
  summary: string
  rawModelOutput: string
}

// ── Review ─────────────────────────────────────────────────────────────────────

export interface Review {
  id: string
  analysisId: string
  noteId: string
  userId: string
  reviewedConditions: ReviewedCondition[]
  reviewedAt: string
}

// ── Note ───────────────────────────────────────────────────────────────────────

export interface Note {
  id: string
  userId: string
  pseudonym: string | null
  visitDate: string | null
  rawText: string
  createdAt: string
  latestAnalysisId: string | null
  reviewStatus: ReviewStatus
}

export interface NoteListItem {
  id: string
  pseudonym: string | null
  visitDate: string | null
  createdAt: string
  reviewStatus: ReviewStatus
  conditionCount: number
}

export interface NoteDetail {
  note: Note
  analysis: Analysis | null
  review: Review | null
}

// ── Requests ───────────────────────────────────────────────────────────────────

export interface CreateNoteRequest {
  rawText: string
  pseudonym?: string
  visitDate?: string
}

export interface SubmitReviewRequest {
  reviewedConditions: ReviewedCondition[]
}

// ── Responses ──────────────────────────────────────────────────────────────────

export interface CreateNoteResponse {
  note: Note
  analysis: Analysis
}

export interface NotesListResponse {
  items: NoteListItem[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}
