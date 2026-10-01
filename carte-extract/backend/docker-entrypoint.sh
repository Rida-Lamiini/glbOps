#!/bin/sh
# Compose gates this container on the db healthcheck, so Postgres is already
# accepting connections by the time this runs — no wait loop needed.
set -e

echo "[entrypoint] applying migrations…"
python manage.py migrate --noinput

echo "[entrypoint] starting: $*"
exec "$@"
