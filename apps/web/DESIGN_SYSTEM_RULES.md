# OfferAccept — Design System Rules

> **Design System Freeze.**  
> These rules define the canonical patterns. Future code must conform to them.  
> Any deviation requires an explicit decision and an update to this file.

---

## 1. Surface hierarchy

The UI has exactly **two surface levels**. Never add a third.

| Token | Value | Used for |
|-------|-------|----------|
| `--color-bg` | `#f8fafc` (slate-50) | Page canvas — `<body>`, page wrapper |
| `--color-surface` | `#ffffff` (white) | Cards, panels, modals, inputs |

**Rule:** Cards must always be `bg-[--color-surface]` on a `bg-[--color-bg]` canvas.  
**Forbidden:** `bg-white` (use the token), `bg-gray-50` on card, `bg-gray-100` as a page bg.

---

## 2. Token usage

**All** colours must come from `apps/web/src/styles/tokens.css`.  
**No** raw Tailwind color classes (`text-gray-900`, `bg-blue-600`, etc.) in component code.

### Colour replacement map

| Hardcoded | Token |
|-----------|-------|
| `text-gray-900` | `text-[--color-text-primary]` |
| `text-gray-600`, `text-gray-700` | `text-[--color-text-secondary]` |
| `text-gray-400`, `text-gray-500` | `text-[--color-text-muted]` |
| `bg-gray-50` | `bg-[--color-bg]` |
| `bg-gray-100`, `bg-gray-200` | `bg-[--color-neutral-surface]` |
| `border-gray-100` | `border-[--color-border-subtle]` |
| `border-gray-200` | `border-[--color-border]` |
| `bg-blue-600` | `bg-[--color-accent]` |
| `hover:bg-blue-700` | `hover:bg-[--color-accent-hover]` |
| `text-blue-600`, `text-blue-700` | `text-[--color-accent]` or `text-[--color-info-text]` |
| `bg-blue-50`, `bg-blue-100` | `bg-[--color-info-light]` or `bg-[--color-accent-light]` |
| `text-green-500`, `text-green-700` | `text-[--color-success]` or `text-[--color-success-text]` |
| `border-red-400` | `border-[--color-error-border]` |
| `text-red-500` | `text-[--color-error]` |

---

## 3. Typography hierarchy

All headings use `font-bold tracking-tight`. No `font-semibold` on headings.

| Level | Class | Usage |
|-------|-------|-------|
| Page H1 | `text-[length:var(--font-size-h1)] font-bold tracking-tight` | One per page |
| Section H2 | `text-3xl font-bold tracking-tight` | Section headings (landing) |
| Card H2 | `text-xl font-bold tracking-tight` | Card/modal titles |
| Sub-heading H3 | `text-sm font-semibold` | Card section titles, table headers |
| Body | `text-sm text-[--color-text-secondary]` | Normal paragraph text |
| Caption | `text-xs text-[--color-text-muted]` | Timestamps, hints, labels |

**Forbidden:** `font-semibold` on `<h1>`, mixed tracking values.

---

## 4. Skeleton system

**One pattern only:** `.skeleton-shimmer` (moving gradient sweep).

The deprecated `.skeleton` class exists as a no-op alias for backward compatibility. All new code uses `.skeleton-shimmer` directly.

```tsx
// ✓ Correct
<div className="skeleton-shimmer h-3 w-24 rounded" />

// ✗ Wrong — do not use
<div className="skeleton h-3 w-24 rounded bg-gray-200 animate-pulse" />
```

Skeleton elements must **not** have explicit background colors — `.skeleton-shimmer` provides its own.

---

## 5. Hover & interactive states

Every interactive element must have all three states: **hover**, **focus-visible**, **active/disabled**.

| State | Pattern |
|-------|---------|
| Hover (colour) | `hover:bg-[--color-hover]` or `hover:text-[--color-text-primary]` |
| Hover (card shadow lift) | `.card-hover` utility class |
| Focus ring | `focus-visible:ring-2 focus-visible:ring-[--color-accent]` |
| Disabled | `disabled:opacity-50 disabled:cursor-not-allowed` |
| Interactive cards | Must have `cursor-pointer` |

**Forbidden:** Raw `hover:bg-gray-50`, focus rings with hardcoded colors (`focus:ring-blue-500`).

---

## 6. Motion system

All durations and easings come from tokens. No raw `ms` values in component CSS.

| Token | Value | Use for |
|-------|-------|---------|
| `--duration-instant` | 80ms | Focus ring appearance |
| `--duration-hover` | 120ms | Hover colour/shadow transitions |
| `--duration-leave` | 140ms | Dropdown/popover exit |
| `--duration-enter` | 180ms | Modal open, command palette |
| `--duration-base` | 200ms | General transitions |
| `--duration-slow` | 300ms | Page-level, skeleton fade |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default motion |
| `--ease-decelerate` | `cubic-bezier(0, 0, 0.2, 1)` | Entering elements |
| `--ease-accelerate` | `cubic-bezier(0.4, 0, 1, 1)` | Exiting elements |
| `--ease-spring` | `cubic-bezier(0.16, 1, 0.3, 1)` | Spring/bounce (modals) |

**Rule:** Entering animation = `--duration-enter` + `--ease-decelerate`.  
**Rule:** Exiting animation = `--duration-leave` + `--ease-accelerate`.  
**Rule:** Hover transitions = `--duration-hover` + `--ease-standard`.

---

## 7. Badge usage

Badges communicate **status only** — not category, not rank, not decoration.

| Variant | Token pair | When to use |
|---------|-----------|-------------|
| `green` | `--color-success-*` | Accepted, active, verified |
| `blue` | `--color-info-*` | Sent, in-progress, info |
| `red` | `--color-error-*` | Declined, failed, error |
| `amber` | `--color-warning-*` | Expired, warning, caution |
| `purple` | `--color-purple-*` | Revoked, special state |
| `gray` | `--color-neutral-*` | Draft, inactive, neutral |

**Forbidden:** Adding new badge variants without a new semantic token in `tokens.css`.

---

## 8. Empty states

Every empty state must have all four layers in order:

1. **Icon** — `w-12 h-12 rounded-2xl bg-[--color-neutral-surface]`, icon at `w-5 h-5`
2. **Title** — `text-sm font-semibold text-[--color-text-primary]`
3. **Description** — 1–2 sentences, `text-sm text-[--color-text-secondary] leading-relaxed`
4. **Primary action** — `Button variant="primary" size="sm"` with clear verb label
5. **Hint** *(optional)* — `text-xs text-[--color-text-muted]`, below the CTA

Use the `<EmptyState>` component from `components/ui/EmptyState.tsx`.  
**Forbidden:** Custom empty state markup that bypasses the component.

---

## 9. Activity feed / event items

Event items follow: **verb** (bold) → **object** (muted, truncated) → **timestamp** (smaller muted).

```
● Offer accepted          ← font-semibold, --color-text-primary
  Senior Engineer Q1 2026 ← text-[11px], --color-text-secondary, line-clamp-1
  2 minutes ago            ← text-[11px], --color-text-muted
```

Dot color is semantic — see `EVENT_DOT` map in `ActivityFeed.tsx`. Do not add new event types without a dot color mapping.

---

## 10. Sidebar width

Use the token `--sidebar-width` for all sidebar width references. Never hardcode `w-60` or `240px`.

---

*Last updated: 2026-04-13. Changes require PR review by design owner.*
