import { cookies } from 'next/headers';
import { SigningClient } from './signing-client';

// Server component. Extracts the token from the URL and passes it to the
// client component which manages the acceptance flow state machine.
// Locale is read from the oa_locale cookie (set by middleware) so the
// recipient sees the language matching their browser/sender context.

interface AcceptPageProps {
  params: Promise<{ token: string }>;
}

export default async function AcceptPage({ params }: AcceptPageProps) {
  const { token } = await params;
  const cookieStore = await cookies();
  const locale = cookieStore.get('oa_locale')?.value === 'no' ? 'no' : 'en';
  return <SigningClient token={token} locale={locale} />;
}

export const dynamic = 'force-dynamic'; // never cache — acceptance page is always live
