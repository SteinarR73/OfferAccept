import { redirect } from 'next/navigation';

export default function NoRootPage() {
  redirect('/no/landing');
}
