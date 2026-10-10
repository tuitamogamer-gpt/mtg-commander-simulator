#!/usr/bin/env bash
# The supervisor keeps the lock while forwarding outer-shell cancellation to
# an isolated worker group and waiting for browser cleanup. Queue cancellation
# cannot launch a later orphan, and the native timeout starts after acquisition.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec python3 tests/browser/second-audit-browser-supervisor.py "$@"
