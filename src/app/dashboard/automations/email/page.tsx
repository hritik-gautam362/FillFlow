'use client';

import * as React from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Mail,
  Lock,
  CheckCircle2,
  ExternalLink,
  ArrowLeft,
  AlertCircle,
  Unplug,
  Copy,
  Check,
  Inbox,
  ShieldCheck,
  Server,
  Radio,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

interface EmailQuotaData {
  monthlyLimit: number;
  usedCredits: number;
  reservedCredits: number;
  remainingCredits: number;
  usagePercentage: number;
  automationStatus: 'ACTIVE' | 'QUOTA_LOCKED' | 'ADMIN_DISABLED' | 'DISCONNECTED';
  adminDisabled: boolean;
  quotaLocked: boolean;
  nextResetAt: string;
}

export default function EmailAutomationPage() {
  const [activeTab, setActiveTab] = React.useState<'google' | 'mailgun'>('google');
  const [loading, setLoading] = React.useState(true);
  const [isAccessActive, setIsAccessActive] = React.useState(false);
  const [emailQuota, setEmailQuota] = React.useState<EmailQuotaData | null>(null);
  const [connectionStatus, setConnectionStatus] = React.useState<string>('not_connected');
  const [companyId, setCompanyId] = React.useState<string | null>(null);
  const [connectedProvider, setConnectedProvider] = React.useState<'google' | 'mailgun' | null>(null);
  const [googleEmail, setGoogleEmail] = React.useState('');
  const [mailgunSenderEmail, setMailgunSenderEmail] = React.useState('');
  const [connectedDate, setConnectedDate] = React.useState<string | null>(null);
  const [mailgunDomain, setMailgunDomain] = React.useState('mg.apexbyte.io');
  const [connecting, setConnecting] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [copiedInbound, setCopiedInbound] = React.useState(false);
  const [copiedWebhook, setCopiedWebhook] = React.useState(false);
  const [copiedEvents, setCopiedEvents] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);
  const [configuredPubSubWebhookUrl, setConfiguredPubSubWebhookUrl] = React.useState<string | null>(null);
  const [configuredPubSubTopic, setConfiguredPubSubTopic] = React.useState<string | null>(null);
  const [watchStatus, setWatchStatus] = React.useState<string | null>(null);
  const [watchExpiration, setWatchExpiration] = React.useState<string | null>(null);

  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';
  const inboundWebhookUrl = `${originUrl}/api/webhooks/mailgun/inbound`;
  const eventsWebhookUrl = `${originUrl}/api/webhooks/mailgun/events`;
  const googlePubSubWebhookUrl =
    configuredPubSubWebhookUrl ||
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_GOOGLE_PUBSUB_WEBHOOK_URL) ||
    `${originUrl}/api/webhooks/google/pubsub`;

  const dedicatedRoutingAddress = `scope-${companyId?.slice(0, 8) || 'workspace'}@${mailgunDomain}`;

  const loadStatus = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Check URL parameters for OAuth return state
      let fromGoogleOAuth = false;
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.get('google_connected') === 'true') {
          fromGoogleOAuth = true;
          setActiveTab('google');
          setSuccessMsg('Google Gmail connection established successfully via OAuth 2.0.');
          window.history.replaceState({}, document.title, window.location.pathname);
        } else if (params.get('google_error')) {
          setError(`Google OAuth Error: ${decodeURIComponent(params.get('google_error') || '')}`);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }

      const meRes = await fetch('/api/auth/me', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!meRes.ok) throw new Error('Please sign in to view automation settings.');
      const meJson = await meRes.json();
      const currentCompanyId = meJson.data?.company?.id;
      if (!currentCompanyId) throw new Error('Unable to resolve active company workspace.');
      setCompanyId(currentCompanyId);

      // 1. Fetch access status
      const accessRes = await fetch(`/api/companies/${currentCompanyId}/automations/email?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (accessRes.ok) {
        const accessJson = await accessRes.json();
        setIsAccessActive(Boolean(accessJson.data?.enabled));
        if (accessJson.data?.quota) {
          setEmailQuota(accessJson.data.quota);
        }
      }

      // 2. Fetch connection status with cache-busting timestamp
      const connRes = await fetch(`/api/companies/${currentCompanyId}/automations/email/connection?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (connRes.ok) {
        const connJson = await connRes.json();
        if (connJson.data) {
          const status = connJson.data.status || 'not_connected';
          setConnectionStatus(status);

          const rawProvider = connJson.data.provider
            ? String(connJson.data.provider).toLowerCase()
            : null;

          const isConnected = status === 'connected';
          const validActiveProvider =
            isConnected && (rawProvider === 'google' || rawProvider === 'mailgun')
              ? (rawProvider as 'google' | 'mailgun')
              : null;

          setConnectedProvider(validActiveProvider);

          if (connJson.data.connectedAt) {
            setConnectedDate(new Date(connJson.data.connectedAt).toLocaleDateString());
          } else {
            setConnectedDate(null);
          }

          if (connJson.data.domain) {
            setMailgunDomain(connJson.data.domain);
          }

          if (connJson.data.googlePubSubWebhookUrl) {
            setConfiguredPubSubWebhookUrl(connJson.data.googlePubSubWebhookUrl);
          }
          if (connJson.data.googlePubSubTopic) {
            setConfiguredPubSubTopic(connJson.data.googlePubSubTopic);
          }
          if (connJson.data.metadata?.watchStatus) {
            setWatchStatus(connJson.data.metadata.watchStatus);
          }
          if (connJson.data.metadata?.watchExpiration) {
            setWatchExpiration(connJson.data.metadata.watchExpiration);
          }

          const resolvedIdentity =
            connJson.data.displayName ||
            (connJson.data.metadata?.googleEmail as string) ||
            '';

          if (validActiveProvider === 'google') {
            setGoogleEmail(resolvedIdentity);
            if (fromGoogleOAuth) {
              setActiveTab('google');
            }
          } else if (validActiveProvider === 'mailgun') {
            setMailgunSenderEmail(resolvedIdentity);
            if (!fromGoogleOAuth) {
              setActiveTab('mailgun');
            }
          } else {
            // Neither connected
            if (rawProvider === 'google' || connJson.data.metadata?.googleEmail) {
              setGoogleEmail(resolvedIdentity);
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleConnectGoogle = () => {
    if (!companyId) return;
    setConnecting(true);
    window.location.href = `/api/integrations/google/start?companyId=${encodeURIComponent(companyId)}`;
  };

  const handleDisconnectGoogle = async () => {
    if (!companyId) return;
    try {
      setConnecting(true);
      setError(null);
      const res = await fetch('/api/integrations/google/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });

      if (res.ok) {
        setConnectionStatus('disconnected');
        setConnectedProvider(null);
        setSuccessMsg('Google Gmail connection revoked and disconnected safely.');
        await loadStatus();
      } else {
        const json = await res.json();
        throw new Error(json.error || 'Failed to disconnect Google mailbox.');
      }
    } catch (err) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleSyncGoogle = async () => {
    if (!companyId) return;
    try {
      setSyncing(true);
      setError(null);
      setSuccessMsg(null);
      const res = await fetch('/api/integrations/google/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to sync unread messages.');
      }

      const s = json.data?.summary;
      if (s) {
        setSuccessMsg(
          `Inbox checked: ${s.checked} checked, ${s.replied} replied, ${s.skipped} skipped, ${s.failed} failed.`
        );
      } else {
        setSuccessMsg(`Inbox checked. ${json.data?.syncedCount ?? 0} unread messages processed.`);
      }
    } catch (err) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleConnectMailgun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    setConnecting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/automations/email/connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'connected',
          provider: 'mailgun',
          displayName: mailgunSenderEmail,
          metadata: {
            inboundEmail: mailgunSenderEmail,
            forwardingAddress: dedicatedRoutingAddress,
            domain: mailgunDomain,
            configuredAt: new Date().toISOString(),
          },
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to save email configuration.');
      }

      setConnectionStatus('connected');
      setConnectedProvider('mailgun');
      setSuccessMsg('Mailgun email automation connection established successfully.');
      await loadStatus();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectMailgun = async () => {
    if (!companyId) return;
    try {
      setConnecting(true);
      const res = await fetch(`/api/companies/${companyId}/automations/email/connection`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setConnectionStatus('not_connected');
        setConnectedProvider(null);
        setSuccessMsg('Mailgun automation disconnected.');
        await loadStatus();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setConnecting(false);
    }
  };

  const isGoogleConnected = connectionStatus === 'connected' && connectedProvider === 'google';
  const isMailgunConnected = connectionStatus === 'connected' && connectedProvider === 'mailgun';
  const activeProviderName = isGoogleConnected
    ? 'Google'
    : isMailgunConnected
    ? 'Mailgun'
    : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Link href="/dashboard" className="hover:text-white flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
          <span>/</span>
          <span className="text-slate-200">Email Automation</span>
        </div>

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
              <Mail className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Email Automation Setup
                </h1>
                <Badge
                  variant="outline"
                  className={`text-[11px] font-mono ${
                    activeProviderName
                      ? 'border-indigo-500/30 text-indigo-300 bg-indigo-950/40'
                      : 'border-slate-700 text-slate-400 bg-slate-900'
                  }`}
                >
                  Provider: {activeProviderName || 'Not Connected'}
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-slate-400">
                Connect your Google Workspace / Gmail mailbox or Mailgun inbound routing for automated AI scoping.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Access Status Badge */}
            {isAccessActive ? (
              <Badge variant="success" className="text-xs flex items-center gap-1 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" /> Access Active
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs flex items-center gap-1 text-slate-400 border-slate-700 bg-slate-900">
                <Lock className="h-3.5 w-3.5 text-amber-400" /> Access Locked
              </Badge>
            )}

            {/* Connection Status Badge */}
            {isAccessActive && (
              <span
                className={`text-xs px-2.5 py-1 rounded-md border font-medium ${
                  connectionStatus === 'connected'
                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                    : connectionStatus === 'pending'
                    ? 'bg-sky-950/40 text-sky-400 border-sky-500/30'
                    : connectionStatus === 'disconnected'
                    ? 'bg-slate-900 text-slate-400 border-slate-700'
                    : connectionStatus === 'error'
                    ? 'bg-rose-950/40 text-rose-400 border-rose-500/30'
                    : 'bg-amber-950/40 text-amber-400 border-amber-500/30'
                }`}
              >
                {connectionStatus === 'connected'
                  ? 'Connected'
                  : connectionStatus === 'pending'
                  ? 'Connecting'
                  : connectionStatus === 'disconnected'
                  ? 'Disconnected'
                  : connectionStatus === 'error'
                  ? 'Connection Error'
                  : 'Not Connected'}
              </span>
            )}
          </div>
        </div>

        {/* Diagnostic / Error Banners */}
        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Loading Spinner Skeleton when initial fetch is running */}
        {loading && !companyId && (
          <div className="p-12 text-center text-slate-400 text-sm flex flex-col items-center gap-3">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-400" />
            <span>Loading email automation settings...</span>
          </div>
        )}

        {/* AI Testing Playground Quick Access Card */}
        {!loading && (
          <div className="p-4 rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-slate-900/60 to-purple-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white">AI Testing Playground</h3>
                  <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-500/40 bg-amber-950/50 uppercase tracking-wider font-semibold">
                    Simulation Only
                  </Badge>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Test how FillFlow responds to customer inquiries before enabling live automated communication.
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/automations/email/playground"
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all shrink-0"
            >
              Open AI Playground
            </Link>
          </div>
        )}

        {/* Quota Locked Notice Banner */}
        {emailQuota && emailQuota.automationStatus === 'QUOTA_LOCKED' && !loading && (
          <Card className="p-6 border-amber-500/40 bg-amber-500/10 space-y-4">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400">
                <Lock className="h-6 w-6" />
              </div>
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">Email automation locked</h3>
                  <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-500/40 bg-amber-950/50">
                    Monthly AI email limit reached
                  </Badge>
                </div>
                <p className="text-xs text-amber-200/80">
                  Your monthly AI email allowance has been completely consumed ({emailQuota.usedCredits} / {emailQuota.monthlyLimit} emails used). Incoming emails are still securely synced and recorded, but automatic Gemini replies are locked until the next quota period or limit increase.
                </p>
                <div className="pt-2 flex flex-wrap items-center gap-5 text-xs text-slate-300 border-t border-amber-500/20">
                  <div>
                    Usage: <span className="font-semibold text-white">{emailQuota.usedCredits} / {emailQuota.monthlyLimit} emails used</span>
                  </div>
                  <div>
                    Resets on: <span className="font-semibold text-white">{new Date(emailQuota.nextResetAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Quota Overview Strip when not quota-locked */}
        {emailQuota && emailQuota.automationStatus !== 'QUOTA_LOCKED' && !loading && (
          <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Monthly AI Allowance:</span>
              <span className="font-semibold text-white">{emailQuota.usedCredits} / {emailQuota.monthlyLimit} emails used</span>
              <span className="text-slate-500">({emailQuota.remainingCredits} credits remaining)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-28 bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    emailQuota.usagePercentage >= 80 ? 'bg-amber-500' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${emailQuota.usagePercentage}%` }}
                />
              </div>
              <span className="text-slate-400 text-[11px]">
                Resets {new Date(emailQuota.nextResetAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </div>
          </div>
        )}

        {/* State 1: Locked Access */}
        {!isAccessActive && !loading && (
          <Card className="p-8 border-slate-800 bg-slate-900/60 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <Lock className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-white">Email Automation is Disabled</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                Email Automation has been disabled for your workspace by a platform administrator.
              </p>
            </div>
            <Link href="mailto:support@apexbyte.io?subject=Activate%20Email%20Automation">
              <Button variant="outline" size="sm" className="border-slate-700">
                Request Activation from Admin <ExternalLink className="h-3.5 w-3.5 ml-1.5 text-indigo-400" />
              </Button>
            </Link>
          </Card>
        )}

        {/* State 2: Active Access */}
        {isAccessActive && (
          <div className="space-y-6">
            {/* Provider Selector Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <button
                type="button"
                onClick={() => setActiveTab('google')}
                className={`text-xs px-3.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === 'google'
                    ? 'bg-indigo-600/20 border border-indigo-500/40 text-indigo-300'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Google Workspace / Gmail {isGoogleConnected && '✓'}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('mailgun')}
                className={`text-xs px-3.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === 'mailgun'
                    ? 'bg-purple-600/20 border border-purple-500/40 text-purple-300'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Server className="h-3.5 w-3.5 text-purple-400" />
                Mailgun Inbound Routing {isMailgunConnected && '✓'}
              </button>
            </div>

            {/* TAB 1: GOOGLE INTEGRATION */}
            {activeTab === 'google' && (
              <div className="space-y-6">
                {/* Google Connected Status Card */}
                {isGoogleConnected ? (
                  <Card className="p-6 border-slate-800 bg-slate-900/70 space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                          <CheckCircle2 className="h-5 w-5" />
                        </div>
                        <div>
                          <h2 className="text-base font-semibold text-white flex items-center gap-2">
                            Connected to Google Gmail
                            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px]">
                              Active
                            </Badge>
                          </h2>
                          <p className="text-xs text-slate-400">
                            AI actively scopes client requirements from incoming emails and replies from your Gmail mailbox.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSyncGoogle}
                          disabled={syncing}
                          className="text-xs border-slate-700 bg-slate-800/80 text-slate-200"
                        >
                          <RefreshCw className={`h-3 w-3 mr-1 ${syncing ? 'animate-spin' : ''}`} />
                          {syncing ? 'Syncing...' : 'Sync Inbox'}
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleDisconnectGoogle}
                          disabled={connecting}
                          className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30"
                        >
                          <Unplug className="h-3.5 w-3.5 mr-1" /> Disconnect
                        </Button>
                      </div>
                    </div>

                    {/* Metadata Overview Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                        <span className="text-[11px] text-slate-400 block mb-1">Provider</span>
                        <div className="text-xs font-semibold text-white">Google Workspace</div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                        <span className="text-[11px] text-slate-400 block mb-1">Connected Email Address</span>
                        <div className="text-xs font-semibold text-indigo-300 font-mono truncate">
                          {googleEmail || 'connected@gmail.com'}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                        <span className="text-[11px] text-slate-400 block mb-1">Connection Status</span>
                        <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                          <Radio className="h-3 w-3 animate-pulse text-emerald-400" /> Connected
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                        <span className="text-[11px] text-slate-400 block mb-1">Connected Date</span>
                        <div className="text-xs font-semibold text-slate-300">
                          {connectedDate || 'Today'}
                        </div>
                      </div>
                    </div>

                    {/* Pub/Sub Webhook Info Box */}
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                          <ShieldCheck className="h-4 w-4 text-indigo-400" /> Real-time Cloud Pub/Sub Push Webhook
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-mono ${
                              watchStatus === 'active'
                                ? 'border-emerald-500/30 text-emerald-400 bg-emerald-950/40'
                                : 'border-amber-500/30 text-amber-400 bg-amber-950/40'
                            }`}
                          >
                            Watch: {watchStatus === 'active' ? 'Active (Event-driven)' : watchStatus || 'Ready'}
                          </Badge>
                          {watchExpiration && (
                            <span className="text-[10px] text-slate-400">
                              Expires: {new Date(Number(watchExpiration)).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[11px] text-slate-400 block">
                          Pub/Sub Topic:
                        </span>
                        <div className="p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-indigo-300 select-all overflow-x-auto">
                          {configuredPubSubTopic || 'projects/automation-508113/topics/gmail-inbound'}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-400 block">
                            Push Endpoint Destination URL:
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(googlePubSubWebhookUrl);
                              setCopiedWebhook(true);
                              setTimeout(() => setCopiedWebhook(false), 2000);
                            }}
                            className="text-[10px] h-6 px-2 text-slate-400 hover:text-white"
                          >
                            {copiedWebhook ? (
                              <>
                                <Check className="h-3 w-3 mr-1 text-emerald-400" /> Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3 mr-1" /> Copy URL
                              </>
                            )}
                          </Button>
                        </div>
                        <div className="p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-indigo-300 select-all overflow-x-auto">
                          {googlePubSubWebhookUrl}
                        </div>
                      </div>

                      {googlePubSubWebhookUrl.includes('localhost') && (
                        <div className="p-2.5 rounded bg-amber-950/30 border border-amber-500/30 text-amber-300 text-[11px] flex items-start gap-2">
                          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span>
                            <strong>Local Development Notice:</strong> Google Cloud Pub/Sub requires a public HTTPS push endpoint. Set <code>GOOGLE_PUBSUB_WEBHOOK_URL</code> in your <code>.env</code> with your public tunnel URL (e.g. via ngrok or Cloudflare tunnel).
                          </span>
                        </div>
                      )}
                    </div>
                  </Card>
                ) : (
                  /* Google Not Connected State */
                  <Card className="p-8 border-slate-800 bg-slate-900/60 text-center space-y-6">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
                      <svg className="h-8 w-8" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                    </div>

                    <div className="space-y-2 max-w-md mx-auto">
                      <h3 className="text-lg font-bold text-white">Connect Google Workspace / Gmail</h3>
                      <p className="text-xs sm:text-sm text-slate-400">
                        Link your company mailbox with secure Google OAuth 2.0. The AI will automatically read client requirement inquiries, extract project specs, and send replies directly from your mailbox.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                      <Button
                        type="button"
                        variant="glow"
                        size="default"
                        onClick={handleConnectGoogle}
                        disabled={connecting}
                        className="text-xs sm:text-sm px-6 font-semibold flex items-center gap-2"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24">
                          <path
                            fill="currentColor"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                        </svg>
                        {connecting ? 'Redirecting to Google...' : 'Connect Google'}
                      </Button>
                    </div>

                    <div className="text-[11px] text-slate-500 max-w-sm mx-auto">
                      Uses minimum required OAuth permissions (gmail.send, gmail.readonly, gmail.modify). Tokens are strictly encrypted using AES-256-GCM.
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* TAB 2: MAILGUN INTEGRATION */}
            {activeTab === 'mailgun' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <Card className="p-3.5 border-slate-800 bg-slate-900/80">
                    <span className="text-[11px] text-slate-400 block mb-1">Provider</span>
                    <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <Server className="h-3.5 w-3.5 text-purple-400" /> Mailgun
                    </div>
                  </Card>

                  <Card className="p-3.5 border-slate-800 bg-slate-900/80">
                    <span className="text-[11px] text-slate-400 block mb-1">Configured Domain</span>
                    <div className="text-sm font-semibold text-purple-300 font-mono truncate">
                      {mailgunDomain}
                    </div>
                  </Card>

                  <Card className="p-3.5 border-slate-800 bg-slate-900/80">
                    <span className="text-[11px] text-slate-400 block mb-1">Sender Address</span>
                    <div className="text-sm font-semibold text-white truncate">
                      {mailgunSenderEmail || 'Not configured'}
                    </div>
                  </Card>

                  <Card className="p-3.5 border-slate-800 bg-slate-900/80">
                    <span className="text-[11px] text-slate-400 block mb-1">Automation Status</span>
                    <div
                      className={`text-sm font-semibold flex items-center gap-1 ${
                        isMailgunConnected ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      <Radio className={`h-3.5 w-3.5 ${isMailgunConnected ? 'animate-pulse' : ''}`} />
                      {isMailgunConnected ? 'Active & Ready' : 'Not Connected'}
                    </div>
                  </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Box 1: Sender & Channel Identity */}
                  <Card className="p-6 border-slate-800 bg-slate-900/70 space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-purple-600/30 border border-purple-500/40 text-purple-400 text-xs font-bold flex items-center justify-center">
                        1
                      </span>
                      <h2 className="text-base font-semibold text-white">Agency Sender Identity</h2>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Enter your company sender or sales inquiry email. When AI responds to prospective clients, messages will originate from this address.
                    </p>

                    <form onSubmit={handleConnectMailgun} className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Agency Sales / Support Email
                        </label>
                        <div className="relative">
                          <Inbox className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                          <Input
                            type="email"
                            required
                            placeholder="sales@agency.com"
                            value={mailgunSenderEmail}
                            onChange={(e) => setMailgunSenderEmail(e.target.value)}
                            className="pl-9 bg-slate-950/70 border-slate-800 text-white text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <Button
                          type="submit"
                          variant="glow"
                          size="sm"
                          disabled={connecting}
                          className="text-xs"
                        >
                          {connecting
                            ? 'Saving...'
                            : isMailgunConnected
                            ? 'Update Sender'
                            : 'Connect Mailgun'}
                        </Button>

                        {isMailgunConnected && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleDisconnectMailgun}
                            disabled={connecting}
                            className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30"
                          >
                            <Unplug className="h-3.5 w-3.5 mr-1" /> Disconnect
                          </Button>
                        )}
                      </div>
                    </form>
                  </Card>

                  {/* Box 2: Dedicated AI Inbound Address */}
                  <Card className="p-6 border-slate-800 bg-slate-900/70 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-purple-600/30 border border-purple-500/40 text-purple-400 text-xs font-bold flex items-center justify-center">
                          2
                        </span>
                        <h2 className="text-base font-semibold text-white">Dedicated AI Inbound Box</h2>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(dedicatedRoutingAddress);
                          setCopiedInbound(true);
                          setTimeout(() => setCopiedInbound(false), 2000);
                        }}
                        className="text-xs h-7 px-2 border-slate-700 bg-slate-800/80 text-slate-300"
                      >
                        {copiedInbound ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400 mr-1" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3 text-slate-400 mr-1" /> Copy Box
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Route incoming client requests or forward RFP emails to your workspace&apos;s unique Mailgun receiving address:
                    </p>

                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-purple-300 overflow-x-auto select-all">
                      {dedicatedRoutingAddress}
                    </div>

                    <div className="pt-2 text-[11px] text-slate-400 space-y-1">
                      <div className="flex items-center gap-1 text-slate-300">
                        <ShieldCheck className="h-3.5 w-3.5 text-purple-400" /> Tenant-Safe Isolation Active
                      </div>
                      <p className="text-slate-500">
                        Emails delivered to this inbox automatically map to your company workspace, trigger requirement scoping, and update your leads pipeline.
                      </p>
                    </div>
                  </Card>
                </div>

                {/* Webhook Configuration Details for Mailgun */}
                <Card className="p-6 border-slate-800 bg-slate-900/60 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-purple-600/30 border border-purple-500/40 text-purple-400 text-xs font-bold flex items-center justify-center">
                      3
                    </span>
                    <h2 className="text-base font-semibold text-white">Mailgun Webhook Targets</h2>
                  </div>
                  <p className="text-xs text-slate-400">
                    In your Mailgun Dashboard, configure receiving routes and webhook notifications with these URLs:
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    {/* Inbound Webhook */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">Inbound Email Webhook (Receiving)</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(inboundWebhookUrl);
                            setCopiedWebhook(true);
                            setTimeout(() => setCopiedWebhook(false), 2000);
                          }}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                        >
                          {copiedWebhook ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                          {copiedWebhook ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 select-all overflow-x-auto">
                        {inboundWebhookUrl}
                      </div>
                    </div>

                    {/* Delivery Events Webhook */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">Delivery Events Webhook (Tracking)</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(eventsWebhookUrl);
                            setCopiedEvents(true);
                            setTimeout(() => setCopiedEvents(false), 2000);
                          }}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                        >
                          {copiedEvents ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                          {copiedEvents ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 select-all overflow-x-auto">
                        {eventsWebhookUrl}
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
