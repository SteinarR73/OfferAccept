import { redirect } from 'next/navigation';

// Versioned canonical URL — always redirects to the current terms page.
// /legal/terms/v1.1 is the permanent stable link for this version.
// If a future v1.2 is published, this file remains and a new /v1.2 directory is added.
export default function TermsV1_1Page() {
  redirect('/legal/terms');
}
