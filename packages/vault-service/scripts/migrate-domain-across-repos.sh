#!/usr/bin/env bash
set -euo pipefail

OWNER="${OWNER:-crvouga}"
OLD_HOST="${OLD_HOST:-vault.chrisvouga.dev}"
NEW_HOST="${NEW_HOST:-vault.chrisvouga.dev}"
DRY_RUN=0
COMMIT_MSG="chore: migrate vault domain to ${NEW_HOST}"

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Find every ${OWNER} repo containing ${OLD_HOST}, replace it with ${NEW_HOST},
then commit and push directly to each repo's default branch.

Options:
  --owner OWNER   GitHub owner (default: ${OWNER})
  --old HOST      Old hostname to replace (default: ${OLD_HOST})
  --new HOST      New hostname (default: ${NEW_HOST})
  --dry-run       Show what would change without committing or pushing
  -h, --help      Show this help

Requires: gh, git, python3
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --owner)
      [ $# -ge 2 ] || { echo "ERROR: --owner requires a value" >&2; exit 1; }
      OWNER="$2"; shift 2 ;;
    --old)
      [ $# -ge 2 ] || { echo "ERROR: --old requires a value" >&2; exit 1; }
      OLD_HOST="$2"; shift 2 ;;
    --new)
      [ $# -ge 2 ] || { echo "ERROR: --new requires a value" >&2; exit 1; }
      NEW_HOST="$2"; shift 2 ;;
    --dry-run)
      DRY_RUN=1; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "ERROR: Unknown option: $1" >&2
      usage >&2
      exit 1 ;;
  esac
done

require_cmd() {
  local cmd="$1"
  local hint="${2:-}"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: ${cmd} is required${hint:+ (${hint})}" >&2
    exit 1
  fi
}

require_cmd gh
require_cmd git
require_cmd python3

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh is not authenticated" >&2
  exit 1
fi

WORK_ROOT="$(mktemp -d)"
trap 'rm -rf "$WORK_ROOT"' EXIT

echo "==> Listing ${OWNER} repos..."
REPO_LIST="$(gh repo list "$OWNER" --no-archived --source -L 1000 --json nameWithOwner,isFork \
  | python3 -c '
import json, sys
for repo in json.load(sys.stdin):
    if repo.get("isFork"):
        continue
    name = repo.get("nameWithOwner")
    if name:
        print(name)
' | sort)"

if [ -z "$REPO_LIST" ]; then
  echo "No repos found containing ${OLD_HOST}"
  exit 0
fi

REPO_COUNT="$(printf '%s\n' "$REPO_LIST" | sed '/^$/d' | wc -l | tr -d ' ')"
echo "Found ${REPO_COUNT} repo(s)"

updated=0
skipped=0
failed=0
declare -a FAILED_REPOS=()

scan_repo_for_old_host() {
  local repo_dir="$1"
  python3 - "$repo_dir" "$OLD_HOST" <<'PY'
import pathlib
import re
import sys

repo_dir = pathlib.Path(sys.argv[1])
old_host = sys.argv[2]
pattern = re.compile(re.escape(old_host))
matches = []

for path in repo_dir.rglob("*"):
    if not path.is_file():
        continue
    if ".git" in path.parts:
        continue
    try:
        data = path.read_bytes()
    except OSError:
        continue
    if b"\x00" in data:
        continue
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        continue
    if pattern.search(text):
        matches.append(str(path.relative_to(repo_dir)))

for rel in sorted(matches):
    print(rel)
PY
}

replace_in_repo() {
  local repo_dir="$1"
  python3 - "$repo_dir" "$OLD_HOST" "$NEW_HOST" <<'PY'
import pathlib
import re
import sys

repo_dir = pathlib.Path(sys.argv[1])
old_host = sys.argv[2]
new_host = sys.argv[3]
pattern = re.compile(re.escape(old_host))
changed = []

for path in repo_dir.rglob("*"):
    if not path.is_file():
        continue
    if ".git" in path.parts:
        continue
    try:
        data = path.read_bytes()
    except OSError:
        continue
    if b"\x00" in data:
        continue
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        continue
    if pattern.search(text):
        path.write_text(pattern.sub(new_host, text), encoding="utf-8")
        changed.append(str(path.relative_to(repo_dir)))

for rel in sorted(changed):
    print(rel)
PY
}

