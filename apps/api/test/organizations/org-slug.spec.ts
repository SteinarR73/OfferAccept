import { Prisma } from '@prisma/client';
import { slugify, isSlugUniqueViolation } from '../../src/modules/organizations/org-slug';

describe('slugify', () => {
  it('lowercases and collapses non-alphanumerics into single hyphens', () => {
    expect(slugify('  Acme & Søn AS!! ')).toBe('acme-s-n-as');
  });

  it('falls back to "org" when nothing usable remains', () => {
    expect(slugify('!!!')).toBe('org');
  });

  it('leaves room for a collision suffix within 63 chars', () => {
    expect(slugify('a'.repeat(100)).length + '-ffff'.length).toBeLessThanOrEqual(63);
  });
});

describe('isSlugUniqueViolation', () => {
  it('recognises a P2002 on the slug column', () => {
    const err = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['slug'] },
    });
    expect(isSlugUniqueViolation(err)).toBe(true);
  });

  it('ignores unique violations on other columns and other errors', () => {
    expect(isSlugUniqueViolation({ code: 'P2002', meta: { target: ['email'] } })).toBe(false);
    expect(isSlugUniqueViolation(new Error('boom'))).toBe(false);
    expect(isSlugUniqueViolation(null)).toBe(false);
  });
});
