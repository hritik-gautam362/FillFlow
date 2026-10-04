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
  Globe,
  Lock,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  ArrowLeft,
  AlertCircle,
  Unplug,
  ShieldCheck,
} from 'lucide-react';

export default function WebAutomationPage() {
  const [loading, setLoading] = React.useState(true);
  const [isAccessActive, setIsAccessActive] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState<string>('not_connected');
  const [companyId, setCompanyId] = React.useState<string | null>(null);
  const [allowedDomain, setAllowedDomain] = React.useState('');
  const [assistantName, setAssistantName] = React.useState('AI Discovery Assistant');
  const [welcomeMessage, setWelcomeMessage] = React.useState('');
  const [hostUrl, setHostUrl] = React.useState('');
  const [connecting, setConnecting] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      setHostUrl(window.location.origin);
    }
  }, []);

  const loadStatus = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Get current user's company
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) {
        throw new Error('Please sign in to view automation settings.');
      }
      const meJson = await meRes.json();
      const currentCompanyId = meJson.data?.company?.id;
      setCompanyId(currentCompanyId);

      // 2. Fetch Web automation access
      const accessRes = await fetch(`/api/companies/${currentCompanyId}/automations/web`);
      if (accessRes.ok) {
        const accessJson = await accessRes.json();
        setIsAccessActive(Boolean(accessJson.data?.enabled));
      }

      // 3. Fetch Web automation connection
      const connRes = await fetch(`/api/companies/${currentCompanyId}/automations/web/connection`);
      if (connRes.ok) {
        const connJson = await connRes.json();
        if (connJson.data) {
          setConnectionStatus(connJson.data.status || 'not_connected');
          if (connJson.data.metadata?.allowedDomain) {
            setAllowedDomain(connJson.data.metadata.allowedDomain);
          }
          if (connJson.data.metadata?.assistantName) {
            setAssistantName(connJson.data.metadata.assistantName);
          }
          if (connJson.data.metadata?.welcomeMessage) {
            setWelcomeMessage(connJson.data.metadata.welcomeMessage);
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

  const handleConnectWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    setConnecting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/automations/web/connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'connected',
          provider: 'web_widget',
          displayName: allowedDomain,
          metadata: {
            allowedDomain,
            assistantName: assistantName.trim() || 'AI Discovery Assistant',
            welcomeMessage: welcomeMessage.trim() || undefined,
            configuredAt: new Date().toISOString(),
          },
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to save website configuration.');
      }

      setConnectionStatus('connected');
      setSuccessMsg('Website domain and widget configuration saved successfully.');
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!companyId) return;
    try {
      setConnecting(true);
      const res = await fetch(`/api/companies/${companyId}/automations/web/connection`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setConnectionStatus('not_connected');
        setSuccessMsg('Website disconnected successfully.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setConnecting(false);
    }
  };

  const widgetSnippet = `<!-- FillFlow Widget -->
<script
  src="${hostUrl || 'https://YOUR_DOMAIN'}/widget.js"
  data-company-id="${companyId || 'YOUR_COMPANY_ID'}"
  defer>
</script>`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(widgetSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Link href="/dashboard" className="hover:text-white flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
          <span>/</span>
          <span className="text-slate-200">Web Automation</span>
        </div>

        {/* Page Title & Status Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
              <Globe className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Web Automation Setup
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Configure authorized domains and installation settings for conversational AI discovery.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAccessActive ? (
              <Badge variant="success" className="text-xs flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Access Active
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs flex items-center gap-1 text-slate-400 border-slate-700 bg-slate-900">
                <Lock className="h-3.5 w-3.5 text-amber-400" /> Access Locked
              </Badge>
            )}

            {isAccessActive && (
              <span className={`text-xs px-2.5 py-1 rounded-md border font-medium ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                  : connectionStatus === 'pending'
                  ? 'bg-sky-950/40 text-sky-400 border-sky-500/30'
                  : connectionStatus === 'disconnected'
                  ? 'bg-slate-900 text-slate-400 border-slate-700'
                  : connectionStatus === 'error'
                  ? 'bg-rose-950/40 text-rose-400 border-rose-500/30'
                  : 'bg-amber-950/40 text-amber-400 border-amber-500/30'
              }`}>
                {connectionStatus === 'connected'
                  ? 'Connected'
                  : connectionStatus === 'pending'
                  ? 'Pending Setup'
                  : connectionStatus === 'disconnected'
                  ? 'Disconnected'
                  : connectionStatus === 'error'
                  ? 'Connection Error'
                  : 'Not Connected'}
              </span>
            )}
          </div>
        </div>

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

        {/* State 1: Locked Access */}
        {!isAccessActive && !loading && (
          <Card className="p-8 border-slate-800 bg-slate-900/60 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <Lock className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-white">Web Automation is Locked</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                Your workspace does not have Web Automation enabled. Please contact your platform administrator to activate Web channel access.
              </p>
            </div>
            <Link href="mailto:support@apexbyte.io?subject=Activate%20Web%20Automation">
              <Button variant="outline" size="sm" className="border-slate-700">
                Contact Platform Admin <ExternalLink className="h-3.5 w-3.5 ml-1.5 text-indigo-400" />
              </Button>
            </Link>
          </Card>
        )}

        {/* State 2 & 3: Active Access (Not Connected OR Connected) */}
        {isAccessActive && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Step 1: Website Configuration */}
            <Card className="p-6 border-slate-800 bg-slate-900/70 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600/30 border border-indigo-500/40 text-indigo-400 text-xs font-bold flex items-center justify-center">
                  1
                </span>
                <h2 className="text-base font-semibold text-white">Website Domain Setup</h2>
              </div>
              <p className="text-xs text-slate-400">
                Configure your agency domain where the AI discovery chat will be hosted and authorized.
              </p>

              <form onSubmit={handleConnectWebsite} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Website URL / Domain
                  </label>
                  <Input
                    type="url"
                    required
                    placeholder="https://agency.com"
                    value={allowedDomain}
                    onChange={(e) => setAllowedDomain(e.target.value)}
                    className="bg-slate-950/70 border-slate-800 text-white text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Assistant Name (Optional)
                  </label>
                  <Input
                    type="text"
                    placeholder="AI Discovery Assistant"
                    value={assistantName}
                    onChange={(e) => setAssistantName(e.target.value)}
                    className="bg-slate-950/70 border-slate-800 text-white text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Welcome Message (Optional)
                  </label>
                  <Input
                    type="text"
                    placeholder="Hi! I'm your AI Project Assistant. How can I help you today?"
                    value={welcomeMessage}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                    className="bg-slate-950/70 border-slate-800 text-white text-xs"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button
                    type="submit"
                    variant="glow"
                    size="sm"
                    disabled={connecting}
                    className="text-xs"
                  >
                    {connecting ? 'Saving...' : connectionStatus === 'connected' ? 'Update Domain' : 'Connect Website'}
                  </Button>

                  {connectionStatus === 'connected' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleDisconnect}
                      disabled={connecting}
                      className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30"
                    >
                      <Unplug className="h-3.5 w-3.5 mr-1" /> Disconnect
                    </Button>
                  )}
                </div>
              </form>
            </Card>

            {/* Step 2: Widget Installation Code Snippet */}
            <Card className="p-6 border-slate-800 bg-slate-900/70 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-600/30 border border-indigo-500/40 text-indigo-400 text-xs font-bold flex items-center justify-center">
                    2
                  </span>
                  <h2 className="text-base font-semibold text-white">Embed Script Configuration</h2>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyCode}
                  className="text-xs h-7 px-2 border-slate-700 bg-slate-800/80 text-slate-300"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400 mr-1" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 text-slate-400 mr-1" /> Copy Code
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-slate-400">
                This installation snippet is configured for your workspace. When deploying your client-facing chat widget, include this tag before the closing <code className="text-indigo-300">&lt;/body&gt;</code> tag.
              </p>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-indigo-300 overflow-x-auto leading-relaxed">
                <pre>{widgetSnippet}</pre>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" /> Company scoped by ID
                </span>
                <Link href="/chat">
                  <Button variant="ghost" size="sm" className="text-xs text-indigo-400 hover:text-indigo-300">
                    Test in Web Chat <ArrowLeft className="h-3 w-3 rotate-180 ml-1" />
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
