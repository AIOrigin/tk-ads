export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white px-6 py-10 text-gray-900">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-3xl font-bold">Terms of Service</h1>
        <p className="text-sm leading-6 text-gray-600">
          By using Dance Like Me, you confirm that you have the right to upload the content you submit and
          you agree not to use the service for unlawful, abusive, or infringing activity.
        </p>
        <p className="text-sm leading-6 text-gray-600">
          Purchases cover generation of the requested dance video. Delivery times are estimates and may vary
          based on system load or moderation checks.
        </p>
        <p className="text-sm leading-6 text-gray-600">
          If generation fails after payment, contact support at support@elser.ai so we can help recover,
          regenerate, or review refund options.
        </p>
      </div>
    </main>
  );
}
