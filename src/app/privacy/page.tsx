import { Metadata } from 'next';
import Link from 'next/link';
import { Shield, Lock, Eye, Trash2, ArrowLeft, Mail, CheckCircle2 } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: 'Privacy Policy | FillFlow',
  description: 'FillFlow Privacy Policy, Google API User Data Policy compliance, and Limited Use disclosure.',
};

export default function PrivacyPolicyPage() {
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
              <Shield className="h-3.5 w-3.5 text-indigo-400" />
              <span>Security & Compliance</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              FillFlow Privacy Policy
            </h1>
            <p className="text-sm text-slate-400">
              Last Updated: {lastUpdated} • Effective Immediately
            </p>
          </div>

          {/* Section 1: Overview & Scope */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              1. Overview & Service Purpose
            </h2>
            <p>
              FillFlow (&quot;we&quot;, &quot;our&quot;, or &quot;the Service&quot;) provides an automated requirement discovery, inbound inquiry triage, and draft response platform for software and IT service companies. 
              FillFlow allows businesses to connect communication channels—including Google Workspace / Gmail, Web Chat, and WhatsApp—to automatically review prospective client inquiries, extract project specifications (budget, timeline, requested tech stack), generate proposed reply drafts, and route sensitive commercial discussions to a human review queue.
            </p>
          </section>

          {/* Section 2: Google User Data Accessed */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              2. Google API Data Accessed & Requested Scopes
            </h2>
            <p>
              When a company administrator connects a Google Workspace or Gmail mailbox to FillFlow, the application requests access to specific Google user data through OAuth 2.0. The exact scopes requested and their operational purposes are:
            </p>
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                <div className="font-semibold text-white text-xs font-mono text-indigo-300">
                  https://www.googleapis.com/auth/gmail.readonly
                </div>
                <p className="text-xs text-slate-400">
                  Used exclusively to detect incoming client emails, parse message headers (sender, recipient, subject, thread IDs), and read message body content to determine if the message is a business inquiry.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                <div className="font-semibold text-white text-xs font-mono text-emerald-300">
                  https://www.googleapis.com/auth/gmail.send
                </div>
                <p className="text-xs text-slate-400">
                  Used solely to dispatch outbound email responses directly from the company&apos;s authorized email address—either automatically when authorized by company policy or manually after a human team member approves a draft in the Approval Queue.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                <div className="font-semibold text-white text-xs font-mono text-purple-300">
                  https://www.googleapis.com/auth/userinfo.email
                </div>
                <p className="text-xs text-slate-400">
                  Used to verify the primary email address of the connecting Google account to correctly map multi-tenant workspace connections and prevent cross-account misconfiguration.
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Note: FillFlow does not read, parse, or download email attachments. File attachments are entirely ignored by our ingestion pipeline.
            </p>
          </section>

          {/* Section 3: Google Limited Use Disclosure */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed border-2 border-indigo-500/40 rounded-xl p-6 bg-indigo-950/20">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Lock className="h-5 w-5 text-indigo-400" />
              3. Google API Services User Data Policy & Limited Use Disclosure
            </h2>
            <p className="text-indigo-200 font-medium">
              FillFlow&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-indigo-300 hover:text-indigo-100"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
            <div className="space-y-2 text-xs text-slate-300 pt-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>No Generalized AI Model Training:</strong> Google Workspace and Gmail user data obtained by FillFlow is strictly used to provide contextual requirement scoping and response generation for your workspace. It is <strong>never</strong> used to train, retrain, or improve generalized or foundation artificial intelligence or machine learning models.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>No Advertising:</strong> Google user data is never transferred, licensed, or used for serving personalized, retargeted, or interest-based advertising.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Strict Third-Party Transfer Limitations:</strong> We only transfer Google user data to service providers (such as secure cloud infrastructure and Google Gemini AI API) as strictly necessary to execute the inquiry triage and reply drafting requested by the user.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Human Oversight:</strong> Human staff do not read raw customer emails unless specifically required by customer support request, debugging with explicit consent, or where required by law.
                </span>
              </div>
            </div>
          </section>

          {/* Section 4: Data Processing & Third Parties */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Eye className="h-5 w-5 text-purple-400" />
              4. How We Process Data & Third-Party Service Providers
            </h2>
            <p>
              To deliver contextual intelligence, incoming email inquiries are processed through our AI pipeline:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-slate-400">
              <li>
                <strong>Google Cloud Platform & Pub/Sub:</strong> Push notifications are delivered from Gmail to secure Google Cloud Pub/Sub topics, alerting FillFlow of new inbox events in real time.
              </li>
              <li>
                <strong>Google Generative AI (Gemini API):</strong> Email subject, sender name, inquiry text, and active conversation history are passed to Google Gemini to classify intent, extract project requirements (budget, timeline, features), and compose response draft options.
              </li>
              <li>
                <strong>Database Hosting (Neon PostgreSQL):</strong> Extracted requirements, customer lead records, message logs, and generated drafts are stored in multi-tenant PostgreSQL databases with TLS encryption in transit and at rest.
              </li>
            </ul>
          </section>

          {/* Section 5: Security & Encryption */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Lock className="h-5 w-5 text-emerald-400" />
              5. Token Security & Storage Encryption
            </h2>
            <p>
              All sensitive credentials—including Google OAuth access tokens and refresh tokens—are encrypted at rest using industry-standard <strong>AES-256-GCM</strong> (Galois/Counter Mode) authenticated encryption with 96-bit unique initialization vectors (IV) and 128-bit authentication tags. 
              Tokens are never exposed in browser-side code, logs, or API responses.
            </p>
          </section>

          {/* Section 6: Data Retention & Deletion */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-400" />
              6. Data Retention, Disconnection & Deletion Rights
            </h2>
            <div className="space-y-3">
              <p>
                We believe in full user control over business data:
              </p>
              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                <h3 className="font-semibold text-white text-xs">Instant Account Disconnection:</h3>
                <p className="text-xs text-slate-400">
                  Company administrators can disconnect their Gmail integration at any time from the FillFlow Dashboard. Upon disconnection:
                </p>
                <ul className="list-disc pl-5 text-xs text-slate-400 space-y-1">
                  <li>Active Google Pub/Sub push notification watches are immediately terminated via the Gmail API.</li>
                  <li>OAuth credentials are revoked directly with Google&apos;s authorization server.</li>
                  <li>Encrypted access and refresh tokens are permanently purged from persistent database storage.</li>
                </ul>
              </div>
              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                <h3 className="font-semibold text-white text-xs">User Data Deletion Requests:</h3>
                <p className="text-xs text-slate-400">
                  Users and company administrators have the right to request permanent deletion of their account, customer leads, conversation history, and project briefs. Deletion requests can be initiated within workspace settings or by submitting an email to our support team.
                </p>
              </div>
            </div>
          </section>

          {/* Section 7: Operator Identity & Contact */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed border-t border-slate-800 pt-8">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Mail className="h-5 w-5 text-indigo-400" />
              7. Operator Information & Contact Details
            </h2>
            <p>
              If you have any questions about this Privacy Policy, your Google user data, or wish to exercise your data deletion rights, please contact us:
            </p>
            <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1 text-slate-300">
              <div><strong>Application:</strong> FillFlow SaaS (hritik-gautam362/FillFlow)</div>
              <div><strong>Production Domain:</strong> https://fill-flow-omega.vercel.app</div>
              <div><strong>Support & Privacy Email:</strong> support@fillflow.io</div>
              <div className="pt-2 text-slate-400">
                <em>Note: Formal corporate registered address and designated legal representative details are maintained by the platform operator. [OWNER_ACTION_REQUIRED: Supply formal entity name and registered physical jurisdiction for production verification submission].</em>
              </div>
            </div>
          </section>

        </div>
      </main>

      <Footer />
    </div>
  );
}
