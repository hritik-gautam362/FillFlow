# FillFlow — Google OAuth Verification Readiness Package

**Target Document:** `docs/google-oauth-verification-readiness.md`  
**Application Name:** FillFlow  
**Repository:** `hritik-gautam362/FillFlow`  
**Production Staging URL:** `https://fill-flow-omega.vercel.app`  
**Google Cloud Project ID:** `automation-508113`  
**Date of Preparation:** October 15, 2026  
**Compliance Standard:** Google API Services User Data Policy (including Limited Use Requirements) & Google Identity OAuth Verification

---

## 1. Confirmed Scope Inventory & Functional Justification

Following the Least-Privilege Scope Remediation, FillFlow has removed `https://www.googleapis.com/auth/gmail.modify` from the requested scopes. The application now requests exactly **three (3) scopes**:

| OAuth Scope | Google Sensitivity Tier | Why FillFlow Needs It (Feature) | Gmail API Operations Called | User-Facing Benefit / Least Privilege Reasoning |
|---|:---:|---|---|---|
| `https://www.googleapis.com/auth/gmail.readonly` | **Restricted** | **Inbound Inquiry Triage & Contextual Discovery** | `users.messages.get`, `users.history.list`, `users.threads.get`, `users.profile.get`, `users.watch` | **Essential.** The app cannot detect prospective client inquiries or extract project requirements without reading incoming message headers and inquiry text. Attachment bodies are never parsed. |
| `https://www.googleapis.com/auth/gmail.send` | **Restricted** | **Automated & Approved Outbound Replies** | `users.messages.send` | **Essential.** Allows FillFlow to send conversational responses and approved project briefs directly from the user's authentic company mailbox, preserving client continuity and email threading (`In-Reply-To`, `References`). |
| `https://www.googleapis.com/auth/userinfo.email` | **Non-Sensitive** | **Tenant Workspace Mapping** | `/oauth2/v2/userinfo` | **Essential.** Identifies the authenticated Google account email to map multi-tenant database records and prevent cross-company message routing. |

### Note on Eliminated Scope (`gmail.modify`)
- **Status:** **REMOVED**
- **Rationale:** `gmail.modify` was previously used solely to remove the `UNREAD` label after processing. Database-backed deduplication (PostgreSQL `ChatMessage` records, `AutomationConnection.metadata.processedEmailIds`, and in-memory caches) reliably prevents duplicate processing loops. Removing `gmail.modify` eliminates write/delete permissions over customer mailboxes, strictly adhering to Google's Principle of Least Privilege.

---

## 2. Exact OAuth Branding Fields to Enter in Google Cloud Console

When configuring **APIs & Services > OAuth consent screen** in project `automation-508113`:

