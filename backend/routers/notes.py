"""Note CRUD routes.

POST /api/notes          – create note + run analysis synchronously
GET  /api/notes          – list current user's notes, newest first (paginated)
GET  /api/notes/{noteId} – note detail with latest analysis + review
POST /api/notes/{noteId}/analyze – re-run analysis on an existing note
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from google.cloud.firestore_v1 import Client

from auth import get_current_uid
from db import get_db
from models.note import (
    AnalysisCondition,
    AnalysisOut,
    NoteCreate,
    NoteCreateOut,
    NoteDetail,
    NoteListItem,
    NotesListOut,
    NoteOut,
    ReviewedCondition,
    ReviewOut,
)
from services.gemini_service import run_analysis

router = APIRouter(tags=["notes"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _assert_owner(doc_data: dict[str, Any], uid: str, resource: str = "note") -> None:
    """Raise 403 if the document does not belong to the requesting user."""
    if doc_data.get("userId") != uid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You do not have permission to access this {resource}.",
        )


def _doc_to_note_out(doc_id: str, data: dict[str, Any]) -> NoteOut:
    return NoteOut(
        id=doc_id,
        userId=data["userId"],
        pseudonym=data.get("pseudonym"),
        visitDate=data.get("visitDate"),
        rawText=data["rawText"],
        createdAt=data["createdAt"],
        latestAnalysisId=data.get("latestAnalysisId"),
        reviewStatus=data.get("reviewStatus", "pending"),
    )


def _analysis_doc_to_out(doc_id: str, data: dict[str, Any]) -> AnalysisOut:
    conditions = [AnalysisCondition(**c) for c in data.get("conditions", [])]
    return AnalysisOut(
        id=doc_id,
        noteId=data["noteId"],
        userId=data["userId"],
        createdAt=data["createdAt"],
        modelVersion=data["modelVersion"],
        promptVersion=data["promptVersion"],
        status=data["status"],
        conditions=conditions,
        documentationGaps=data.get("documentationGaps", []),
        summary=data.get("summary", ""),
        rawModelOutput=data.get("rawModelOutput", ""),
    )


def _review_doc_to_out(doc_id: str, data: dict[str, Any]) -> ReviewOut:
    conditions = [ReviewedCondition(**c) for c in data.get("reviewedConditions", [])]
    return ReviewOut(
        id=doc_id,
        analysisId=data["analysisId"],
        noteId=data["noteId"],
        userId=data["userId"],
        reviewedConditions=conditions,
        reviewedAt=data["reviewedAt"],
    )


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/notes", response_model=NoteCreateOut, status_code=status.HTTP_201_CREATED)
async def create_note(
    body: NoteCreate,
    uid: str = Depends(get_current_uid),
    db: Client = Depends(get_db),
) -> NoteCreateOut:
    """Create a note and run an AI analysis synchronously.

    Design decision: synchronous analysis keeps the client simple — no polling
    required. Gemini calls typically complete in 3–8 s. A frontend loading
    spinner covers the wait. If the call times out the analysis is stored with
    status='failed' and the client can trigger a re-analysis.
    """
    note_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    note_data: dict[str, Any] = {
        "userId": uid,
        "pseudonym": body.pseudonym,
        "visitDate": body.visitDate.isoformat() if body.visitDate else None,
        "rawText": body.rawText,
        "createdAt": now,
        "latestAnalysisId": None,
        "reviewStatus": "pending",
    }
    db.collection("notes").document(note_id).set(note_data)

    # Ensure user record exists
    user_ref = db.collection("users").document(uid)
    if not user_ref.get().exists:
        user_ref.set({"uid": uid, "createdAt": now})

    analysis_out = await run_analysis(
        note_id=note_id,
        uid=uid,
        raw_text=body.rawText,
        db=db,
    )

    # Update note with latestAnalysisId
    db.collection("notes").document(note_id).update(
        {"latestAnalysisId": analysis_out.id}
    )

    return NoteCreateOut(
        note=NoteOut(
            id=note_id,
            userId=uid,
            pseudonym=body.pseudonym,
            visitDate=body.visitDate,
            rawText=body.rawText,
            createdAt=now,
            latestAnalysisId=analysis_out.id,
            reviewStatus="pending",
        ),
        analysis=analysis_out,
    )


@router.get("/notes", response_model=NotesListOut)
async def list_notes(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    uid: str = Depends(get_current_uid),
    db: Client = Depends(get_db),
) -> NotesListOut:
    """List the current user's notes, newest first.

    Uses the composite Firestore index: userId ASC, createdAt DESC.
    """
    query = (
        db.collection("notes")
        .where("userId", "==", uid)
        .order_by("createdAt", direction="DESCENDING")
    )

    all_docs = list(query.stream())
    total = len(all_docs)

    start = (page - 1) * page_size
    page_docs = all_docs[start : start + page_size]

    items: list[NoteListItem] = []
    for doc in page_docs:
        data = doc.to_dict()
        if data is None:
            continue

        condition_count = 0
        analysis_id = data.get("latestAnalysisId")
        if analysis_id:
            a_doc = db.collection("analyses").document(analysis_id).get()
            if a_doc.exists:
                a_data = a_doc.to_dict() or {}
                condition_count = len(a_data.get("conditions", []))

        items.append(
            NoteListItem(
                id=doc.id,
                pseudonym=data.get("pseudonym"),
                visitDate=data.get("visitDate"),
                createdAt=data["createdAt"],
                reviewStatus=data.get("reviewStatus", "pending"),
                conditionCount=condition_count,
            )
        )

    return NotesListOut(
        items=items,
        total=total,
        page=page,
        pageSize=page_size,
        hasMore=(start + page_size) < total,
    )


@router.get("/notes/{note_id}", response_model=NoteDetail)
async def get_note(
    note_id: str,
    uid: str = Depends(get_current_uid),
    db: Client = Depends(get_db),
) -> NoteDetail:
    """Return a note with its latest analysis and human review."""
    note_doc = db.collection("notes").document(note_id).get()
    if not note_doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found.")

    note_data = note_doc.to_dict() or {}
    _assert_owner(note_data, uid)

    note_out = _doc_to_note_out(note_doc.id, note_data)

    analysis_out = None
    review_out = None

    if note_data.get("latestAnalysisId"):
        a_doc = db.collection("analyses").document(note_data["latestAnalysisId"]).get()
        if a_doc.exists:
            a_data = a_doc.to_dict() or {}
            _assert_owner(a_data, uid, "analysis")
            analysis_out = _analysis_doc_to_out(a_doc.id, a_data)

            # Fetch review for this specific analysis
            r_query = (
                db.collection("reviews")
                .where("analysisId", "==", a_doc.id)
                .where("userId", "==", uid)
                .limit(1)
            )
            r_docs = list(r_query.stream())
            if r_docs:
                r_data = r_docs[0].to_dict() or {}
                review_out = _review_doc_to_out(r_docs[0].id, r_data)

    return NoteDetail(note=note_out, analysis=analysis_out, review=review_out)


@router.post("/notes/{note_id}/analyze", response_model=NoteCreateOut)
async def reanalyze_note(
    note_id: str,
    uid: str = Depends(get_current_uid),
    db: Client = Depends(get_db),
) -> NoteCreateOut:
    """Re-run Gemini on an existing note.

    Creates a NEW analyses document — does NOT overwrite the previous one.
    Updates notes.latestAnalysisId to point to the new analysis.
    """
    note_doc = db.collection("notes").document(note_id).get()
    if not note_doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found.")

    note_data = note_doc.to_dict() or {}
    _assert_owner(note_data, uid)

    analysis_out = await run_analysis(
        note_id=note_id,
        uid=uid,
        raw_text=note_data["rawText"],
        db=db,
    )

    db.collection("notes").document(note_id).update(
        {"latestAnalysisId": analysis_out.id}
    )
    note_data["latestAnalysisId"] = analysis_out.id

    return NoteCreateOut(
        note=_doc_to_note_out(note_doc.id, note_data),
        analysis=analysis_out,
    )
