// Org slugs are derived from the org name at signup (AuthService) and when a
// member creates another org (OrgService). Both paths must produce the same slug
// for the same name, and both append a short suffix on collision, so the base is
// capped below Postgres/DNS-label friendly 63 chars to leave room for it.
const SLUG_MAX_LENGTH = 55;

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, SLUG_MAX_LENGTH) || 'org'
  );
}

// True when the error is a Prisma unique-constraint violation on the slug column,
// i.e. a concurrent insert took the slug first.
export function isSlugUniqueViolation(err: unknown): boolean {
  const e = err as { code?: unknown; meta?: { target?: unknown } } | null;
  return e?.code === 'P2002' && Array.isArray(e.meta?.target) && e.meta.target.includes('slug');
}
