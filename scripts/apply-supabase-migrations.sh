#!/usr/bin/env bash
set -euo pipefail

MIGRATIONS_DIR="${MIGRATIONS_DIR:-supabase/migrations}"
MIGRATIONS_TABLE="${MIGRATIONS_TABLE:-schema_migrations}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "Migrations directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

psql "$DATABASE_URL" \
  --set=ON_ERROR_STOP=1 \
  --set=migrations_table="$MIGRATIONS_TABLE" \
  --command='CREATE TABLE IF NOT EXISTS :"migrations_table" (
    filename text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  );'

find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' -print0 \
  | sort -z \
  | while IFS= read -r -d '' migration_file; do
      filename="$(basename "$migration_file")"
      if command -v sha256sum >/dev/null 2>&1; then
        checksum="$(sha256sum "$migration_file" | awk '{print $1}')"
      else
        checksum="$(shasum -a 256 "$migration_file" | awk '{print $1}')"
      fi

      existing_checksum="$(
        psql "$DATABASE_URL" \
          --tuples-only \
          --no-align \
          --set=ON_ERROR_STOP=1 \
          --set=migrations_table="$MIGRATIONS_TABLE" \
          --set=filename="$filename" \
          --command='SELECT checksum FROM :"migrations_table" WHERE filename = :'\''filename'\'';' \
          | tr -d '[:space:]'
      )"

      if [[ -n "$existing_checksum" ]]; then
        if [[ "$existing_checksum" != "$checksum" ]]; then
          echo "Checksum mismatch for already-applied migration: $filename" >&2
          echo "Expected: $existing_checksum" >&2
          echo "Current:  $checksum" >&2
          exit 1
        fi

        echo "Skipping already-applied migration: $filename"
        continue
      fi

      echo "Applying migration: $filename"
      tmp_file="$(mktemp)"
      printf '\\i %s\n' "$migration_file" > "$tmp_file"
      printf 'INSERT INTO :"migrations_table" (filename, checksum) VALUES (:'\''filename'\'', :'\''checksum'\'');\n' >> "$tmp_file"

      psql "$DATABASE_URL" \
        --set=ON_ERROR_STOP=1 \
        --set=migrations_table="$MIGRATIONS_TABLE" \
        --set=filename="$filename" \
        --set=checksum="$checksum" \
        --single-transaction \
        --file="$tmp_file"

      rm -f "$tmp_file"
    done
