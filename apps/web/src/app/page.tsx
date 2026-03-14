// Dashboard root — placeholder until auth and routing are implemented.
// In production this will redirect to /dashboard if authenticated,
// or to /login if not.

export default function RootPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-gray-500">OfferAccept — coming soon.</p>
    </main>
  );
}
