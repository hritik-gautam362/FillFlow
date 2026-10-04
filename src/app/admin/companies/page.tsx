'use client';

import * as React from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Shield,
  Building2,
  CheckCircle2,
  Lock,
  ArrowRight,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

interface CompanyAdminItem {
  id: string;
  name: string;
  industry: string | null;
  teamSize: string | null;
  createdAt: string;
  leadCount: number;
  users: Array<{ id: string; name: string; email: string; role: string }>;
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
  }>;
  emailQuota?: {
    monthlyLimit: number;
    usedCredits: number;
    remainingCredits: number;
    usagePercentage: number;
    automationStatus: 'ACTIVE' | 'QUOTA_LOCKED' | 'ADMIN_DISABLED' | 'DISCONNECTED';
    nextResetAt: string;
  };
}

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = React.useState<CompanyAdminItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchCompanies = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/companies');
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error('Access denied: You must be signed in as a platform administrator.');
        }
        throw new Error('Failed to load companies.');
      }
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setCompanies(json.data);
      }
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-400 shadow-md shadow-purple-950/20">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Platform Administration
                </h1>
                <Badge variant="purple" className="text-[10px]">
                  platform_admin
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-slate-400">
                Manage all registered client workspaces, access grants, and automation modules.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchCompanies}
            disabled={loading}
            className="text-xs border-slate-700 bg-slate-900/60"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Workspaces
          </Button>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-xs text-rose-300 hover:text-white">
                Log In as Admin
              </Button>
            </Link>
          </div>
        )}

        {/* Company Workspaces Table */}
        <Card className="border border-slate-800 bg-slate-900/80 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Registered Workspaces ({companies.length})</h2>
            <span className="text-xs text-slate-400">Multi-tenant Company Directory</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Workspace Name</th>
                  <th className="py-3 px-4 font-semibold">Primary Contact</th>
                  <th className="py-3 px-4 font-semibold">Web Access</th>
                  <th className="py-3 px-4 font-semibold">WhatsApp Access</th>
                  <th className="py-3 px-4 font-semibold">Email Access</th>
                  <th className="py-3 px-4 font-semibold">Leads</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading && companies.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Loading companies...
                    </td>
                  </tr>
                ) : companies.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No companies found.
                    </td>
                  </tr>
                ) : (
                  companies.map((c) => {
                    const primaryUser = c.users[0];
                    const webStatus = c.automations.find((a) => a.automationType === 'web');
                    const waStatus = c.automations.find((a) => a.automationType === 'whatsapp');
                    const emailStatus = c.automations.find((a) => a.automationType === 'email');

                    return (
                      <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-medium text-white">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-indigo-400" />
                            <span>{c.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            {c.industry || 'Consulting'} • {c.teamSize || '1-10'}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          {primaryUser ? (
                            <div>
                              <div className="text-white font-medium">{primaryUser.name}</div>
                              <div className="text-slate-400 text-[10px]">{primaryUser.email}</div>
                            </div>
                          ) : (
                            <span className="text-slate-500">No users yet</span>
                          )}
                        </td>

                        {/* Web Status */}
                        <td className="py-3.5 px-4">
                          {webStatus?.enabled ? (
                            <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> ACTIVE
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500 flex items-center gap-1">
                              <Lock className="h-3 w-3 text-slate-500" /> LOCKED
                            </span>
                          )}
                        </td>

                        {/* WhatsApp Status */}
                        <td className="py-3.5 px-4">
                          {waStatus?.enabled ? (
                            <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> ACTIVE
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500 flex items-center gap-1">
                              <Lock className="h-3 w-3 text-slate-500" /> LOCKED
                            </span>
                          )}
                        </td>

                        {/* Email Status & Quota */}
                        <td className="py-3.5 px-4">
                          {(() => {
                            const quota = c.emailQuota;
                            const status = quota?.automationStatus || (emailStatus?.enabled ? 'ACTIVE' : 'ADMIN_DISABLED');

                            if (status === 'ACTIVE') {
                              return (
                                <div>
                                  <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> ACTIVE
                                  </span>
                                  {quota && (
                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                      {quota.usedCredits}/{quota.monthlyLimit} used ({quota.usagePercentage}%)
                                    </div>
                                  )}
                                </div>
                              );
                            }
                            if (status === 'QUOTA_LOCKED') {
                              return (
                                <div>
                                  <span className="text-[11px] text-amber-400 font-semibold flex items-center gap-1">
                                    <Lock className="h-3 w-3" /> QUOTA LOCKED
                                  </span>
                                  {quota && (
                                    <div className="text-[10px] text-amber-300/80 mt-0.5">
                                      {quota.usedCredits}/{quota.monthlyLimit} (100%)
                                    </div>
                                  )}
                                </div>
                              );
                            }
                            if (status === 'ADMIN_DISABLED') {
                              return (
                                <span className="text-[11px] text-rose-400 font-medium flex items-center gap-1">
                                  <Lock className="h-3 w-3 text-rose-400" /> ADMIN DISABLED
                                </span>
                              );
                            }
                            return (
                              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                DISCONNECTED
                              </span>
                            );
                          })()}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-300">
                          {c.leadCount}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <Link href={`/admin/companies/${c.id}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 px-2.5 border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-indigo-300"
                            >
                              Manage <ArrowRight className="h-3 w-3 ml-1" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>

      <Footer />
    </div>
  );
}