| Console Field | Value to Enter | Verification Guidance |
|---|---|---|
| **App Name** | `FillFlow` | Must match branding on public website and consent screen title. |
| **User Support Email** | `support@apexbyte.io` *(or owner-designated support email)* | Must be an inbox accessible by the owner for verification correspondence. |
| **App Logo** | 120x120px PNG/JPEG with transparent or dark background | Logo must match the "FillFlow" logo displayed on the landing page header. |
| **Application Home Page** | `https://fill-flow-omega.vercel.app` *(or custom domain `https://fillflow.app`)* | Must be publicly accessible without login. |
| **Application Privacy Policy Link** | `https://fill-flow-omega.vercel.app/privacy` | Must resolve to the newly published live Privacy Policy. |
| **Application Terms of Service Link** | `https://fill-flow-omega.vercel.app/terms` | Must resolve to the newly published live Terms of Service. |
| **Authorized Domains** | `fillflow.app` *(and/or owner's registered domain)* | **Crucial:** Google Cloud does not permit adding `vercel.app` as an authorized top-level domain because it is a shared public suffix. A custom domain owned by the project owner is strictly required (see Section 4). |
| **Developer Contact Information** | `support@apexbyte.io` *(or owner contact)* | Google will use this email for annual re-verification and CASA security assessment notifications. |

---

## 3. Production Callback & Redirect URIs

Configured under **APIs & Services > Credentials > OAuth 2.0 Client IDs**:

- **Production Authorized Redirect URI:**
  ```text
  https://fill-flow-omega.vercel.app/api/integrations/google/callback
  ```
  *(And for custom production domain when mapped:)*
  ```text
  https://fillflow.app/api/integrations/google/callback
  ```
- **Local Development Redirect URI:**
  ```text
  http://localhost:3000/api/integrations/google/callback
  ```
- **Authorized JavaScript Origins:**
  ```text
  https://fill-flow-omega.vercel.app
  https://fillflow.app
  http://localhost:3000
  ```

---

## 4. Domain Ownership & Custom Domain Requirements

> [!IMPORTANT]
> **VERCEL.APP CANNOT BE VERIFIED AS AN AUTHORIZED DOMAIN WITH GOOGLE.**
> Google requires that the top-level domain listed in your OAuth consent screen be verified under your Google account using **Google Search Console**. Because `vercel.app` is a shared public domain owned by Vercel, Google will refuse verification if you only provide `vercel.app`.

### Owner Action Required:
1. Purchase or designate a custom domain (e.g., `fillflow.app`, `fillflow.io`, or `youragency.com`).
2. Add the custom domain to your Vercel deployment under **Project Settings > Domains**.
3. Verify domain ownership in [Google Search Console](https://search.console.google.com/) under the same Google account that owns GCP project `automation-508113` (via DNS TXT record).
4. Add the verified domain to **Authorized Domains** in the GCP OAuth consent screen.

---

## 5. Public Privacy Policy & Terms URLs

Both pages have been implemented as public, unauthenticated routes in the Next.js App Router:
- **Privacy Policy:** `https://fill-flow-omega.vercel.app/privacy` ([`src/app/privacy/page.tsx`](file:///c:/Users/Hritik/Desktop/sevice/src/app/privacy/page.tsx))
- **Terms of Service:** `https://fill-flow-omega.vercel.app/terms` ([`src/app/terms/page.tsx`](file:///c:/Users/Hritik/Desktop/sevice/src/app/terms/page.tsx))

Both routes are linked in the application footer ([`src/components/layout/Footer.tsx`](file:///c:/Users/Hritik/Desktop/sevice/src/components/layout/Footer.tsx)) and are mobile-responsive and accessible without login.

---

## 6. Google Limited Use & Data-Handling Disclosures

FillFlow's Privacy Policy explicitly incorporates the mandatory Google Limited Use disclosure:
1. **Limited Use Commitment:** Information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.
2. **No Model Training:** Gmail user data is never used to train, retrain, or fine-tune generalized or foundation artificial intelligence models.
3. **No Advertising:** Gmail data is never used or transferred for advertising purposes.
4. **Encryption at Rest:** Sensitive OAuth tokens are encrypted using AES-256-GCM.
5. **Right to Disconnect & Delete:** Users can disconnect at any time to purge tokens and cancel watches, or request permanent data deletion via the authenticated API or support email.

---

## 7. Required Demonstration Video Script (2-3 Minutes)

Google requires a publicly viewable YouTube (Unlisted) or Google Drive video demonstrating the OAuth grant process and the features that utilize the requested scopes.

### Video Requirements:
- **URL Bar Visible:** The browser address bar MUST be clearly visible throughout the OAuth flow, showing the complete OAuth URL with the `client_id` parameter matching `10697576552-htgiqhl4vm8a1hn010oibfk46qmsoc0d.apps.googleusercontent.com`.
- **Consent Screen:** Show the Google account chooser, the app title "FillFlow", and the permission grant checkboxes for reading and sending email.
- **In-App Demonstration:** Show what happens immediately after connecting.

### Step-by-Step Script:
1. **Introduction (0:00 - 0:25):**
   - Introduce FillFlow: *"FillFlow is an automated requirement scoping and inquiry triage SaaS for IT and software agencies."*
   - Show the public landing page explaining Gmail automation.
2. **OAuth Consent Flow (0:25 - 1:05):**
   - Navigate to the FillFlow Dashboard > Email Automations (`/dashboard/automations/email`).
   - Click **Connect Gmail**.
   - Zoom in on the address bar to show the URL: `https://accounts.google.com/o/oauth2/v2/auth?client_id=10697576552-...`.
   - Show the permission prompt requesting access to view email messages and send emails on your behalf.
   - Accept permissions.
3. **Inbound Inquiry & Intent Triage (1:05 - 1:55):**
   - Send a test business inquiry email from an external client account (e.g., *"Hi, we need a mobile app built with Flutter. Budget is $20,000."*).
   - Show Google Cloud Pub/Sub push notification arrival.
   - Show FillFlow automatically parsing the inquiry, creating a Lead, and extracting the budget and timeline.
4. **Approval Queue & Outbound Send (1:55 - 2:35):**
   - Show the generated AI draft reply in the dashboard.
   - Show how sensitive quotes or policies route to the Approval Queue.
   - Click **Approve & Send** (or show automated reply dispatch).
   - Switch to the client inbox to show the reply delivered seamlessly in the existing email thread.
5. **Secure Disconnection (2:35 - 3:00):**
   - Return to Settings, click **Disconnect Gmail**.
   - Explain that credentials are immediately purged and the Pub/Sub watch is cancelled.

---

## 8. Restricted-Scope Security Assessment (CASA Tier 2) Implications

Because FillFlow requests `gmail.readonly` and `gmail.send`, Google classifies the application as using **Restricted Scopes**.

### What to Expect:
- **Automated Verification Review:** Google Trust & Safety will first review your app branding, privacy policy, domain ownership, and demo video.
- **CASA Notification:** Once approved by the initial review team, Google will instruct you to initiate a **Cloud Application Security Assessment (CASA Tier 2)** through an authorized third-party lab (such as Bishop Fox, Leviathan Security, DEKRA, or CyberCX).
- **Cost & Timeline:** Third-party CASA assessments typically take 2-4 weeks and cost between $1,500 and $6,000 annually.
- **Alternative (Internal Testing Mode):** If FillFlow is initially used only by your own company's Google Workspace domain (e.g., `@yourcompany.com`), you can switch the OAuth Consent Screen to **Internal User Type**, which **completely bypasses verification and CASA fees**.

---

## 9. Missing Owner Legal Information (`OWNER_ACTION_REQUIRED`)

Before submitting the verification request in Google Cloud Console, the owner must provide:
1. **Formal Registered Entity Name:** Legal business name (e.g., "FillFlow Technologies LLC" or registered agency name).
2. **Physical Registered Business Address:** Required for privacy policy completeness and Google business identity check.
3. **Official Support Email Address:** Confirm whether `support@apexbyte.io` or a dedicated domain email (e.g., `support@fillflow.app`) is active.
4. **Domain Purchase & DNS TXT Record:** Purchase and verify custom domain in Google Search Console.

---

## 10. Manual Steps Remaining in Google Cloud Console

1. Navigate to [Google Cloud Console](https://console.cloud.google.com/) > Select project `automation-508113`.
2. Go to **APIs & Services > OAuth consent screen**.
3. Under **App Information**, enter:
   - App Name: `FillFlow`
   - User Support Email: *(Your verified email)*
   - App Logo: *(Upload 120x120px logo)*
4. Under **App Domain**, enter:
   - Application Home Page: `https://fillflow.app`
   - Privacy Policy Link: `https://fillflow.app/privacy`
   - Terms of Service Link: `https://fillflow.app/terms`
   - Authorized Domains: `fillflow.app`
5. Under **Scopes for Google APIs**, ensure only the following are configured:
   - `.../auth/gmail.readonly`
   - `.../auth/gmail.send`
   - `.../auth/userinfo.email`
   *(Remove `.../auth/gmail.modify` if previously added)*
6. Under **Developer Contact Information**, enter your primary contact email.
7. Click **Save and Continue**.
8. Click **Publish App** to switch from "Testing" mode to "In Production".
9. When prompted, submit the unlisted YouTube demonstration video URL and detailed scope justifications from Section 1.

---

## 11. Prioritized Final Submission Checklist

- [x] **Privacy Policy Published:** [`src/app/privacy/page.tsx`](file:///c:/Users/Hritik/Desktop/sevice/src/app/privacy/page.tsx) live with Google Limited Use statement.
- [x] **Terms of Service Published:** [`src/app/terms/page.tsx`](file:///c:/Users/Hritik/Desktop/sevice/src/app/terms/page.tsx) live with AI approval disclaimers.
- [x] **Footer Links Active:** [`src/components/layout/Footer.tsx`](file:///c:/Users/Hritik/Desktop/sevice/src/components/layout/Footer.tsx) updated with functional Next.js links.
- [x] **Landing Page Aligned:** [`Hero.tsx`](file:///c:/Users/Hritik/Desktop/sevice/src/components/landing/Hero.tsx), [`HowItWorks.tsx`](file:///c:/Users/Hritik/Desktop/sevice/src/components/landing/HowItWorks.tsx), and [`Features.tsx`](file:///c:/Users/Hritik/Desktop/sevice/src/components/landing/Features.tsx) explicitly explain Gmail automation.
- [x] **Scope Reduction Implemented:** `gmail.modify` eliminated from standard authorization flow.
- [x] **Disconnection Service Unified:** Tokens revoked with Google and purged from database metadata.
- [x] **Data Deletion Mechanism Created:** Authenticated API route and cascade service implemented.
- [ ] **OWNER ACTION:** Map custom domain (e.g., `fillflow.app`) to Vercel and verify in Google Search Console.
- [ ] **OWNER ACTION:** Finalize corporate entity details and support contact email.
- [ ] **OWNER ACTION:** Record 2-3 minute demo video following the script in Section 7.
- [ ] **OWNER ACTION:** Submit OAuth Consent Screen in Google Cloud Console for project `automation-508113`.
