#!/bin/sh
set -eu

# When RELEASE_PATH is set, mirror a versioned release prefix from an
# S3-compatible bucket (e.g. Garage) into SERVE_DIR before starting the
# server. Local dev instead bind-syncs artifacts directly into SERVE_DIR via
# `develop.watch` (see deploy/development/docker-compose.yml), so none of
# this runs there.
if [ -n "${RELEASE_PATH:-}" ]; then
  : "${BUCKET_ENDPOINT:?RELEASE_PATH is set but BUCKET_ENDPOINT is missing}"
  : "${BUCKET_NAME:?RELEASE_PATH is set but BUCKET_NAME is missing}"
  : "${BUCKET_ACCESS_KEY:?RELEASE_PATH is set but BUCKET_ACCESS_KEY is missing}"
  : "${BUCKET_SECRET_KEY:?RELEASE_PATH is set but BUCKET_SECRET_KEY is missing}"

  mc alias set release "${BUCKET_ENDPOINT}" "${BUCKET_ACCESS_KEY}" "${BUCKET_SECRET_KEY}" >/dev/null
  # --remove keeps SERVE_DIR in sync with exactly this version — clears out
  # anything left over from a previous release pointed at the same volume.
  mc mirror --overwrite --remove "release/${BUCKET_NAME}/${RELEASE_PATH}" "${SERVE_DIR}"
fi

exec "$@"
