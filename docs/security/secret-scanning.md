# Secret Scanning

## Overview

Two complementary layers prevent credentials from entering the repository:

| Layer | Where | When | Tool |
|-------|-------|------|------|
| Pre-commit hook | Developer workstation | Before every local commit | `.githooks/pre-commit` |
| CI job | GitHub Actions | Every push and pull request | `scripts/secret-scan.ts` via `pnpm secret-scan` |

The pre-commit hook is a fast local feedback loop. The CI job is the enforcement gate — it runs on the full file tree and must pass before a build artifact can be produced.

---

## CI Job: `secret-scan`

**File:** `.github/workflows/ci.yml`  
**Job name:** `secret-scan`  
**Trigger:** Every `push` and `pull_request` targeting `main`  
**Blocking:** The `build` job lists `secret-scan` in its `needs` array — no artifact is produced if the scan fails.

### What it does

1. Checks out the repository at the commit being tested.
2. Installs dependencies (`pnpm install --frozen-lockfile`) to make `tsx` available.
3. Runs `pnpm secret-scan`, which executes `scripts/secret-scan.ts`.
4. Exits 0 (pass) or 1 (fail) — GitHub Actions marks the job accordingly.

### Job definition (excerpt)

```yaml
secret-scan:
  name: Secret scan
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with:
        version: ${{ env.PNPM_VERSION }}
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: pnpm
    - name: Install dependencies
      run: pnpm install --frozen-lockfile
    - name: Scan for secrets
      run: pnpm secret-scan
```

---

## What is scanned

`scripts/secret-scan.ts` scans every file tracked by git. Binary files and files over 5 MB are skipped automatically.

### Detection rules

| Rule name | Pattern | Examples caught |
|-----------|---------|-----------------|
| `stripe-live-secret` | `sk_live_[A-Za-z0-9]{20,}` | Live Stripe secret keys |
| `stripe-live-publishable` | `pk_live_[A-Za-z0-9]{20,}` | Live Stripe publishable keys |
| `stripe-webhook-secret` | `whsec_[A-Za-z0-9]{20,}` | Stripe webhook signing secrets |
| `aws-access-key-id` | `AKIA[A-Z0-9]{16}` | AWS access key IDs |
| `aws-secret-access-key` | Assignment of 40-char AWS secret | AWS secret access keys |
| `private-key-header` | `-----BEGIN ... PRIVATE KEY-----` | PEM private keys |
| `long-jwt-secret-assignment` | `JWT_SECRET = <≥32 chars>` | Hardcoded JWT secrets |
| `gemini-api-key` | `AIza[A-Za-z0-9_-]{35}` | Google / Gemini API keys |
| `generic-secret-assignment-40chars` | `SECRET/API_KEY/TOKEN = <≥40 chars>` | Miscellaneous long secrets |
| `database-url-with-password` | `postgresql://user:password@host` | Connection strings with embedded credentials |

### Excluded paths

The following are never scanned:

- `node_modules/`, `dist/`, `build/`, `.next/`, `coverage/`
- Lock files (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`)
- Binary and image files (`.png`, `.jpg`, `.pdf`, `.zip`, `.woff2`, etc.)
- Files larger than 5 MB

### False-positive suppression

Lines containing any of the following strings are skipped (case-insensitive):

```
example  test  placeholder  your_  xxx  <secret>  ${
```

This avoids false positives on documentation examples, test fixtures, and template
strings like `process.env.JWT_SECRET` or `YOUR_API_KEY_HERE`.

---

## Pre-commit hook

**File:** `.githooks/pre-commit`

The hook runs automatically on every `git commit` after the one-time setup:

```bash
git config core.hooksPath .githooks
```

This is done automatically by the `prepare` script in `package.json`, which runs on every `pnpm install`.

### What the hook checks

1. **Database files** — blocks `*.db`, `*.sqlite`, `*.sqlite3`, `*.db-wal`, `*.db-shm`
2. **Environment files** — blocks any file matching `(^|/)\.env($|\.)`
3. **Key / certificate files** — blocks `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.crt`, `*.cer`, `*.jks`, `*.keystore`
4. **Secret patterns** — scans the staged diff for four patterns:
   - `JWT_SECRET` assignment with ≥32-char value
   - Stripe live secret key (`sk_live_…`)
   - AWS access key ID (`AKIA…`)
   - Generic `API_KEY / SECRET / ACCESS_TOKEN` assignment with ≥40-char value

### Bypassing (emergency use only)

```bash
git commit --no-verify
```

Use only when intentionally committing a known-safe exception (e.g. rotating a test key
value). Document the reason in the commit message.

---

## Responding to a CI failure

When `secret-scan` fails, the output lists each violation with:
- File path and line number
- Rule name
- Truncated excerpt (middle of long lines is masked)
- Remediation guidance

### Triage steps

1. **Review the violation** — is it a real credential or a false positive?

2. **If it is a false positive:**
   - Add the triggering term to the `FALSE_POSITIVE_TOKENS` array in `scripts/secret-scan.ts`, OR
   - Add an inline suppression comment on the offending line:
     ```typescript
     // secret-scan-ignore: this is an example value, not a real key
     ```
     Then update the scanner to honour that comment (search for `FALSE_POSITIVE_TOKENS` in the script).

3. **If it is a real credential:**
   - **Do not merge the PR.**
   - Follow the rotation procedures in `docs/security/secret-rotation-execution.md`.
   - Remove the secret from the branch and force-push (coordinate with the team first).
   - If the branch was already merged to `main`, treat it as an active exposure and rotate immediately.

---

## Adding a new detection rule

Edit `scripts/secret-scan.ts` and add an entry to the `RULES` array:

```typescript
{
  name: 'my-service-api-key',
  pattern: /myservice_[A-Za-z0-9]{32,}/,
  remediation: 'Rotate the key at myservice.com/account/api-keys.',
},
```

Rules are matched per-line. Keep patterns specific enough to avoid false positives on
documentation and test files — use the `FALSE_POSITIVE_TOKENS` suppression mechanism
for unavoidable overlaps.

---

## Relationship to GitHub's native secret scanning

GitHub's built-in secret scanning (available on public repos and GitHub Advanced Security)
provides a complementary layer with a broader rule set and push-protection features.

`scripts/secret-scan.ts` is intentionally simpler:
- It runs on **private** repos without Advanced Security
- It covers **project-specific patterns** (e.g. `JWT_SECRET` assignments) that generic scanners miss
- It runs **before the build**, blocking the artifact pipeline, not just alerting

Both layers should be active where available.
