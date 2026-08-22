"""Firestore client singleton.

Importing this module initialises the Firebase Admin SDK exactly once,
using the service account pointed to by GOOGLE_APPLICATION_CREDENTIALS.
"""

from __future__ import annotations

import os

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1 import Client

_app: firebase_admin.App | None = None
_db: Client | None = None


def _init() -> None:
    global _app, _db
    if _app is not None:
        return

    cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    project_id = os.getenv("FIREBASE_PROJECT_ID")

    if not cred_path or not project_id:
        raise RuntimeError(
            "GOOGLE_APPLICATION_CREDENTIALS and FIREBASE_PROJECT_ID must be set."
        )

    cred = credentials.Certificate(cred_path)
    _app = firebase_admin.initialize_app(cred, {"projectId": project_id})
    _db = firestore.client()


_init()


def get_db() -> Client:
    """Return the initialised Firestore client."""
    if _db is None:  # pragma: no cover – only reachable if _init failed silently
        raise RuntimeError("Firestore client not initialised.")
    return _db
