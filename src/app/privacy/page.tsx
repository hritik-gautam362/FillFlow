import * as React from 'react';
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
  const preparationDate = 'October 18, 2026';

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
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back to Home
            </Link>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
              <Shield className="h-3.5 w-3.5 text-indigo-400" aria-hidden="true" />
              <span>Security & Compliance</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              FillFlow Privacy Policy
            </h1>
            <p className="text-sm text-slate-400">
              Draft for Review & Verification Preparation • Prepared: {preparationDate}
            </p>
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs text-amber-300 leading-relaxed">
              <strong>Pre-Publication Notice:</strong> This privacy policy documents the verified technical data handling, encryption, and deletion mechanisms implemented in the FillFlow repository. It is prepared as a draft for review and Google OAuth verification readiness. Formal legal publication and final effective date will take effect only upon authorized owner execution with the verified operating legal entity.
            </div>
          </div>

          {/* Section 1: Overview & Scope */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <h2 className="text-xl font-bold text-white">
              1. Overview & Service Purpose
            </h2>
            <p>
              FillFlow (&quot;we&quot;, &quot;our&quot;, or &quot;the Service&quot;) provides an automated requirement discovery, inbound inquiry triage, and draft response platform for software agencies and IT service providers. 
              FillFlow enables businesses to connect communication channels—specifically Google Workspace / Gmail mailboxes, embeddable web chat widgets, and optional Meta WhatsApp Cloud API modules—to systematically evaluate prospective client inquiries, extract project specifications (budget ranges, estimated timelines, requested tech stack), formulate proposed reply drafts, and route sensitive commercial matters to a human review queue.
            </p>
            <p>
              This Privacy Policy (available at <a href="https://fill-flow-omega.vercel.app/privacy" className="underline text-indigo-400 hover:text-indigo-300 break-all sm:break-normal">https://fill-flow-omega.vercel.app/privacy</a>) applies to all services offered at our production homepage (<a href="https://fill-flow-omega.vercel.app/" target="_blank" rel="noopener noreferrer" className="underline text-indigo-400 hover:text-indigo-300 break-all sm:break-normal">https://fill-flow-omega.vercel.app/</a>) and is governed by and incorporates our <Link href="/terms" className="underline text-indigo-400 hover:text-indigo-300 font-semibold">Terms of Service</Link> (<a href="https://fill-flow-omega.vercel.app/terms" target="_blank" rel="noopener noreferrer" className="underline text-indigo-400 hover:text-indigo-300 break-all sm:break-normal">https://fill-flow-omega.vercel.app/terms</a>).
            </p>
            <p className="text-xs text-slate-400">
              <em>Note on Product Boundaries: FillFlow does not offer a standalone unauthenticated public chat product. All interactive communications occur via authenticated workspace accounts or authorized customer-facing embeddable widgets.</em>
            </p>
          </section>

          {/* Section 2: Google User Data Accessed */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <h2 className="text-xl font-bold text-white">
              2. Google API Data Accessed & Requested Scopes
            </h2>
            <p>
              When a company administrator connects a Google Workspace or Gmail mailbox to FillFlow via OAuth 2.0, the application requests access to the following minimum necessary scopes:
            </p>
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                <div className="font-semibold text-white text-xs font-mono text-indigo-300 break-all">
                  https://www.googleapis.com/auth/gmail.readonly
                </div>
                <p className="text-xs text-slate-400">
                  Used exclusively to inspect incoming client emails, parse message headers (sender email, recipient, subject, thread IDs), and read message body text to classify whether the message is a business inquiry and extract project requirements.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                <div className="font-semibold text-white text-xs font-mono text-emerald-300 break-all">
                  https://www.googleapis.com/auth/gmail.send
                </div>
                <p className="text-xs text-slate-400">
                  Used solely to dispatch outbound email responses directly from the company&apos;s authorized email address—either automatically when strictly compliant with verified non-commercial auto-reply policies, or manually after a human team member approves a draft in the internal Approval Queue.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                <div className="font-semibold text-white text-xs font-mono text-purple-300 break-all">
                  https://www.googleapis.com/auth/userinfo.email
                </div>
                <p className="text-xs text-slate-400">
                  Used to verify the primary email address of the connecting Google account to correctly map multi-tenant workspace connections and prevent cross-account misconfiguration.
                </p>
              </div>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-slate-400 space-y-1">
              <p>
                <strong>Unrequested Scopes & Attachment Policy:</strong> FillFlow does <em>not</em> request <code className="text-slate-300 break-all">https://www.googleapis.com/auth/gmail.modify</code> in its standard authorization flow. Furthermore, FillFlow does not inspect, parse, or download file attachments. Attachment payloads are completely ignored throughout our email ingestion pipeline.
              </p>
            </div>
          </section>

          {/* Section 3: Google Limited Use Disclosure */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed border-2 border-indigo-500/40 rounded-xl p-6 bg-indigo-950/20">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-indigo-400 shrink-0" aria-hidden="true" />
              <h2 className="text-xl font-bold text-white">
                3. Google API Services User Data Policy & Limited Use Disclosure
              </h2>
            </div>
            <p className="text-indigo-200 font-medium">
              FillFlow&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-indigo-300 hover:text-indigo-100 font-semibold break-all sm:break-normal"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
            <ul className="space-y-2 text-xs text-slate-300 pt-2 list-none p-0 m-0">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>No Generalized AI Model Training:</strong> Google Workspace and Gmail user data obtained by FillFlow is strictly used to provide contextual requirement scoping and response generation for your workspace. It is <strong>never</strong> used to train, retrain, or fine-tune generalized or foundation artificial intelligence or machine learning models.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>No Advertising or Brokering:</strong> Google user data is never transferred, licensed, sold, or used for serving personalized, retargeted, or interest-based advertising or commercial data brokering.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>Strict Third-Party Transfer Limitations:</strong> We only transfer Google user data to necessary cloud service providers (Google Cloud Pub/Sub for push notifications, Google Gemini API for inference, Neon PostgreSQL for encrypted storage, and Vercel for application hosting) as strictly required to execute the customer-requested email triage and response features.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>Authoritative Knowledge vs. Customer Claims:</strong> FillFlow strictly distinguishes between company-authorized knowledge bases and unverified customer claims. Statements or pricing proposals provided by prospective clients in inbound inquiries are processed solely to evaluate project requirements and are never treated as verified company policy or used to establish binding commercial terms.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>Human Oversight Safeguards:</strong> Human personnel do not read raw customer emails unless specifically requested by the customer for support/debugging with explicit consent, or where strictly required by applicable law or security investigation.
                </span>
              </li>
            </ul>
          </section>

          {/* Section 4: Data Processing & Third Parties */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-purple-400 shrink-0" aria-hidden="true" />
              <h2 className="text-xl font-bold text-white">
                4. Data Processing & Third-Party Service Providers
              </h2>
            </div>
            <p>
              To deliver requirement intelligence, incoming email inquiries are processed through our verified infrastructure:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-slate-400">
              <li>
                <strong>Google Cloud Platform & Pub/Sub:</strong> Push notifications are delivered from Gmail to secure Google Cloud Pub/Sub topics, notifying FillFlow of new inbox history events in real time.
              </li>
              <li>
                <strong>Google Generative AI (Gemini API):</strong> Email subject, sender name, inquiry text, and active conversation history are passed to Google Gemini to classify intent, extract project requirements (budget, timeline, features), and compose response draft options. Google enterprise terms prohibit using API inputs to train foundation models.
              </li>
              <li>
                <strong>Database Hosting (Neon PostgreSQL):</strong> Extracted requirements, customer lead records, message logs, and generated drafts are stored in multi-tenant PostgreSQL databases with TLS encryption in transit and AES-256 cloud storage encryption at rest.
              </li>
              <li>
                <strong>Cloud Application Hosting (Vercel):</strong> The Next.js web application is hosted on Vercel with encrypted HTTPS transmission for all client interactions.
              </li>
              <li>
                <strong>Meta WhatsApp Cloud API (Optional):</strong> If the customer configures the optional WhatsApp module, incoming WhatsApp inquiries are processed through Meta&apos;s Cloud API according to customer-configured credentials.
              </li>
            </ul>
          </section>

          {/* Section 5: Security & Encryption */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-emerald-400 shrink-0" aria-hidden="true" />
              <h2 className="text-xl font-bold text-white">
                5. Token Security & Storage Encryption
              </h2>
            </div>
            <p>
              All sensitive credentials—including Google OAuth access tokens and refresh tokens—are encrypted before persistent storage using <strong>AES-256-GCM</strong> (Galois/Counter Mode) authenticated encryption with unique 96-bit initialization vectors (IV) and 128-bit authentication tags. 
              Decryption keys are derived from cryptographic environment variables via SHA-256 and are never accessible to client browsers or exposed in logs.
            </p>
          </section>

          {/* Section 6: Data Retention & Deletion */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <div className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-400 shrink-0" aria-hidden="true" />
              <h2 className="text-xl font-bold text-white">
                6. Data Retention, Disconnection & Deletion Rights
              </h2>
            </div>
            <div className="space-y-3">
              <p>
                We provide multi-tenant isolation and complete customer control over retained business data:
              </p>
              
              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                <h3 className="font-semibold text-white text-xs">Operational Data Retention:</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Customer lead records, conversation messages, extracted requirements, and generated draft replies are retained in tenant-isolated database tables for the duration of the customer&apos;s active account subscription, or until the customer initiates a channel-specific purge or account deletion. Stored credentials for disconnected integrations are immediately cleared from active database records.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                <h3 className="font-semibold text-white text-xs">Outbound Dispatch & Approval Controls:</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  FillFlow sends autonomous replies only for low-risk, verified informational inquiries when auto-reply is enabled by the administrator. Any inquiry involving sensitive commercial topics (such as pricing proposals, discounts, commissions, contractual terms, refunds, deadlines, or SLAs) is automatically held in the internal Approval Queue for human review and explicit authorization prior to dispatch. In the Approval Queue, authorized personnel can review, adjust, and approve commercial responses (such as quotes, discounts, or delivery timelines) based on verified company knowledge or explicit human editing, while immutable platform safety filters prevent the dispatch of unconditional performance guarantees or formal contract executions.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                <h3 className="font-semibold text-white text-xs">Account Disconnection & Revocation Behavior:</h3>
                <p className="text-xs text-slate-400">
                  Company administrators can disconnect their Gmail integration at any time from workspace settings. Upon disconnection:
                </p>
                <ul className="list-disc pl-5 text-xs text-slate-400 space-y-1">
                  <li>Active Google Pub/Sub push notification watches are requested to be stopped via the Gmail API (<code className="text-slate-300">users.stop</code>).</li>
                  <li>OAuth credentials are submitted for revocation directly to Google&apos;s authorization server (<code className="text-slate-300 break-all">oauth2.googleapis.com/revoke</code>).</li>
                  <li>Encrypted access and refresh tokens are immediately removed and set to null in active database storage.</li>
                  <li><em>Failure-Handling Qualification:</em> If upstream network disruptions prevent Google&apos;s revocation endpoint from acknowledging the request, local database credentials remain purged immediately. Users retain the ability to independently verify or revoke OAuth grants at any time via <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="underline text-indigo-400 hover:text-indigo-300 break-all sm:break-normal">Google Account Permissions</a>.</li>
                </ul>
              </div>

              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                <h3 className="font-semibold text-white text-xs">Tenant-Isolated Data Deletion Scopes:</h3>
                <p className="text-xs text-slate-400">
                  FillFlow provides authenticated endpoints (<code className="text-slate-300 break-all">/api/companies/[id]/data-deletion</code>) supporting two operational deletion scopes:
                </p>
                <ul className="list-disc pl-5 text-xs text-slate-400 space-y-1">
                  <li><strong>Gmail Data Purge:</strong> Permanently deletes all Gmail-derived lead records (<code className="text-slate-300">channel = &apos;email&apos;</code>) from active production tables, cascading to delete associated messages, project briefs, and feature records, while revoking credentials and clearing approval queue drafts. Non-email channels and company accounts remain intact.</li>
                  <li><strong>Full Company Account Deletion:</strong> Requires explicit confirmation matching <code className="text-slate-300">&quot;DELETE &lt;companyName&gt;&quot;</code> or <code className="text-slate-300">&quot;DELETE&quot;</code>. Permanently deletes the company record and cascades deletion across all user accounts, leads, briefs, messages, settings, quota audit logs, and credentials from active production database tables.</li>
                </ul>
              </div>

              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                <h3 className="font-semibold text-white text-xs">Backups, Audit History & System Logs Limitations:</h3>
                <ul className="list-disc pl-5 text-xs text-slate-400 space-y-1.5">
                  <li>
                    <strong>Cloud Provider Backups:</strong> Live deletion commands remove customer records immediately and permanently from active production database tables. In accordance with standard cloud database hosting (Neon PostgreSQL), encrypted point-in-time recovery archives and automated disaster recovery snapshots are managed entirely by the underlying cloud database provider for its applicable backup retention lifecycle. These backup snapshots are immutable, aggregate disaster-recovery copies that cannot be selectively altered or purged on an individual tenant basis; copies remaining in provider-managed backups expire and are overwritten automatically in accordance with provider retention schedules. Deleting records from active database tables does not constitute immediate deletion from disaster-recovery backups, and FillFlow does not promise an unverified backup deletion timeline.
                  </li>
                  <li>
                    <strong>Audit History:</strong> Operational audit logs (<code className="text-slate-300">AutomationQuotaAuditLog</code>) record administrative actions (such as purge timestamps and requester user IDs, without storing email content or tokens) for security verification and quota tracking. Audit records persist during channel-specific purges and are permanently deleted upon full company account deletion.
                  </li>
                  <li>
                    <strong>Transient Server Logs:</strong> Non-content server runtime logs (such as Vercel serverless function execution logs containing request timestamps and HTTP status codes) are maintained by the cloud hosting provider for its applicable operational retention periods. Deleting active database records does not retroactively rewrite hosting provider system logs. FillFlow ensures that raw email message bodies and authentication tokens are never recorded in server runtime logs.
                  </li>
                </ul>
              </div>

            </div>
          </section>

          {/* Section 7: Operator Identity & Contact */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed border-t border-slate-800 pt-8">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-indigo-400 shrink-0" aria-hidden="true" />
              <h2 className="text-xl font-bold text-white">
                7. Operator Information & Contact Details
              </h2>
            </div>
            <p>
              If you have any questions regarding this Privacy Policy, your Google user data, or wish to exercise your data deletion rights, please contact us:
            </p>
            <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-2 text-slate-300">
              <div><strong>Application:</strong> FillFlow SaaS (Repository: hritik-gautam362/FillFlow)</div>
              <div><strong>Production Homepage:</strong> <a href="https://fill-flow-omega.vercel.app/" target="_blank" rel="noopener noreferrer" className="underline text-indigo-400 hover:text-indigo-300 break-all sm:break-normal">https://fill-flow-omega.vercel.app/</a></div>
              <div><strong>Privacy Policy URL:</strong> <a href="https://fill-flow-omega.vercel.app/privacy" className="underline text-indigo-400 hover:text-indigo-300 break-all sm:break-normal">https://fill-flow-omega.vercel.app/privacy</a></div>
              <div><strong>Terms of Service URL:</strong> <a href="https://fill-flow-omega.vercel.app/terms" className="underline text-indigo-400 hover:text-indigo-300 break-all sm:break-normal">https://fill-flow-omega.vercel.app/terms</a></div>
              <div><strong>Designated Support & Privacy Email:</strong> support@fillflow.io <span className="text-amber-400 font-medium">(Draft Placeholder - Unverified; mailbox and domain routing not yet configured in repository or environment)</span></div>
              <div><strong>Operating Legal Entity:</strong> <span className="text-slate-400">[Draft Placeholder - Pending owner corporate registration]</span></div>
              <div><strong>Company Registration Number:</strong> <span className="text-slate-400">[Draft Placeholder - Pending owner corporate registration]</span></div>
              <div><strong>Registered Physical Address:</strong> <span className="text-slate-400">[Draft Placeholder - Pending owner corporate registration]</span></div>
              <div><strong>Governing Jurisdiction:</strong> <span className="text-slate-400">[Draft Placeholder - Pending owner corporate registration]</span></div>
              <div><strong>Google OAuth Verification Status:</strong> <span className="text-amber-400 font-medium">Pending Submission & Verification (Not yet approved or verified by Google)</span></div>
              <div className="border-t border-slate-800 pt-2 text-slate-400 space-y-1.5">
                <span className="font-semibold text-amber-300">[OWNER ACTION REQUIRED FOR FORMAL PUBLICATION]:</span>
                <p className="text-[11px] leading-relaxed">
                  Before official submission for production Google OAuth verification and final legal publication, the platform owner must complete the following actions:
                </p>
                <ul className="list-disc pl-4 text-[11px] space-y-1 text-slate-400">
                  <li><strong>Operating Entity Details:</strong> Specify the formal operating corporate entity name, company registration number, registered physical address, and designated governing jurisdiction.</li>
                  <li><strong>Support Email Configuration:</strong> Establish and verify an active, operational support mailbox (e.g., matching the Google Cloud Console OAuth consent screen user support email). Operation of the draft placeholder address (<code>support@fillflow.io</code>) is unverified and not configured in the repository or environment.</li>
                  <li><strong>Custom Domain Verification:</strong> If deploying under a custom corporate domain, verify domain ownership in Google Search Console and update OAuth consent screen branding links.</li>
                  <li><strong>Google Cloud OAuth Submission:</strong> Submit the verified URLs and consent screen in Google Cloud Project <code>automation-508113</code> for formal review.</li>
                </ul>
              </div>
            </div>
          </section>

        </div>
      </main>

      <Footer />
    </div>
  );
}
