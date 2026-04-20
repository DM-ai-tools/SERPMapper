import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use | SERPMapper",
  description: "Terms of use for the SERPMapper local visibility tool.",
};

export default function TermsPage() {
  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
      <h1 className="text-3xl sm:text-4xl font-black text-gray-900">Terms of Use</h1>
      <p className="mt-3 text-sm text-gray-500">Last updated: April 16, 2026</p>

      <div className="mt-10 space-y-8 text-gray-700 leading-7">
        <section>
          <h2 className="text-xl font-bold text-gray-900">1. Acceptance</h2>
          <p className="mt-2">
            By using SERPMapper, you agree to these Terms of Use. If you do not agree, do not use
            the service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">2. Service description</h2>
          <p className="mt-2">
            SERPMapper provides local search visibility estimates and related insights based on
            third-party data sources. Results are informational and may vary over time.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">3. Acceptable use</h2>
          <p className="mt-2">
            You agree not to misuse the tool, interfere with service operations, attempt
            unauthorized access, or submit unlawful content.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">4. Third-party APIs</h2>
          <p className="mt-2">
            SERPMapper depends on third-party APIs and infrastructure. Availability, accuracy, and
            pricing may change due to those providers, and temporary service disruption may occur.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">5. No guarantees</h2>
          <p className="mt-2">
            SERPMapper is provided on an \"as is\" basis without warranties of any kind. We do not
            guarantee ranking outcomes, traffic growth, or business performance.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">6. Limitation of liability</h2>
          <p className="mt-2">
            To the maximum extent permitted by law, SERPMapper and its operators are not liable for
            indirect, incidental, or consequential damages arising from use of the service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">7. Changes to terms</h2>
          <p className="mt-2">
            These terms may be updated from time to time. Continued use of SERPMapper after updates
            means you accept the revised terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">8. Contact</h2>
          <p className="mt-2">
            For questions regarding these terms, contact Traffic Radius via{" "}
            <a
              href="https://trafficradius.com.au/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:text-brand-700"
            >
              trafficradius.com.au
            </a>
            .
          </p>
        </section>
      </div>
    </section>
  );
}
