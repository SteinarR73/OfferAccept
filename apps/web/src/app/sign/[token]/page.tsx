import { SigningClient } from './signing-client';

// Server component. Extracts the token from the URL and passes it to the
// client component which manages the signing flow state machine.
// No data is fetched here — the client handles all API calls.

interface SignPageProps {
  params: Promise<{ token: string }>;
}

export default async function SignPage({ params }: SignPageProps) {
  const { token } = await params;
  return <SigningClient token={token} />;
}

export const dynamic = 'force-dynamic'; // never cache — signing page is always live
