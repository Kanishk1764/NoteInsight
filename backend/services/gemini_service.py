"""Gemini integration service.

Responsibilities:
  1. Build the structured prompt from `prompts/note_analysis_prompt.md`.
  2. Call Gemini with a strict response_schema so output is constrained JSON.
  3. Validate the response with Pydantic; on failure, retry once with a
     corrective prompt; if still failing, persist status='malformed'/'failed'.
  4. Verify every evidenceQuote is a real substring of the original note text
     (whitespace/case-normalised) and mark quoteVerified accordingly.
  5. Persist the analysis to Firestore and return AnalysisOut.
"""

from __future__ import annotations

import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from google import genai
from google.genai import types as genai_types
from pydantic import ValidationError

from models.note import AnalysisCondition, AnalysisOut

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "note_analysis_prompt.md"
_PROMPT_TEMPLATE: str | None = None

_DEFAULT_MODELS = [
    os.getenv("GEMINI_MODEL", "").strip(),
    "gemini-2.5-flash",
    "gemini-1.5-flash",
    "gemini-2.0-flash-exp",
    "gemini-1.5-pro",
]
_CANDIDATE_MODELS = [m for m in _DEFAULT_MODELS if m]
PROMPT_VERSION = os.getenv("PROMPT_VERSION", "1.0.0")
_ACTIVE_MODEL = _CANDIDATE_MODELS[0] if _CANDIDATE_MODELS else "gemini-1.5-flash"

# Maximum words before truncation (Gemini has token limits; we guard at word level)
_MAX_WORDS = 5000
_TRUNCATION_WARNING = (
    "\n\n[NOTE TRUNCATED: The original note exceeded 5000 words. "
    "The analysis covers the truncated portion only.]"
)


def _load_prompt_template() -> str:
    global _PROMPT_TEMPLATE
    if _PROMPT_TEMPLATE is None:
        _PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")
    return _PROMPT_TEMPLATE


def _maybe_truncate(text: str) -> tuple[str, bool]:
    """Return (text, was_truncated). Truncates to _MAX_WORDS words if needed."""
    words = text.split()
    if len(words) <= _MAX_WORDS:
        return text, False
    truncated = " ".join(words[:_MAX_WORDS]) + _TRUNCATION_WARNING
    return truncated, True


def _normalise(s: str) -> str:
    """Collapse whitespace and lowercase for fuzzy substring matching."""
    return re.sub(r"\s+", " ", s).strip().lower()


def _verify_quotes(
    conditions: list[AnalysisCondition], raw_text: str
) -> list[AnalysisCondition]:
    """Set quoteVerified=True iff the evidenceQuote is found in the normalised note."""
    norm_note = _normalise(raw_text)
    verified: list[AnalysisCondition] = []
    for cond in conditions:
        norm_quote = _normalise(cond.evidenceQuote)
        found = norm_quote in norm_note if norm_quote else False
        verified.append(cond.model_copy(update={"quoteVerified": found}))
    return verified


# ── Gemini response schema ─────────────────────────────────────────────────────

_RESPONSE_SCHEMA = genai_types.Schema(
    type=genai_types.Type.OBJECT,
    required=["conditions", "documentationGaps", "summary"],
    properties={
        "conditions": genai_types.Schema(
            type=genai_types.Type.ARRAY,
            items=genai_types.Schema(
                type=genai_types.Type.OBJECT,
                required=[
                    "name",
                    "evidenceQuote",
                    "documentationStatus",
                    "suggestedIcd10",
                    "confidence",
                ],
                properties={
                    "name": genai_types.Schema(type=genai_types.Type.STRING),
                    "evidenceQuote": genai_types.Schema(type=genai_types.Type.STRING),
                    "documentationStatus": genai_types.Schema(
                        type=genai_types.Type.STRING,
                        enum=["documented", "implied", "absent"],
                    ),
                    "suggestedIcd10": genai_types.Schema(type=genai_types.Type.STRING),
                    "confidence": genai_types.Schema(type=genai_types.Type.NUMBER),
                },
            ),
        ),
        "documentationGaps": genai_types.Schema(
            type=genai_types.Type.ARRAY,
            items=genai_types.Schema(type=genai_types.Type.STRING),
        ),
        "summary": genai_types.Schema(type=genai_types.Type.STRING),
    },
)


# ── Core Gemini call ───────────────────────────────────────────────────────────

