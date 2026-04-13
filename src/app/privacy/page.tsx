export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white px-6 py-10 text-gray-900">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="text-sm leading-6 text-gray-600">
          We use your email address for authentication and service-related communication. Uploaded media is
          used to generate your requested dance video.
        </p>
        <p className="text-sm leading-6 text-gray-600">
          Payment processing is handled by Stripe. We do not store full card details on this site.
        </p>
        <p className="text-sm leading-6 text-gray-600">
          If you have privacy questions or want help removing generated content, contact support@elser.ai.
        </p>
      </div>
    </main>
  );
}
