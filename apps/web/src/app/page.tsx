import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// Server-side redirect — no client bundle, no spinner flash.
// Reads the oa_sess session-indicator cookie (plain, non-HttpOnly) from the
// incoming request headers. Authenticated → /dashboard, otherwise → /landing.
export default async function RootPage() {
  const cookieStore = await cookies();
  if (cookieStore.has('oa_sess')) {
    redirect('/dashboard');
  }
  redirect('/landing');
}
