import { SigningClient } from '@/app/accept/[token]/signing-client';

// Norwegian acceptance route — always renders in Norwegian.
// Norwegian senders use /no/accept/[token] links; the middleware
// also sets oa_locale=no for all /no/* routes automatically.

interface Props {
  params: Promise<{ token: string }>;
}

export default async function NoAcceptPage({ params }: Props) {
  const { token } = await params;
  return <SigningClient token={token} locale="no" />;
}

export const dynamic = 'force-dynamic';
