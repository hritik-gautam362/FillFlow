'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Globe,
  MessageSquare,
  Mail,
  Lock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  ExternalLink,
  Settings,
} from 'lucide-react';

export interface AutomationStatus {
  automationType: 'web' | 'whatsapp' | 'email';
  enabled: boolean;
  activatedAt: string | null;
  expiresAt: string | null;
}

export interface AutomationConnectionStatus {
  automationType: 'web' | 'whatsapp' | 'email';
  status: 'not_connected' | 'pending' | 'connected' | 'disconnected' | 'error';
  provider?: string | null;
  domain?: string | null;
  displayName?: string | null;
}

interface AutomationAccessOverviewProps {
  companyId: string;
}

export function AutomationAccessOverview({ companyId }: AutomationAccessOverviewProps) {
  const [automations, setAutomations] = React.useState<AutomationStatus[]>([
    { automationType: 'web', enabled: true, activatedAt: null, expiresAt: null },
    { automationType: 'whatsapp', enabled: false, activatedAt: null, expiresAt: null },
    { automationType: 'email', enabled: true, activatedAt: null, expiresAt: null },
  ]);
  const [connections, setConnections] = React.useState<Record<string, AutomationConnectionStatus>>({});
  const [loading, setLoading] = React.useState(true);

  const fetchOverview = React.useCallback(async () => {
    if (!companyId) return;
    try {
      // 1. Fetch access status
      const accessRes = await fetch(`/api/companies/${companyId}/automations`);
      if (accessRes.ok) {
        const json = await accessRes.json();
        if (json.success && Array.isArray(json.data)) {
          setAutomations(json.data);
        }
      }

      // 2. Fetch connection statuses
      const connMap: Record<string, AutomationConnectionStatus> = {};
      for (const type of ['web', 'whatsapp', 'email']) {
        try {
          const connRes = await fetch(`/api/companies/${companyId}/automations/${type}/connection`);
          if (connRes.ok) {
            const connJson = await connRes.json();
            if (connJson.success && connJson.data) {
              connMap[type] = connJson.data;
            }
          }
        } catch {
          // Channel connection unconfigured
        }
      }
      setConnections(connMap);
    } catch (err) {
      console.error('[AutomationAccessOverview] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  React.useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const moduleConfigs = [
    {
      type: 'web' as const,
      title: 'Web Automation',
      description: 'AI-driven requirement discovery chat widget & instant scoping for your prospective clients.',
      icon: Globe,
      color: 'text-indigo-400 border-indigo-500/20 bg-indigo-500/10',
      manageHref: '/dashboard/automations/web',
    },
    {
      type: 'whatsapp' as const,
      title: 'WhatsApp Automation',
      description: 'Meta WhatsApp Cloud API integration for 24/7 client discovery, qualification scoring & briefs.',
      icon: MessageSquare,
      color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10',
      manageHref: '/dashboard/automations/whatsapp',
    },
    {
      type: 'email' as const,
      title: 'Email Automation',
      description: 'Autonomous inbound RFP and requirement parsing directly from prospective client email briefs.',
      icon: Mail,
      color: 'text-purple-400 border-purple-500/20 bg-purple-500/10',
      manageHref: '/dashboard/automations/email',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white tracking-tight">Automation Channels</h2>
        </div>
        <span className="text-[11px] text-slate-400">Access & Connection Status</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {moduleConfigs.map((cfg) => {
          const status = automations.find((a) => a.automationType === cfg.type);
          const isAccessActive = status ? status.enabled : (cfg.type === 'web' || cfg.type === 'email');
          const connection = connections[cfg.type];
          const connStatus = connection?.status || 'not_connected';
          const isConnected = connStatus === 'connected';
          const Icon = cfg.icon;

          return (
            <Card
              key={cfg.type}
              className={`p-5 border transition-all flex flex-col justify-between ${
                isAccessActive
                  ? 'border-slate-800 bg-slate-900/90 shadow-lg shadow-indigo-950/10'
                  : 'border-slate-800/60 bg-slate-950/60 opacity-80'
              }`}
            >
              <div>
                {/* Header: Icon + Badges */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className={`p-2 rounded-lg border ${cfg.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    {/* Access Status Badge */}
                    {loading ? (
                      <Badge variant="outline" className="text-[10px] animate-pulse">
                        Checking...
                      </Badge>
                    ) : isAccessActive ? (
                      <Badge variant="success" className="text-[10px] flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="h-3 w-3" /> ACTIVE
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] flex items-center gap-1 text-slate-400 border-slate-700 bg-slate-900">
                        <Lock className="h-3 w-3 text-amber-400" /> LOCKED
                      </Badge>
                    )}

                    {/* Connection Status Badge (Only shown if access is active) */}
                    {isAccessActive && !loading && (
                      <div>
                        {connStatus === 'connected' ? (
                          <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 bg-emerald-950/40 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Connected
                          </span>
                        ) : connStatus === 'pending' ? (
                          <span className="text-[10px] text-sky-400 font-medium flex items-center gap-1 bg-sky-950/40 border border-sky-500/20 px-2 py-0.5 rounded-full">
                            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
                            Pending Setup
                          </span>
                        ) : connStatus === 'disconnected' ? (
                          <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1 bg-slate-900 border border-slate-700 px-2 py-0.5 rounded-full">
                            Disconnected
                          </span>
                        ) : connStatus === 'error' ? (
                          <span className="text-[10px] text-rose-400 font-medium flex items-center gap-1 bg-rose-950/40 border border-rose-500/20 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="h-3 w-3" /> Error
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-400/90 font-medium flex items-center gap-1 bg-amber-950/40 border border-amber-500/20 px-2 py-0.5 rounded-full">
                            ⚠️ Not connected
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Automation Info */}
                <div className="space-y-1 mb-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                      {cfg.title}
                    </h3>
                    {cfg.type === 'email' && (
                      <span className="text-[10px] font-medium text-indigo-300/90 bg-indigo-950/40 border border-indigo-500/30 px-2 py-0.5 rounded">
                        {connection?.provider ? (connection.provider.toLowerCase() === 'google' ? 'Google' : 'Mailgun') : 'Google / Mailgun'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed min-h-[36px]">
                    {cfg.description}
                  </p>
                  {cfg.type === 'email' && connection?.displayName && (
                    <div className="text-[11px] text-purple-300 font-mono pt-1 truncate">
                      Sender: {connection.displayName}
                    </div>
                  )}
                </div>
              </div>

              {/* Single Clear Primary Action */}
              <div className="pt-3 border-t border-slate-800/80">
                {isAccessActive ? (
                  <Link href={cfg.manageHref} className="block w-full">
                    {isConnected ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs flex items-center justify-center gap-1.5 border-slate-700 bg-slate-800/60 hover:bg-slate-800"
                      >
                        <Settings className="h-3.5 w-3.5 text-indigo-400" />
                        <span>Manage {cfg.title.replace(' Automation', '')}</span>
                      </Button>
                    ) : (
                      <Button
                        variant="glow"
                        size="sm"
                        className="w-full text-xs flex items-center justify-center gap-1.5"
                      >
                        <span>Connect {cfg.title.replace(' Automation', '')}</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </Link>
                ) : (
                  <div className="flex items-center justify-between text-xs py-1">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-slate-500" />
                      Not activated
                    </span>
                    <Link
                      href="mailto:support@apexbyte.io?subject=Request%20Automation%20Activation"
                      className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 text-[11px]"
                    >
                      Contact Admin <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
