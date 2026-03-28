import { SigningClient } from '../../sign/[token]/signing-client';

// Server component. Extracts the token from the URL and passes it to the
// client component which manages the acceptance flow state machine.
// No data is fetched here — the client handles all API calls.

interface AcceptPageProps {
  params: Promise<{ token: string }>;
}

export default async function AcceptPage({ params }: AcceptPageProps) {
  const { token } = await params;
  return <SigningClient token={token} />;
}

export const dynamic = 'force-dynamic'; // never cache — acceptance page is always live
