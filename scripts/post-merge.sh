#!/bin/bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

CI=true pnpm install --frozen-lockfile --prefer-offline
pnpm run typecheck:libs

# Do not run drizzle-kit push here: legacy database objects are not all
# represented in Drizzle, and push can prompt to truncate or drop real data.
# Database changes must be applied as reviewed, narrowly scoped migrations
# by the task that owns the schema change, not inferred during every merge.
