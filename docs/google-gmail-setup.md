# Google Workspace / Gmail Event-Driven Integration Setup Guide

This guide walks you through connecting your company's Gmail or Google Workspace mailbox to FillFlow's event-driven AI Requirement Discovery and Email Automation SaaS platform.

Once connected, FillFlow automatically detects new customer inquiry emails via **Google Cloud Pub/Sub push notifications**, retrieves history changes, validates customer intent, scopes requirements using contextual AI, reserves and commits quota, and sends replies directly from your Gmail account—**without requiring manual "Sync Inbox" clicks**.

---

## Architecture & Event-Driven Flow

```
Customer sends email
        ↓
Gmail mailbox receives message
        ↓
Gmail users.watch() notification
        ↓
Google Cloud Pub/Sub Topic (projects/automation-508113/topics/gmail-inbound)
        ↓
Pub/Sub Push Subscription
        ↓
POST /api/webhooks/google/pubsub
        ↓
Gmail history.list(startHistoryId=previousHistoryId)
        ↓
Smart Customer / Inquiry Filter (Phase 2)
        ↓
Quota Atomic Reservation (reserveEmailQuota)
        ↓
Contextual Response Engine & Conversation Memory (Phase 3)
        ↓
Gmail Outbound Reply (users.messages.send)
        ↓
Commit Quota (1 credit consumed) & Update Latest historyId
```

---

