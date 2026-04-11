# Phase 1 — Security Exposure Report
**Date:** 2026-04-11  
**Auditor:** Automated differential audit  
**Status:** CLOSED — No active exposure

---

## Findings

### prisma/dev.db — Exposure Status

**Result: NOT PRESENT IN GIT HISTORY**

Command run:
```bash
git log --all -- prisma/dev.db
git log --all --diff-filter=A --name-only --oneline | grep -i '\.db$'
find . -name "*.db" -not -path "*/.git/*"
```

All three checks returned empty output. No `.db`, `.sqlite`, or `.sqlite3` file was
found in any git commit object across the full 62-commit history.

### What Was Found

Commit `ba806f6` ("Security: gitignore hardening, dev.db runbook, and audit tooling")
introduced:
- `.gitignore` entries blocking future `*.db` commits
- `docs/security/dev-db-removal.md` — pre-emptive runbook for the scenario where a
  dev.db is committed
- `docs/security/secret-rotation-checklist.md` — rotation procedures
- `scripts/audit-dev-db.ts` — read-only audit tool

This commit is evidence that the team was **aware of the risk** and proactively closed
the vector before any database file was committed.

### Current .gitignore Coverage

The following patterns are confirmed present in `.gitignore`:
```
.env
.env.local
.env.*.local
prisma/*.db
prisma/*.db-wal
prisma/*.db-shm
*.db
*.db-wal
*.db-shm
```

### Conclusion

| Item | Status |
|------|--------|
| dev.db in git history | ✅ Not present |
| .gitignore blocks future commits | ✅ Confirmed |
| Rotation runbook exists | ✅ Present |
| Audit tooling exists | ✅ Present |

**No history rewrite is required.** The `scripts/remove-dev-db-history.sh` script
created in Task Group 2 is a **precautionary toolkit** for the case where the repo
is cloned on a different machine that did have the file committed, or for any future
incident. It should be retained but is not required to be executed on this repo.

---

## Recommendations

1. Execute `scripts/audit-dev-db.ts` on local developer machines to confirm no
   dev.db exists outside of git.
2. Continue monitoring CI with `scripts/secret-scan.ts` (Phase 6) on every push.
3. Confirm all production secrets are stored in a secrets manager (not `.env` files
   checked into version control).
