import { redirect } from 'next/navigation';

// Permanent redirect: /sign/[token] → /accept/[token]
//
// Old signing links (delivered by email before the route rename) continue to
// work. Recipients clicking a link from an older email arrive here and are
// immediately forwarded to the canonical acceptance route.
//
// 308 Permanent Redirect — informs crawlers and HTTP clients that the URL has
// moved permanently and future requests should use the new location.

interface SignPageProps {
  params: Promise<{ token: string }>;
}

export default async function SignRedirectPage({ params }: SignPageProps) {
  const { token } = await params;
  redirect(`/accept/${token}`);
}
