#!/bin/sh
set -e

# Bring the database schema up to date, then start the server.
#
# ── Why this is here and not in the platform ──────────────────────────────
#
# On Railway this was `preDeployCommand` in railway.json: the platform ran
# `prisma db push` once, on its own, before any new container started. Most
# other hosts — Lightsail container services among them — have no such hook, so
# a schema change would deploy code that expects columns the database does not
# have yet, and every request touching them would fail until someone noticed.
#
# ── The assumption this makes, stated out loud ────────────────────────────
#
# ONE node. Railway ran with numReplicas: 1 and this app still holds state in
# memory (report jobs, channel caches), so that is not a temporary convenience.
# But it matters here for a second reason: two containers starting together
# would both push DDL at the same database, and concurrent DDL is how you get a
# lock timeout in the middle of a deploy.
#
# So if the service is ever scaled past one node, set SKIP_DB_PUSH=1 and run
# the push yourself before deploying. The guard is deliberately manual: a flag
# that silently did the right thing would hide the fact that the assumption
# changed.

if [ "${SKIP_DB_PUSH}" = "1" ]; then
  echo "[entrypoint] SKIP_DB_PUSH=1 — leaving the schema alone"
else
  echo "[entrypoint] applying the Prisma schema…"
  # --skip-generate: the client was generated at image build time, against this
  # same schema. Regenerating here would need the dev dependencies the runtime
  # image deliberately does not ship.
  npx prisma db push --skip-generate
  echo "[entrypoint] schema is up to date"
fi

# exec, so the server becomes PID 1 and receives SIGTERM directly. Without it
# the shell holds PID 1, swallows the signal, and every deploy ends in a SIGKILL
# ten seconds later — mid-request, and mid-transaction.
exec "$@"
