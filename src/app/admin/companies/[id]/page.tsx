'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Shield,
  Building2,
  Users,
  CheckCircle2,
  Lock,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  Globe,
  MessageSquare,
  Mail,
  Key,
  Sliders,
  History,
  RotateCcw,
} from 'lucide-react';

interface CompanyDetail {
  id: string;
  name: string;
  industry: string | null;
  teamSize: string | null;
  createdAt: string;
  leadCount: number;
  users: Array<{ id: string; name: string; email: string; role: string; createdAt: string }>;
  automations: Array<{
    automationType: 'web' | 'whatsapp' | 'email';
    enabled: boolean;
    activatedAt: string | null;
    expiresAt: string | null;
  }>;
  connections: Array<{
    automationType: 'web' | 'whatsapp' | 'email';
    status: string;
    displayName: string | null;
    provider: string | null;
  }>;
  emailQuota?: {
    monthlyLimit: number;
    usedCredits: number;
    reservedCredits: number;
    remainingCredits: number;
    usagePercentage: number;
    automationStatus: 'ACTIVE' | 'QUOTA_LOCKED' | 'ADMIN_DISABLED' | 'DISCONNECTED';
    adminDisabled: boolean;
    quotaLocked: boolean;
    nextResetAt: string;
  };
  auditLogs?: Array<{
    id: string;
    action: string;
    details: Record<string, unknown> | null;
    createdAt: string;
  }>;
}

