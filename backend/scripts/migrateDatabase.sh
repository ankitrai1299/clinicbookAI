#!/usr/bin/env bash
#
# Move the app's data from one Postgres to another — used to bring the database
# from Singapore (ap-southeast-1) into India (ap-south-1) for ABDM.
#
#   SRC_URL="postgresql://...singapore.../postgres" \
#   DST_URL="postgresql://...mumbai.../postgres" \
#   bash scripts/migrateDatabase.sh            # dump + verify, does NOT write
#
#   ...same, plus --apply                      # actually restores
#
# ONLY the `public` schema moves. Supabase's own schemas (auth, storage,
# realtime, vault, graphql, extensions) belong to the platform and a fresh
# project already has them — copying them across would fight the target's own
# definitions for no gain. This app uses none of them: it has its own JWT auth,
# and object storage is not configured.
#
# Use the DIRECT connection URLs (port 5432), not the pooler (6543). pgbouncer
# in transaction mode cannot carry a restore.

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
echo "  mode : $([[ $APPLY == true ]] && echo 'APPLY — the target WILL be written' || echo 'dry run — nothing is written')"
echo

# ── 1. Refuse to restore onto data ────────────────────────────────────────────
# A second run that silently merged into a half-migrated target would leave a
# mess that is very hard to unpick. An empty target is the only safe one.
DST_TABLES=$(psql "$DST_URL" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
echo "target public tables: $DST_TABLES"
if [[ "$DST_TABLES" != "0" ]]; then
  echo
  echo "REFUSING: the target already has $DST_TABLES table(s) in \`public\`."
  echo "This script only ever restores into an EMPTY schema. To start over:"
  echo "    psql \"\$DST_URL\" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'"
  echo
  exit 1
fi

# ── 2. Dump ───────────────────────────────────────────────────────────────────
# --no-owner / --no-privileges: the role names differ between projects, and
# grants that name a role the target has never heard of abort the restore.
echo "dumping public schema..."
pg_dump "$SRC_URL" \
  --schema=public \
  --no-owner \
  --no-privileges \
  --no-publications \
  --no-subscriptions \
  --quote-all-identifiers \
  -f "$DUMP"

echo "dump: $(wc -c <"$DUMP") bytes, $(grep -c '^COPY ' "$DUMP" || true) table(s) with data"

# ── 3. Row counts on the source, to compare against afterwards ───────────────
counts_sql="SELECT table_name FROM information_schema.tables
            WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1"
echo
echo "source row counts:"
SRC_TOTAL=0
declare -A SRC_COUNT
while read -r t; do
  [[ -z "$t" ]] && continue
  n=$(psql "$SRC_URL" -tAc "SELECT count(*) FROM public.\"$t\"")
  SRC_COUNT["$t"]=$n
  SRC_TOTAL=$((SRC_TOTAL + n))
  [[ "$n" != "0" ]] && printf '  %-28s %s\n' "$t" "$n"
done < <(psql "$SRC_URL" -tAc "$counts_sql")
echo "  ── total: $SRC_TOTAL rows"

if [[ $APPLY != true ]]; then
  echo
  echo "Dry run complete. The dump was taken and discarded; the target is untouched."
  echo "Re-run with --apply to restore."
  echo
  exit 0
fi

# ── 4. Restore ────────────────────────────────────────────────────────────────
# ON_ERROR_STOP so a failure halts here instead of leaving a partial database
# that looks like it worked.
echo
echo "restoring..."
psql "$DST_URL" -v ON_ERROR_STOP=1 -q -f "$DUMP"

# ── 5. Verify, table by table ─────────────────────────────────────────────────
# "It restored without error" is not the same as "the data is there". Compare.
echo
echo "verifying:"
MISMATCH=0
DST_TOTAL=0
for t in "${!SRC_COUNT[@]}"; do
  n=$(psql "$DST_URL" -tAc "SELECT count(*) FROM public.\"$t\"" 2>/dev/null || echo "MISSING")
  DST_TOTAL=$((DST_TOTAL + ${n//MISSING/0}))
  if [[ "$n" != "${SRC_COUNT[$t]}" ]]; then
    printf '  MISMATCH  %-28s source=%s  target=%s\n' "$t" "${SRC_COUNT[$t]}" "$n"
    MISMATCH=$((MISMATCH + 1))
  fi
done

echo
if [[ $MISMATCH -eq 0 ]]; then
  echo "  every table matches — $DST_TOTAL rows moved."
  echo
  echo "  NEXT: point Railway at the new database."
  echo "    DATABASE_URL -> the new POOLER url  (port 6543, ?pgbouncer=true)"
  echo "    DIRECT_URL   -> the new DIRECT url  (port 5432)"
  echo "  Then redeploy. Leave the old project alone for a few days."
  echo
else
  echo "  $MISMATCH table(s) DO NOT match. Do not switch Railway over."
  echo "  Start again with a clean target:"
  echo "    psql \"\$DST_URL\" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'"
  echo
  exit 1
fi
