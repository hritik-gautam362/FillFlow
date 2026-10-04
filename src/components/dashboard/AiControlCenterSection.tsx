'use client';

import * as React from 'react';
import {
  AIPermissionLevel,
  AIAutonomyMode,
  CompanyTopicPolicies,
  CompanyPermissionConfig,
  CompanyKnowledgeItem,
  CompanyKnowledgeCategory,
  TeachAiSuggestion,
} from '@/lib/ai/permissionTypes';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ShieldCheck,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
  Sparkles,
  BookOpen,
  Plus,
  Check,
  CheckCircle2,
  Trash2,
  Lock,
  Layers,
  Sliders,
  RefreshCw,
  Lightbulb,
} from 'lucide-react';

interface AiControlCenterSectionProps {
  companyId: string;
}

interface CapabilityDefinition {
  key: keyof CompanyTopicPolicies;
  label: string;
  category: 'General Information' | 'Commercial' | 'Delivery & Operations' | 'Partnerships' | 'Legal & High Risk';
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  whatHappens: string;
  isImmutable?: boolean;
}

const CAPABILITIES: CapabilityDefinition[] = [
  // 1. General Information
  {
    key: 'generalInfo',
    label: 'General Information',
    category: 'General Information',
    risk: 'LOW',
    whatHappens: 'AI may automatically answer questions about company history, mission, business hours, and general FAQs using verified knowledge.',
  },
  {
    key: 'services',
    label: 'Services',
    category: 'General Information',
    risk: 'LOW',
    whatHappens: 'AI may automatically answer questions about verified capabilities and active service offerings.',
  },
  {
    key: 'technologies',
    label: 'Technologies',
    category: 'General Information',
    risk: 'LOW',
    whatHappens: 'AI may automatically share technical frameworks and verified tech stack capabilities.',
  },
  {
    key: 'businessHours',
    label: 'Business Hours',
    category: 'General Information',
    risk: 'LOW',
    whatHappens: 'AI may automatically provide operating hours, office locations, and timezones.',
  },
  {
    key: 'qualificationQuestions',
    label: 'Qualification Questions',
    category: 'General Information',
    risk: 'LOW',
    whatHappens: 'AI may ask follow-up scoping questions to gather client requirements.',
  },

  // 2. Commercial
  {
    key: 'pricing',
    label: 'Pricing',
    category: 'Commercial',
    risk: 'HIGH',
    whatHappens: 'AI may understand pricing requests and prepare drafts, but cannot commit to pricing without approval.',
  },
  {
    key: 'discounts',
    label: 'Discounts',
    category: 'Commercial',
    risk: 'HIGH',
    whatHappens: 'Commercial discounts and price concessions require human review before dispatch.',
  },
  {
    key: 'commission',
    label: 'Commission',
    category: 'Commercial',
    risk: 'HIGH',
    whatHappens: 'Referral commissions and commercial fee percentages require company approval.',
  },
  {
    key: 'revenueShare',
    label: 'Revenue Share',
    category: 'Commercial',
    risk: 'HIGH',
    whatHappens: 'Percentage-based or recurring revenue-share models require human review.',
  },
  {
    key: 'refunds',
    label: 'Refunds',
    category: 'Commercial',
    risk: 'HIGH',
    whatHappens: 'Refund requests and billing disputes are held for management approval.',
  },
  {
    key: 'paymentTerms',
    label: 'Payment Terms',
    category: 'Commercial',
    risk: 'HIGH',
    whatHappens: 'Deferred payment terms (Net-30/60) or custom milestone schedules require finance review.',
  },
  {
    key: 'customCommercialTerms',
    label: 'Custom Commercial Terms',
    category: 'Commercial',
    risk: 'HIGH',
    whatHappens: 'Non-standard fee structures and tailored financial arrangements require approval.',
  },

  // 3. Delivery & Operations
  {
    key: 'deliveryTimelines',
    label: 'Delivery Timelines',
    category: 'Delivery & Operations',
    risk: 'MEDIUM',
    whatHappens: 'Estimated launch schedules and project milestones are prepared for review.',
  },
  {
    key: 'deadlines',
    label: 'Firm Deadlines',
    category: 'Delivery & Operations',
    risk: 'HIGH',
    whatHappens: 'Committing to strict completion dates under penalty requires engineering confirmation.',
  },
  {
    key: 'slas',
    label: 'SLAs',
    category: 'Delivery & Operations',
    risk: 'HIGH',
    whatHappens: 'Contractual uptime, response-time, or performance targets require technical authorization.',
  },
  {
    key: 'clientCommunication',
    label: 'Client Communication',
    category: 'Delivery & Operations',
    risk: 'MEDIUM',
    whatHappens: 'Confirming whether company speaks directly with referred clients requires review.',
  },

  // 4. Partnerships
  {
    key: 'partnerships',
    label: 'Partnerships',
    category: 'Partnerships',
    risk: 'MEDIUM',
    whatHappens: 'Strategic agency partnerships or white-label collaborations require team review.',
  },
  {
    key: 'referralArrangements',
    label: 'Referral Arrangements',
    category: 'Partnerships',
    risk: 'MEDIUM',
    whatHappens: 'Discussing introductory terms and referral relationships requires approval.',
  },

  // 5. Legal & High Risk
  {
    key: 'contracts',
    label: 'Contracts',
    category: 'Legal & High Risk',
    risk: 'CRITICAL',
    whatHappens: 'Executing binding commercial or service contracts is strictly blocked from autonomous acceptance.',
    isImmutable: true,
  },
  {
    key: 'ndaAcceptance',
    label: 'NDA Acceptance',
    category: 'Legal & High Risk',
    risk: 'CRITICAL',
    whatHappens: 'Accepting legal non-disclosure or confidentiality agreements cannot be done autonomously.',
    isImmutable: true,
  },
  {
    key: 'legalCommitments',
    label: 'Legal Commitments',
    category: 'Legal & High Risk',
    risk: 'CRITICAL',
    whatHappens: 'Power of attorney or binding legal representations are strictly blocked.',
    isImmutable: true,
  },
  {
    key: 'exclusivity',
    label: 'Exclusivity',
    category: 'Legal & High Risk',
    risk: 'CRITICAL',
    whatHappens: 'Agreeing to exclusive vendor arrangements or non-compete clauses is strictly blocked.',
    isImmutable: true,
  },
  {
    key: 'guarantees',
    label: 'Guarantees',
    category: 'Legal & High Risk',
    risk: 'CRITICAL',
    whatHappens: 'Binding performance, uptime, or commercial guarantees are strictly blocked from autonomous commitment.',
    isImmutable: true,
  },
];

