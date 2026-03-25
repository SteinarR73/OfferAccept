import { redirect } from 'next/navigation';

// All new-deal creation goes through the 4-step wizard at /dashboard/deals/new.
export default function NewOfferRedirect() {
  redirect('/dashboard/deals/new');
}
