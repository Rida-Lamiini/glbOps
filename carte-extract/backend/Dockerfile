# Django API for glbOps.
#
# All the heavy third-party pieces (psycopg, pyproj, pymupdf) ship manylinux
# wheels with their native libraries bundled, so this needs no compiler or
# -dev packages on top of the slim base.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
# gunicorn is installed here rather than in requirements.txt: it has no working
# Windows runtime, and requirements.txt is what the developers install into
# their local venvs.
RUN pip install --no-cache-dir -r requirements.txt gunicorn==23.0.0

COPY . .

RUN chmod +x docker-entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]

# --timeout 300: a scanned PDF goes out to the OCR service and can take ~60s;
# gunicorn's default 30s worker timeout would kill the request mid-OCR.
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "300", "--access-logfile", "-", "--error-logfile", "-"]
