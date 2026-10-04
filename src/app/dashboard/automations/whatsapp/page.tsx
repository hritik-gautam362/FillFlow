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
  MessageSquare,
  Lock,
  CheckCircle2,
  ExternalLink,
  ArrowLeft,
  AlertCircle,
  Unplug,
  Copy,
  Check,
  Smartphone,
  ShieldCheck,
} from 'lucide-react';

export default function WhatsAppAutomationPage() {
  const [loading, setLoading] = React.useState(true);
  const [isAccessActive, setIsAccessActive] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState<string>('not_connected');
  const [companyId, setCompanyId] = React.useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = React.useState('');
  const [wabaId, setWabaId] = React.useState('');
  const [connecting, setConnecting] = React.useState(false);
  const [copiedWebhook, setCopiedWebhook] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/whatsapp`
    : 'https://your-domain.com/api/webhooks/whatsapp';

  const loadStatus = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) throw new Error('Please sign in to view automation settings.');
      const meJson = await meRes.json();
      const currentCompanyId = meJson.data?.company?.id;
      setCompanyId(currentCompanyId);

      const accessRes = await fetch(`/api/companies/${currentCompanyId}/automations/whatsapp`);
      if (accessRes.ok) {
        const accessJson = await accessRes.json();
        setIsAccessActive(Boolean(accessJson.data?.enabled));
      }

      const connRes = await fetch(`/api/companies/${currentCompanyId}/automations/whatsapp/connection`);
      if (connRes.ok) {
        const connJson = await connRes.json();
        if (connJson.data) {
          setConnectionStatus(connJson.data.status || 'not_connected');
          if (connJson.data.displayName) {
            setPhoneNumber(connJson.data.displayName);
          }
          if (connJson.data.externalId) {
            setWabaId(connJson.data.externalId);
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

  const handleConnectWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    setConnecting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/automations/whatsapp/connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'connected',
          provider: 'meta_cloud_api',
          externalId: wabaId || `waba-${Date.now()}`,
          displayName: phoneNumber,
          metadata: { phoneNumber, configuredAt: new Date().toISOString() },
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to save WhatsApp configuration.');
      }

      setConnectionStatus('connected');
      setSuccessMsg('WhatsApp Business configuration saved successfully.');
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
      const res = await fetch(`/api/companies/${companyId}/automations/whatsapp/connection`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setConnectionStatus('not_connected');
        setSuccessMsg('WhatsApp disconnected successfully.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Link href="/dashboard" className="hover:text-white flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
          <span>/</span>
          <span className="text-slate-200">WhatsApp Automation</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                WhatsApp Automation Setup
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Connect your Meta WhatsApp Cloud API for automated 24/7 lead scoping.
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
              <h3 className="text-lg font-semibold text-white">WhatsApp Automation is Locked</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                WhatsApp Automation has not been activated for your company yet. A platform administrator must grant access before you can connect your Meta phone number.
              </p>
            </div>
            <Link href="mailto:support@apexbyte.io?subject=Activate%20WhatsApp%20Automation">
              <Button variant="outline" size="sm" className="border-slate-700">
                Request Activation from Admin <ExternalLink className="h-3.5 w-3.5 ml-1.5 text-indigo-400" />
              </Button>
            </Link>
          </Card>
        )}

        {/* State 2 & 3: Active Access */}
        {isAccessActive && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 border-slate-800 bg-slate-900/70 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-600/30 border border-emerald-500/40 text-emerald-400 text-xs font-bold flex items-center justify-center">
                  1
                </span>
                <h2 className="text-base font-semibold text-white">Meta Business Setup</h2>
              </div>
              <p className="text-xs text-slate-400">
                Enter your WhatsApp Business account details. Inbound messages will automatically route to our AI requirement scoping pipeline.
              </p>

              <form onSubmit={handleConnectWhatsApp} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    WhatsApp Business Phone Number
                  </label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                    <Input
                      type="text"
                      required
                      placeholder="+1 (555) 019-2834"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="pl-9 bg-slate-950/70 border-slate-800 text-white text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Meta Phone Number ID / WABA ID
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. 100654321098765"
                    value={wabaId}
                    onChange={(e) => setWabaId(e.target.value)}
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
                    {connecting ? 'Saving...' : connectionStatus === 'connected' ? 'Update Details' : 'Connect WhatsApp'}
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

            <Card className="p-6 border-slate-800 bg-slate-900/70 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-600/30 border border-emerald-500/40 text-emerald-400 text-xs font-bold flex items-center justify-center">
                    2
                  </span>
                  <h2 className="text-base font-semibold text-white">Meta Webhook Target</h2>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(webhookUrl);
                    setCopiedWebhook(true);
                    setTimeout(() => setCopiedWebhook(false), 2000);
                  }}
                  className="text-xs h-7 px-2 border-slate-700 bg-slate-800/80 text-slate-300"
                >
                  {copiedWebhook ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400 mr-1" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 text-slate-400 mr-1" /> Copy URL
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-slate-400">
                In Meta Developer Portal, set this Webhook URL under your WhatsApp App settings:
              </p>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-emerald-400 overflow-x-auto select-all">
                {webhookUrl}
              </div>

              <div className="pt-2 text-[11px] text-slate-400 space-y-1">
                <div className="flex items-center gap-1 text-slate-300">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Webhook Verification Active
                </div>
                <p className="text-slate-500">
                  Inbound WhatsApp messages verify company automation access before triggering Gemini requirement scoping.
                </p>
              </div>
            </Card>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