process_repo() {
  local repo="$1"
  local default_branch archived is_fork repo_dir changed_files

  echo ""
  echo "==> ${repo}"

  repo_meta="$(gh repo view "$repo" --json defaultBranchRef,isArchived,isFork 2>/dev/null || true)"
  if [ -z "$repo_meta" ]; then
    echo "ERROR: could not read repo metadata" >&2
    return 1
  fi

  archived="$(printf '%s' "$repo_meta" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("isArchived", False))')"
  is_fork="$(printf '%s' "$repo_meta" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("isFork", False))')"
  default_branch="$(printf '%s' "$repo_meta" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("defaultBranchRef") or {}).get("name") or "main")')"

  if [ "$archived" = "True" ]; then
    echo "Skipping archived repo"
    skipped=$((skipped + 1))
    return 0
  fi
  if [ "$is_fork" = "True" ]; then
    echo "Skipping fork"
    skipped=$((skipped + 1))
    return 0
  fi

  repo_dir="${WORK_ROOT}/$(echo "$repo" | tr '/' '_')"
  rm -rf "$repo_dir"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "DRY RUN: would clone ${repo} (${default_branch})"
  else
    git clone --depth 1 --branch "$default_branch" "https://github.com/${repo}.git" "$repo_dir" >/dev/null 2>&1 \
      || git clone --depth 1 "https://github.com/${repo}.git" "$repo_dir" >/dev/null 2>&1
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "DRY RUN: would replace ${OLD_HOST} -> ${NEW_HOST}"
    skipped=$((skipped + 1))
    return 0
  fi

  changed_files="$(replace_in_repo "$repo_dir" || true)"
  if [ -z "$changed_files" ]; then
    echo "No changes needed"
    skipped=$((skipped + 1))
    return 0
  fi

  echo "Changed files:"
  printf '%s\n' "$changed_files" | sed 's/^/  - /'

  cd "$repo_dir"
  git add -A
  if git diff --cached --quiet; then
    echo "No staged changes after add"
    skipped=$((skipped + 1))
    return 0
  fi
  git -c user.name="Domain Migration Bot" -c user.email="bot@users.noreply.github.com" \
    commit -m "$COMMIT_MSG"
  git push origin "HEAD:${default_branch}"

  echo "Pushed to ${default_branch}"
  updated=$((updated + 1))
}

while IFS= read -r repo; do
  [ -n "$repo" ] || continue
  if process_repo "$repo"; then
    :
  else
    failed=$((failed + 1))
    FAILED_REPOS+=("$repo")
  fi
done <<< "$REPO_LIST"

echo ""
echo "================================================================================"
echo "Migration summary"
echo "================================================================================"
echo "Owner:    ${OWNER}"
echo "Replace:  ${OLD_HOST} -> ${NEW_HOST}"
echo "Updated:  ${updated}"
echo "Skipped:  ${skipped}"
echo "Failed:   ${failed}"

if [ "$failed" -gt 0 ]; then
  echo ""
  echo "Failed repos:"
  for repo in "${FAILED_REPOS[@]}"; do
    echo "  - ${repo}"
  done
  exit 1
fi

echo ""
echo "==> Verifying no remaining references in ${OWNER} repos..."
REMAINING_COUNT=0
while IFS= read -r repo; do
  [ -n "$repo" ] || continue
  repo_dir="${WORK_ROOT}/verify_$(echo "$repo" | tr '/' '_')"
  rm -rf "$repo_dir"
  git clone --depth 1 "https://github.com/${repo}.git" "$repo_dir" >/dev/null 2>&1 || continue
  if [ -n "$(scan_repo_for_old_host "$repo_dir" || true)" ]; then
    echo "  - ${repo}" >&2
    REMAINING_COUNT=$((REMAINING_COUNT + 1))
  fi
done <<< "$REPO_LIST"

if [ "$REMAINING_COUNT" -gt 0 ]; then
  echo "ERROR: ${REMAINING_COUNT} repo(s) still contain ${OLD_HOST}" >&2
  exit 1
fi

echo "No remaining references to ${OLD_HOST}"
