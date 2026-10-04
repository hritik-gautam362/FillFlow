'use client';

import * as React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { StatsOverview } from '@/components/dashboard/StatsOverview';
import { AutomationAccessOverview } from '@/components/dashboard/AutomationAccessOverview';
import { AiApprovalQueueSection } from '@/components/dashboard/AiApprovalQueueSection';
import { AiControlCenterSection } from '@/components/dashboard/AiControlCenterSection';
import { BriefDetailModal } from '@/components/dashboard/BriefDetailModal';
import { ExportModal } from '@/components/dashboard/ExportModal';
import { Lead, ChannelSource, LeadStatus } from '@/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search,
  Filter,
  FileSpreadsheet,
  MessageSquare,
  Globe,
  Mail,
  FileText,
  Eye,
  Sparkles,
  Bot,
  PlusCircle,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface CompanyData {
  id: string;
  name: string;
  industry?: string | null;
  teamSize?: string | null;
  onboardingCompleted?: boolean;
  onboardingStep?: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [company, setCompany] = React.useState<CompanyData | null>(null);
  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [searchQuery, setSearchQuery] = React.useState('');
  const [channelFilter, setChannelFilter] = React.useState<ChannelSource | 'all'>('all');
  const [statusFilter, setStatusFilter] = React.useState<LeadStatus | 'all'>('all');

  const [selectedLead, setSelectedLead] = React.useState<Lead | null>(null);
  const [modalDefaultTab, setModalDefaultTab] = React.useState<'overview' | 'conversation' | 'brief'>('overview');
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = React.useState(false);

  // Fetch real company and real leads from Neon PostgreSQL
  const loadDashboardData = React.useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // 1. Retrieve the authenticated company record
      const meRes = await fetch('/api/auth/me');
      if (meRes.status === 401) {
        router.push('/login');
        return;
      }
      if (!meRes.ok) {
        throw new Error(`Failed to load company profile (${meRes.status})`);
      }
      const meJson = await meRes.json();
      if (!meJson.success || !meJson.data?.company) {
        throw new Error('Please sign in to access your company dashboard.');
      }

      const activeCompany = meJson.data.company;
      setCompany(activeCompany);

      // 2. Retrieve real leads for this company
      const leadsRes = await fetch(`/api/companies/${activeCompany.id}/leads`);
      if (!leadsRes.ok) {
        throw new Error(`Failed to load leads (${leadsRes.status})`);
      }
      const leadsJson = await leadsRes.json();
      if (!leadsJson.success || !Array.isArray(leadsJson.data)) {
        throw new Error(leadsJson.error || 'Failed to retrieve leads');
      }

      // Map DB lead records to Lead interface
      const formattedLeads: Lead[] = leadsJson.data.map((l: Record<string, unknown>) => ({
        id: String(l.id),
        clientName: String(l.clientName || 'Anonymous Client'),
        companyName: String(l.companyName || 'Unknown Organization'),
        email: String(l.email || ''),
        phone: String(l.phone || ''),
        channel: (l.channel as ChannelSource) || 'web_chat',
        status: (l.status as LeadStatus) || 'new',
        qualificationScore: typeof l.qualificationScore === 'number' ? l.qualificationScore : 0,
        estimatedBudget: typeof l.estimatedBudget === 'string' && l.estimatedBudget ? l.estimatedBudget : 'Gathering budget...',
        requestedTimeline: typeof l.requestedTimeline === 'string' && l.requestedTimeline ? l.requestedTimeline : 'Evaluating duration...',
        projectType: typeof l.projectType === 'string' && l.projectType ? l.projectType : 'Scoping Project...',
        lastActive: l.lastActive ? String(l.lastActive) : String(l.createdAt || new Date().toISOString()),
        assignedManager: typeof l.assignedManager === 'string' ? l.assignedManager : undefined,
        notes: typeof l.notes === 'string' ? l.notes : undefined,
        projectBrief: l.projectBrief ? (l.projectBrief as { id: string; title: string }) : null,
      }));

      setLeads(formattedLeads);
    } catch (err) {
      console.error('[Dashboard Error]:', err);
      setError((err as Error).message || 'Failed to connect to Neon database.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [router]);

  React.useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Filter logic
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.projectType.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesChannel = channelFilter === 'all' || lead.channel === channelFilter;
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;

    return matchesSearch && matchesChannel && matchesStatus;
  });

  const handleOpenLead = (lead: Lead, tab: 'overview' | 'conversation' | 'brief' = 'overview') => {
    setSelectedLead(lead);
    setModalDefaultTab(tab);
    setIsModalOpen(true);
  };

  // Real database metrics calculation
  const totalCount = leads.length;
  const qualifiedCount = leads.filter(
    (l) => l.qualificationScore >= 75 || l.status === 'qualified' || l.status === 'brief_ready'
  ).length;
  const briefsCount = leads.filter((l) => Boolean(l.projectBrief)).length;
  const avgScore =
    totalCount > 0 ? Math.round(leads.reduce((acc, l) => acc + l.qualificationScore, 0) / totalCount) : 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      <Navbar />

      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 mx-auto max-w-7xl w-full space-y-8">
        {/* Dashboard Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Company Dashboard
              </h1>
              <Badge variant="purple" className="flex items-center gap-1">
                <Bot className="h-3 w-3" />
                {company?.name || 'Workspace'}
              </Badge>
            </div>
            <p className="text-sm text-slate-400">
              Overview of inbound WhatsApp & Web chat leads, AI qualification scores, and project briefs.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadDashboardData(true)}
              disabled={isRefreshing || loading}
              className="flex items-center gap-1.5 border-slate-800 bg-slate-900 text-slate-300 hover:text-white"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
            </Button>

            <Link href="/chat">
              <Button variant="outline" size="sm" className="flex items-center gap-1.5 border-slate-700 bg-slate-900">
                <PlusCircle className="h-4 w-4 text-emerald-400" />
                Test Client Chat Flow
              </Button>
            </Link>

            <Button
              variant="glow"
              size="sm"
              onClick={() => setIsExportModalOpen(true)}
              disabled={leads.length === 0}
              className="flex items-center gap-1.5"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel Report
            </Button>
          </div>
        </div>

        {/* Error Notification if any */}
        {error && (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadDashboardData()}
              className="text-xs shrink-0 border-destructive/30"
            >
              Retry
            </Button>
          </div>
        )}

        {/* Incomplete Onboarding Banner (Non-intrusive reminder for newly registered companies) */}
        {company && company.onboardingCompleted === false && (
          <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900/50 p-4 text-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Complete your AI workspace setup</p>
                <p className="text-xs text-slate-400">
                  Configure your company profile, business hours, AI knowledge, and Gmail connection in the guided setup wizard.
                </p>
              </div>
            </div>
            <Link href="/onboarding">
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs shrink-0 shadow-md">
                Resume Setup ({company.onboardingStep || 1}/7)
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </Link>
          </div>
        )}

        {/* AI Approvals Workflow Queue Section (Priority 1: Immediate visibility for responses waiting for company authorization) */}
        {company?.id && (
          <AiApprovalQueueSection companyId={company.id} />
        )}

        {/* Gmail / Email Automation Status & Access (Priority 2) */}
        {company?.id && (
          <AutomationAccessOverview companyId={company.id} />
        )}

        {/* Other Email Automation Settings / AI Control Center (Priority 3) */}
        {company?.id && (
          <AiControlCenterSection companyId={company.id} />
        )}

        {/* Stats Metrics (All Real DB-Backed) */}
        <StatsOverview
          totalLeads={totalCount}
          qualifiedLeads={qualifiedCount}
          briefsCount={briefsCount}
          avgScore={avgScore}
        />

        {/* Lead Management Section */}
        <div className="space-y-4">
          
          {/* Search & Filter Toolbar */}
          <Card className="p-4 border-slate-800 bg-slate-900/90 flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                type="text"
                placeholder="Search leads, companies, or project types..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-slate-950 border-slate-800 text-xs"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5 text-slate-400">
                <Filter className="h-3.5 w-3.5" /> Filter Source:
              </div>
              <div className="flex items-center rounded-lg bg-slate-950 p-1 border border-slate-800">
                <button
                  onClick={() => setChannelFilter('all')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    channelFilter === 'all' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setChannelFilter('whatsapp')}
                  className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                    channelFilter === 'whatsapp' ? 'bg-emerald-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <MessageSquare className="h-3 w-3" /> WhatsApp
                </button>
                <button
                  onClick={() => setChannelFilter('web_chat')}
                  className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                    channelFilter === 'web_chat' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Globe className="h-3 w-3" /> Web Chat
                </button>
                <button
                  onClick={() => setChannelFilter('email')}
                  className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                    channelFilter === 'email' ? 'bg-purple-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Mail className="h-3 w-3" /> Email
                </button>
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as LeadStatus | 'all')}
                className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">All Statuses</option>
                <option value="new">New</option>
                <option value="qualifying">Qualifying</option>
                <option value="qualified">Qualified</option>
                <option value="brief_ready">Brief Ready</option>
                <option value="converted">Converted</option>
                <option value="disqualified">Disqualified</option>
              </select>
            </div>

          </Card>

          {/* Leads Table */}
          <Card className="border-slate-800 bg-slate-900/80 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase font-mono border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5">Client & Company</th>
                    <th className="px-5 py-3.5">Inbound Channel</th>
                    <th className="px-5 py-3.5">AI Score</th>
                    <th className="px-5 py-3.5">Project Scope / Budget</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {loading ? (
                    // Loading skeleton state
                    Array.from({ length: 4 }).map((_, idx) => (
                      <tr key={idx} className="animate-pulse">
                        <td className="px-5 py-4">
                          <div className="space-y-2">
                            <div className="h-3.5 bg-slate-800 rounded w-28" />
                            <div className="h-2.5 bg-slate-800/60 rounded w-20" />
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="h-5 bg-slate-800 rounded w-20" />
                        </td>
                        <td className="px-5 py-4">
                          <div className="h-3 bg-slate-800 rounded w-16" />
                        </td>
                        <td className="px-5 py-4">
                          <div className="space-y-1.5">
                            <div className="h-3 bg-slate-800 rounded w-32" />
                            <div className="h-2.5 bg-slate-800/60 rounded w-16" />
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="h-5 bg-slate-800 rounded w-20" />
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="h-7 bg-slate-800 rounded w-20 ml-auto" />
                        </td>
                      </tr>
                    ))
                  ) : filteredLeads.length > 0 ? (
                    filteredLeads.map((lead) => {
                      const hasBrief = Boolean(lead.projectBrief);
                      return (
                        <tr
                          key={lead.id}
                          onClick={() => handleOpenLead(lead, 'overview')}
                          className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                        >
                          {/* Client & Company Column */}
                          <td className="px-5 py-4">
                            <div className="flex flex-col">
                              <span className="font-semibold text-white text-sm">{lead.clientName}</span>
                              <span className="text-slate-400 font-medium">{lead.companyName}</span>
                              <span className="text-[10px] text-slate-500 font-mono mt-0.5">{lead.email}</span>
                            </div>
                          </td>

                          {/* Channel Column */}
                          <td className="px-5 py-4">
                            {lead.channel === 'whatsapp' ? (
                              <Badge variant="success" className="flex items-center gap-1 w-fit">
                                <MessageSquare className="h-3 w-3" /> WhatsApp
                              </Badge>
                            ) : lead.channel === 'web_chat' ? (
                              <Badge variant="default" className="flex items-center gap-1 w-fit">
                                <Globe className="h-3 w-3" /> Web Chat
                              </Badge>
                            ) : lead.channel === 'email' ? (
                              <Badge variant="outline" className="flex items-center gap-1 w-fit border-purple-500/30 text-purple-300 bg-purple-950/40">
                                <Mail className="h-3 w-3" /> Email
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                                <FileText className="h-3 w-3" /> Contact Form
                              </Badge>
                            )}
                          </td>

                          {/* Qualification Score Column */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-2 rounded-full bg-slate-800 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    lead.qualificationScore >= 90
                                      ? 'bg-emerald-500'
                                      : lead.qualificationScore >= 75
                                      ? 'bg-indigo-500'
                                      : 'bg-amber-500'
                                  }`}
                                  style={{ width: `${lead.qualificationScore}%` }}
                                />
                              </div>
                              <span className="font-bold text-white font-mono">{lead.qualificationScore}/100</span>
                            </div>
                          </td>

                          {/* Scope & Budget Column */}
                          <td className="px-5 py-4">
                            <div className="flex flex-col space-y-0.5">
                              <span className="text-slate-200 font-medium">{lead.projectType}</span>
                              <span className="text-emerald-400 font-semibold">{lead.estimatedBudget}</span>
                              <span className="text-[10px] text-slate-400">{lead.requestedTimeline}</span>
                            </div>
                          </td>

                          {/* Status Column */}
                          <td className="px-5 py-4">
                            {lead.status === 'brief_ready' ? (
                              <Badge variant="purple" className="flex items-center gap-1 w-fit">
                                <Sparkles className="h-3 w-3" /> Brief Ready
                              </Badge>
                            ) : lead.status === 'qualified' ? (
                              <Badge variant="success" className="flex items-center gap-1 w-fit">
                                <CheckCircle2 className="h-3 w-3" /> Qualified
                              </Badge>
                            ) : lead.status === 'converted' ? (
                              <Badge variant="success" className="bg-emerald-600 text-white flex items-center gap-1 w-fit">
                                <CheckCircle2 className="h-3 w-3" /> Converted
                              </Badge>
                            ) : lead.status === 'disqualified' ? (
                              <Badge variant="destructive" className="w-fit">
                                Disqualified
                              </Badge>
                            ) : lead.status === 'new' ? (
                              <Badge variant="outline" className="text-slate-300 border-slate-700 w-fit">
                                New
                              </Badge>
                            ) : (
                              <Badge variant="warning" className="w-fit">Qualifying</Badge>
                            )}
                          </td>

                          {/* Actions Column */}
                          <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenLead(lead, hasBrief ? 'brief' : 'overview')}
                                className="text-xs flex items-center gap-1 border-slate-700 bg-slate-950 hover:bg-slate-800"
                              >
                                <Eye className="h-3.5 w-3.5 text-indigo-400" />
                                {hasBrief ? 'View Brief' : 'View Details'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                        {searchQuery || channelFilter !== 'all' || statusFilter !== 'all' ? (
                          <span>No leads found matching your search filters.</span>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-sm font-medium text-slate-300">No leads recorded in database yet.</p>
                            <p className="text-xs text-slate-500">
                              Use the Client Requirement Onboarding Demo to simulate a lead conversation.
                            </p>
                            <Link href="/chat">
                              <Button variant="outline" size="sm" className="mt-2 text-xs border-slate-700 bg-slate-900">
                                Open Client Chat Flow
                              </Button>
                            </Link>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Real Lead & Brief Detail Modal */}
        <BriefDetailModal
          lead={selectedLead}
          defaultTab={modalDefaultTab}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />

        {/* Export Modal */}
        <ExportModal
          leads={filteredLeads}
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
        />
      </main>

      <Footer />
    </div>
  );
}
