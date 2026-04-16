import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | SERPMapper",
  description: "Privacy policy for the SERPMapper local visibility tool.",
};

export default function PrivacyPage() {
  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
      <h1 className="text-3xl sm:text-4xl font-black text-gray-900">Privacy Policy</h1>
      <p className="mt-3 text-sm text-gray-500">Last updated: April 16, 2026</p>

      <div className="mt-10 space-y-8 text-gray-700 leading-7">
        <section>
          <h2 className="text-xl font-bold text-gray-900">1. What we collect</h2>
          <p className="mt-2">
            SERPMapper collects only the data needed to generate and share visibility reports:
            business website URL, keyword, city, generated report data, and optional email address
            when you unlock the full report.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">2. How we use data</h2>
          <p className="mt-2">
            We use your submitted data to run ranking checks, calculate a visibility score, and
            present report insights. If you provide an email, we use it to deliver report-related
            follow-up messages.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">3. Third-party services</h2>
          <p className="mt-2">
            To operate SERPMapper, data may be processed by infrastructure and API partners
            including PostgreSQL hosting, DataforSEO, Google Places API, Anthropic, SendGrid, and
            hosting providers. Each partner handles data under its own privacy terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">4. Data retention</h2>
          <p className="mt-2">
            Report data may be cached for performance and cost control for up to 7 days. Email lead
            data may be stored longer for service analytics and attribution unless deletion is
            requested.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">5. Security</h2>
          <p className="mt-2">
            We use commercially reasonable safeguards to protect data in transit and at rest.
            However, no online service can guarantee absolute security.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">6. Your rights</h2>
          <p className="mt-2">
            You can request access, correction, or deletion of your personal data by contacting the
            operator listed below.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">7. Contact</h2>
          <p className="mt-2">
            For privacy requests or questions, contact DotMappers IT Pvt Ltd via{" "}
            <a
              href="https://dotmappers.in"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:text-brand-700"
            >
              dotmappers.in
            </a>
            .
          </p>
        </section>
      </div>
    </section>
  );
}
