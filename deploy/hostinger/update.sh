#!/bin/sh
# Update Commander Live on the VPS to the newest code on a branch (main by default):
#   sh deploy/hostinger/update.sh [branch]
# Players in a room are told to reconnect; the page reconnects by itself.
set -eu
cd "$(dirname "$0")"
branch="${1:-main}"

[ -f .env ] || { echo "Missing deploy/hostinger/.env (copy env.example and fill it in)." >&2; exit 1; }

git fetch origin "$branch"
git checkout "$branch"
git merge --ff-only "origin/$branch"

docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null

# The server reports healthy only when it reaches its room storage.
for attempt in $(seq 1 30); do
  state="$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q live)" 2>/dev/null || echo starting)"
  [ "$state" = "healthy" ] && { echo "Commander Live is healthy at revision $(git rev-parse --short HEAD)."; exit 0; }
  sleep 2
done
echo "Commander Live did not become healthy. Check: docker compose logs --tail 50 live" >&2
exit 1
