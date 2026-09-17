"""OCR microservice wrapping the official PaddleOCR pipeline (onnxruntime
inference engine, CPU, French model). Called by the Django cadastre app's PDF
ingestion pipeline instead of running OCR in-process — see
cadastre/pdf/extract.py.

PaddleOCR's detection model returns one entry per detected text region
(each table cell is its own entry, not full table rows), in reading order
but with no row grouping. reconstruct_text() rebuilds row-grouped text by
clustering entries whose bounding boxes are vertically close together and
joining each cluster left-to-right with spaces — this is what lets the
line parser (X <space> borne-name <space> Y per line,
see cadastre/pdf/parse_bornes.py) keep working unchanged against PaddleOCR
output the same way it did against Tesseract's own line reconstruction.
"""

import io
from typing import Optional

import numpy as np
from fastapi import FastAPI, File, UploadFile
from PIL import Image
from paddleocr import PaddleOCR

app = FastAPI()

_ocr: Optional[PaddleOCR] = None


def get_ocr() -> PaddleOCR:
    global _ocr
    if _ocr is None:
        _ocr = PaddleOCR(
            lang="fr",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            device="cpu",
            engine="onnxruntime",
        )
    return _ocr


def box_y_center(box) -> float:
    return (box[1] + box[3]) / 2


def box_x_left(box) -> float:
    return box[0]


# Two cells belong to the same table row if their vertical centers are
# within this many pixels of each other (at 300 DPI rasterization — tuned
# against this app's real ANCFCC sample: borne-table rows are ~45px apart
# center-to-center, but the letterhead has two label:value rows only
# ~14-25px apart, so this has to stay well under that to keep them
# separate. Compared against the row's *first* member, not a running
# average, so a long row can't drift and chain into the next one.)
ROW_Y_TOLERANCE_PX = 10


def reconstruct_text(texts: list[str], boxes: list[list[float]]) -> str:
    if not texts:
        return ""

    items = sorted(zip(texts, boxes), key=lambda t: box_y_center(t[1]))

    rows: list[list[tuple[str, list[float]]]] = []
    current_row: list[tuple[str, list[float]]] = []
    row_anchor_y: Optional[float] = None
    for text, box in items:
        y = box_y_center(box)
        if row_anchor_y is None or abs(y - row_anchor_y) <= ROW_Y_TOLERANCE_PX:
            current_row.append((text, box))
            if row_anchor_y is None:
                row_anchor_y = y
        else:
            rows.append(current_row)
            current_row = [(text, box)]
            row_anchor_y = y
    if current_row:
        rows.append(current_row)

    lines = []
    for row in rows:
        row_sorted = sorted(row, key=lambda t: box_x_left(t[1]))
        lines.append(" ".join(t[0] for t in row_sorted))
    return "\n".join(lines)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")
    array = np.array(image)

    engine = get_ocr()
    results = engine.predict(array)

    all_lines = []
    all_texts: list[str] = []
    all_boxes: list[list[float]] = []
    for res in results:
        data = res.json["res"]
        texts = data.get("rec_texts", [])
        scores = data.get("rec_scores", [])
        boxes = data.get("rec_boxes", [])
        for i, text in enumerate(texts):
            if not text:
                continue
            box = boxes[i].tolist() if hasattr(boxes[i], "tolist") else list(boxes[i])
            score = float(scores[i]) if i < len(scores) else None
            all_lines.append({"text": text, "confidence": score, "box": box})
            all_texts.append(text)
            all_boxes.append(box)

    return {"text": reconstruct_text(all_texts, all_boxes), "lines": all_lines}
