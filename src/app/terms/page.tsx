import { Metadata } from 'next';
import Link from 'next/link';
import { FileText, ArrowLeft, Mail, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: 'Terms of Service | FillFlow',
  description: 'FillFlow Terms of Service, acceptable use policy, and AI-assisted automation terms.',
};

export default function TermsOfServicePage() {
  const lastUpdated = 'October 15, 2026';

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      <Navbar />

      <main className="flex-1 py-12 md:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-12">
          
          {/* Header */}
          <div className="space-y-4 border-b border-slate-800 pb-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Home
            </Link>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
              <FileText className="h-3.5 w-3.5 text-indigo-400" />
              <span>Legal Agreement</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Terms of Service
            </h1>
            <p className="text-sm text-slate-400">
              Last Updated: {lastUpdated} • Effective Immediately
            </p>
          </div>

          {/* Section 1: Agreement to Terms */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing, browsing, or registering for FillFlow (&quot;the Service&quot;), you (&quot;Customer&quot;, &quot;User&quot;, or &quot;Subscriber&quot;) agree to be bound by these Terms of Service (&quot;Terms&quot;) and our Privacy Policy. If you are entering into this agreement on behalf of a company, agency, or other legal entity, you represent that you possess the legal authority to bind such entity to these Terms.
            </p>
          </section>

          {/* Section 2: Service Description */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              2. Description of the Service
            </h2>
            <p>
              FillFlow provides an event-driven AI platform designed for software agencies, IT service firms, and technology providers. The platform automates inbound client lead discovery, qualification scoring, scope and requirement extraction, and multi-channel email responses across Google Workspace / Gmail, Web chat widgets, and WhatsApp.
            </p>
          </section>

          {/* Section 3: Third-Party Integrations & Google Account Access */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              3. Google Workspace & Gmail Integrations
            </h2>
            <p>
              When you connect your Google account or Gmail mailbox to FillFlow:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-slate-400">
              <li>
                You authorize FillFlow to read incoming client messages to classify customer intent and extract project requirements.
              </li>
              <li>
                You authorize FillFlow to dispatch automated or human-approved outbound replies on your behalf from your authorized mailbox.
              </li>
              <li>
                You acknowledge that FillFlow adheres strictly to the Google API Services User Data Policy, including its Limited Use commitments.
              </li>
              <li>
                You may disconnect your Google Workspace mailbox at any time via workspace settings, which revokes active credentials and cancels push notifications.
              </li>
            </ul>
          </section>

          {/* Section 4: AI Scoping, Response Generation & Approval Queue */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              4. AI-Assisted Communications & Human Review
            </h2>
            <p>
              FillFlow incorporates artificial intelligence (Google Gemini API) to generate contextual reply drafts and extract technical requirements. You understand and agree that:
            </p>
            <div className="space-y-2 text-xs text-slate-300">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Commercial Guardrails:</strong> FillFlow implements automated safety policies that prohibit AI models from committing your company to unauthorized contractual terms, NDAs, revenue shares, fixed deadlines, SLAs, or unconditional guarantees.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Approval Queue:</strong> Inquiries involving sensitive commercial proposals, pricing quotes, or policy exceptions are automatically routed to your internal Approval Queue for human verification and approval prior to sending.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Final Responsibility:</strong> While FillFlow implements multi-layer deterministic validation, your organization maintains ultimate oversight and responsibility for all outbound client communications dispatched from your mailbox.
                </span>
              </div>
            </div>
          </section>

          {/* Section 5: Acceptable Use */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              5. Acceptable Use Policy
            </h2>
            <p>
              You agree not to use the Service:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-400">
              <li>To send unsolicited bulk email (spam), phishing attempts, deceptive messages, or malicious content.</li>
              <li>To violate applicable laws, regulations, or third-party intellectual property or privacy rights.</li>
              <li>To attempt unauthorized access, reverse-engineer platform security controls, or extract internal proprietary system prompts.</li>
              <li>In any manner that violates the Google API Terms of Service or Meta WhatsApp Business Messaging Policies.</li>
            </ul>
          </section>

          {/* Section 6: Limitation of Liability */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              6. Limitation of Liability
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, FILLFLOW AND ITS AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, USE, GOODWILL, OR BUSINESS OPPORTUNITIES ARISING FROM OR RELATED TO YOUR USE OF THE SERVICE, THIRD-PARTY CLOUD OUTAGES, OR AI-GENERATED CONTENT.
            </p>
          </section>

          {/* Section 7: Termination & Account Deletion */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              7. Termination & Account Deletion
            </h2>
            <p>
              Either party may terminate your access to the Service at any time. Upon termination, you may request permanent deletion of your stored customer leads, briefs, conversation logs, and integration credentials pursuant to our Privacy Policy.
            </p>
          </section>

          {/* Section 8: Contact Information */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed border-t border-slate-800 pt-8">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Mail className="h-5 w-5 text-indigo-400" />
              8. Contact & Legal Notices
            </h2>
            <p>
              Questions regarding these Terms of Service may be addressed to:
            </p>
            <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1 text-slate-300">
              <div><strong>Application:</strong> FillFlow SaaS (hritik-gautam362/FillFlow)</div>
              <div><strong>Production Domain:</strong> https://fill-flow-omega.vercel.app</div>
              <div><strong>Legal & Support Email:</strong> support@fillflow.io</div>
              <div className="pt-2 text-slate-400">
                <em>[OWNER_ACTION_REQUIRED: Provide formal registered company entity name, registration number, and jurisdiction upon submission].</em>
              </div>
            </div>
          </section>

        </div>
      </main>

      <Footer />
    </div>
  );
}
