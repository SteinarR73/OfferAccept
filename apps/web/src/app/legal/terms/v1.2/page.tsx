import { redirect } from 'next/navigation';

// Versioned canonical URL — always redirects to the current terms page.
// /legal/terms/v1.2 is the permanent stable link for this version.
// If a future v1.3 is published, this file remains and a new /v1.3 directory is added.
export default function TermsV1_2Page() {
  redirect('/legal/terms');
}
