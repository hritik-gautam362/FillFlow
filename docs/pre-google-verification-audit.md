# FillFlow — Pre-Google Verification Audit Report

**Date of Audit:** October 14, 2026  
**Auditor:** Automated Engineering & Security Audit Subsystem (Antigravity AI)  
**Corpus / Repository:** `hritik-gautam362/FillFlow`  
**Target Document Path:** `docs/pre-google-verification-audit.md`  
**Purpose:** Comprehensive, evidence-based audit of architecture, Gmail OAuth integration, Google user data handling, public web presence, Google Cloud configuration, and verification readiness prior to formal Google OAuth App Verification.

---

## 1. Current Project Overview

### 1.1 Architecture & Stack
FillFlow is an event-driven AI requirement discovery and inbound inquiry automation SaaS platform built on the **Next.js App Router** framework. It intercepts prospective customer inquiries across multiple channels (Gmail, Web Chat, and WhatsApp), classifies intent, scopes project requirements using conversational AI, and either issues automated replies or routes high-risk commercial inquiries to an internal company approval queue.

- **Framework:** Next.js `15.5.27` (React `19.0.0`, React DOM `19.0.0`)
- **Language / Runtime:** TypeScript `5.0.0`, Node.js (Engine: Node 20+)
- **Database & ORM:** PostgreSQL hosted via Neon Serverless (`@neondatabase/serverless` `0.10.4`, `@prisma/adapter-neon` `6.4.1`), managed through Prisma ORM `6.4.1`
- **AI Core:** Google Generative AI SDK (`@google/generative-ai` `0.24.1`), utilizing `gemini-flash-lite-latest` (with fallback to `gemini-3.1-flash-lite`)
- **Styling & UI:** Tailwind CSS `4.0.0`, Lucide React `0.475.0`, Class Variance Authority (`cva` `0.7.1`), `clsx` / `tailwind-merge`
- **Security & Cryptography:** Node.js native `crypto` (AES-256-GCM for token encryption, SHA-256 key derivation), `jose` `6.2.12` (JWT session tokens & OAuth state signatures), `bcryptjs` `3.0.3` (password hashing)
- **Deployment Platform:** Vercel (Configured via [vercel.json](file:///c:/Users/Hritik/Desktop/sevice/vercel.json) with automated cron schedule: `0 2 * * *` targeting `/api/integrations/google/watch/renew`)
- **Deployment URL:** Configured dynamically via `NEXT_PUBLIC_APP_URL` (Defaults to `http://localhost:3000` in `.env.example`)

### 1.2 Important Integrations
1. **Google Workspace / Gmail API:** REST API v1 for mailbox history synchronization, message retrieval, label manipulation, push notification registration (`users.watch`), and outbound reply dispatch (`users.messages.send`).
2. **Google Cloud Pub/Sub:** Real-time push subscription delivering inbound mailbox notifications (`gmail-inbound` topic) to `/api/webhooks/google/pubsub`.
3. **Google Gemini API:** Intent classification, progressive scoping, requirement extraction, and multi-style draft variation generation.
4. **Neon PostgreSQL:** Multi-tenant relational storage with connection pooling and SSL WebSockets.
5. **Meta WhatsApp Cloud API:** Auxiliary inbound channel (`src/lib/whatsapp.ts`).
6. **Mailgun API:** Auxiliary email provider interface (`src/lib/services/email/MailgunProvider.ts`).

### 1.3 Project Directory Structure
```
c:\Users\Hritik\Desktop\sevice\
├── .env.example                     # Environment template (safe, non-secret)
├── docs/
│   ├── google-gmail-setup.md        # Architectural setup guide for Google Cloud & Pub/Sub
│   └── pre-google-verification-audit.md # [This Audit Document]
├── prisma/
│   └── schema.prisma                # Database schema (14 models, 7 enums)
├── public/                          # Static assets
├── scripts/                         # 80 operational, regression, and migration scripts
├── src/
│   ├── app/
│   │   ├── admin/                   # Platform administration dashboards
│   │   ├── api/                     # 45 REST API routes (Auth, Integrations, Webhooks, etc.)
│   │   ├── chat/                    # Web-based customer chat interface
│   │   ├── dashboard/               # Tenant dashboard (Settings, Automations, Playground)
│   │   ├── login/ & signup/         # User authentication flows
│   │   ├── onboarding/              # Multi-step agency guided onboarding
│   │   ├── widget/                  # Embeddable web widget client
│   │   ├── layout.tsx & page.tsx    # Root layout and public marketing landing page
│   ├── components/                  # UI components (landing, layout, dashboard)
│   ├── lib/
│   │   ├── ai/                      # Permission engine, prompt templates, validators, memory
│   │   ├── auth/                    # JWT sessions, cookie management, access guards
│   │   ├── security/                # AES-256-GCM encryption, rate limiting, widget auth
│   │   ├── services/                # Business logic, email providers, approvals, quotas
│   │   └── prisma.ts                # Neon-pooled database client
│   └── types/                       # Shared TypeScript type definitions
└── vercel.json                      # Vercel cron and deployment specification
```

---

## 2. Implemented Features

Each feature below has been inspected directly in the application source code. We explicitly distinguish between **Verified Implementation**, **Partially Implemented Behavior**, and **Unverified Assumptions**.

### 2.1 Gmail OAuth Connection
- **Status:** **VERIFIED IMPLEMENTATION**
- **Evidence:**
  - Route: [`src/app/api/integrations/google/start/route.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/app/api/integrations/google/start/route.ts)
  - Callback: [`src/app/api/integrations/google/callback/route.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/app/api/integrations/google/callback/route.ts)
  - Service: [`src/lib/services/automationConnectionService.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/automationConnectionService.ts)
- **Detailed Findings:**
  - Initiates Google OAuth 2.0 with `access_type=offline`, `prompt=consent select_account`, and cryptographically signed JWT `state` tokens (10-minute expiry) carrying tenant metadata (`companyId`, `userId`, `nonce`).
  - Exchanges authorization code via `https://oauth2.googleapis.com/token`.
  - Verifies presence of granted scopes and requires reauthorization if `https://www.googleapis.com/auth/gmail.modify` is missing.
  - Persists connection status in Prisma `AutomationConnection` table.

### 2.2 Gmail Inbound Processing & History Sync
- **Status:** **VERIFIED IMPLEMENTATION**
- **Evidence:**
  - Service: [`src/lib/services/email/emailInboundService.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/emailInboundService.ts) (`processInboundEmail`)
  - Provider: [`src/lib/services/email/GoogleProvider.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/GoogleProvider.ts) (`fetchMessage`, `listHistory`)
  - Webhook Service: [`src/lib/services/email/googlePubSubWebhookService.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/googlePubSubWebhookService.ts)
- **Detailed Findings:**
  - Multi-tier deduplication: in-memory cache (`completedEmailMessageIds`), database check in `ChatMessage.extractedDataSnapshot`, and `metadata.processedEmailIds`.
  - Incremental sync via `gmail.users.history.list(startHistoryId)`.
  - Graceful recovery: On HTTP 404 (expired `historyId`), falls back to querying the latest profile historyId and fetching recent unread messages (`in:inbox is:unread`).
  - Normalizes RFC 2822 messages, strips previous email quotes/signatures, and extracts thread headers (`In-Reply-To`, `References`, `Thread-Id`).

### 2.3 Google Cloud Pub/Sub Push Integration
- **Status:** **VERIFIED IMPLEMENTATION**
- **Evidence:**
  - Route: [`src/app/api/webhooks/google/pubsub/route.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/app/api/webhooks/google/pubsub/route.ts)
  - Service: [`src/lib/services/email/googlePubSubWebhookService.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/googlePubSubWebhookService.ts)
  - Watch Lifecycle: [`src/lib/services/email/gmailWatchService.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/gmailWatchService.ts) (`setupGmailWatch`, `renewGmailWatchIfNeeded`)
- **Detailed Findings:**
  - Base64 decodes Google Pub/Sub push notification envelope (`emailAddress`, `historyId`).
  - Validates `GMAIL_PUBSUB_VERIFICATION_TOKEN` via query param or Bearer header (strictly required in production).
  - Resolves target company via multi-tenant address lookup on `AutomationConnection`.
  - Maintains in-flight concurrency locks (`inFlightSyncCompanies`) to prevent race conditions during concurrent push bursts.
  - Registers watches with 7-day expiration via `users.watch()`, and implements proactive renewal if expiration is under 48 hours.

### 2.4 AI Response Generation & Discovery Engine
- **Status:** **VERIFIED IMPLEMENTATION**
- **Evidence:**
  - Core AI: [`src/lib/ai/gemini.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/ai/gemini.ts) (`callGeminiRequirementAgent`)
  - Discovery Service: [`src/lib/services/aiDiscoveryService.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/aiDiscoveryService.ts)
  - Prompts & Rules: [`src/lib/ai/prompts.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/ai/prompts.ts)
  - Classifier: [`src/lib/services/email/emailClassifier.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/emailClassifier.ts)
- **Detailed Findings:**
  - Deterministic and AI-based classification categorizes inbound messages into `CUSTOMER_INQUIRY`, `PROMOTIONAL`, `NEWSLETTER`, `AUTOMATED`, or `SPAM`. Non-inquiries are dropped without replying or burning quota.
  - Multi-turn conversation memory maintains accumulated requirements (`budget`, `timeline`, `techStack`, `features`).
  - Response generator answers the customer's newest inquiry first, respects business context, and avoids hallucinations.

### 2.5 AI Permission Engine & Commercial Safety Layer
- **Status:** **VERIFIED IMPLEMENTATION**
- **Evidence:**
  - Engine: [`src/lib/ai/permissionEngine.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/ai/permissionEngine.ts) (`evaluateMessagePermissions`)
  - Service: [`src/lib/services/companyPermissionService.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/companyPermissionService.ts)
  - Claim Validator: [`src/lib/ai/commercialClaimValidator.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/ai/commercialClaimValidator.ts)
- **Detailed Findings:**
  - Implements immutable regex rules blocking unauthorized contractual commitments, NDAs, power of attorney, unconditional guarantees (money-back, 100% bug-free), exclusivity clauses, and prompt extraction attempts.
  - Evaluates autonomous reply policy across 9 risk categories: pricing, discounts, commission/revenue-share, contracts, refunds, deadlines, SLAs, partnerships, general info.
  - Three company autonomy modes: `FULL_AUTONOMY`, `LIMITED_ACCESS`, and `STRICT_APPROVAL`.

### 2.6 Approval Queue & Draft Variations
- **Status:** **VERIFIED IMPLEMENTATION**
- **Evidence:**
  - Service: [`src/lib/services/aiApprovalService.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/aiApprovalService.ts) (`createApprovalItem`, `sendApprovalItem`)
  - Variations: [`src/lib/ai/draftVariationEngine.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/ai/draftVariationEngine.ts)
  - API Routes: `src/app/api/companies/[id]/approvals/*`
- **Detailed Findings:**
  - When a message triggers restricted policies, an approval item is generated containing customer data, history, and 3 pre-screened drafts: Professional, Warm/Relationship, and Concise.
  - Items are persisted in `AutomationConnection.metadata.approvalQueue`.
  - Optional customer holding response can be dispatched immediately while notifying the customer that leadership is reviewing terms.
  - Manual review actions supported: Select variation, regenerate, validate against company policy, edit text, and send.

### 2.7 Company Knowledge Base & Control Center
- **Status:** **VERIFIED IMPLEMENTATION**
- **Evidence:**
  - Schema: `CompanyKnowledge` model in [`prisma/schema.prisma`](file:///c:/Users/Hritik/Desktop/sevice/prisma/schema.prisma)
  - Service: [`src/lib/services/companyPermissionService.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/companyPermissionService.ts)
  - Routes: [`src/app/api/companies/[id]/knowledge/route.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/app/api/companies/[id]/knowledge/route.ts), `control-center/route.ts`
- **Detailed Findings:**
  - Supports structured knowledge items (`pricing`, `services`, `company`, `policy`, `faq`).
  - Supports AI suggestions (`CompanyAiSuggestion`) extracted from customer interactions, requiring admin verification before becoming active facts.

### 2.8 Audit Logging & Email Quota Controls
- **Status:** **VERIFIED IMPLEMENTATION**
- **Evidence:**
  - Service: [`src/lib/services/emailQuotaService.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/emailQuotaService.ts)
  - Schema: `AutomationQuotaAuditLog` and `AutomationAccess` in [`prisma/schema.prisma`](file:///c:/Users/Hritik/Desktop/sevice/prisma/schema.prisma)
- **Detailed Findings:**
  - Two-phase quota reservation (`reserveEmailQuota` -> `commitEmailQuota` or `releaseEmailQuota`).
  - Atomic auto-lock when `usedCredits + reservedCredits >= monthlyLimit`.
  - Detailed audit logs recorded in `AutomationQuotaAuditLog` table for `QUOTA_RESERVED`, `CREDIT_CONSUMED`, `CREDIT_RELEASED`, `QUOTA_LOCKED`, `LIMIT_UPDATED`, and `ADMIN_DISABLED`.
  - Structured application logs generated via `logEmailAutomationEvent` avoiding secrets or credentials.

### 2.9 Account Disconnection
- **Status:** **PARTIALLY IMPLEMENTED (Security Gap Identified)**
- **Evidence:**
  - Disconnect Route 1: [`src/app/api/integrations/google/disconnect/route.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/app/api/integrations/google/disconnect/route.ts)
  - Disconnect Route 2: [`src/app/api/companies/[id]/automations/[type]/connection/route.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/app/api/companies/[id]/automations/[type]/connection/route.ts)
  - Connection Service: [`src/lib/services/automationConnectionService.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/automationConnectionService.ts) (`disconnectAutomation`)
- **Detailed Findings:**
  - In `POST /api/integrations/google/disconnect`, the application cleanly calls `stopGmailWatch(companyId)` and attempts to revoke the access token at `https://oauth2.googleapis.com/revoke?token=...`.
  - **GAP:** Only `accessToken` is sent to Google's revocation endpoint. If expired, revocation fails. The `refreshToken` is never explicitly revoked.
  - **CRITICAL GAP:** `disconnectAutomation` updates `status: disconnected` and `disconnectedAt: now()`, but **does NOT clear or wipe the `metadata` column**. Encrypted access tokens, encrypted refresh tokens, user IDs, and past history IDs remain stored in PostgreSQL after disconnection.
  - **INCONSISTENCY GAP:** In `DELETE /api/companies/[id]/automations/[type]/connection/route.ts`, the handler calls `disconnectAutomation` directly without invoking `stopGmailWatch` or revoking tokens with Google.

### 2.10 User Data Deletion & Privacy Rights
- **Status:** **UNVERIFIED ASSUMPTION / MISSING**
- **Evidence:**
  - Codebase search for company/tenant deletion: No `DELETE` handler exists on `/api/companies/[id]`.
  - No data purging service or retention cleanup job exists in the repository.
- **Detailed Findings:**
  - While individual project features and knowledge items can be deleted (`DELETE /api/features/[id]`, `DELETE /api/companies/[id]/knowledge/[itemId]`), there is **no implementation for deleting a company, user account, customer leads, chat history, or imported email records**.
  - Google's OAuth Verification requirements strictly demand a clear user data deletion policy and an accessible mechanism (in-app button or documented contact mechanism) for users to request data purging.

---

## 3. OAuth and Gmail Scope Audit

### 3.1 OAuth Scopes Requested
The application requests **four (4) OAuth scopes** in [`src/app/api/integrations/google/start/route.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/app/api/integrations/google/start/route.ts#L84-L89):

| Scope | Google Sensitivity Classification | Configured Location | Purpose in FillFlow | Scope Justification & Minimum Privilege Assessment |
|---|---|---|---|---|
| `https://www.googleapis.com/auth/gmail.readonly` | **Restricted** | `src/app/api/integrations/google/start/route.ts:85` | Reading incoming messages (`users.messages.get`), inspecting message threads (`users.threads.get`), and listing mailbox history (`users.history.list`). | **Required** for inbound inquiry detection, but triggers Restricted Scope verification. |
| `https://www.googleapis.com/auth/gmail.modify` | **Restricted** | `src/app/api/integrations/google/start/route.ts:86` | Removing the `UNREAD` label (`users.messages.modify`) after processing, and registering `users.watch`. | **High Risk / Potential Redundancy:** Marking messages read is only used to avoid duplicate sync loops. FillFlow already has robust database-backed deduplication (`ChatMessage`, `AutomationConnection.metadata.processedEmailIds`). Gmail `users.watch` on INBOX can be registered with `gmail.readonly`. Requesting `gmail.modify` is a primary verification obstacle. |
| `https://www.googleapis.com/auth/gmail.send` | **Restricted** | `src/app/api/integrations/google/start/route.ts:87` | Sending automated replies and manual approval drafts via `users.messages.send`. | **Required** if sending emails from the user's Gmail mailbox. Triggers Restricted Scope verification. |
| `https://www.googleapis.com/auth/userinfo.email` | **Non-Sensitive** | `src/app/api/integrations/google/start/route.ts:88` | Retrieving the authenticated Google user's primary email address for multi-tenant mapping. | Standard, non-sensitive scope. |

> [!WARNING]
> **THREE (3) RESTRICTED SCOPES REQUESTED:**
> Requesting `gmail.readonly`, `gmail.modify`, and `gmail.send` places FillFlow in the highest scrutiny tier of Google OAuth App Verification. It requires a mandatory Cloud Application Security Assessment (CASA Tier 2/Tier 3) by an authorized security assessor, costing between $1,500 and $6,000+ annually, unless internal user type or scope reductions apply.

### 3.2 Every Gmail API Operation Performed

| # | HTTP Method & Gmail API Endpoint | Caller in Repository | Required Scope | Function & Business Purpose |
|---|---|---|---|---|
| 1 | `POST /gmail/v1/users/me/messages/send` | [`GoogleProvider.ts:261`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/GoogleProvider.ts#L261) | `gmail.send` | Dispatches outbound automated AI replies or approved drafts in RFC 2822 base64 format. |
| 2 | `GET /gmail/v1/users/me/messages/{id}?format=full` | [`GoogleProvider.ts:376`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/GoogleProvider.ts#L376) | `gmail.readonly` | Fetches incoming customer inquiry headers, sender info, subject, and text/html body. |
| 3 | `GET /gmail/v1/users/me/profile` | [`GoogleProvider.ts:418`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/GoogleProvider.ts#L418) | `gmail.readonly` | Obtains baseline `historyId` and connected email address during recovery sync. |
| 4 | `GET /gmail/v1/users/me/history?startHistoryId=...` | [`GoogleProvider.ts:460`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/GoogleProvider.ts#L460) | `gmail.readonly` | Fetches incremental changes (`messageAdded`) since the last known `historyId`. |
| 5 | `POST /gmail/v1/users/me/watch` | [`GoogleProvider.ts:529`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/GoogleProvider.ts#L529) | `gmail.readonly` or `gmail.modify` | Registers push notifications with Google Cloud Pub/Sub topic on the `INBOX` label. |
| 6 | `POST /gmail/v1/users/me/stop` | [`GoogleProvider.ts:591`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/GoogleProvider.ts#L591) | `gmail.readonly` or `gmail.modify` | Cancels active Pub/Sub push notification watch when disconnecting. |
| 7 | `POST /gmail/v1/users/me/messages/{id}/modify` | [`GoogleProvider.ts:622`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/GoogleProvider.ts#L622) | `gmail.modify` | Modifies message labels (removes `UNREAD` label) to prevent duplicate sync loops. |
| 8 | `GET /gmail/v1/users/me/threads/{id}?format=metadata` | [`GoogleProvider.ts:684`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/GoogleProvider.ts#L684) | `gmail.readonly` | Inspects thread metadata headers (`from`, `in-reply-to`, `references`) to verify whether an outbound reply was already dispatched. |
| 9 | `GET /gmail/v1/users/me/messages?q=...` | [`googlePubSubWebhookService.ts:223`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/googlePubSubWebhookService.ts#L223) | `gmail.readonly` | Recovery query executed when `historyId` expires (404) to search for recent unread inbox messages. |

### 3.3 Other Google OAuth / Identity Endpoints Used
- `POST https://oauth2.googleapis.com/token`: Authorization code exchange and refresh token grant.
- `GET https://www.googleapis.com/oauth2/v2/userinfo`: Fetches user's Google ID and verified email address.
- `POST https://oauth2.googleapis.com/revoke?token=...`: Revokes access token during disconnect.

### 3.4 OAuth State Validation & Redirect URI Security
- **State Generation:** [`src/app/api/integrations/google/start/route.ts:70-81`](file:///c:/Users/Hritik/Desktop/sevice/src/app/api/integrations/google/start/route.ts#L70-L81) signs a JWT using HS256 containing `companyId`, `userId`, `nonce`, and `returnTo`. Expires in 10 minutes.
- **State Verification:** [`src/app/api/integrations/google/callback/route.ts:77`](file:///c:/Users/Hritik/Desktop/sevice/src/app/api/integrations/google/callback/route.ts#L77) verifies signature and expiration.
- **Redirect URIs in Code:**
  - Default: `process.env.GOOGLE_REDIRECT_URI`
  - Fallback: `${url.origin}/api/integrations/google/callback`
  - Local Dev Target: `http://localhost:3000/api/integrations/google/callback`
- **Return URL Sanitization:** `sanitizeReturnTo` prevents open redirect attacks by checking that `returnTo` starts with `/`, does not start with `//`, does not contain `\`, and stays on the same origin.
- **Fallback Secret Warning:** In both `start` and `callback`, if `process.env.JWT_SECRET` is unset, code defaults to a hardcoded string (`'apexbyte-secret-saas-platform-key-2026-secure'`). While convenient in local development, this is a security risk if deployed without environment enforcement.

### 3.5 Token Storage, Refresh, Revocation, and Error Handling
- **Storage:** Tokens are encrypted with AES-256-GCM via [`src/lib/security/encryption.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/security/encryption.ts) before persisting to `AutomationConnection.metadata` (`encryptedAccessToken`, `encryptedRefreshToken`, `tokenExpiry`).
- **Refresh Mechanism:** [`GoogleProvider.ts:87-154`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/GoogleProvider.ts#L87-L154) automatically refreshes access tokens when within 60 seconds of expiration or upon receiving HTTP 401 Unauthorized. Updates database via `onTokenRefreshed` callback.
- **Revocation:** Calls `https://oauth2.googleapis.com/revoke` on `accessToken` during disconnection. Does not revoke `refreshToken`.

---

## 4. Google User Data and Privacy Audit

### 4.1 Data Processing & Storage Map

| Data Category | Specific Fields Extracted | Storage Location (Database & Fields) | Retention Duration |
|---|---|---|---|
| **OAuth Credentials** | Access Token, Refresh Token, Expiry Timestamp | `AutomationConnection.metadata.encryptedAccessToken`, `encryptedRefreshToken`, `tokenExpiry` | Indefinite until manual DB purge or overwrite (persists even after disconnect). |
| **Mailbox Identifiers** | Connected Gmail address, Google User ID | `AutomationConnection.displayName`, `externalId`, `metadata.googleEmail`, `metadata.googleUserId` | Indefinite. |
| **Pub/Sub Notification Data** | Webhook publishTime, messageId, mailbox address, incoming historyId | Processed in-flight in [`googlePubSubWebhookService.ts`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/googlePubSubWebhookService.ts); stored in `AutomationConnection.metadata.historyId` | Updated on each sync. |
| **Customer Email Metadata** | Sender email, sender name, recipient, subject, RFC Message-ID, Gmail messageId, threadId, internalDate, RFC headers (`In-Reply-To`, `References`) | `Lead.email`, `Lead.clientName`; `ChatMessage.extractedDataSnapshot` (`gmailMessageId`, `gmailThreadId`, `inReplyToGmailMessageId`); `AutomationConnection.metadata.processedEmailIds` | Indefinite in relational tables. |
| **Customer Message Body** | Cleaned plain text (HTML stripped, signature and quoted thread removed) | Stored in `ChatMessage.text` (when Lead created/updated); stored in `AiApprovalItem.latestCustomerMessage` | Indefinite in PostgreSQL. |
| **Email Attachments** | **Not processed / Not stored.** Code only parses text and HTML parts (`GoogleProvider.ts:847-871`). Attachments are completely ignored. | None. | None. |
| **Extracted Requirements** | Budget, timeline, projectType, technical stack, requested features | `Lead.estimatedBudget`, `Lead.requestedTimeline`, `Lead.projectType`; `ProjectBrief` table; `ProjectFeature` table | Indefinite in PostgreSQL. |
| **Generated AI Drafts** | Professional, Warm, Concise reply texts | `AiApprovalItem.variations`, `currentDraft`, `originalAiDraft` inside `AutomationConnection.metadata.approvalQueue`; and `ChatMessage.text` upon sending | Indefinite in metadata. |

### 4.2 Data Sent to AI Providers & Third Parties
- **Third Party:** Google Generative AI (Gemini API) via `@google/generative-ai`.
- **API Key Env Var:** `AI_API_KEY` (Server-side only).
- **Model Used:** `AI_MODEL` (`gemini-flash-lite-latest` with fallback to `gemini-3.1-flash-lite`).
- **Data Transmitted to Gemini:**
  1. **Inbound Email Triage (`emailClassifier.ts:1216-1221`):** Sender Name, Sender Email, Subject, and up to the first 1,200 characters of the inbound email text.
  2. **Response Generation (`prompts.ts` / `gemini.ts`):** Complete message conversation history (client text, prior agent replies), confirmed project requirements, company profile context (company name, industry, services, business hours, and active company knowledge base snippets).
- **Data Sharing / Model Training Disclosure:** Under Google API Services User Data Policy, Google Workspace data obtained through restricted Gmail scopes **must NOT be used to train generalized artificial intelligence or machine learning models**. The application currently relies on Google Gemini API. FillFlow's public documentation and privacy disclosures must explicitly address this.

### 4.3 Logging and Retention Behavior
- Application event logging is executed through `logEmailAutomationEvent` in [`src/lib/services/email/emailInboundService.ts:135-175`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/emailInboundService.ts#L135-L175).
- Strictly logs metadata: `timestamp`, `gmailMessageId`, `threadId`, `sender`, `subject`, `classification`, `intent`, `processingStatus`, and error messages.
- Does **NOT** print raw email bodies, access tokens, refresh tokens, or client credentials into standard output logs.
- Retention: Database records (`Lead`, `ChatMessage`, `ProjectBrief`, `AutomationQuotaAuditLog`) are retained indefinitely. There is no automated TTL or scheduled pruning.

### 4.4 Tenant Isolation and Multi-Tenant Authorization
- **Database Level:** `companyId` foreign key is indexed and required across `User`, `Lead`, `ChatMessage`, `AutomationConnection`, `AutomationAccess`, `CompanyKnowledge`, and `CompanyAiPermission`.
- **API Guard Level:**
  - `requireAuth(request)`: Authenticates user session from HTTP-only JWT cookie (`auth_session`).
  - `requireCompanyAuth(companyId, request)`: Validates that `context.user.companyId === companyId` unless user possesses the `platform_admin` role.
- **Inbound Webhook Level:** Google Pub/Sub webhook (`/api/webhooks/google/pubsub`) resolves tenant ownership by querying `AutomationConnection` for `displayName` or `metadata.googleEmail` matching the decoded mailbox address. Only authorized tenant data is mutated.

### 4.5 Security Controls & Vulnerability Findings
1. **Hardcoded Fallback Cryptographic Secrets:**
   - In [`src/lib/security/encryption.ts:17`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/security/encryption.ts#L17): `const effectiveSecret = secret || 'apexbyte-default-encryption-secret-change-in-prod-2026';`
   - In [`src/lib/auth/jwt.ts:16`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/auth/jwt.ts#L16) and [`src/app/api/integrations/google/start/route.ts:9`](file:///c:/Users/Hritik/Desktop/sevice/src/app/api/integrations/google/start/route.ts#L9): fallback to `'apexbyte-secret-saas-platform-key-2026-secure'`.
   - *Severity: Medium.* Mitigated in production by throwing errors if `NODE_ENV === 'production'`, but should never be hardcoded in codebase.
2. **Residual Token Data After Disconnect:**
   - Disconnecting an automation channel sets status to `disconnected` but leaves encrypted tokens in `metadata`. If a workspace connects and later disconnects, Google tokens remain in database indefinitely.
3. **No User Data Deletion Capability:**
   - There is no automated or customer-facing data deletion endpoint.

---

## 5. Public Website Audit

We inspected all public landing pages, layout components, and client routes in `src/app`.

### 5.1 Exact Public Routes in Repository

| Route | File Path | Route Type | Working Status in Repo | Notes |
|---|---|---|---|---|
| `/` | [`src/app/page.tsx`](file:///c:/Users/Hritik/Desktop/sevice/src/app/page.tsx) | Static (○) | **Working** | Public marketing landing page. |
| `/login` | `src/app/login/page.tsx` | Static (○) | **Working** | User authentication login page. |
| `/signup` | `src/app/signup/page.tsx` | Static (○) | **Working** | Company registration & signup page. |
| `/chat` | `src/app/chat/page.tsx` | Static (○) | **Working** | Public interactive demo of requirement collection chat. |
| `/widget` | `src/app/widget/page.tsx` | Static (○) | **Working** | Standalone embeddable chat widget. |
| `/privacy` | *None* | **Missing** | **404 NOT FOUND** | **Critical Blocker:** No privacy policy route exists in `src/app`. |
| `/terms` | *None* | **Missing** | **404 NOT FOUND** | **Critical Blocker:** No terms of service route exists in `src/app`. |
| `/contact` | *None* | **Missing** | **404 NOT FOUND** | No dedicated support or contact page exists in `src/app`. |

### 5.2 Footer Analysis
Inspecting [`src/components/layout/Footer.tsx:75-83`](file:///c:/Users/Hritik/Desktop/sevice/src/components/layout/Footer.tsx#L75-L83):
```tsx
<div className="flex items-center gap-6">
  <span className="hover:text-slate-300 transition-colors">Privacy Policy</span>
  <span className="hover:text-slate-300 transition-colors">Terms of Service</span>
  <span className="hover:text-slate-300 transition-colors">WhatsApp Business API Ready</span>
</div>
```
- **Finding:** The terms "Privacy Policy" and "Terms of Service" appear in the footer, but **they are plain `<span>` tags, NOT clickable links** (`<Link>` or `<a>`).
- Clicking them in a browser does nothing.

### 5.3 Marketing Copy & Gmail Integration Inconsistency
- Inspecting [`Hero.tsx`](file:///c:/Users/Hritik/Desktop/sevice/src/components/landing/Hero.tsx), [`ProblemSolution.tsx`](file:///c:/Users/Hritik/Desktop/sevice/src/components/landing/ProblemSolution.tsx), [`HowItWorks.tsx`](file:///c:/Users/Hritik/Desktop/sevice/src/components/landing/HowItWorks.tsx), and [`Features.tsx`](file:///c:/Users/Hritik/Desktop/sevice/src/components/landing/Features.tsx):
  - The public landing page describes FillFlow **exclusively** as a tool for converting "Messy Client Chats into Structured Project Briefs" across **WhatsApp and Web Chat**.
  - **There is ZERO mention of Gmail, Google Workspace, or Email Automation on the public landing page.**
- **Google Verification Implication:** Google Trust & Safety reviewers manually inspect the public application homepage. If an application requests high-risk Gmail scopes (`gmail.readonly`, `gmail.modify`, `gmail.send`) but its public website only talks about WhatsApp and Web Chat, the application is **summarily rejected** for deceptive branding / inconsistent scope justification.

---

## 6. Google Cloud Configuration Audit

### 6.1 Repository Configuration & References

| Setting | Repository Evidence / Reference | Nature of Evidence |
|---|---|---|
| **Google Cloud Project ID** | `automation-508113` | Documented in [`docs/google-gmail-setup.md:40`](file:///c:/Users/Hritik/Desktop/sevice/docs/google-gmail-setup.md#L40); hardcoded default in [`gmailWatchService.ts:6`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/gmailWatchService.ts#L6); fallback in [`GoogleProvider.ts:566`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/GoogleProvider.ts#L566). |
| **OAuth Client ID** | `10697576552-htgiqhl4vm8a1hn010oibfk46qmsoc0d.apps.googleusercontent.com` | Documented in [`docs/google-gmail-setup.md:141`](file:///c:/Users/Hritik/Desktop/sevice/docs/google-gmail-setup.md#L141); set via `GOOGLE_CLIENT_ID` in `.env`. |
| **OAuth Client Secret** | Configured via `GOOGLE_CLIENT_SECRET` in `.env`. Never hardcoded in code. | Environment variable. |
| **Redirect URI (Dev)** | `http://localhost:3000/api/integrations/google/callback` | Documented in `.env.example` and `google-gmail-setup.md:57`. |
| **Redirect URI (Prod)** | `https://<production-domain>/api/integrations/google/callback` | Expected in `GOOGLE_REDIRECT_URI`. |
| **Pub/Sub Topic Path** | `projects/automation-508113/topics/gmail-inbound` | Hardcoded default fallback in [`gmailWatchService.ts:6`](file:///c:/Users/Hritik/Desktop/sevice/src/lib/services/email/gmailWatchService.ts#L6); configured via `GMAIL_PUBSUB_TOPIC`. |
| **Pub/Sub Push Endpoint** | `https://<domain-or-tunnel>/api/webhooks/google/pubsub` | Configured via `GOOGLE_PUBSUB_WEBHOOK_URL`. |
| **Pub/Sub Publisher Principal** | `gmail-api-push@system.gserviceaccount.com` | Required role: **Pub/Sub Publisher** on topic `gmail-inbound` (documented in setup guide). |
| **Pub/Sub Verification Token** | Configured via `GMAIL_PUBSUB_VERIFICATION_TOKEN`. Validated in webhook handler. | Environment variable. |

### 6.2 External Verification Notice
> [!NOTE]
> The items above represent references within repository source code and documentation. Settings such as Google Cloud OAuth consent screen publishing status (Testing vs. In Production), verified domain ownership (Google Search Console), OAuth branding logos, developer contact emails, and active Google Cloud Pub/Sub subscriptions **cannot be verified from the codebase** and must be inspected directly in the [Google Cloud Console](https://console.cloud.google.com/).

---

## 7. Existing Tests and Build Results

We executed non-destructive verification commands against the active repository on Windows PowerShell.

### 7.1 Exact Commands and Real Exit Statuses

#### Command 1: TypeScript Validation
```powershell
npx tsc --noEmit
```
- **Execution Date:** 2026-10-14 22:07:12 IST
- **Exit Status:** **0 (PASSED)**
- **Output:** Clean exit. Zero type errors across the entire codebase.

#### Command 2: ESLint Linter
```powershell
npm run lint
```
- **Execution Date:** 2026-10-14 22:07:25 IST
- **Exit Status:** **0 (PASSED)**
- **Output:**
  ```text
  > client-ai-agent@0.1.0 lint
  > eslint src
  ```
  Clean exit. Zero lint warnings or errors.

#### Command 3: Production Build
```powershell
npm run build
```
- **Execution Date:** 2026-10-14 22:07:38 IST (Task `task-155`)
- **Exit Status:** **0 (PASSED)**
- **Output:**
  - Prisma Client `6.4.1` generated in 94ms.
  - Next.js `15.5.27` compiled successfully in 4.0s.
  - Type validity verified.
  - Generated 29 static pages (all routes rendered successfully, including 45 API endpoints and 13 dynamic/static application pages).

#### Command 4: Isolated Acceptance Safety Test
```powershell
npx tsx scripts/test-acceptance-safety-isolated.ts
```
- **Execution Date:** 2026-10-14 22:08:41 IST (Task `task-171`)
- **Exit Status:** **0 (PASSED)**
- **Output:**
  ```text
  Testing Acceptance Safety Test 4 isolated:
  [Test 4A Result]: {
    isValid: false,
    issues: [ 'Send blocked: This response appears to commit to a 30% revenue share that has not been approved.' ],
    hasUnverifiedCommercialClaim: true
  }
  commercialIdentified: true
  [Test 4B Result]: {
    isValid: false,
    issues: [
      'Send blocked: Outbound immutable safety rule violated (contract, NDA, guarantee, exclusivity, or prompt leak). Protected by immutable safety rules.',
      'Send blocked: Response Requires Review: This response contains an unauthorized contractual, legal, guarantee, exclusivity, or system instruction commitment.'
    ]
  }
  guaranteeBlocked: true
  ✓ ACCEPTANCE SAFETY TEST 4 PASSED CLEANLY!
  ```

### 7.2 Non-Destructive Constraint Compliance
No live emails were sent, no external APIs were invoked with live write requests, no production databases were altered, and no destructive schema or migration commands were executed.

---

## 8. Google OAuth Verification Readiness

| Requirement | Current Evidence | Status | Remaining Action |
|---|---|---|---|
| **Public Homepage** | `src/app/page.tsx` exists and builds cleanly, but copy only mentions WhatsApp and Web Chat. | **PARTIALLY READY** | Update homepage and feature copy to prominently explain and showcase the Gmail / Google Workspace integration. |
| **Privacy Policy** | No `/privacy` route exists. Footer has unlinked text `<span>Privacy Policy</span>`. | **MISSING** | Create dedicated `src/app/privacy/page.tsx`, link it in `Footer.tsx`, and state data handling practices clearly. |
| **Terms of Service** | No `/terms` route exists. Footer has unlinked text `<span>Terms of Service</span>`. | **MISSING** | Create dedicated `src/app/terms/page.tsx` and link it in `Footer.tsx`. |
| **Domain Ownership & Verification** | Deployment uses `localhost:3000` / ngrok tunnel in `.env.example`. No production domain verified in repo. | **NEEDS EXTERNAL VERIFICATION** | Owner must verify top-level domain in Google Search Console and configure authorized domain in GCP. |
| **OAuth Branding & App Identity** | App is titled "FillFlow", but `package.json` names it `client-ai-agent`. Consent screen logo & app name unverified in Console. | **NEEDS EXTERNAL VERIFICATION** | Configure app name ("FillFlow"), official support email, and logo in Google Cloud Console OAuth consent screen. |
| **Authorized Domains & Redirect URIs** | `GOOGLE_REDIRECT_URI` points to `localhost:3000` in `.env.example`. | **PARTIALLY READY** | Add production domain redirect URI (e.g., `https://fillflow.app/api/integrations/google/callback`) to Google Cloud Console. |
| **Requested Scopes & Justifications** | Requests 3 Restricted scopes: `gmail.readonly`, `gmail.modify`, `gmail.send`. | **BLOCKED** | Scope reduction decision required: eliminate `gmail.modify` if possible, and prepare detailed, written functional justification for remaining scopes. |
| **Google Limited Use Disclosure** | No Limited Use statement in codebase, landing page, or privacy disclosures. | **MISSING** | Add mandatory Google API Services User Data Policy / Limited Use disclosure prominently in the new Privacy Policy. |
| **User Data Handling & Retention** | Indefinite retention in PostgreSQL; tokens retained in metadata after disconnect; no data deletion flow. | **BLOCKED** | Implement true data purge on disconnect, clear tokens from database, and build user account/data deletion mechanism. |
| **Demo Video Readiness** | No demonstration video or video script exists in the repository. | **MISSING** | Record a comprehensive YouTube/Drive video showing: client ID in address bar, OAuth consent screen, permission prompt, and actual in-app Gmail features. |
| **Restricted Scope Security Assessment (CASA)** | Because `gmail.send` and `gmail.readonly` are requested, CASA Tier 2 assessment will be triggered upon submission. | **BLOCKED** | Owner must budget for external CASA security assessment or evaluate if restricted scopes can be downgraded. |

---

## 9. Prioritized Findings

The top blockers are listed below in strict order of priority, categorized by whether they require **code changes**, **owner-provided business/legal details**, or **Google Cloud Console actions**:

### Blocker 1: Missing Public Privacy Policy & Terms of Service Pages (Critical Blocker)
- **Category:** **Code Change & Owner Business/Legal Action**
- **Detail:** Routes `/privacy` and `/terms` do not exist in Next.js, and footer links are unclickable `<span>` elements. Google OAuth verification immediately rejects any application without accessible, public, top-level privacy policy and terms of service pages.
- **Action Required:**
  1. Author and publish `src/app/privacy/page.tsx` including exact Google user data handling policies and Limited Use disclosures.
  2. Author and publish `src/app/terms/page.tsx`.
  3. Update `src/components/layout/Footer.tsx` to link to these routes using Next.js `<Link>`.

### Blocker 2: Three Restricted Scopes Requested & Scope Minimization Decision (Critical Blocker)
- **Category:** **Code Change & Owner Architectural Decision**
- **Detail:** FillFlow requests `gmail.readonly`, `gmail.modify`, and `gmail.send`. Google strictly requires applicants to request *only* the minimum necessary scopes.
- **Action Required:**
  1. **Evaluate removing `https://www.googleapis.com/auth/gmail.modify`:** The code only uses modify to remove the `UNREAD` label. Deduplication is already reliably handled in PostgreSQL (`ChatMessage` and `metadata.processedEmailIds`). Dropping `gmail.modify` removes a major restricted scope.
  2. For `gmail.readonly` and `gmail.send`, write detailed, step-by-step user-benefit justifications explaining why the core user-facing functionality cannot work without them.

### Blocker 3: Public Website Omits Gmail Integration (Trust & Safety Blocker)
- **Category:** **Code Change**
- **Detail:** The landing page (`Hero.tsx`, `Features.tsx`, `Footer.tsx`) only advertises WhatsApp and Web Chat for IT agencies. When Google reviewers load the homepage, they will find zero mention of Gmail or email automation and reject the submission for misleading/inconsistent scope usage.
- **Action Required:**
  - Update `Hero.tsx`, `HowItWorks.tsx`, and `Features.tsx` to prominently showcase Gmail inbox automation, email requirement collection, and how FillFlow interacts with Google Workspace.

### Blocker 4: Residual Token Storage & Missing Data Deletion Workflow (Privacy & Compliance Blocker)
- **Category:** **Code Change**
- **Detail:** Disconnecting Gmail leaves encrypted tokens, email addresses, and approval queues in the database metadata. Furthermore, there is no mechanism for a user or tenant to request complete account or customer data deletion.
- **Action Required:**
  1. Update `disconnectAutomation` and the disconnect route to wipe `encryptedAccessToken`, `encryptedRefreshToken`, and mailbox metadata from `AutomationConnection`.
  2. Revoke the `refreshToken` with Google (`https://oauth2.googleapis.com/revoke`) in addition to the access token.
  3. Implement a tenant data deletion endpoint (`DELETE /api/companies/[id]`) and provide a clear contact method / self-service button for account data deletion.

### Blocker 5: Google Cloud Console Setup & CASA Assessment Preparation (Operational Blocker)
- **Category:** **Google Cloud Console & External Owner Action**
- **Detail:** OAuth consent screen must be configured with verified production domain, official branding, privacy policy URL, and support email. Retaining restricted scopes (`gmail.send`, `gmail.readonly`) will trigger a mandatory third-party CASA Tier 2 security assessment.
- **Action Required:**
  1. Complete Google Cloud Console OAuth consent screen form.
  2. Verify domain ownership in Google Search Console.
  3. Produce a 2-3 minute demo video demonstrating the full OAuth flow showing the Google Client ID in the browser URL bar.
  4. Prepare for CASA security assessment or determine if internal testing mode / alternate providers suffice for initial rollout.

---

## 10. Summary & Sign-Off

This audit provides a factual, code-backed inventory of FillFlow's current state. The core engineering foundations (type safety, Next.js 15 build, AES-256-GCM token encryption, Pub/Sub webhook processing, multi-turn AI response generation, and commercial safety permission checks) are completely sound and pass all build checks with zero errors.

However, the application is currently **BLOCKED** from passing Google OAuth verification primarily due to:
1. Missing public Privacy Policy and Terms of Service pages.
2. Complete absence of Gmail integration messaging on the public homepage.
3. Over-requesting restricted scopes (`gmail.modify`).
4. Incomplete token purging on disconnect and missing data deletion capabilities.
5. Pending Google Cloud Console configuration and CASA readiness.

*Report compiled and saved to [docs/pre-google-verification-audit.md](file:///c:/Users/Hritik/Desktop/sevice/docs/pre-google-verification-audit.md).*
