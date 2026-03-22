'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// ─── OrgContext ────────────────────────────────────────────────────────────────
// Holds the current org for the authenticated session.
//
// orgId and orgRole come from the JWT claims (set by the server at login from
// the user's primary Membership row). They are available immediately — no extra
// fetch is needed on page load.
//
// For org-switching (future): call switchOrg() with a new orgId. The app should
// trigger POST /auth/switch-org to issue a new access token for that org, then
// update the context with the returned claims.

export interface OrgState {
  orgId: string;
  orgRole: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
}

interface OrgContextValue extends OrgState {
  switchOrg: (next: OrgState) => void;
}

const OrgContext = createContext<OrgContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function OrgProvider({
  initial,
  children,
}: {
  initial: OrgState;
  children: ReactNode;
}) {
  const [state, setState] = useState<OrgState>(initial);

  const switchOrg = useCallback((next: OrgState) => {
    setState(next);
  }, []);

  return (
    <OrgContext.Provider value={{ ...state, switchOrg }}>
      {children}
    </OrgContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCurrentOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) {
    throw new Error('useCurrentOrg must be used within OrgProvider');
  }
  return ctx;
}

// ── Role helpers ──────────────────────────────────────────────────────────────

const ROLE_RANK: Record<OrgState['orgRole'], number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

// Returns true if the current user's org role is at least minRole.
export function useHasOrgRole(minRole: OrgState['orgRole']): boolean {
  const { orgRole } = useCurrentOrg();
  return ROLE_RANK[orgRole] >= ROLE_RANK[minRole];
}
