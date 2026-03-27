import { redirect } from 'next/navigation';

// The canonical deal detail page is at /dashboard/deals/[id].
export default function OfferDetailRedirect({ params }: { params: { id: string } }) {
  redirect(`/dashboard/deals/${params.id}`);
}
