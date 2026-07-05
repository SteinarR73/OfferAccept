import { redirect } from 'next/navigation';

// Retired duplicate — this used to be a second, thinner, inconsistent Terms of
// Service page (no eIDAS disclaimer, generic AUP, wrong governing law). The
// canonical Terms of Service lives at /legal/terms; redirect here permanently.
export default function TermsPage() {
  redirect('/legal/terms');
}
