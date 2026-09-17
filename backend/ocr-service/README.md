# ocr-service

FastAPI microservice wrapping the official [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)
pipeline (onnxruntime inference engine, CPU, French model). Called over HTTP by
the Django `cadastre` app's PDF ingestion pipeline (`cadastre/pdf/extract.py`).

It stays a separate service rather than running inside Django because the model
stack is heavy (~1.4 GB image) and a scanned page takes the better part of a
minute — that has no business blocking a Django worker.

## Run it

Via Docker Compose (from `backend/`):

```bash
docker compose up -d ocr
```

For local iteration without rebuilding the image each time:

```bash
python -m venv .venv
./.venv/Scripts/activate   # or source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Model weights (PP-OCRv6, ONNX variant) download on the first `/ocr` request and
are cached under `~/.paddlex/official_models/` — mapped to the `ocr_models`
Docker volume so a container restart doesn't re-download them. That first
request is noticeably slower than the rest.

## API

- `GET /health` → `{"status": "ok"}`
- `POST /ocr` (multipart form, field `file`: a PNG page image) →
  ```json
  {
    "text": "row-grouped plain text, one table row per line",
    "lines": [{ "text": "...", "confidence": 0.98, "box": [x1, y1, x2, y2] }]
  }
  ```

PaddleOCR's detection model returns one entry per detected text region — each
table cell is its own entry, not a full row. `reconstruct_text()` in `main.py`
rebuilds row-grouped text by clustering entries whose bounding boxes are
vertically close together (tuned against a real ANCFCC sample) and joining each
cluster left-to-right with spaces. This is what lets the line parser
(`X <space> borne-name <space> Y` per line, `cadastre/pdf/parse_bornes.py`) work
against PaddleOCR output.

## Host port

Published on host port **8500**, not 8000 — the 7681-8180 TCP range is reserved
on the original dev machine (Hyper-V/WSL2 NAT) and binding in it fails. The
container-internal port stays 8000; Django reaches it via `OCR_SERVICE_URL`
(default `http://localhost:8500`).
