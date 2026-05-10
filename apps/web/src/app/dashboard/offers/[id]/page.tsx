import { redirect } from 'next/navigation';

// The canonical deal detail page is at /dashboard/deals/[id].
export default async function OfferDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/deals/${id}`);
}
