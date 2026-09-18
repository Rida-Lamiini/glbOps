# ocr-service

FastAPI microservice wrapping the official [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)
pipeline (onnxruntime inference engine, CPU, French model). Called by the
Django backend (`core/ocr.py`) over HTTP when an image attachment is
uploaded — there's no official PaddleOCR runtime for a pure-Python web
worker to embed in-process, so this runs as its own container instead.

## Run it

Via Docker Compose (from `backend/`):

```bash
docker compose up -d ocr
```

For local iteration without rebuilding the image each time:

```bash
cd ocr-service
python -m venv .venv
./.venv/Scripts/activate   # or source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Model weights (PP-OCRv6, ONNX variant) download on the first `/ocr` request
and get cached under `~/.paddlex/official_models/` — that first request
will be noticeably slower than the rest.

## API

- `GET /health` → `{"status": "ok"}`
- `POST /ocr` (multipart form, field `file`: a PNG/JPEG page image) →
  ```json
  {
    "text": "row-grouped plain text, one table row per line",
    "lines": [{ "text": "...", "confidence": 0.98, "box": [x1, y1, x2, y2] }]
  }
  ```

PaddleOCR's detection model returns one entry per detected text region —
each table cell is its own entry, not a full row. `reconstruct_text()` in
`main.py` rebuilds row-grouped text by clustering entries whose bounding
boxes are vertically close together (tuned against real cadastral-table
samples) and joining each cluster left-to-right with spaces.

## Integration

`core.ocr.extract_text()` in the Django backend calls this service's
`/ocr` endpoint whenever an image `Attachment` is created, and stores the
result on `Attachment.ocr_text`. The service URL is configured via the
`OCR_SERVICE_URL` env var (see `backend/.env.example`) — it defaults to
`http://ocr:8000` inside Docker Compose and `http://localhost:8500` for
local (non-Docker) iteration. A slow or unreachable OCR service never
blocks an upload: extraction failures are logged and `ocr_text` is left
blank.
