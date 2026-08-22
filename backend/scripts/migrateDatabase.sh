#!/usr/bin/env bash
#
# Move the app's data from one Postgres to another — used to bring the database
# from Singapore (ap-southeast-1) into India (ap-south-1) for ABDM.
#
#   SRC_URL="postgresql://...:5432/postgres" \
#   DST_URL="postgresql://...:5432/postgres" \
#   bash scripts/migrateDatabase.sh            # dump + count, does NOT write
#
#   ...same, plus --apply                      # actually restores
#
# ONLY the `public` schema moves. Supabase's own schemas (auth, storage,
# realtime, vault, graphql, extensions) belong to the platform and a fresh
# project already has them — copying them across would fight the target's own
# definitions for no gain. This app uses none of them: it has its own JWT auth,
# and object storage is not configured.
#
# Both URLs must be port 5432 — a direct connection, or Supabase's SESSION
# pooler. NOT the transaction pooler on 6543: pgbouncer in transaction mode
# cannot carry a restore. (Supabase's `db.<ref>.supabase.co` direct host is
# IPv6-only on new projects; the session pooler is the IPv4 way in.)

set -euo pipefail

APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

: "${SRC_URL:?SRC_URL is required (the database to copy FROM)}"
: "${DST_URL:?DST_URL is required (the database to copy INTO)}"

mask() { sed 's|://[^@]*@|://***@|' <<<"$1"; }

DUMP="${TMPDIR:-/tmp}/clinicbook-migrate-$$.sql"
trap 'rm -f "$DUMP"' EXIT

echo
echo "  FROM : $(mask "$SRC_URL")"
echo "  INTO : $(mask "$DST_URL")"
if [[ $APPLY == true ]]; then
  echo "  mode : APPLY — the target WILL be written"
else
  echo "  mode : dry run — nothing is written"
fi
echo

# ── Row counts, in ONE query ──────────────────────────────────────────────────
#
# Not a shell loop over table names. The loop version broke on Windows: psql
# prints CRLF, so every table name arrived with a trailing carriage return and
# the count query failed on an identifier that looked perfectly correct in the
# error message. Doing it in SQL takes the shell out of the path entirely — and
# costs one round trip instead of thirty-nine.
COUNTS_SQL="
SELECT table_name || '|' || (xpath('/row/c/text()', x))[1]::text
FROM (
  SELECT table_name,
         query_to_xml(format('select count(*) as c from public.%I', table_name),
                      false, true, '') AS x
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
) t
ORDER BY table_name"

read_counts() { psql "$1" -tAc "$COUNTS_SQL" | tr -d '\r'; }

# ── 1. Refuse to restore onto data ────────────────────────────────────────────
# A second run merging into a half-migrated target leaves a mess that is very
# hard to unpick. An empty target is the only safe one.
DST_TABLES=$(psql "$DST_URL" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'" | tr -d '\r')
echo "target public tables: $DST_TABLES"
if [[ "$DST_TABLES" != "0" ]]; then
  echo
  echo "REFUSING: the target already has $DST_TABLES table(s) in 'public'."
  echo "This script only ever restores into an EMPTY schema. To start over:"
  echo "    psql \"\$DST_URL\" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'"
  echo
  exit 1
fi

# ── 2. Dump ───────────────────────────────────────────────────────────────────
# --no-owner / --no-privileges: role names differ between projects, and a grant
# naming a role the target has never heard of aborts the restore partway.
echo "dumping public schema..."
pg_dump "$SRC_URL" \
  --schema=public \
  --no-owner \
  --no-privileges \
  --no-publications \
  --no-subscriptions \
  --quote-all-identifiers \
  -f "$DUMP"

# `pg_dump --schema=public` emits `CREATE SCHEMA "public";` and a COMMENT on it.
# Every Postgres database already HAS a public schema, so the create fails
# immediately — and with ON_ERROR_STOP that aborts the whole restore before a
# single table is written. The comment fails too, on a fresh Supabase project,
# because the schema is not owned by our role.
#
# Dropping and recreating the target's public schema would also work, but it
# discards grants for no reason. Removing two statements the target does not
# need is the smaller change.
sed -i -E \
  -e '/^CREATE SCHEMA "?public"?;/d' \
  -e '/^COMMENT ON SCHEMA "?public"? IS/d' \
  "$DUMP"

echo "dump: $(wc -c <"$DUMP") bytes, $(grep -c '^COPY ' "$DUMP" || true) table(s) with data"

# ── 3. Source counts, to compare against afterwards ───────────────────────────
echo
echo "source row counts:"
SRC_TOTAL=0
declare -A SRC_COUNT
while IFS='|' read -r t n; do
  [[ -z "$t" ]] && continue
  SRC_COUNT["$t"]=$n
  SRC_TOTAL=$((SRC_TOTAL + n))
  if [[ "$n" != "0" ]]; then
    printf '  %-28s %s\n' "$t" "$n"
  fi
done < <(read_counts "$SRC_URL")
echo "  -- total: $SRC_TOTAL rows across ${#SRC_COUNT[@]} tables"

if [[ $APPLY != true ]]; then
  echo
  echo "Dry run complete. The dump was taken and discarded; the target is untouched."
  echo "Re-run with --apply to restore."
  echo
  exit 0
fi

# ── 4. Restore ────────────────────────────────────────────────────────────────
# ON_ERROR_STOP so a failure halts here rather than leaving a partial database
# that looks like it worked.
echo
echo "restoring..."
psql "$DST_URL" -v ON_ERROR_STOP=1 -q -f "$DUMP"

# ── 5. Verify, table by table ─────────────────────────────────────────────────
# "It restored without error" is not the same as "the data is there".
echo
echo "verifying:"
MISMATCH=0
DST_TOTAL=0
declare -A DST_COUNT
while IFS='|' read -r t n; do
  [[ -z "$t" ]] && continue
  DST_COUNT["$t"]=$n
  DST_TOTAL=$((DST_TOTAL + n))
done < <(read_counts "$DST_URL")

for t in "${!SRC_COUNT[@]}"; do
  got="${DST_COUNT[$t]-MISSING}"
  if [[ "$got" != "${SRC_COUNT[$t]}" ]]; then
    printf '  MISMATCH  %-28s source=%s  target=%s\n' "$t" "${SRC_COUNT[$t]}" "$got"
    MISMATCH=$((MISMATCH + 1))
  fi
done

echo
if [[ $MISMATCH -eq 0 ]]; then
  echo "  every table matches — $DST_TOTAL rows moved."
  echo
  echo "  NEXT: point Railway at the new database, then redeploy."
  echo "  Leave the old project alone for a few days."
  echo
else
  echo "  $MISMATCH table(s) DO NOT match. Do not switch Railway over."
  echo "  Start again with a clean target:"
  echo "    psql \"\$DST_URL\" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'"
  echo
  exit 1
fi
