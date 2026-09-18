"""Client for the OCR microservice (backend/ocr-service).

Extraction runs synchronously inside the attachment upload request. That's
fine for the page-at-a-time images this handles today; if uploads grow into
multi-page batches this should move to a background task instead of
stretching the request further.
"""

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# Generous: the very first request after the OCR container starts also
# downloads and loads the PaddleOCR model weights (~80s observed), and a
# multi-page PDF chains one of these calls per page.
OCR_TIMEOUT_SECONDS = 180

# Extensions the OCR service can actually read (Pillow-openable images).
# PDFs are handled by other tooling and are not sent here.
OCR_ELIGIBLE_EXTENSIONS = {"png", "jpg", "jpeg"}


def is_ocr_eligible(filename: str) -> bool:
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return extension in OCR_ELIGIBLE_EXTENSIONS


def _send_to_ocr(filename: str, content: bytes) -> dict | None:
    try:
        response = requests.post(
            f"{settings.OCR_SERVICE_URL}/ocr",
            files={"file": (filename, content)},
            timeout=OCR_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException:
        logger.warning("OCR extraction failed for %s", filename, exc_info=True)
        return None


def extract_text(file_obj) -> str:
    """Send an already-saved attachment file to the OCR service and return
    its row-grouped text, or "" if extraction isn't possible or fails.
    """
    file_obj.open("rb")
    try:
        result = _send_to_ocr(file_obj.name, file_obj.read())
    finally:
        file_obj.close()
    return result.get("text", "") if result else ""


def run_bytes(filename: str, content: bytes) -> dict | None:
    """Send raw bytes (not tied to a Django file field) straight to the OCR
    service and return its full response, or None on failure — e.g. a PDF
    page rasterized in-memory. Used by cadastre/pdf/extract.py.
    """
    return _send_to_ocr(filename, content)
