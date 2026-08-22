"""Pydantic v2 models for notes and their related sub-structures."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


# ── Condition (shared sub-model) ───────────────────────────────────────────────

class ConditionBase(BaseModel):
    name: str = Field(..., description="Condition / diagnosis name")
    evidenceQuote: str = Field(..., description="Verbatim excerpt from the note")
    quoteVerified: bool = Field(
        default=False,
        description="True iff the evidenceQuote is a verified substring of the raw note text",
    )
    documentationStatus: Literal["documented", "implied", "absent"] = Field(
        ...,
        description="How well the condition is documented in the note",
    )
    suggestedIcd10: str = Field(..., description="E.g. E11.9")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Model confidence 0–1")


# ── Analysis models ────────────────────────────────────────────────────────────

class AnalysisCondition(ConditionBase):
    """One condition as returned by (and stored from) the AI."""


class AnalysisOut(BaseModel):
    id: str
    noteId: str
    userId: str
    createdAt: datetime
    modelVersion: str
    promptVersion: str
    status: Literal["success", "malformed", "failed"]
    conditions: list[AnalysisCondition]
    documentationGaps: list[str]
    summary: str
    rawModelOutput: str


# ── Review models ──────────────────────────────────────────────────────────────

class HumanCorrectedFields(BaseModel):
    name: str | None = None
    evidenceQuote: str | None = None
    documentationStatus: Literal["documented", "implied", "absent"] | None = None
    suggestedIcd10: str | None = None
    confidence: float | None = Field(None, ge=0.0, le=1.0)


class ReviewedCondition(ConditionBase):
    edited: bool = False
    rejected: bool = False
    addedByHuman: bool = False
    humanCorrectedFields: HumanCorrectedFields | None = None


class ReviewOut(BaseModel):
    id: str
    analysisId: str
    noteId: str
    userId: str
    reviewedConditions: list[ReviewedCondition]
    reviewedAt: datetime


# ── Note models ────────────────────────────────────────────────────────────────

class NoteCreate(BaseModel):
    rawText: str = Field(..., min_length=1, max_length=50000)
    pseudonym: str | None = Field(None, max_length=200)
    visitDate: date | None = None

    @field_validator("rawText")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("rawText must not be blank")
        return stripped


class NoteOut(BaseModel):
    id: str
    userId: str
    pseudonym: str | None
    visitDate: date | None
    rawText: str
    createdAt: datetime
    latestAnalysisId: str | None
    reviewStatus: Literal["pending", "reviewed"]


class NoteDetail(BaseModel):
    note: NoteOut
    analysis: AnalysisOut | None
    review: ReviewOut | None


class NoteListItem(BaseModel):
    id: str
    pseudonym: str | None
    visitDate: date | None
    createdAt: datetime
    reviewStatus: Literal["pending", "reviewed"]
    conditionCount: int


class NotesListOut(BaseModel):
    items: list[NoteListItem]
    total: int
    page: int
    pageSize: int
    hasMore: bool


class NoteCreateOut(BaseModel):
    note: NoteOut
    analysis: AnalysisOut


# ── Review submit ──────────────────────────────────────────────────────────────

class ReviewSubmit(BaseModel):
    reviewedConditions: list[ReviewedCondition]