def _call_gemini(prompt: str, is_retry: bool = False) -> tuple[str, dict[str, Any] | None, str]:
    """Call Gemini with the structured schema.

    Returns (raw_text_output, parsed_dict_or_None, used_model_name).
    """
    global _ACTIVE_MODEL
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is not set.")

    client = genai.Client(api_key=api_key)

    generation_config = genai_types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=_RESPONSE_SCHEMA,
        temperature=0.1 if not is_retry else 0.0,
        max_output_tokens=4096,
    )

    last_err: Exception | None = None
    # Try the active model first, then fallback models if 404 occurs
    models_to_try = [_ACTIVE_MODEL] + [m for m in _CANDIDATE_MODELS if m != _ACTIVE_MODEL]

    for model_name in models_to_try:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=generation_config,
            )
            _ACTIVE_MODEL = model_name
            raw_text = response.text or ""
            try:
                parsed = json.loads(raw_text)
            except json.JSONDecodeError:
                logger.warning("Gemini returned non-JSON output (model=%s, retry=%s)", model_name, is_retry)
                parsed = None
            return raw_text, parsed, model_name
        except Exception as exc:
            err_str = str(exc)
            last_err = exc
            if "404" in err_str or "NOT_FOUND" in err_str or "not available" in err_str:
                logger.warning("Model %s returned 404/unavailable. Trying next model...", model_name)
                continue
            raise exc

    if last_err:
        raise last_err
    raise RuntimeError("No Gemini model succeeded.")


# ── Main entry point ───────────────────────────────────────────────────────────

async def run_analysis(
    note_id: str,
    uid: str,
    raw_text: str,
    db: Any,
) -> AnalysisOut:
    """Run Gemini analysis, validate, verify quotes, persist, and return AnalysisOut.

    Failure ladder:
      1. Primary call → Pydantic validation.
      2. On ValidationError or bad JSON → retry with corrective prompt.
      3. Second failure → status='malformed'; if network error → status='failed'.
    """
    now = datetime.now(timezone.utc)
    analysis_id = str(uuid.uuid4())

    text_to_analyse, was_truncated = _maybe_truncate(raw_text)
    if was_truncated:
        logger.warning("Note %s truncated to %d words for analysis.", note_id, _MAX_WORDS)

    template = _load_prompt_template()
    primary_prompt = template.replace("{{NOTE_TEXT}}", text_to_analyse)

    raw_output = ""
    conditions: list[AnalysisCondition] = []
    gaps: list[str] = []
    summary = ""
    final_status: str = "success"

    used_model = _ACTIVE_MODEL
    try:
        raw_output, parsed, used_model = _call_gemini(primary_prompt)

        if parsed is None:
            raise ValueError("JSON decode failed on primary attempt")

        # Validate with Pydantic
        conditions_raw = parsed.get("conditions", [])
        gaps = parsed.get("documentationGaps", [])
        summary = parsed.get("summary", "")

        conditions = [
            AnalysisCondition(
                name=c["name"],
                evidenceQuote=c["evidenceQuote"],
                quoteVerified=False,  # will be set by _verify_quotes
                documentationStatus=c["documentationStatus"],
                suggestedIcd10=c["suggestedIcd10"],
                confidence=float(c["confidence"]),
            )
            for c in conditions_raw
        ]

    except (ValueError, ValidationError, KeyError) as primary_err:
        logger.warning(
            "Primary Gemini parse failed for note %s: %s. Retrying…",
            note_id,
            primary_err,
        )
        corrective_prompt = (
            primary_prompt
            + "\n\n[SYSTEM NOTE]: Your previous response could not be parsed. "
            "Return ONLY valid JSON matching the schema. No prose, no markdown fences."
        )
        try:
            raw_output, parsed2, used_model = _call_gemini(corrective_prompt, is_retry=True)
            if parsed2 is None:
                raise ValueError("JSON decode failed on retry")

            conditions_raw2 = parsed2.get("conditions", [])
            gaps = parsed2.get("documentationGaps", [])
            summary = parsed2.get("summary", "")
            conditions = [
                AnalysisCondition(
                    name=c["name"],
                    evidenceQuote=c["evidenceQuote"],
                    quoteVerified=False,
                    documentationStatus=c["documentationStatus"],
                    suggestedIcd10=c["suggestedIcd10"],
                    confidence=float(c["confidence"]),
                )
                for c in conditions_raw2
            ]

        except (ValueError, ValidationError, KeyError):
            logger.error(
                "Gemini retry also failed for note %s. Storing as malformed.", note_id
            )
            final_status = "malformed"

    except Exception as network_err:
        logger.error("Gemini network/API error for note %s: %s", note_id, network_err)
        final_status = "failed"
        raw_output = str(network_err)

    # Quote verification (only when we have conditions)
    if conditions:
        conditions = _verify_quotes(conditions, raw_text)

    # Persist to Firestore
    analysis_doc: dict[str, Any] = {
        "noteId": note_id,
        "userId": uid,
        "createdAt": now,
        "modelVersion": used_model,
        "promptVersion": PROMPT_VERSION,
        "status": final_status,
        "conditions": [c.model_dump() for c in conditions],
        "documentationGaps": gaps,
        "summary": summary,
        "rawModelOutput": raw_output,
    }
    db.collection("analyses").document(analysis_id).set(analysis_doc)

    return AnalysisOut(
        id=analysis_id,
        noteId=note_id,
        userId=uid,
        createdAt=now,
        modelVersion=used_model,
        promptVersion=PROMPT_VERSION,
        status=final_status,  # type: ignore[arg-type]
        conditions=conditions,
        documentationGaps=gaps,
        summary=summary,
        rawModelOutput=raw_output,
    )
