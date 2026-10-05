# Scratch harness: exercises the workflow retry loop verbatim against a
# real bare remote, so the "verified" claim rests on execution not reading.
set -euo pipefail

WORK="${1:?workdir}"
REMOTE="${2:?remote}"
BRANCH="${3:-master}"

cd "$WORK"
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t
export GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

# Mirrors the workflow exactly. data.raw.json is deliberately NOT removed
# here: the retry path re-runs build-assets.mjs, which reads it, and it is
# gitignored so `git reset --hard` leaves it alone.
rm -f repos.local.json .projects.json
git add assets/ README.md 2>/dev/null || true

if git diff --cached --quiet; then
  echo "No changes to commit."
  rm -f data.raw.json
  exit 0
fi

git commit -q -m "chore: refresh profile cards"

for attempt in 1 2 3; do
  if git push origin "HEAD:$BRANCH" 2>/dev/null; then
    echo "Pushed on attempt ${attempt}."
    rm -f data.raw.json
    exit 0
  fi

  echo "::warning::Push rejected on attempt ${attempt}; remote moved."
  git fetch --quiet origin "$BRANCH"

  git reset --hard "origin/$BRANCH"
  node .github/scripts/build-assets.mjs
  node .github/scripts/recent-projects.mjs
  node .github/scripts/validate.mjs

  rm -f repos.local.json .projects.json
  git add assets/ README.md 2>/dev/null || true

  if git diff --cached --quiet; then
    echo "Remote already up to date after reset; nothing to commit."
    rm -f data.raw.json
    exit 0
  fi

  git commit -q -m "chore: refresh profile cards"
done

echo "Unable to push after 3 attempts." >&2
rm -f data.raw.json
exit 1