## 1. Google Cloud Project Setup
1. In the [Google Cloud Console](https://console.cloud.google.com/), select your project (e.g. `automation-508113`).
2. Verify that the following APIs are **Enabled** under **APIs & Services** > **Library**:
   - **Gmail API**
   - **Cloud Pub/Sub API**

---

## 2. Configure OAuth Consent Screen & Scopes
1. Go to **APIs & Services** > **OAuth consent screen**.
2. Select User Type (**External** or **Internal**).
3. Under **Scopes**, ensure the granular scopes are configured:
   - `https://www.googleapis.com/auth/gmail.send`: Send AI-generated scoping replies on behalf of the company.
   - `https://www.googleapis.com/auth/gmail.readonly`: Retrieve incoming client inquiry messages and headers.
   - `https://www.googleapis.com/auth/gmail.modify`: Modify labels on processed messages (mark as read to avoid repeated sync loops).
   - `https://www.googleapis.com/auth/userinfo.email`: View user's primary email address to map multi-tenant connections.
4. Under **Credentials** > **OAuth client ID** (Web application):
   - **Authorized redirect URIs**:
     - Local development: `http://localhost:3000/api/integrations/google/callback`
     - Production: `https://your-domain.com/api/integrations/google/callback`

---

## 3. Google Cloud Pub/Sub Topic & Permissions

### Step 3.1: Create Pub/Sub Topic
1. Go to **Pub/Sub** > **Topics**.
2. If not already created, create topic:
   - Topic ID: `gmail-inbound`
   - Full topic path: `projects/automation-508113/topics/gmail-inbound`

### Step 3.2: Grant Gmail Publish Permissions
Gmail requires permission to publish push notifications to your topic:
1. In your `gmail-inbound` topic, click **Permissions** > **Add Principal**.
2. Enter Principal:
   ```text
   gmail-api-push@system.gserviceaccount.com
   ```
3. Assign Role:
   ```text
   Pub/Sub Publisher
   ```
4. Click **Save**.

---

## 4. Google Cloud Pub/Sub Push Subscription

Google Cloud Pub/Sub pushes incoming mailbox notifications to your HTTPS webhook.

1. Go to **Pub/Sub** > **Subscriptions** > **Create Subscription**.
2. Configure settings:
   - **Subscription ID**: `gmail-inbound-push`
   - **Topic**: `projects/automation-508113/topics/gmail-inbound`
   - **Delivery Type**: **Push**
   - **Endpoint URL**:
     - **Production**: `https://your-domain.com/api/webhooks/google/pubsub`
     - **Local Development / Tunnel**: `https://<YOUR-TUNNEL-SUBDOMAIN>.ngrok-free.app/api/webhooks/google/pubsub`
   - **Acknowledgment Deadline**: `30 seconds`
   - **Retry policy**: Retry immediately or exponential backoff.
3. Click **Create**.

---

## 5. Local Tunnel Setup for Development

Google Cloud Pub/Sub cannot deliver notifications to `http://localhost:3000`. You must expose your local development server via a secure public HTTPS tunnel.

### Option A: Using ngrok
```bash
# Install ngrok if not already installed
npm install -g ngrok
# or download from https://ngrok.com

# Start a tunnel pointing to port 3000
ngrok http 3000
```
ngrok will provide a public forwarding URL like:
```text
https://abc1-23-45-67-89.ngrok-free.app
```

### Option B: Using Cloudflare Tunnel (`cloudflared`)
```bash
cloudflared tunnel --url http://localhost:3000
```

### Configure Tunnel URL in `.env`:
Add the public HTTPS webhook URL to your `.env`:
```env
GOOGLE_PUBSUB_WEBHOOK_URL="https://abc1-23-45-67-89.ngrok-free.app/api/webhooks/google/pubsub"
```
The FillFlow Email Automation Dashboard will automatically display this URL as the push target!

---

## 6. Environment Variables Reference

In your root `.env` file, configure:

```env
# Google OAuth 2.0 Credentials
GOOGLE_CLIENT_ID="10697576552-htgiqhl4vm8a1hn010oibfk46qmsoc0d.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:3000/api/integrations/google/callback"

# Google Cloud Pub/Sub Configuration
GMAIL_PUBSUB_TOPIC="projects/automation-508113/topics/gmail-inbound"
GOOGLE_PUBSUB_WEBHOOK_URL="https://your-public-tunnel-or-domain.com/api/webhooks/google/pubsub"
GMAIL_PUBSUB_VERIFICATION_TOKEN="" # Optional: secret token to verify push requests

# Token Storage Encryption Key (AES-256-GCM)
ENCRYPTION_SECRET="your-32-byte-encryption-secret"

# Cron renewal secret (optional for scheduled endpoint)
CRON_SECRET="your-secure-cron-secret"
```

---

## 7. Gmail Watch Lifecycle & Automatic Renewal

### How Gmail Watch Works
- When a company connects Gmail via OAuth, FillFlow registers a watch with Gmail API (`users.watch()`).
- Gmail returns:
  - `historyId`: The baseline history ID at the moment of watch registration.
  - `expiration`: Timestamp when the watch expires (up to 7 days).
- FillFlow stores `historyId` and `watchExpiration` in `AutomationConnection.metadata`.

### Automatic Renewal (Zero Human Intervention)
1. **Proactive Renewal on Webhook**: Whenever a Pub/Sub webhook arrives for a company, FillFlow checks if `watchExpiration` is within 48 hours. If so, it silently refreshes the watch.
2. **Scheduled Cron Endpoint**: External schedulers (Vercel Cron, Google Cloud Scheduler, or cron tab) can call:
   ```bash
   POST /api/integrations/google/watch/renew
   Header: Authorization: Bearer <CRON_SECRET>
   ```
   This scans all connected companies and renews any watches nearing expiration.
3. **Clean Disconnection**: When a user clicks **Disconnect**, FillFlow invokes `users.stop()` to cancel the watch with Google before revoking tokens.

---

## 8. Manual Sync Inbox Fallback

The **Sync Inbox** button on the dashboard remains fully operational.
- It acts as an instant recovery and fallback tool if a notification was delayed or during initial account setup.
- Both manual sync and automatic push webhooks share the exact same idempotency and quota locking guarantees, so running both will never cause duplicate replies or double quota consumption.

---

## 9. Troubleshooting & FAQ

| Issue | Cause | Fix |
|---|---|---|
| **No notifications received** | Pub/Sub push subscription not pointing to HTTPS URL | Update Pub/Sub push endpoint in GCP console with your tunnel or domain URL (`/api/webhooks/google/pubsub`). |
| **Pub/Sub returns 403 Forbidden** | Gmail service account lacks Publish permission | Add `gmail-api-push@system.gserviceaccount.com` as **Pub/Sub Publisher** on your topic. |
| **HistoryId expired (404)** | Mailbox inactive for extended period (>7-30 days) | FillFlow automatically catches 404, runs safe unread inbox recovery, and updates baseline historyId. |
| **Webhook returns 401 Unauthorized** | Verification token mismatch | Ensure `GMAIL_PUBSUB_VERIFICATION_TOKEN` in `.env` matches `?token=` parameter or Bearer header in Pub/Sub subscription URL. |
| **Promotional email received reply** | Message mistakenly classified as inquiry | Phase 2 deterministic & AI classifier filters out promotions (`category:promotions`, newsletters, autoresponders). Check audit logs. |
