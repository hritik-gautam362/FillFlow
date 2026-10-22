import * as React from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { FileText, ArrowLeft, Mail, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: 'Terms of Service | FillFlow',
  description: 'FillFlow Terms of Service, acceptable use policy, AI-assisted automation terms, and Google OAuth compliance.',
};

export default function TermsOfServicePage() {
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
              <FileText className="h-3.5 w-3.5 text-indigo-400" aria-hidden="true" />
              <span>Legal Terms</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Terms of Service
            </h1>
            <p className="text-sm text-slate-400">
              Draft for Review & Verification Preparation • Prepared: {preparationDate}
            </p>
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs text-amber-300 leading-relaxed">
              <strong>Pre-Publication Notice:</strong> This document reflects the verified architectural capabilities and data handling practices implemented in the FillFlow platform. It is prepared as a draft for review and Google OAuth verification readiness. Formal legal publication and final effective date will take effect only upon authorized owner execution with the verified operating legal entity.
            </div>
          </div>

          {/* Section 1: Acceptance of Terms */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <h2 className="text-xl font-bold text-white">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing, browsing, registering an account, or connecting communication channels with FillFlow (&quot;the Service&quot;) at our production homepage (<a href="https://fill-flow-omega.vercel.app/" target="_blank" rel="noopener noreferrer" className="underline text-indigo-400 hover:text-indigo-300 break-all sm:break-normal">https://fill-flow-omega.vercel.app/</a>), you (&quot;Customer&quot;, &quot;User&quot;, or &quot;Subscriber&quot;) agree to be governed by these Terms of Service (&quot;Terms&quot;, available at <a href="https://fill-flow-omega.vercel.app/terms" className="underline text-indigo-400 hover:text-indigo-300 break-all sm:break-normal">https://fill-flow-omega.vercel.app/terms</a>) and our <Link href="/privacy" className="text-indigo-400 hover:text-indigo-300 underline font-semibold">Privacy Policy</Link> (<a href="https://fill-flow-omega.vercel.app/privacy" target="_blank" rel="noopener noreferrer" className="underline text-indigo-400 hover:text-indigo-300 break-all sm:break-normal">https://fill-flow-omega.vercel.app/privacy</a>). If you are accepting on behalf of an agency, company, or other legal entity, you represent that you possess the lawful authority to bind such entity.
            </p>
          </section>

          {/* Section 2: Description of the Service & Verified Integrations */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <h2 className="text-xl font-bold text-white">
              2. Description of the Service & Verified Integrations
            </h2>
            <p>
              FillFlow is an AI-assisted qualification and requirement discovery platform built for IT and software service companies. The platform automates inbound client lead triage, qualification scoring, scope and requirement extraction, and structured project brief generation across designated channels:
            </p>
            <div className="space-y-3 pt-2 text-xs text-slate-300">
              <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                <div className="font-semibold text-white">Google Workspace & Gmail Automation (Primary)</div>
                <p className="text-slate-400">
                  Connects to authorized corporate Gmail mailboxes via Google OAuth 2.0 to monitor incoming client inquiries in real time, extract project parameters, draft proposed replies, route sensitive matters to an internal Approval Queue, and dispatch approved responses directly from your mailbox.
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                <div className="font-semibold text-white">Website Chat Widget (Embeddable)</div>
                <p className="text-slate-400">
                  Provides an embeddable customer-facing widget (/widget) allowing prospective clients visiting your website to converse with an AI assistant that collects requirements and creates structured briefs directly in your dashboard.
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                <div className="font-semibold text-white">WhatsApp Cloud API (Optional Module)</div>
                <p className="text-slate-400">
                  An optional channel integration connecting via Meta WhatsApp Cloud API requiring customer-provided Meta Business credentials and webhook subscription.
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-400 pt-1">
              <em>Note on Product Boundaries: FillFlow does not maintain a public standalone unauthenticated chat service. All interactive communications occur via authenticated workspace tools or authorized customer-facing embeddable widgets.</em>
            </p>
          </section>

          {/* Section 3: Third-Party Integrations & Google Account Access */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <h2 className="text-xl font-bold text-white">
              3. Google Workspace & Gmail Integrations
            </h2>
            <p>
              When an authorized administrator connects a Google account or Gmail mailbox to FillFlow:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-slate-300">
              <li>
                <strong>Authorized Scopes & Inbound Processing:</strong> You authorize FillFlow to read incoming messages (<code className="text-indigo-300 break-all">gmail.readonly</code>) solely to evaluate if an incoming message is a client inquiry and extract project requirements. FillFlow does not inspect, parse, or download file attachments.
              </li>
              <li>
                <strong>Outbound Dispatch:</strong> You authorize FillFlow to send emails (<code className="text-emerald-300 break-all">gmail.send</code>) on behalf of your authorized account—either automatically when strictly compliant with your pre-configured company auto-reply policies, or upon explicit human authorization from your internal Approval Queue.
              </li>
              <li>
                <strong>Account Mapping:</strong> You authorize FillFlow to read the account email address (<code className="text-purple-300 break-all">userinfo.email</code>) to verify mailbox ownership and isolate tenant data.
              </li>
              <li>
                <strong>Compliance with Google Limited Use:</strong> FillFlow strictly adheres to the{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-indigo-400 hover:text-indigo-300 break-all sm:break-normal"
                >
                  Google API Services User Data Policy
                </a>
                , including its Limited Use requirements. Google user data is never used to train generalized foundation AI models, nor is it transferred to third parties for advertising or unauthorized purposes. For full details, see our <Link href="/privacy" className="underline text-indigo-400 hover:text-indigo-300">Privacy Policy</Link>.
              </li>
              <li>
                <strong>Disconnection & Token Revocation:</strong> You may disconnect your Google Workspace mailbox at any time via FillFlow dashboard settings. Upon disconnection, FillFlow requests cancellation of the Gmail Pub/Sub push watch via the Gmail API (<code className="text-slate-300">users.stop</code>), dispatches a token revocation request to Google authorization servers (<code className="text-slate-300">oauth2.googleapis.com/revoke</code>), and purges stored encrypted access and refresh tokens from active database records. If upstream network disruptions prevent Google&apos;s revocation endpoint from acknowledging the request, local credentials remain permanently purged from our active database, and users can independently revoke grants via <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="underline text-indigo-400 hover:text-indigo-300 break-all sm:break-normal">Google Account Permissions</a>.
              </li>
            </ul>
          </section>

          {/* Section 4: AI Scoping, Response Generation & Approval Queue */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" aria-hidden="true" />
              <h2 className="text-xl font-bold text-white">
                4. AI-Assisted Communications, Safety Rules & Human Oversight
              </h2>
            </div>
            <p>
              FillFlow incorporates artificial intelligence (Google Gemini API) to generate contextual reply drafts and extract technical requirements. While FillFlow employs multi-layered safety guardrails, AI-generated content is probabilistic and cannot be guaranteed to be error-free:
            </p>
            <ul className="space-y-3 text-xs text-slate-300 list-none p-0 m-0">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>Immutable Platform Safety Guardrails:</strong> FillFlow implements automated safety filters that permanently prohibit the email automation engine from dispatching unconditional performance guarantees (such as &quot;100% money-back guarantee&quot; or &quot;bug-free guarantee&quot;) or executing formal binding contracts and NDAs, even if entered into an edited draft.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>Conditions for Autonomous Auto-Replies:</strong> FillFlow dispatches automated email replies autonomously <em>only</em> when all of the following conditions are met: (a) the inbound message is classified as an actionable client inquiry, (b) email automation is enabled in workspace settings, and (c) the inquiry relates strictly to pre-approved non-sensitive topics (e.g. general company background or service capabilities) verified against authorized company knowledge. AI models are strictly blocked from inventing prices, offering discounts, proposing commission/revenue shares, or committing to delivery deadlines or SLAs.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>Mandatory Approval Queue for Commercial Topics:</strong> Inquiries involving sensitive commercial topics—including custom pricing quotes, discount requests, commissions, revenue shares, contractual terms, refunds, delivery deadlines, or SLAs—are automatically held in your internal Approval Queue. In the Approval Queue, authorized personnel can review, adjust, and approve commercial terms (such as verified prices, custom discounts, negotiated commissions, delivery schedules, or service terms) through explicit human editing or by referencing verified company knowledge items, prior to outbound transmission.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>Distinction Between Company Knowledge & Customer Claims:</strong> FillFlow strictly distinguishes between company-authorized knowledge (verified policies, rate cards, and administrator instructions) and unverified customer claims or past conversation content. Statements or pricing claims made by prospective clients in inbound inquiries do not establish company policy and are never treated as authoritative commercial terms.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>Final Customer Responsibility:</strong> While FillFlow implements multi-layer deterministic validation, your organization maintains ultimate oversight and legal responsibility for all outbound client communications dispatched from your mailbox.
                </span>
              </li>
            </ul>
          </section>

          {/* Section 5: Acceptable Use */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <h2 className="text-xl font-bold text-white">
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
            <h2 className="text-xl font-bold text-white">
              6. Limitation of Liability
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, FILLFLOW AND ITS OPERATORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, USE, GOODWILL, OR BUSINESS OPPORTUNITIES ARISING FROM OR RELATED TO YOUR USE OF THE SERVICE, THIRD-PARTY CLOUD OUTAGES, OR AI-GENERATED CONTENT.
            </p>
          </section>

          {/* Section 7: Termination & Data Deletion Rights */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <h2 className="text-xl font-bold text-white">
              7. Termination & Data Deletion Rights
            </h2>
            <p>
              Either party may terminate access to the Service at any time. FillFlow provides dedicated self-service mechanisms and authenticated API endpoints for tenant-isolated data deletion:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-400">
              <li>
                <strong>Channel-Specific Purge (Gmail Data):</strong> Customers may execute a targeted purge of all Gmail-derived leads, conversation histories, extracted briefs, and pending queue drafts while disconnecting Google credentials, without impacting other workspace channels.
              </li>
              <li>
                <strong>Complete Workspace Account Deletion:</strong> Company administrators may permanently delete the entire company workspace upon entering the required confirmation string (<code className="text-slate-300">&quot;DELETE &lt;companyName&gt;&quot;</code> or <code className="text-slate-300">&quot;DELETE&quot;</code>). This cascades deletion of the company record and all associated user accounts, leads, briefs, settings, quota audit logs, and integration credentials from active production database tables.
              </li>
              <li>
                <strong>Data Deletion Scope & Backup Qualifications:</strong> Deletions remove customer records immediately and permanently from active production database tables. In line with industry-standard cloud database hosting (Neon PostgreSQL), encrypted point-in-time recovery archives and automated disaster recovery snapshots are managed by the cloud database provider for its applicable backup retention lifecycle. These disaster-recovery archives cannot be selectively modified or purged on an individual tenant basis; copies remaining in provider-managed backups expire and are overwritten automatically in accordance with provider retention schedules. Deleting records from active database tables does not constitute immediate deletion from disaster recovery snapshots, and FillFlow does not promise an unverified backup deletion timeline.
              </li>
            </ul>
          </section>

          {/* Section 8: Contact Information */}
          <section className="space-y-4 text-slate-300 text-sm leading-relaxed border-t border-slate-800 pt-8">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-indigo-400 shrink-0" aria-hidden="true" />
              <h2 className="text-xl font-bold text-white">
                8. Contact & Legal Entity Information
              </h2>
            </div>
            <p>
              Inquiries regarding these Terms of Service or platform compliance may be addressed to:
            </p>
            <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-2 text-slate-300">
              <div><strong>Application:</strong> FillFlow SaaS (Repository: hritik-gautam362/FillFlow)</div>
              <div><strong>Production Homepage:</strong> <a href="https://fill-flow-omega.vercel.app/" target="_blank" rel="noopener noreferrer" className="underline text-indigo-400 hover:text-indigo-300 break-all sm:break-normal">https://fill-flow-omega.vercel.app/</a></div>
              <div><strong>Terms of Service URL:</strong> <a href="https://fill-flow-omega.vercel.app/terms" className="underline text-indigo-400 hover:text-indigo-300 break-all sm:break-normal">https://fill-flow-omega.vercel.app/terms</a></div>
              <div><strong>Privacy Policy URL:</strong> <a href="https://fill-flow-omega.vercel.app/privacy" className="underline text-indigo-400 hover:text-indigo-300 break-all sm:break-normal">https://fill-flow-omega.vercel.app/privacy</a></div>
              <div><strong>Designated Support & Legal Email:</strong> support@fillflow.io <span className="text-amber-400 font-medium">(Draft Placeholder - Unverified; mailbox and domain routing not yet configured in repository or environment)</span></div>
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
