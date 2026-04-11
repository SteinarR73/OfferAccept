#!/usr/bin/env bash
# =============================================================================
# scripts/remove-dev-db-history.sh
# =============================================================================
# PRECAUTIONARY TOOLKIT — removes prisma/dev.db (and *.db-wal, *.db-shm)
# from ALL git history using git-filter-repo.
#
# ⚠️  DESTRUCTIVE — rewrites git history.
# ⚠️  Invalidates all existing clones and open pull requests.
# ⚠️  Coordinate with your entire team before running.
# ⚠️  Run on a FRESH CLONE of the repository, not your working copy.
#
# Current repo status: dev.db was NEVER committed. This script is retained
# as a precautionary toolkit for any future incident.
#
# See docs/security/dev-db-removal.md for the full runbook.
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}============================================================${RESET}"
echo -e "${BOLD}  Git history rewrite — prisma/dev.db removal toolkit${RESET}"
echo -e "${BOLD}============================================================${RESET}"
echo ""

# ── Pre-flight: confirm running on a dedicated clone ─────────────────────────
echo -e "${YELLOW}WARNING: This script rewrites git history irreversibly.${RESET}"
echo -e "${YELLOW}It should be run on a fresh bare clone, not your working copy.${RESET}"
echo ""
read -r -p "Type REWRITE to confirm you understand and wish to proceed: " CONFIRM
if [[ "$CONFIRM" != "REWRITE" ]]; then
  echo "Aborted."
  exit 1
fi

# ── Step 1: Check whether dev.db is actually in git history ──────────────────
echo ""
echo -e "${BOLD}Step 1 — Checking git history for .db files...${RESET}"

DB_IN_HISTORY=$(git log --all --diff-filter=A --name-only --format="" 2>/dev/null | grep -E '\.db$|\.db-wal$|\.db-shm$|\.sqlite$|\.sqlite3$' || true)

if [[ -z "$DB_IN_HISTORY" ]]; then
  echo -e "${GREEN}✅  No .db / .sqlite files found in git history.${RESET}"
  echo ""
  echo "This repo does not require a history rewrite."
  echo "The rest of this script is shown for educational purposes only."
  echo ""
  read -r -p "Continue anyway to see what the script would do? [y/N] " CONTINUE
  [[ "$CONTINUE" =~ ^[Yy]$ ]] || exit 0
else
  echo -e "${RED}⚠️  Found the following .db files in history:${RESET}"
  echo "$DB_IN_HISTORY"
fi

# ── Step 2: Install git-filter-repo if missing ────────────────────────────────
echo ""
echo -e "${BOLD}Step 2 — Ensuring git-filter-repo is installed...${RESET}"

if command -v git-filter-repo &>/dev/null; then
  echo -e "${GREEN}✅  git-filter-repo is already installed: $(command -v git-filter-repo)${RESET}"
else
  echo "git-filter-repo not found. Attempting install..."
  if command -v pip3 &>/dev/null; then
    pip3 install git-filter-repo
  elif command -v brew &>/dev/null; then
    brew install git-filter-repo
  else
    echo -e "${RED}Cannot install git-filter-repo automatically.${RESET}"
    echo "Install it manually: https://github.com/newren/git-filter-repo#installation"
    exit 1
  fi
fi

git-filter-repo --version

# ── Step 3: Create a backup tag before rewriting ─────────────────────────────
echo ""
echo -e "${BOLD}Step 3 — Creating backup tag before rewrite...${RESET}"

BACKUP_TAG="backup/pre-db-removal-$(date +%Y%m%d-%H%M%S)"
git tag "$BACKUP_TAG"
echo -e "${GREEN}✅  Backup tag created: $BACKUP_TAG${RESET}"
echo "(This tag will not be pushed unless you explicitly push it.)"

# ── Step 4: Run git-filter-repo ───────────────────────────────────────────────
echo ""
echo -e "${BOLD}Step 4 — Rewriting history to remove .db files...${RESET}"
echo -e "${YELLOW}This may take several minutes on large repositories.${RESET}"

git filter-repo \
  --path "prisma/dev.db" --invert-paths \
  --path "prisma/dev.db-wal" --invert-paths \
  --path "prisma/dev.db-shm" --invert-paths \
  --path-glob "*.db" --invert-paths \
  --path-glob "*.db-wal" --invert-paths \
  --path-glob "*.db-shm" --invert-paths \
  --path-glob "*.sqlite" --invert-paths \
  --path-glob "*.sqlite3" --invert-paths

echo -e "${GREEN}✅  History rewrite complete.${RESET}"

# ── Step 5: Verify the rewrite ────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Step 5 — Verifying removal...${RESET}"

REMAINING=$(git log --all --diff-filter=A --name-only --format="" 2>/dev/null | grep -E '\.db$|\.sqlite$' || true)
if [[ -z "$REMAINING" ]]; then
  echo -e "${GREEN}✅  Verification passed: no .db files remain in history.${RESET}"
else
  echo -e "${RED}⚠️  Verification FAILED. Found remaining files:${RESET}"
  echo "$REMAINING"
  echo "Inspect manually before force-pushing."
  exit 1
fi

# ── Step 6: Force-push instructions ──────────────────────────────────────────
echo ""
echo -e "${BOLD}============================================================${RESET}"
echo -e "${BOLD}  NEXT STEPS — Team coordination required${RESET}"
echo -e "${BOLD}============================================================${RESET}"
echo ""
echo -e "${RED}⚠️  DO NOT run these commands until all team members are notified.${RESET}"
echo -e "${RED}⚠️  Every developer must re-clone after you force-push.${RESET}"
echo ""
echo "1. Re-add your remote (git-filter-repo removes it for safety):"
echo "   git remote add origin <YOUR_REMOTE_URL>"
echo ""
echo "2. Force-push all branches:"
echo "   git push --force --all origin"
echo ""
echo "3. Force-push all tags:"
echo "   git push --force --tags origin"
echo ""
echo "4. Every team member must:"
echo "   cd /some-other-directory"
echo "   git clone <YOUR_REMOTE_URL>"
echo "   (Their existing clone cannot be safely rebased — re-clone is required)"
echo ""
echo "5. Rotate all secrets that may have been in the database:"
echo "   See docs/security/secret-rotation-checklist.md"
echo ""
echo "6. Invalidate GitHub/GitLab caches:"
echo "   Contact your git host to purge cached objects."
echo "   GitHub: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository"
echo ""
echo -e "${GREEN}History rewrite complete. Team coordination required before push.${RESET}"