export default function AdminCompanyDetailPage() {
  const params = useParams();
  const companyId = params?.id as string;

  const [company, setCompany] = React.useState<CompanyDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [toggling, setToggling] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);
  const [limitInput, setLimitInput] = React.useState<string>('');
  const [updatingLimit, setUpdatingLimit] = React.useState(false);
  const [resettingQuota, setResettingQuota] = React.useState(false);

  const fetchDetail = React.useCallback(async () => {
    if (!companyId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/companies/${companyId}`);
      if (!res.ok) throw new Error(`Failed to load company details (${res.status})`);
      const json = await res.json();
      if (json.success && json.data) {
        setCompany(json.data);
      }
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  React.useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleToggleAutomation = async (type: 'web' | 'whatsapp' | 'email', currentEnabled: boolean) => {
    if (!companyId) return;
    setToggling(type);
    setError(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/automations/${type}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update automation access.');
      }

      await fetchDetail();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setToggling(null);
    }
  };

  const handleUpdateLimit = async () => {
    if (!companyId) return;
    const parsed = parseInt(limitInput, 10);
    if (isNaN(parsed) || parsed < 0) {
      setError('Monthly AI email limit must be a non-negative integer.');
      return;
    }
    try {
      setUpdatingLimit(true);
      setError(null);
      setSuccessMsg(null);
      const res = await fetch(`/api/companies/${companyId}/automations/email/quota`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyLimit: parsed }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to update limit.');
      setSuccessMsg(`Monthly AI email allowance successfully updated to ${parsed}.`);
      setLimitInput('');
      await fetchDetail();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setUpdatingLimit(false);
    }
  };

  const handleSetEmailDisabled = async (disabled: boolean) => {
    if (!companyId) return;
    try {
      setToggling('email');
      setError(null);
      setSuccessMsg(null);
      const res = await fetch(`/api/companies/${companyId}/automations/email/quota`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminDisabled: disabled }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to update state.');
      setSuccessMsg(disabled ? 'Email automation manually disabled.' : 'Email automation enabled.');
      await fetchDetail();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setToggling(null);
    }
  };

  const handleResetQuota = async () => {
    if (!companyId) return;
    if (!confirm('Are you sure you want to reset the monthly AI email usage credits to 0 for this company?')) {
      return;
    }
    try {
      setResettingQuota(true);
      setError(null);
      setSuccessMsg(null);
      const res = await fetch(`/api/companies/${companyId}/automations/email/quota`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to reset quota.');
      setSuccessMsg('Monthly email quota successfully reset to 0.');
      await fetchDetail();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setResettingQuota(false);
    }
  };

  const channelConfigs = [
    {
      type: 'web' as const,
      name: 'Web Automation',
      icon: Globe,
      color: 'text-indigo-400 border-indigo-500/20 bg-indigo-500/10',
    },
    {
      type: 'whatsapp' as const,
      name: 'WhatsApp Automation',
      icon: MessageSquare,
      color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10',
    },
    {
      type: 'email' as const,
      name: 'Email Automation',
      icon: Mail,
      color: 'text-purple-400 border-purple-500/20 bg-purple-500/10',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Link href="/admin/companies" className="hover:text-white flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Workspaces
          </Link>
          <span>/</span>
          <span className="text-slate-200">{company?.name || 'Workspace Details'}</span>
        </div>

        {/* Company Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-400">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {company?.name || 'Loading Workspace...'}
                </h1>
                <Badge variant="purple" className="text-[10px]">
                  ID: {companyId?.slice(0, 10)}...
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-slate-400">
                Industry: {company?.industry || 'Consulting'} • Team: {company?.teamSize || '1-10'} • Leads: {company?.leadCount || 0}
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchDetail}
            disabled={loading}
            className="text-xs border-slate-700 bg-slate-900/60"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
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

        {/* Section 1: Automation Access Administration */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-purple-400" />
              <h2 className="text-sm font-semibold text-white">Automation Access Grants</h2>
            </div>
            <span className="text-[11px] text-slate-400">Administrative Manual Activation</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {channelConfigs.map((cfg) => {
              const status = company?.automations.find((a) => a.automationType === cfg.type);
              const isEnabled = Boolean(status?.enabled);
              const connection = company?.connections.find((c) => c.automationType === cfg.type);
              const Icon = cfg.icon;
              const isBusy = toggling === cfg.type;

              return (
                <Card key={cfg.type} className="p-5 border-slate-800 bg-slate-900/80 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className={`p-2 rounded-lg border ${cfg.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    {isEnabled ? (
                      <Badge variant="success" className="text-[10px] flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="h-3 w-3" /> ACTIVE
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] flex items-center gap-1 text-slate-400 border-slate-700 bg-slate-950">
                        <Lock className="h-3 w-3 text-amber-400" /> LOCKED
                      </Badge>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-white">{cfg.name}</h3>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Connection: <span className="font-medium text-slate-300">{connection?.status || 'not_connected'}</span>
                    </div>
                    {connection?.displayName && (
                      <div className="text-[10px] text-slate-500 truncate">
                        Target: {connection.displayName}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-800">
                    <Button
                      variant={isEnabled ? 'destructive' : 'glow'}
                      size="sm"
                      onClick={() => handleToggleAutomation(cfg.type, isEnabled)}
                      disabled={isBusy}
                      className="w-full text-xs flex items-center justify-center gap-1.5"
                    >
                      <Key className="h-3 w-3" />
                      {isBusy ? 'Updating...' : isEnabled ? 'Deactivate Access' : 'Activate Access'}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Section 2: Email Automation Allowance & Quota Control */}
        {company?.emailQuota && (
          <Card className="p-6 border-slate-800 bg-slate-900/90 space-y-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg border border-purple-500/20 bg-purple-500/10 text-purple-400">
                  <Sliders className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">Email Automation Allowance & Quota</h2>
                  <p className="text-xs text-slate-400">
                    Admin-controlled monthly AI email limit with automated quota lock enforcement.
                  </p>
                </div>
              </div>

              {/* Explicit Automation Status Badge */}
              <div>
                {company.emailQuota.automationStatus === 'ACTIVE' && (
                  <Badge variant="success" className="text-xs py-1 px-3 flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> ACTIVE
                  </Badge>
                )}
                {company.emailQuota.automationStatus === 'QUOTA_LOCKED' && (
                  <Badge variant="outline" className="text-xs py-1 px-3 flex items-center gap-1.5 font-semibold text-amber-300 border-amber-500/40 bg-amber-950/60">
                    <Lock className="h-3.5 w-3.5 text-amber-400" /> QUOTA LOCKED
                  </Badge>
                )}
                {company.emailQuota.automationStatus === 'ADMIN_DISABLED' && (
                  <Badge variant="destructive" className="text-xs py-1 px-3 flex items-center gap-1.5 font-semibold">
                    <Lock className="h-3.5 w-3.5" /> ADMIN DISABLED
                  </Badge>
                )}
                {company.emailQuota.automationStatus === 'DISCONNECTED' && (
                  <Badge variant="outline" className="text-xs py-1 px-3 flex items-center gap-1.5 font-semibold text-slate-400 border-slate-700 bg-slate-950">
                    DISCONNECTED
                  </Badge>
                )}
              </div>
            </div>

            {/* Quota Metrics Grid: Shows only Monthly Limit, Used, Remaining, Status, and Reset Date */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60">
                <div className="text-[11px] text-slate-400 font-medium">Monthly Limit</div>
                <div className="text-lg font-bold text-white mt-1">{company.emailQuota.monthlyLimit}</div>
                <div className="text-[10px] text-slate-500">emails / month</div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60">
                <div className="text-[11px] text-slate-400 font-medium">Used</div>
                <div className="text-lg font-bold text-indigo-400 mt-1">{company.emailQuota.usedCredits}</div>
                <div className="text-[10px] text-slate-500">emails sent</div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60">
                <div className="text-[11px] text-slate-400 font-medium">Remaining</div>
                <div className={`text-lg font-bold mt-1 ${company.emailQuota.remainingCredits === 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {company.emailQuota.remainingCredits}
                </div>
                <div className="text-[10px] text-slate-500">available emails</div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60">
                <div className="text-[11px] text-slate-400 font-medium">Reset Date</div>
                <div className="text-xs font-semibold text-slate-200 mt-1.5">
                  {new Date(company.emailQuota.nextResetAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Idempotent monthly cycle</div>
              </div>
            </div>

            {/* Usage Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Usage Progress</span>
                <span className="font-mono text-slate-300">
                  {company.emailQuota.usedCredits} / {company.emailQuota.monthlyLimit} ({company.emailQuota.usagePercentage}%)
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    company.emailQuota.usagePercentage >= 100
                      ? 'bg-amber-500'
                      : company.emailQuota.usagePercentage >= 80
                      ? 'bg-amber-400'
                      : 'bg-indigo-500'
                  }`}
                  style={{ width: `${Math.min(100, company.emailQuota.usagePercentage)}%` }}
                />
              </div>
            </div>

            {/* Administrative Controls */}
            <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-950/40 space-y-4">
              <div className="text-xs font-semibold text-slate-300">Platform Admin Actions</div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    placeholder={`New monthly limit (current: ${company.emailQuota.monthlyLimit})`}
                    value={limitInput}
                    onChange={(e) => setLimitInput(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <Button
                    size="sm"
                    variant="glow"
                    onClick={handleUpdateLimit}
                    disabled={updatingLimit || !limitInput}
                    className="text-xs h-8 whitespace-nowrap"
                  >
                    {updatingLimit ? 'Saving...' : 'Update Limit'}
                  </Button>
                </div>

                <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-slate-800 pt-3 sm:pt-0 sm:pl-3">
                  {company.emailQuota.adminDisabled ? (
                    <Button
                      size="sm"
                      variant="glow"
                      onClick={() => handleSetEmailDisabled(false)}
                      disabled={toggling === 'email'}
                      className="text-xs h-8"
                    >
                      Enable Automation
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleSetEmailDisabled(true)}
                      disabled={toggling === 'email'}
                      className="text-xs h-8"
                    >
                      Disable Automation
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleResetQuota}
                    disabled={resettingQuota}
                    className="text-xs h-8 border-slate-700 text-slate-300 hover:text-white"
                  >
                    <RotateCcw className={`h-3 w-3 mr-1 ${resettingQuota ? 'animate-spin' : ''}`} />
                    Reset Quota
                  </Button>
                </div>
              </div>
            </div>

            {/* Section: Audit Logs */}
            {company.auditLogs && company.auditLogs.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <History className="h-3.5 w-3.5 text-slate-400" />
                  <span>Recent Quota & Lock Audit Trail</span>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-800">
                  <table className="w-full text-left text-[11px] text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3 font-semibold">Timestamp</th>
                        <th className="py-2 px-3 font-semibold">Action</th>
                        <th className="py-2 px-3 font-semibold">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {company.auditLogs.slice(0, 8).map((log) => (
                        <tr key={log.id} className="hover:bg-slate-800/20">
                          <td className="py-2 px-3 text-slate-400 whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 font-mono font-medium">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] ${
                                log.action === 'QUOTA_LOCKED'
                                  ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                  : log.action === 'QUOTA_UNLOCKED'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : log.action === 'ADMIN_DISABLED'
                                  ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                  : log.action === 'LIMIT_CHANGED'
                                  ? 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {log.action}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-400 truncate max-w-xs font-mono text-[10px]">
                            {log.details ? JSON.stringify(log.details) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Section 3: Workspace Users */}
        <Card className="p-5 border-slate-800 bg-slate-900/80 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Workspace Members ({company?.users.length || 0})</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">User Name</th>
                  <th className="py-2.5 px-3 font-semibold">Email</th>
                  <th className="py-2.5 px-3 font-semibold">Role</th>
                  <th className="py-2.5 px-3 font-semibold">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {company?.users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 text-white font-medium">{u.name}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">{u.email}</td>
                    <td className="py-2.5 px-3">
                      <Badge variant={u.role === 'platform_admin' ? 'purple' : 'outline'} className="text-[10px]">
                        {u.role}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </main>

      <Footer />
    </div>
  );
}
