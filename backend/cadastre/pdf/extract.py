"""Extracts and parses an ANCFCC "Calcul de Contenances" PDF.

Tries the PDF's own text layer first (fast, but usually absent for this
document type), and falls back to rasterizing at 300 DPI and sending each
page image to the OCR microservice otherwise.

OCR runs in a separate service (backend/ocr-service/, official PaddleOCR on
the onnxruntime engine) rather than in-process: the model stack is heavy, and
a page takes long enough that it has no business blocking a Django worker.
Django only rasterizes the page and posts the image over HTTP.
"""

import os
from dataclasses import dataclass

import pymupdf
import requests

from .parse_bornes import ParsedBorne, ParsedHeader, parse_calcul_de_contenances

# These are ANCFCC "Calcul de Contenances" scans - almost always image-only
# PDFs with no text layer at all (confirmed against a real sample: zero output
# from pdftotext, a single 1-bit CCITT-fax image per page). So OCR is the
# primary extraction path for this document type, not a rare fallback - a
# short/empty text-layer result is the expected, normal case.
MIN_TEXT_LAYER_CHARS = 50

# 300 DPI, since the PDF's own coordinate space is 72 DPI (scale 1 there).
# Low-res rasterization is the single biggest cause of bad OCR on these
# documents.
OCR_RENDER_SCALE = 300 / 72

OCR_SERVICE_URL = os.getenv("OCR_SERVICE_URL", "http://localhost:8500")
# A scanned page at 300 DPI takes a while, and the very first request after the
# service starts also downloads the model weights.
OCR_REQUEST_TIMEOUT_S = int(os.getenv("OCR_REQUEST_TIMEOUT_S", "180"))


class OcrServiceError(RuntimeError):
    """The OCR service was unreachable or returned an error."""


@dataclass
class ExtractionResult:
    extraction_method: str  # "text-layer" | "ocr"
    header: ParsedHeader
    bornes: list[ParsedBorne]
    raw_ocr_text: str


def _call_ocr_service(page_png: bytes) -> dict:
    try:
        response = requests.post(
            f"{OCR_SERVICE_URL}/ocr",
            files={"file": ("page.png", page_png, "image/png")},
            timeout=OCR_REQUEST_TIMEOUT_S,
        )
    except requests.RequestException as error:
        raise OcrServiceError(
            f"Service OCR ({OCR_SERVICE_URL}) injoignable : {error}. "
            "Vérifiez qu'il est démarré (docker compose up -d ocr)."
        ) from error
    if not response.ok:
        raise OcrServiceError(
            f"Service OCR ({OCR_SERVICE_URL}) a répondu "
            f"{response.status_code} {response.reason}."
        )
    return response.json()


def _run_ocr(document: pymupdf.Document) -> tuple[str, dict[str, int]]:
    matrix = pymupdf.Matrix(OCR_RENDER_SCALE, OCR_RENDER_SCALE)
    text = ""
    word_confidence: dict[str, int] = {}
    for page in document:
        page_png = page.get_pixmap(matrix=matrix).tobytes("png")
        result = _call_ocr_service(page_png)
        text += "\n" + result.get("text", "")
        for line in result.get("lines", []):
            key = (line.get("text") or "").strip()
            confidence = line.get("confidence")
            if key and confidence is not None:
                word_confidence[key] = round(confidence * 100)
    return text, word_confidence


def extract_calcul_de_contenances(file_bytes: bytes) -> ExtractionResult:
    with pymupdf.open(stream=file_bytes, filetype="pdf") as document:
        text_layer_text = "".join(page.get_text() for page in document)

        non_whitespace_chars = len("".join(text_layer_text.split()))
        if non_whitespace_chars >= MIN_TEXT_LAYER_CHARS:
            parsed = parse_calcul_de_contenances(text_layer_text)
            return ExtractionResult(
                extraction_method="text-layer",
                header=parsed.header,
                bornes=parsed.bornes,
                raw_ocr_text=text_layer_text,
            )

        ocr_text, word_confidence = _run_ocr(document)

    parsed = parse_calcul_de_contenances(ocr_text, word_confidence)
    return ExtractionResult(
        extraction_method="ocr",
        header=parsed.header,
        bornes=parsed.bornes,
        raw_ocr_text=ocr_text,
    )
