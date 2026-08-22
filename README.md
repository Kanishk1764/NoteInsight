# Note Insight

> **AI-assisted clinical note structuring.** Paste a free-text clinical note → get structured conditions, ICD-10 codes, evidence quotes, and documentation gaps — then review and correct the AI's output.

> **Scaffold note:** This project was generated as an AI-assisted scaffold using [Antigravity](https://antigravity.dev) and is intended as a starting point for review and iteration. All design decisions are documented below.

---

## Table of Contents

1. [Quick Start (Local)](#quick-start-local)
2. [Data Model](#data-model)
3. [Design Decisions](#design-decisions)
4. [Database Choice Justification](#database-choice-justification)
5. [API Reference](#api-reference)
6. [Deployment](#deployment)
7. [What We'd Build Next](#what-wed-build-next)
8. [Known Gaps](#known-gaps)
9. [Security Posture](#security-posture)

---

## Quick Start (Local)

### Prerequisites

- Python 3.12+
- Node.js 20+
- A Firebase project with **Firestore** and **Email/Password Authentication** enabled
- A Google Gemini API key from [AI Studio](https://aistudio.google.com/app/apikey)

### 1. Clone & enter the repo

```bash
git clone <your-repo-url>
cd "Note Insight"
```

### 2. Backend setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy and fill in the environment file
cp .env.example .env
# Edit .env — see "Credentials you need" section at the bottom of this README
```

Then start the backend:

```bash
uvicorn main:app --reload --port 8000
```

The API will be at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### 3. Frontend setup

```bash
cd frontend

# Install dependencies
npm install

# Copy and fill in the environment file
cp .env.example .env
# Edit .env — see "Credentials you need" section at the bottom of this README

# Start the dev server
npm run dev
```

The app will be at `http://localhost:5173`.

### 4. Firestore indexes

Create one composite index in the Firebase console (Firestore → Indexes → Composite):

| Collection | Field 1 | Field 2 | Query scope |
|---|---|---|---|
| `notes` | `userId` (Ascending) | `createdAt` (Descending) | Collection |

This supports the paginated note list query. Alternatively, deploy it with the Firebase CLI:

```bash
firebase deploy --only firestore:indexes
```

using this `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "notes",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

## Data Model

Four Firestore collections, kept deliberately separate.

### `users/{uid}`

Mirrors Firebase Auth. Stored only to log creation time; Firebase Auth is the authoritative identity store.

```
{
  uid:       string    // Firebase Auth UID (document ID)
  createdAt: timestamp
}
```

### `notes/{noteId}`

The raw input submitted by the clinician. Never mutated after creation except for two pointer fields.

```
{
  id:               string     // document ID
  userId:           string     // owner — every query is scoped to this
  pseudonym:        string?    // optional patient reference
  visitDate:        string?    // ISO date, e.g. "2025-03-14"
  rawText:          string     // the original free-text note, preserved forever
  createdAt:        timestamp
  latestAnalysisId: string?    // pointer to the most recent analysis
  reviewStatus:     "pending" | "reviewed"
}
```

**Why `latestAnalysisId`?** A note can be re-analysed (e.g. after a prompt improvement). Each re-analysis creates a new `analyses` document; the old ones are preserved. `latestAnalysisId` is the only mutable field — it gets updated to point to the newest analysis.

### `analyses/{analysisId}`

An **immutable snapshot** of one Gemini run on one note. Once written, this document is never updated.

```
{
  id:                string
  noteId:            string
  userId:            string
  createdAt:         timestamp
  modelVersion:      string     // e.g. "gemini-2.0-flash"
  promptVersion:     string     // e.g. "1.0.0" — from PROMPT_VERSION env var
  status:            "success" | "malformed" | "failed"
  conditions: [
    {
      name:                 string
      evidenceQuote:        string   // verbatim excerpt from the note
      quoteVerified:        boolean  // true iff quote found as substring of rawText
      documentationStatus:  "documented" | "implied" | "absent"
      suggestedIcd10:       string
      confidence:           number   // 0.0–1.0
    }
  ]
  documentationGaps: string[]
  summary:           string
  rawModelOutput:    string    // the raw Gemini response, always stored for audit
}
```

**Key design constraint:** The AI's output is preserved forever, unchanged. A human review never mutates an analysis document — it creates a separate `reviews` document. This answers "what did the model originally say vs. what did the human correct?"

### `reviews/{reviewId}`

The human layer, linked to one specific analysis. Only one review per `(analysisId, userId)` pair — re-submitting a review is an idempotent upsert.

```
{
  id:        string
  analysisId: string   // points to a specific analysis snapshot
  noteId:    string
  userId:    string
  reviewedConditions: [
    {
      // all fields from AnalysisCondition, plus:
      edited:               boolean
      rejected:             boolean
      addedByHuman:         boolean
      humanCorrectedFields: {     // only fields that changed
        name?:                string
        evidenceQuote?:        string
        documentationStatus?:  string
        suggestedIcd10?:       string
        confidence?:           number
      } | null
    }
  ]
  reviewedAt: timestamp
}
```

**Why immutable analyses?** This is the most important design constraint in the project. If you overwrote an analysis with the human's corrections, you'd lose the audit trail of what the model actually said. Keeping them separate allows for: (a) future prompt regression testing, (b) measuring model accuracy over time, (c) regulatory/audit compliance.

---

## Design Decisions

### 1. Synchronous analysis vs. async/polling

**Decision:** Analysis runs synchronously — `POST /api/notes` calls Gemini, waits for the response, and returns the full `note + analysis` in one HTTP response.

**Alternative:** Return immediately with a job ID and have the client poll `GET /api/notes/{id}` until the analysis status changes from `processing` to `success`. This is more scalable but much more complex to implement.

**Why synchronous?** Gemini calls typically complete in 3–8 seconds. A loading state with a clear message ("Analysing — please don't close this page") gives a good enough UX for this use case. The backend has a timeout guard; if Gemini times out, the analysis is stored with `status: "failed"` and the UI surfaces a "Retry Analysis" button. Async polling can be added later if response times grow.

### 2. Firestore over a relational database

See [Database Choice Justification](#database-choice-justification) below.

### 3. Gemini `response_schema` vs. prompt-and-parse

**Decision:** Use Gemini's `response_schema` / `response_mime_type: "application/json"` to constrain the model output to a strict JSON schema.

**Alternative:** Prompt the model to "return JSON" and then parse its free-text response with regex or `json.loads`. This is fragile — models often include markdown fences, prose preambles, or trailing commas.

**Why `response_schema`?** The schema constraint is enforced at the model level; the model cannot return anything outside the defined structure. Combined with Pydantic validation on the backend, this makes the integration far more robust. We still retry once with a corrective prompt if validation fails, and store `status: "malformed"` if both attempts fail.

### 4. Quote verification via substring search

**Decision:** For every `evidenceQuote` the model returns, check whether it appears (whitespace/case-normalised) as a substring of the original `rawText`. Set `quoteVerified: false` on any that don't match.

**Alternative:** Trust the model's quotes without verification, or use an embedding similarity search.

**Why substring search?** It's the most honest check available: if the quote literally appears in the note, we can be confident the model didn't hallucinate it. Embedding similarity would catch paraphrases but not verify verbatim accuracy, which is what matters for ICD-10 evidence. Quotes that fail the check are visually flagged in the UI with an orange warning, so the clinician is never misled.

---

## Database Choice Justification

**Firestore** was chosen over PostgreSQL (or another relational DB) for the following reasons:

1. **Same ecosystem as Firebase Auth.** The backend already uses the Firebase Admin SDK to verify ID tokens. Using Firestore means one service account, one SDK, one billing account, and one console.

2. **Document model fits the data shape.** Each note/analysis/review is a self-contained JSON document with nested arrays. In PostgreSQL you'd need a `conditions` join table and a `reviewed_conditions` join table, with JSON columns for `humanCorrectedFields`. Firestore stores these naturally.

3. **Free tier is generous.** Firestore's Spark plan allows 50,000 reads and 20,000 writes per day at no cost — ample for a clinical pilot with a small team.

4. **No server to manage.** Unlike a hosted PostgreSQL instance (e.g. Supabase, Railway, or Cloud SQL), Firestore requires zero infrastructure management. This aligns with the "free-tier services only" constraint.

**Trade-off acknowledged:** Firestore does not support ad-hoc SQL queries, joins, or transactions across collections as cleanly as PostgreSQL. For a future analytics feature (e.g. "what is the most commonly missed ICD-10 code?"), a migration to BigQuery or a relational DB would be warranted. That limitation is documented in [Known Gaps](#known-gaps).

---

## API Reference

All routes require `Authorization: Bearer <Firebase ID token>`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/notes` | Create note + run analysis (synchronous). Returns `{ note, analysis }`. |
| `GET` | `/api/notes` | List current user's notes. Params: `page`, `pageSize`. |
| `GET` | `/api/notes/{noteId}` | Note detail with latest analysis and review. |
| `POST` | `/api/notes/{noteId}/analyze` | Re-run analysis; creates new analysis doc. |
| `PATCH` | `/api/analyses/{analysisId}/review` | Submit/update human review. |
| `GET` | `/healthz` | Health check (unauthenticated). |

---

## Deployment

### Backend → Google Cloud Run

```bash
cd backend

# Build and push the Docker image
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/note-insight-backend

# Deploy to Cloud Run
gcloud run deploy note-insight-backend \
  --image gcr.io/YOUR_PROJECT_ID/note-insight-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "GEMINI_API_KEY=...,FIREBASE_PROJECT_ID=...,CORS_ORIGINS=https://your-frontend.web.app"
```

For `GOOGLE_APPLICATION_CREDENTIALS`, mount the service account JSON as a Cloud Run secret or use Workload Identity (recommended for production).

**Fallback: Render**
- Create a new Web Service pointing to the `backend/` directory
- Set the build command: `pip install -r requirements.txt`
- Set the start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Add all environment variables in the Render dashboard
- Set `GOOGLE_APPLICATION_CREDENTIALS` to the path of your service account file (upload it as a secret file)

### Frontend → Firebase Hosting

```bash
cd frontend
npm run build

# From the repo root:
firebase deploy --only hosting
```

**Fallback: Vercel**
```bash
vercel --prod
```
The `vercel.json` at the repo root configures the build and SPA rewrites.

---

## What We'd Build Next

With one more week of development:

1. **Streaming analysis** — Stream Gemini's output token-by-token to the frontend so the clinician sees conditions appear in real time rather than waiting 5–8 seconds.
2. **Inline quote highlighting** — Highlight the `evidenceQuote` directly within the displayed raw note text so the clinician can see exactly where each condition is cited.
3. **Analytics dashboard** — Cross-note view: most common conditions, documentation gap trends, model confidence distribution over time.
4. **Test coverage** — Unit tests for `gemini_service.py` (mocking the Gemini client), integration tests for all API routes with a Firestore emulator, and React Testing Library tests for the review flow.
5. **Rate limiting** — Per-user rate limiting on `/api/notes` and `/api/notes/{id}/analyze` to prevent excessive Gemini API spend.

---

## Known Gaps

- **No automated tests** — The project has no unit or integration tests. This is the most significant gap and should be addressed before any production use.
- **No pagination cursor** — The list endpoint uses offset-based pagination (`page` + `pageSize`). For large datasets this can be slow; Firestore cursor-based pagination (`startAfter`) would be more efficient.
- **No Firestore security rules** — The backend enforces all user-scoping checks in Python code. Firestore security rules are not configured, meaning direct Firestore SDK access (bypassing the API) would not be restricted. Adding rules is strongly recommended.
- **Service account file in filesystem** — The backend reads `GOOGLE_APPLICATION_CREDENTIALS` from a file path. In production on Cloud Run, use a Secret Manager secret or Workload Identity instead of a file.
- **No email verification** — Users can sign up with any email address without verifying it. Adding email verification via Firebase Auth is a one-line change but was skipped for speed.
- **No note deletion** — There is no `DELETE /api/notes/{id}` endpoint. Notes are currently permanent.
- **Condition editing is UI-only** — The `humanCorrectedFields` sub-object is saved to Firestore, but the `name`, `suggestedIcd10`, and `documentationStatus` fields on the `ReviewedCondition` are NOT automatically merged from `humanCorrectedFields`. Downstream consumers of the review data should prefer `humanCorrectedFields` over the base condition fields when `edited: true`.
- **No cross-analysis comparison view** — There's no UI for comparing two analyses of the same note side-by-side (e.g. before and after a prompt improvement).

---

## Security Posture

- Firebase ID tokens are verified **server-side** on every protected route using the Firebase Admin SDK. The `uid` is never taken from the request body.
- Every Firestore read and write is scoped to the authenticated `uid` in Python code before the query is executed.
- `GEMINI_API_KEY` is stored only in the backend environment; it is never referenced in frontend code and is never bundled into the frontend build.
- `.env` files are gitignored; only `.env.example` files (with placeholder values) are committed.
- No real patient data is used anywhere in this repository. Sample notes contain entirely fictional patients.
