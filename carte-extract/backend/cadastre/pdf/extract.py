"""Extracts and parses an ANCFCC "Calcul de Contenances" PDF.

Tries the PDF's own text layer first (fast, but usually absent for this
document type), and falls back to rasterizing each page and sending it to
the OCR microservice otherwise. OCR itself goes through core.ocr (same
client the plain image OCR tool uses) — this module only rasterizes pages
and drives the cadastre-specific parsing on top.
"""

from dataclasses import dataclass

import pymupdf

from core import ocr as ocr_client

from .parse_bornes import ParsedBorne, ParsedHeader, parse_calcul_de_contenances

# These are ANCFCC "Calcul de Contenances" scans - almost always image-only
# PDFs with no text layer at all (confirmed against a real sample: zero output
# from pdftotext, a single 1-bit CCITT-fax image per page). So OCR is the
# primary extraction path for this document type, not a rare fallback - a
# short/empty text-layer result is the expected, normal case.
MIN_TEXT_LAYER_CHARS = 50

# ~144 DPI (the PDF's own coordinate space is 72 DPI, so scale=1 there). This
# was 300 DPI while OCR ran through Tesseract, which needed it — but
# PaddleOCR's own detection preprocessing does the opposite: fed a 300 DPI
# render of a real test document, it silently dropped every 3rd table row
# (missing entirely, not misread), while scale 1.5-3 all read every row
# correctly. Confirmed by posting the same image straight to the OCR service,
# ruling out a transmission bug — this is PaddleOCR's own detection model
# behaving worse on unnecessarily-large input. Don't push this back toward
# 300 DPI without re-verifying against a real scan first.
OCR_RENDER_SCALE = 2


class OcrServiceError(RuntimeError):
    """The OCR service was unreachable or returned an error."""


@dataclass
class ExtractionResult:
    extraction_method: str  # "text-layer" | "ocr"
    header: ParsedHeader
    bornes: list[ParsedBorne]
    raw_ocr_text: str


def _run_ocr(document: pymupdf.Document) -> tuple[str, dict[str, int]]:
    matrix = pymupdf.Matrix(OCR_RENDER_SCALE, OCR_RENDER_SCALE)
    text = ""
    word_confidence: dict[str, int] = {}
    for page in document:
        page_png = page.get_pixmap(matrix=matrix).tobytes("png")
        result = ocr_client.run_bytes("page.png", page_png)
        if result is None:
            raise OcrServiceError(
                "Service OCR injoignable ou en erreur. Vérifiez qu'il est démarré "
                "(docker compose up -d ocr)."
            )
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
