"""Firestore client singleton.

Importing this module initialises the Firebase Admin SDK exactly once,
using the service account pointed to by GOOGLE_APPLICATION_CREDENTIALS.
"""

from __future__ import annotations

import os
from pathlib import Path

import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1 import Client

load_dotenv()

_app: firebase_admin.App | None = None
_db: Client | None = None


def _init() -> None:
    global _app, _db
    if _app is not None and _db is not None:
        return

    cred_path_raw = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    project_id = os.getenv("FIREBASE_PROJECT_ID")

    if not cred_path_raw or not project_id:
        raise RuntimeError(
            "Missing environment variables in backend/.env:\n"
            "Please ensure both GOOGLE_APPLICATION_CREDENTIALS and FIREBASE_PROJECT_ID are set.\n"
            f"Current values: GOOGLE_APPLICATION_CREDENTIALS={cred_path_raw}, FIREBASE_PROJECT_ID={project_id}"
        )

    # Resolve relative paths relative to the backend directory
    cred_path = Path(cred_path_raw)
    if not cred_path.is_absolute():
        backend_dir = Path(__file__).parent
        cred_path = (backend_dir / cred_path).resolve()

    if not cred_path.exists():
        raise FileNotFoundError(
            f"Service account file not found at: {cred_path}\n"
            "Please download your service account JSON key from Firebase Console -> Project Settings -> Service accounts, "
            "save it in the backend folder, and update GOOGLE_APPLICATION_CREDENTIALS in backend/.env"
        )

    cred = credentials.Certificate(str(cred_path))
    _app = firebase_admin.initialize_app(cred, {"projectId": project_id})
    _db = firestore.client()


def get_db() -> Client:
    """Return the initialised Firestore client."""
    if _db is None:
        _init()
    return _db
