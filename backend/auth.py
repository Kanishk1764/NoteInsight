"""Firebase ID-token verification dependency for FastAPI.

Every protected route receives the verified `uid` via `Depends(get_current_uid)`.
The uid is extracted *only* from the server-side verified token – never from
a client-supplied body field.
"""

from __future__ import annotations

import firebase_admin
from fastapi import Depends, Header, HTTPException, status
from firebase_admin import auth as firebase_auth


from db import get_db


def _get_bearer_token(authorization: str = Header(...)) -> str:
    """Extract the raw JWT from the `Authorization: Bearer <token>` header."""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header. Expected: Bearer <token>",
        )
    return token


def get_current_uid(token: str = Depends(_get_bearer_token)) -> str:
    """Verify the Firebase ID token and return the authenticated uid.

    Raises 401 if the token is invalid or expired.
    The returned uid is the authoritative identity for all downstream checks.
    """
    get_db()  # ensures Firebase app is initialized
    try:
        decoded = firebase_auth.verify_id_token(token, check_revoked=True)
    except firebase_admin.exceptions.FirebaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token verification failed: {exc}",
        ) from exc
    uid: str = decoded["uid"]
    return uid
