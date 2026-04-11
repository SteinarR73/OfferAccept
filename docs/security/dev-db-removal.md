# Security Incident: SQLite Database Committed to Repository

**Document type:** Security remediation runbook  
**Severity:** P0 — Potential data exposure  
**Status:** Remediation toolkit prepared; awaiting execution

---

## 1. Risk Assessment

### What happened
A SQLite database file (`prisma/dev.db`) was committed to the git repository. SQLite stores
all data in a single binary file, meaning the entire database — including user records, hashed
passwords, session tokens, and any API keys stored as settings — is present in git history and
downloadable by anyone with read access to the repository.

### Why this is critical

| Risk | Detail |
|------|--------|
| **Data exposure** | All user PII, email addresses, and account data is readable |
| **Credential leakage** | Bcrypt/argon2 hashes can be cracked offline; raw tokens are directly usable |
| **GDPR/compliance breach** | Personal data in a potentially public location triggers Article 33 (72h notification duty) |
| **Permanent record** | Even after the file is deleted from HEAD, it remains in git history forever unless rewritten |
| **WAL/SHM files** | `dev.db-wal` (write-ahead log) and `dev.db-shm` (shared memory) may contain uncommitted data not in the main file |

### Scope of exposure
Run this command to determine when the file was first committed and whether the repo was ever public:

```bash
git log --all --full-history -- "prisma/dev.db"
git log --all --full-history -- "prisma/dev.db-wal"
git log --all --full-history -- "prisma/dev.db-shm"
```

---

## 2. Immediate Actions (Before Running Remediation)

Complete these steps **before** rewriting git history:

### 2a. Audit the committed database
Run the audit script to understand what data is present:

```bash
npx ts-node scripts/audit-dev-db.ts
```

### 2b. Preserve a local copy for legal/compliance review
```bash
cp prisma/dev.db /tmp/dev-db-audit-$(date +%Y%m%d).db
```

### 2c. Notify your team
**Do not run `git filter-repo` without coordinating.** Every developer must:
1. Push all in-progress branches
2. Note their current HEAD commit hash
3. Delete their local clone after history rewrite (re-clone from origin)

```bash
# Each team member should run before the rewrite:
git push origin HEAD
git log --oneline -1  # record this hash
```

---

## 3. Git History Rewrite

### Prerequisites
Install `git-filter-repo` (Python-based, faster and safer than `git filter-branch`):

```bash
# macOS
brew install git-filter-repo

# pip (cross-platform)
pip install git-filter-repo

# Verify
git filter-repo --version
```

### Step 1 — Create a clean working copy
Always rewrite on a fresh clone to avoid state contamination:

```bash
cd /tmp
git clone --mirror git@github.com:YOUR_ORG/YOUR_REPO.git repo-rewrite
cd repo-rewrite
```

### Step 2 — Remove all three database files from history
```bash
git filter-repo --path prisma/dev.db --invert-paths
git filter-repo --path prisma/dev.db-wal --invert-paths
git filter-repo --path prisma/dev.db-shm --invert-paths
```

If the files were in a different location (e.g. `db/development.sqlite`), adjust the paths accordingly.

### Step 3 — Verify removal
```bash
# Must return no output — any output means the file is still present
git log --all --full-history -- "prisma/dev.db"
git log --all --full-history -- "prisma/dev.db-wal"
git log --all --full-history -- "prisma/dev.db-shm"
```

### Step 4 — Force-push all branches and tags
```bash
# Push all branches
git push --force --all

# Push all tags (tags also carry history)
git push --force --tags
```

> **Warning:** Force-pushing rewrites the remote history. Any developer who has cloned or
> pulled since the original commit will have diverged history. They must re-clone.

### Step 5 — Force-push origin (GitHub-specific)
If using GitHub, the push protection may block this. You may need to temporarily disable
branch protection on `main`:

```
GitHub → Settings → Branches → Branch protection rules → Edit → uncheck
"Require pull request reviews" → Save → force-push → re-enable
```

### Step 6 — Invalidate GitHub's cache
GitHub caches objects for up to 90 days. File a support request at
https://support.github.com to request immediate cache invalidation for the removed objects.

---

## 4. Post-Rewrite: Team Coordination

Every developer must perform these steps after the history rewrite is pushed:

```bash
# 1. Back up any uncommitted work
git stash

# 2. Delete the local clone entirely (do NOT rebase — rebasing onto rewritten history
#    can re-introduce the deleted files)
cd ..
rm -rf your-repo-directory

# 3. Re-clone fresh from origin
git clone git@github.com:YOUR_ORG/YOUR_REPO.git
cd your-repo-directory

# 4. Restore any backed-up work
# Re-apply patches manually or cherry-pick from saved commit hashes
```

---

## 5. .gitignore Hardening

Ensure these entries are present in `.gitignore` at the repository root:

```gitignore
# SQLite — never commit database files
prisma/*.db
prisma/*.db-wal
prisma/*.db-shm
*.db
*.db-wal
*.db-shm
```

Also add a pre-commit hook to block accidental re-addition:

```bash
# .git/hooks/pre-commit (make executable: chmod +x .git/hooks/pre-commit)
#!/bin/bash
if git diff --cached --name-only | grep -E '\.(db|db-wal|db-shm)$'; then
  echo "ERROR: Attempting to commit a SQLite database file."
  echo "Remove it with: git rm --cached <file>"
  exit 1
fi
```

For team-wide enforcement, add to `package.json` via Husky:

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "bash .git/hooks/pre-commit"
    }
  }
}
```

---

## 6. Secret Rotation Checklist

See [secret-rotation-checklist.md](./secret-rotation-checklist.md) for the full rotation
runbook. The short version:

| Secret | Rotation action |
|--------|----------------|
| `JWT_SECRET` | Generate new 64-char random string; invalidates all active sessions |
| `STRIPE_SECRET_KEY` | Rotate in Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Delete webhook endpoint and re-create; copy new signing secret |
| `GEMINI_API_KEY` | Revoke in Google AI Studio → API keys |
| `DATABASE_URL` | Change password in database; update hosting env vars |

**All secrets that were stored in the database must also be rotated**, not just environment variables.

---

## 7. Verification

After completing remediation, confirm:

```bash
# 1. File not in HEAD
ls prisma/dev.db  # must return: No such file or directory

# 2. File not in any branch history
git log --all --full-history -- "prisma/dev.db"  # must return: (empty)

# 3. Gitignore blocks re-addition
touch prisma/dev.db
git status  # dev.db must NOT appear as untracked
rm prisma/dev.db

# 4. Pre-commit hook blocks forced addition
git add -f prisma/dev.db && git commit -m "test"  # must be blocked by hook
git reset HEAD prisma/dev.db && rm prisma/dev.db
```

---

*Document prepared as part of P0 security remediation. Retain for compliance audit trail.*
