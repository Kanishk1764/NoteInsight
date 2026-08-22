"""Analysis re-run and review submission routes.

PATCH /api/analyses/{analysisId}/review – submit or update the human review.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from google.cloud.firestore_v1 import Client

from auth import get_current_uid
from db import get_db
from models.note import ReviewOut, ReviewSubmit
from routers.notes import _assert_owner, _review_doc_to_out

router = APIRouter(tags=["analyses"])


@router.patch("/analyses/{analysis_id}/review", response_model=ReviewOut)
async def submit_review(
    analysis_id: str,
    body: ReviewSubmit,
    uid: str = Depends(get_current_uid),
    db: Client = Depends(get_db),
) -> ReviewOut:
    """Create or update the human review for a specific analysis.

    - The original analysis document is NEVER mutated.
    - If a review already exists for this analysis+user, it is overwritten
      (idempotent upsert) — the frontend can call this multiple times.
    - Updates notes.reviewStatus to 'reviewed'.
    """
    a_doc = db.collection("analyses").document(analysis_id).get()
    if not a_doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found.",
        )

    a_data = a_doc.to_dict() or {}
    _assert_owner(a_data, uid, "analysis")

    note_id: str = a_data["noteId"]

    # Verify the parent note also belongs to this user
    note_doc = db.collection("notes").document(note_id).get()
    if not note_doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent note not found.",
        )
    _assert_owner(note_doc.to_dict() or {}, uid)

    now = datetime.now(timezone.utc)

    # Upsert: look for existing review for this analysis+user
    r_query = (
        db.collection("reviews")
        .where("analysisId", "==", analysis_id)
        .where("userId", "==", uid)
        .limit(1)
    )
    existing = list(r_query.stream())

    review_id = existing[0].id if existing else str(uuid.uuid4())

    conditions_raw: list[dict[str, Any]] = [
        c.model_dump() for c in body.reviewedConditions
    ]

    review_data: dict[str, Any] = {
        "analysisId": analysis_id,
        "noteId": note_id,
        "userId": uid,
        "reviewedConditions": conditions_raw,
        "reviewedAt": now,
    }

    db.collection("reviews").document(review_id).set(review_data)

    # Flip note review status
    db.collection("notes").document(note_id).update({"reviewStatus": "reviewed"})

    return _review_doc_to_out(review_id, review_data)