export function AiControlCenterSection({ companyId }: AiControlCenterSectionProps) {
  const [config, setConfig] = React.useState<CompanyPermissionConfig | null>(null);
  const [knowledgeItems, setKnowledgeItems] = React.useState<CompanyKnowledgeItem[]>([]);
  const [suggestions, setSuggestions] = React.useState<TeachAiSuggestion[]>([]);
  const [, setLoading] = React.useState(true);
  const [savingPolicy, setSavingPolicy] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'matrix' | 'knowledge' | 'teach'>('matrix');

  // New Knowledge Modal state
  const [isAddKnowledgeOpen, setIsAddKnowledgeOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState('');
  const [newContent, setNewContent] = React.useState('');
  const [newCategory, setNewCategory] = React.useState<CompanyKnowledgeCategory>('company');
  const [newVerified, setNewVerified] = React.useState(true);
  const [isCreatingKnowledge, setIsCreatingKnowledge] = React.useState(false);

  // Teach AI review modal state
  const [selectedSuggestion, setSelectedSuggestion] = React.useState<TeachAiSuggestion | null>(null);

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [ctrlRes, knowRes, teachRes] = await Promise.all([
        fetch(`/api/companies/${companyId}/control-center`),
        fetch(`/api/companies/${companyId}/knowledge`),
        fetch(`/api/companies/${companyId}/knowledge/teach`),
      ]);

      if (ctrlRes.ok) {
        const cJson = await ctrlRes.json();
        if (cJson.success) setConfig(cJson.data);
      }
      if (knowRes.ok) {
        const kJson = await knowRes.json();
        if (kJson.success) setKnowledgeItems(kJson.data);
      }
      if (teachRes.ok) {
        const tJson = await teachRes.json();
        if (tJson.success) setSuggestions(tJson.data.filter((s: TeachAiSuggestion) => s.status === 'PENDING'));
      }
    } catch (err) {
      console.error('[AI Control Center] Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  React.useEffect(() => {
    if (companyId) loadData();
  }, [companyId, loadData]);

  // Handle Autonomy Mode change
  const handleSetAutonomyMode = async (mode: AIAutonomyMode) => {
    if (!config) return;
    try {
      const res = await fetch(`/api/companies/${companyId}/control-center`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autonomyMode: mode }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setConfig(json.data);
      }
    } catch (err) {
      console.error('Failed to update autonomy mode:', err);
    }
  };

  // Handle Emergency Outbound Pause
  const handleToggleEmergencyPause = async () => {
    if (!config) return;
    const nextState = !config.outboundPaused;
    try {
      const res = await fetch(`/api/companies/${companyId}/control-center`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outboundPaused: nextState }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setConfig(json.data);
      }
    } catch (err) {
      console.error('Failed to toggle emergency pause:', err);
    }
  };

  // Handle Topic Policy Level change
  const handleSetTopicPolicy = async (key: keyof CompanyTopicPolicies, level: AIPermissionLevel) => {
    if (!config || !config.topicPolicies) return;
    setSavingPolicy(true);
    const updatedPolicies = {
      ...config.topicPolicies,
      [key]: level,
    };

    try {
      const res = await fetch(`/api/companies/${companyId}/control-center`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicPolicies: updatedPolicies }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setConfig(json.data);
      }
    } catch (err) {
      console.error('Failed to update topic policy:', err);
    } finally {
      setSavingPolicy(false);
    }
  };

  // Handle Knowledge Create
  const handleCreateKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    setIsCreatingKnowledge(true);

    try {
      const res = await fetch(`/api/companies/${companyId}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          content: newContent.trim(),
          category: newCategory,
          verified: newVerified,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setKnowledgeItems((prev) => [...prev, json.data]);
          setIsAddKnowledgeOpen(false);
          setNewTitle('');
          setNewContent('');
        }
      }
    } catch (err) {
      console.error('Failed to create knowledge item:', err);
    } finally {
      setIsCreatingKnowledge(false);
    }
  };

  // Handle Knowledge Delete
  const handleDeleteKnowledge = async (itemId: string) => {
    try {
      const res = await fetch(`/api/companies/${companyId}/knowledge/${itemId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setKnowledgeItems((prev) => prev.filter((k) => k.id !== itemId));
      }
    } catch (err) {
      console.error('Failed to delete knowledge item:', err);
    }
  };

  // Handle Knowledge Verify
  const handleVerifyKnowledge = async (itemId: string) => {
    try {
      const res = await fetch(`/api/companies/${companyId}/knowledge/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', verifiedBy: 'Company Admin' }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setKnowledgeItems((prev) => prev.map((k) => (k.id === itemId ? json.data : k)));
        }
      }
    } catch (err) {
      console.error('Failed to verify knowledge item:', err);
    }
  };

  // Handle Teach AI Suggestion Action
  const handleTeachAiAction = async (suggestionId: string, action: 'accept' | 'dismiss') => {
    try {
      const res = await fetch(`/api/companies/${companyId}/knowledge/teach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          suggestionId,
          customEdits: selectedSuggestion
            ? {
                title: selectedSuggestion.suggestionText.slice(0, 45),
                content: selectedSuggestion.suggestionText,
                category: selectedSuggestion.suggestedCategory,
              }
            : undefined,
        }),
      });
      if (res.ok) {
        setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
        setSelectedSuggestion(null);
        if (action === 'accept') {
          // Refresh knowledge items
          const knowRes = await fetch(`/api/companies/${companyId}/knowledge`);
          if (knowRes.ok) {
            const kJson = await knowRes.json();
            if (kJson.success) setKnowledgeItems(kJson.data);
          }
        }
      }
    } catch (err) {
      console.error('Failed to handle Teach AI suggestion:', err);
    }
  };

  const categories = [
    'General Information',
    'Commercial',
    'Delivery & Operations',
    'Partnerships',
    'Legal & High Risk',
  ] as const;

  return (
    <div className="space-y-6">
      {/* SECTION HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-transparent border border-indigo-500/30">
            <Sliders className="h-6 w-6 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-white">AI Control Center</h2>
              <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-300 border-indigo-500/30">
                Phase 2
              </Badge>
            </div>
            <p className="text-xs text-slate-400">
              Control what FillFlow can read, decide, draft, and send on your company&apos;s behalf.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Emergency Pause Button */}
          <Button
            size="sm"
            variant={config?.outboundPaused ? 'destructive' : 'outline'}
            onClick={handleToggleEmergencyPause}
            className="flex items-center gap-1.5 text-xs font-semibold"
          >
            {config?.outboundPaused ? (
              <>
                <PlayCircle className="h-4 w-4" /> Resume Outbound
              </>
            ) : (
              <>
                <PauseCircle className="h-4 w-4 text-amber-400" /> Pause AI Outbound
              </>
            )}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={loadData}
            className="text-xs text-slate-400 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* PERSISTENT EMERGENCY PAUSE BANNER */}
      {config?.outboundPaused && (
        <div className="p-4 rounded-xl bg-rose-950/70 border border-rose-600/60 text-rose-200 flex items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-rose-300">
                AI Outbound Paused
              </div>
              <p className="text-xs text-rose-200/90">
                All customer responses require human approval before sending. Autonomous responses are completely halted.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleToggleEmergencyPause}
            className="text-xs bg-rose-900 border-rose-500/50 text-white hover:bg-rose-800 shrink-0"
          >
            Resume Outbound
          </Button>
        </div>
      )}

      {/* TOP-LEVEL AI AUTONOMY CARD */}
      <Card className="p-5 border-slate-800 bg-slate-900/90 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-400" />
              AI Access
            </h3>
            <p className="text-xs text-slate-400">
              The AI behaves like a controlled employee, not an unrestricted autonomous agent.
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              config?.autonomyMode === 'LIMITED_ACCESS'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }
          >
            AI ACCESS: {config?.autonomyMode === 'LIMITED_ACCESS' ? 'Limited Access' : 'No Autonomous Access'}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* LIMITED ACCESS */}
          <div
            onClick={() => handleSetAutonomyMode('LIMITED_ACCESS')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              config?.autonomyMode === 'LIMITED_ACCESS'
                ? 'bg-indigo-950/40 border-indigo-500/60 ring-1 ring-indigo-500/40'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                  <span className="text-xs font-bold text-white">Limited Access</span>
                  <Badge variant="outline" className="text-[9px] bg-slate-800 text-slate-300 border-slate-700">Mode A</Badge>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  AI may automatically respond to customers only when the requested topic is explicitly permitted by company policy (AUTO) and passes all safety and response validation checks.
                </p>
              </div>
              <div className="text-xs text-indigo-400 font-semibold shrink-0">
                {config?.autonomyMode === 'LIMITED_ACCESS' && <Check className="h-4 w-4" />}
              </div>
            </div>
          </div>

          {/* NO AUTONOMOUS ACCESS / HUMAN APPROVAL ONLY */}
          <div
            onClick={() => handleSetAutonomyMode('NO_AUTONOMOUS_ACCESS')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              config?.autonomyMode === 'NO_AUTONOMOUS_ACCESS'
                ? 'bg-amber-950/30 border-amber-500/60 ring-1 ring-amber-500/40'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
                  <span className="text-xs font-bold text-white">No Autonomous Access</span>
                  <Badge variant="outline" className="text-[9px] bg-slate-800 text-slate-300 border-slate-700">Mode B</Badge>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  AI reads, classifies, extracts requirements, and generates 3 draft variations, but <strong>NEVER directly sends a customer-facing reply</strong>. Every response routes to the Approval Queue.
                </p>
              </div>
              <div className="text-xs text-amber-400 font-semibold shrink-0">
                {config?.autonomyMode === 'NO_AUTONOMOUS_ACCESS' && <Check className="h-4 w-4" />}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* NAVIGATION TABS: MATRIX vs KNOWLEDGE vs TEACH AI */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('matrix')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'matrix'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          Permission Matrix
        </button>

        <button
          onClick={() => setActiveTab('knowledge')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'knowledge'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <BookOpen className="h-3.5 w-3.5" />
          Company Knowledge ({knowledgeItems.length})
        </button>

        <button
          onClick={() => setActiveTab('teach')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'teach'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
          Teach AI Suggestions
          {suggestions.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-bold">
              {suggestions.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: PERMISSION MATRIX */}
      {activeTab === 'matrix' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Configure AI capability boundaries per topic.</span>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> 🟢 AUTO: AI answers verified knowledge
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-400" /> 🟡 APPROVAL: Held for review &amp; 3 variations
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-400" /> 🔴 BLOCKED: AI never autonomously commits
              </span>
            </div>
          </div>

          {categories.map((cat) => {
            const items = CAPABILITIES.filter((c) => c.category === cat);
            return (
              <Card key={cat} className="p-4 border-slate-800 bg-slate-900/80 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">{cat}</h4>
                  {cat === 'Legal & High Risk' && (
                    <Badge variant="outline" className="text-[10px] bg-rose-950/40 text-rose-300 border-rose-800 flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Immutable Safety Layer
                    </Badge>
                  )}
                </div>

                {/* Table Header: Topic | AI Access | Risk | What happens */}
                <div className="hidden md:grid grid-cols-12 gap-3 px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800/60">
                  <div className="col-span-3">Topic</div>
                  <div className="col-span-3">AI Access</div>
                  <div className="col-span-2">Risk</div>
                  <div className="col-span-4">What happens</div>
                </div>

                <div className="divide-y divide-slate-800/60">
                  {items.map((item) => {
                    const currentLevel: AIPermissionLevel =
                      config?.topicPolicies?.[item.key] || 'APPROVAL';
                    const isLocked = item.isImmutable;

                    return (
                      <div
                        key={item.key}
                        className="py-3 px-1 md:px-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-xs"
                      >
                        {/* 1. Topic */}
                        <div className="col-span-12 md:col-span-3 flex items-center gap-2">
                          <span className="font-semibold text-white">{item.label}</span>
                          {isLocked && (
                            <span title="Immutable safety rule: cannot be set to AUTO">
                              <Lock className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                            </span>
                          )}
                        </div>

                        {/* 2. AI Access */}
                        <div className="col-span-12 md:col-span-3 flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                          {/* AUTO */}
                          <button
                            disabled={isLocked || savingPolicy}
                            onClick={() => handleSetTopicPolicy(item.key, 'AUTO')}
                            title={isLocked ? 'Immutable safety rule: cannot be set to AUTO' : 'AI can respond automatically when safe'}
                            className={`flex-1 py-1 text-center rounded text-[11px] font-semibold transition-all ${
                              currentLevel === 'AUTO'
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'text-slate-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed'
                            }`}
                          >
                            AUTO
                          </button>

                          {/* APPROVAL */}
                          <button
                            disabled={savingPolicy}
                            onClick={() => handleSetTopicPolicy(item.key, 'APPROVAL')}
                            title="AI can draft but company approval is required"
                            className={`flex-1 py-1 text-center rounded text-[11px] font-semibold transition-all ${
                              currentLevel === 'APPROVAL'
                                ? 'bg-amber-600 text-white shadow-sm'
                                : 'text-slate-400 hover:text-white disabled:opacity-20'
                            }`}
                          >
                            APPROVAL
                          </button>

                          {/* BLOCKED */}
                          <button
                            disabled={savingPolicy}
                            onClick={() => handleSetTopicPolicy(item.key, 'BLOCKED')}
                            title="AI must not respond autonomously and must escalate appropriately"
                            className={`flex-1 py-1 text-center rounded text-[11px] font-semibold transition-all ${
                              currentLevel === 'BLOCKED'
                                ? 'bg-rose-600 text-white shadow-sm'
                                : 'text-slate-400 hover:text-white disabled:opacity-30'
                            }`}
                          >
                            BLOCKED
                          </button>
                        </div>

                        {/* 3. Risk */}
                        <div className="col-span-12 md:col-span-2">
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-bold ${
                              item.risk === 'CRITICAL'
                                ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                                : item.risk === 'HIGH'
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                : item.risk === 'MEDIUM'
                                ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            }`}
                          >
                            {item.risk}
                          </Badge>
                        </div>

                        {/* 4. What happens */}
                        <div className="col-span-12 md:col-span-4 text-slate-400 text-[11px] leading-relaxed">
                          {item.whatHappens}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* TAB 2: COMPANY KNOWLEDGE CENTER */}
      {activeTab === 'knowledge' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Authoritative company knowledge repository. Only <strong>VERIFIED</strong> knowledge can be answered automatically.
            </p>
            <Button
              size="sm"
              onClick={() => setIsAddKnowledgeOpen(true)}
              className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500"
            >
              <Plus className="h-3.5 w-3.5" /> Add Knowledge Item
            </Button>
          </div>

          {knowledgeItems.length === 0 ? (
            <Card className="p-8 text-center border-slate-800 bg-slate-900/60">
              <BookOpen className="h-8 w-8 text-slate-600 mx-auto mb-2" />
              <h4 className="text-sm font-semibold text-slate-300">No Knowledge Items Yet</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Add verified services, business policies, or tech stack details so FillFlow AI can answer customer inquiries accurately.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {knowledgeItems.map((item) => (
                <Card
                  key={item.id}
                  className="p-4 border-slate-800 bg-slate-900/80 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-bold text-white">{item.title}</h4>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge
                          variant="outline"
                          className={
                            item.verified
                              ? 'text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }
                        >
                          {item.verified ? 'VERIFIED' : 'UNVERIFIED'}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] bg-slate-800 text-slate-300 border-slate-700 capitalize">
                          {item.category}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{item.content}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Source: {item.source}</span>
                    <div className="flex items-center gap-2">
                      {!item.verified && (
                        <button
                          onClick={() => handleVerifyKnowledge(item.id)}
                          className="text-emerald-400 hover:text-emerald-300 font-semibold"
                        >
                          Verify Now
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteKnowledge(item.id)}
                        className="text-rose-400 hover:text-rose-300 p-1"
                        title="Delete item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TEACH AI SUGGESTIONS */}
      {activeTab === 'teach' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            FillFlow detects unverified facts from customer conversations and proposes them for review. Suggestions <strong>never</strong> become authoritative knowledge without explicit company verification.
          </p>

          {suggestions.length === 0 ? (
            <Card className="p-8 text-center border-slate-800 bg-slate-900/60">
              <Sparkles className="h-8 w-8 text-indigo-400/50 mx-auto mb-2" />
              <h4 className="text-sm font-semibold text-slate-300">All Suggestions Reviewed</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No pending suggestions. When customer conversations discuss new facts, they will appear here for verification.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {suggestions.map((sug) => (
                <Card
                  key={sug.id}
                  className="p-4 border-slate-800 bg-slate-900/90 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-300 border-amber-500/30">
                        Conversation Suggestion
                      </Badge>
                      <Badge variant="outline" className="text-[10px] bg-slate-800 text-slate-300 border-slate-700 capitalize">
                        {sug.suggestedCategory}
                      </Badge>
                    </div>
                    <p className="text-xs font-semibold text-white">{sug.suggestionText}</p>
                    <p className="text-[11px] text-slate-400 italic">
                      Source snippet: &quot;{sug.sourceSnippet}&quot;
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => handleTeachAiAction(sug.id, 'accept')}
                      className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Add to Knowledge
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTeachAiAction(sug.id, 'dismiss')}
                      className="text-xs border-slate-700 text-slate-400 hover:text-white"
                    >
                      Ignore
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: ADD KNOWLEDGE ITEM */}
      {isAddKnowledgeOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 border-slate-800 bg-slate-950 text-white space-y-4">
            <h3 className="text-base font-bold text-white">Add Company Knowledge</h3>
            <p className="text-xs text-slate-400">
              Only verified knowledge can be answered automatically by FillFlow AI.
            </p>

            <form onSubmit={handleCreateKnowledge} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400">Title</label>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Next.js & Mobile App Stack"
                  className="bg-slate-900 border-slate-800 text-xs mt-1"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-slate-400">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as CompanyKnowledgeCategory)}
                  className="w-full mt-1 px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800 text-xs text-slate-200"
                >
                  <option value="company">Company Information</option>
                  <option value="services">Services</option>
                  <option value="technologies">Technologies</option>
                  <option value="pricing_rules">Pricing Rules</option>
                  <option value="commercial_policies">Commercial Policies</option>
                  <option value="partnerships">Partnerships</option>
                  <option value="communication_preferences">Communication Preferences</option>
                  <option value="delivery_policies">Delivery Policies</option>
                  <option value="custom_instructions">Custom Instructions</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400">Content</label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Explain the verified factual knowledge in detail..."
                  rows={4}
                  className="w-full mt-1 p-2.5 rounded-md bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="verifiedCheck"
                  checked={newVerified}
                  onChange={(e) => setNewVerified(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="verifiedCheck" className="text-xs text-slate-300">
                  Mark as explicitly verified company policy
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddKnowledgeOpen(false)}
                  className="text-xs border-slate-800 text-slate-400"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isCreatingKnowledge}
                  className="text-xs bg-indigo-600 hover:bg-indigo-500"
                >
                  {isCreatingKnowledge ? 'Saving...' : 'Save Knowledge'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
