'use client';

import * as React from 'react';
import { ProjectBrief, Lead } from '@/types';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileSpreadsheet,
  Copy,
  Check,
  Code,
  Cpu,
  AlertTriangle,
  Layers,
  Calendar,
  DollarSign,
  MessageSquare,
  Users,
  CheckCircle2,
  Sparkles,
  Bot,
  User,
  Clock,
  Loader2,
} from 'lucide-react';

interface DbChatMessage {
  id: string;
  sender: 'client' | 'agent' | 'system';
  text: string;
  createdAt: string;
  options?: string[];
}

interface BriefModalProps {
  lead: Lead | null;
  brief?: ProjectBrief | null;
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'overview' | 'conversation' | 'features' | 'brief' | 'json';
}

export function BriefDetailModal({
  lead,
  brief: initialBrief,
  isOpen,
  onClose,
  defaultTab = 'overview',
}: BriefModalProps) {
  const [activeTab, setActiveTab] = React.useState<'overview' | 'conversation' | 'brief' | 'features' | 'json'>(defaultTab);
  const [brief, setBrief] = React.useState<ProjectBrief | null>(initialBrief || null);
  const [loadingBrief, setLoadingBrief] = React.useState(false);
  const [messages, setMessages] = React.useState<DbChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // Sync state on open or lead change
  React.useEffect(() => {
    if (!isOpen || !lead) {
      setMessages([]);
      return;
    }

    setActiveTab(defaultTab);

    // 1. Fetch real ProjectBrief if not provided
    if (initialBrief) {
      setBrief(initialBrief);
    } else {
      setLoadingBrief(true);
      fetch(`/api/leads/${lead.id}/brief`)
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => {
          if (res && res.success && res.data) {
            setBrief(res.data);
          } else {
            setBrief(null);
          }
        })
        .catch(() => setBrief(null))
        .finally(() => setLoadingBrief(false));
    }

    // 2. Fetch real Conversation messages
    setLoadingMessages(true);
    fetch(`/api/leads/${lead.id}/messages`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res && res.success && Array.isArray(res.data)) {
          setMessages(res.data);
        } else {
          setMessages([]);
        }
      })
      .catch(() => setMessages([]))
      .finally(() => setLoadingMessages(false));
  }, [isOpen, lead, initialBrief, defaultTab]);

  const [isExportingExcel, setIsExportingExcel] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);

  if (!lead) return null;

  const handleCopyJson = () => {
    const payload = brief?.structuredJson || lead;
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportExcel = async () => {
    if (!lead || !hasBrief || isExportingExcel) return;

    setIsExportingExcel(true);
    setExportError(null);

    try {
      const response = await fetch(`/api/leads/${lead.id}/brief/export`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `Export failed with status ${response.status}`);
      }

      // Extract filename from Content-Disposition header if available
      let filename = `project-brief-${(lead.companyName || 'client').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()}.xlsx`;
      const disposition = response.headers.get('content-disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Export Excel Error]:', err);
      setExportError((err as Error).message || 'Failed to export Excel workbook.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const hasBrief = Boolean(brief);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={brief?.title || `${lead.projectType || 'Software Project'} Details`}
      description={`Lead profile & requirements for ${lead.companyName} (${lead.clientName})`}
      maxWidth="3xl"
    >
      <div className="space-y-6">
        
        {/* Modal Top Quick Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-950 border border-slate-800">
          <div className="flex items-center gap-3">
            <Badge variant="purple" className="px-3 py-1">
              {lead.projectType || 'Custom Project'}
            </Badge>
            <Badge
              variant={lead.status === 'brief_ready' ? 'purple' : lead.status === 'qualified' ? 'success' : 'warning'}
              className="text-[10px]"
            >
              {lead.status.toUpperCase()}
            </Badge>
            <span className="text-xs text-slate-400 font-mono">
              Score: <span className="font-bold text-emerald-400">{lead.qualificationScore}/100</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {hasBrief && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                disabled={isExportingExcel}
                className="text-xs flex items-center gap-1.5 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
              >
                {isExportingExcel ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 text-emerald-400 animate-spin" />
                    Generating Excel...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                    Export Excel
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Error notification if export failed */}
        {exportError && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center justify-between">
            <span>⚠️ {exportError}</span>
            <button onClick={() => setExportError(null)} className="underline ml-2">Dismiss</button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 gap-6 text-sm overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 font-medium transition-colors border-b-2 flex items-center gap-1.5 shrink-0 ${
              activeTab === 'overview'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Users className="h-3.5 w-3.5" /> Lead & Scope
          </button>

          <button
            onClick={() => setActiveTab('conversation')}
            className={`pb-3 font-medium transition-colors border-b-2 flex items-center gap-1.5 shrink-0 ${
              activeTab === 'conversation'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" /> Conversation ({messages.length})
          </button>

          <button
            onClick={() => setActiveTab('brief')}
            className={`pb-3 font-medium transition-colors border-b-2 flex items-center gap-1.5 shrink-0 ${
              activeTab === 'brief'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" /> Project Brief {hasBrief ? '✓' : ''}
          </button>

          {brief && brief.features && brief.features.length > 0 && (
            <button
              onClick={() => setActiveTab('features')}
              className={`pb-3 font-medium transition-colors border-b-2 flex items-center gap-1.5 shrink-0 ${
                activeTab === 'features'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="h-3.5 w-3.5" /> Features ({brief.features.length})
            </button>
          )}

          <button
            onClick={() => setActiveTab('json')}
            className={`pb-3 font-medium transition-colors border-b-2 flex items-center gap-1.5 shrink-0 ${
              activeTab === 'json'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Code className="h-3.5 w-3.5" /> Structured Data
          </button>
        </div>

        {/* Tab 1: Overview & Lead Details */}
        {activeTab === 'overview' && (
          <div className="space-y-6 text-xs text-slate-300">
            {/* Commercial Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-400" /> Target Budget
                </span>
                <p className="text-base font-bold text-white">
                  {lead.estimatedBudget || brief?.budgetRange || 'Gathering budget...'}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                  <Calendar className="h-3.5 w-3.5 text-indigo-400" /> Requested Timeline
                </span>
                <p className="text-base font-bold text-white">
                  {lead.requestedTimeline || brief?.estimatedDuration || 'Evaluating duration...'}
                </p>
              </div>
            </div>

            {/* Contact Information & Channel */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                  <User className="h-3.5 w-3.5 text-indigo-400" /> Contact Information
                </span>
                <div className="space-y-1 text-xs">
                  <p className="font-semibold text-white">{lead.clientName}</p>
                  <p className="text-slate-400">{lead.companyName}</p>
                  <p className="text-slate-400 font-mono text-[11px]">{lead.email}</p>
                  {lead.phone && <p className="text-slate-400 font-mono text-[11px]">{lead.phone}</p>}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Lead Qualification Status
                </span>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Inbound Channel:</span>
                    <Badge variant={lead.channel === 'whatsapp' ? 'success' : 'default'} className="text-[10px]">
                      {lead.channel === 'whatsapp' ? 'WhatsApp' : lead.channel === 'web_chat' ? 'Web Chat' : 'Contact Form'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Manager:</span>
                    <span className="text-slate-200">{lead.assignedManager || 'Unassigned'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Last Active:</span>
                    <span className="text-slate-400 font-mono text-[10px] flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {lead.lastActive ? new Date(lead.lastActive).toLocaleString() : 'Recent'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Scope / Objective */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-purple-400" /> Scope & Project Type
              </h4>
              <p className="p-4 rounded-xl bg-slate-950 border border-slate-800 leading-relaxed text-slate-300">
                {lead.projectType || 'Requirement scoping in progress.'}
              </p>
            </div>
          </div>
        )}

        {/* Tab 2: Conversation History */}
        {activeTab === 'conversation' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/80 pb-2">
              <span>Chronological Transcript (Neon DB)</span>
              <span>{messages.length} Messages</span>
            </div>

            <div className="space-y-3.5 max-h-[420px] overflow-y-auto p-4 bg-slate-950/60 rounded-xl border border-slate-800">
              {loadingMessages ? (
                <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Bot className="h-4 w-4 animate-spin text-indigo-400" />
                  Loading conversation history from database...
                </div>
              ) : messages.length > 0 ? (
                messages.map((msg) => {
                  const isAgent = msg.sender === 'agent';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'}`}
                    >
                      <div className="flex items-center gap-2 mb-1 px-1 text-[10px]">
                        <span className="text-slate-400 font-medium">
                          {isAgent ? 'AI Assistant' : lead.clientName || 'Client'}
                        </span>
                        <span className="text-slate-600 font-mono">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div
                        className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                          isAgent
                            ? 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-sm'
                            : 'bg-indigo-600 text-white rounded-tr-sm shadow-md shadow-indigo-600/20'
                        }`}
                      >
                        {msg.text}

                        {/* Quick options if present */}
                        {msg.options && msg.options.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1.5 pt-2 border-t border-slate-800/60">
                            {msg.options.map((opt, i) => (
                              <span
                                key={i}
                                className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-300"
                              >
                                {opt}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-xs text-slate-500">
                  No conversation messages recorded in database for this lead.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Project Brief */}
        {activeTab === 'brief' && (
          <div className="space-y-6 text-xs text-slate-300">
            {loadingBrief ? (
              <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Sparkles className="h-4 w-4 animate-spin text-purple-400" />
                Retrieving project brief from database...
              </div>
            ) : brief ? (
              <>
                {/* Executive Summary */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-white">Project Executive Summary</h4>
                  <p className="p-4 rounded-xl bg-slate-950 border border-slate-800 leading-relaxed text-slate-300">
                    {brief.summary}
                  </p>
                </div>

                {/* Target Audience */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-white">Target Audience & User Personas</h4>
                  <p className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                    {brief.targetAudience}
                  </p>
                </div>

                {/* Tech Stack */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <Cpu className="h-4 w-4 text-purple-400" /> Recommended Technology Stack
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {brief.requiredTechStack.map((tech, idx) => (
                      <Badge key={idx} variant="secondary" className="px-3 py-1 text-xs bg-slate-950 border-slate-700">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Key Risks */}
                {brief.keyRisks && brief.keyRisks.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-white flex items-center gap-1.5 text-amber-400">
                      <AlertTriangle className="h-4 w-4" /> Potential Risks & Constraints
                    </h4>
                    <ul className="space-y-1.5 p-4 rounded-xl bg-amber-950/20 border border-amber-500/20 text-amber-200">
                      {brief.keyRisks.map((risk, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-amber-400 font-bold">•</span>
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="p-8 text-center space-y-3 bg-slate-950/60 rounded-2xl border border-slate-800">
                <Sparkles className="h-8 w-8 text-slate-500 mx-auto" />
                <h4 className="text-sm font-semibold text-white">Project Brief Not Generated Yet</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  A structured Project Brief is automatically generated once all essential project specifications
                  (budget, timeline, and at least 3 core features) are confirmed during the AI discovery interview.
                </p>
                <div className="pt-2">
                  <Badge variant="warning" className="text-xs">
                    Current Status: {lead.status.toUpperCase()}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Feature Breakdown (Only when brief exists) */}
        {activeTab === 'features' && brief && brief.features && (
          <div className="space-y-3">
            {brief.features.map((feat, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-white text-sm flex items-center gap-2">
                    <Layers className="h-4 w-4 text-indigo-400" />
                    {feat.name}
                  </h4>
                  <Badge
                    variant={
                      feat.complexity === 'High'
                        ? 'destructive'
                        : feat.complexity === 'Medium'
                        ? 'warning'
                        : 'success'
                    }
                    className="text-[10px]"
                  >
                    Complexity: {feat.complexity}
                  </Badge>
                </div>
                <p className="text-xs text-slate-400">{feat.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tab 5: JSON Output */}
        {activeTab === 'json' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Structured Data Payload (PostgreSQL)</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyJson}
                className="text-xs flex items-center gap-1.5"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied!' : 'Copy JSON'}
              </Button>
            </div>
            <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-indigo-300 overflow-x-auto max-h-[300px]">
              {JSON.stringify(brief?.structuredJson || lead, null, 2)}
            </pre>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex justify-end pt-4 border-t border-slate-800">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

      </div>
    </Dialog>
  );
}
