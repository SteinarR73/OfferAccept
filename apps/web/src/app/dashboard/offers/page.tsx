import { redirect } from 'next/navigation';

// The canonical deals list is at /dashboard/deals.
export default function OffersRedirect() {
  redirect('/dashboard/deals');
}
