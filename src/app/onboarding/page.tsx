'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Bot,
  Building2,
  Clock,
  BookOpen,
  ShieldCheck,
  Mail,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  Plus,
  Trash2,
  ExternalLink,
  RefreshCw,
  LogOut,
  Lock,
} from 'lucide-react';

interface CompanyProfile {
  id: string;
  name: string;
  industry?: string | null;
  teamSize?: string | null;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  timezone?: string | null;
  onboardingCompleted?: boolean;
  onboardingStep?: number;
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  category: string;
  verified: boolean;
}

interface PermissionTopicConfig {
  canAutoReply: boolean;
  requireApproval: boolean;
  allowedKeywords?: string[];
  restrictedKeywords?: string[];
}

interface DaySchedule {
  open: boolean;
  openTime: string;
  closeTime: string;
}

interface WeeklySchedule {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

const DEFAULT_SCHEDULE: WeeklySchedule = {
  monday: { open: true, openTime: '09:00', closeTime: '17:00' },
  tuesday: { open: true, openTime: '09:00', closeTime: '17:00' },
  wednesday: { open: true, openTime: '09:00', closeTime: '17:00' },
  thursday: { open: true, openTime: '09:00', closeTime: '17:00' },
  friday: { open: true, openTime: '09:00', closeTime: '17:00' },
  saturday: { open: false, openTime: '10:00', closeTime: '16:00' },
  sunday: { open: false, openTime: '10:00', closeTime: '16:00' },
};

const STEP_METADATA = [
  { step: 1, title: 'Welcome', icon: Sparkles, short: 'Overview' },
  { step: 2, title: 'Company Profile', icon: Building2, short: 'Profile' },
  { step: 3, title: 'Hours & Communication', icon: Clock, short: 'Preferences' },
  { step: 4, title: 'Teach FillFlow', icon: BookOpen, short: 'Knowledge' },
  { step: 5, title: 'AI Safety & Permissions', icon: ShieldCheck, short: 'Safety' },
  { step: 6, title: 'Connect Gmail', icon: Mail, short: 'Integrations' },
  { step: 7, title: 'Review & Finish', icon: CheckCircle2, short: 'Review' },
];

function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Root state
  const [loading, setLoading] = React.useState(true);
  const [savingStep, setSavingStep] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successNotice, setSuccessNotice] = React.useState<string | null>(null);

  const [user, setUser] = React.useState<UserProfile | null>(null);
  const [company, setCompany] = React.useState<CompanyProfile | null>(null);
  const [currentStep, setCurrentStep] = React.useState<number>(1);

  // Step 2: Company Profile state
  const [profileName, setProfileName] = React.useState('');
  const [profileIndustry, setProfileIndustry] = React.useState('');
  const [profileWebsite, setProfileWebsite] = React.useState('');
  const [profilePhone, setProfilePhone] = React.useState('');
  const [profileAddress, setProfileAddress] = React.useState('');
  const [profileCity, setProfileCity] = React.useState('');
  const [profileState, setProfileState] = React.useState('');
  const [profileCountry, setProfileCountry] = React.useState('');
  const [profileTimezone, setProfileTimezone] = React.useState('UTC');

  // Step 3: Business Hours & Communication
  const [schedule, setSchedule] = React.useState<WeeklySchedule>(DEFAULT_SCHEDULE);
  const [commTone, setCommTone] = React.useState('professional');
  const [commDelay, setCommDelay] = React.useState('immediate');
  const [commSignature, setCommSignature] = React.useState('');
  const [commSignatureEnabled, setCommSignatureEnabled] = React.useState(false);

  // Step 4: Knowledge
  const [knowledgeList, setKnowledgeList] = React.useState<KnowledgeItem[]>([]);
  const [newKnowledgeTitle, setNewKnowledgeTitle] = React.useState('');
  const [newKnowledgeContent, setNewKnowledgeContent] = React.useState('');
  const [newKnowledgeCategory, setNewKnowledgeCategory] = React.useState('company');
  const [addingKnowledge, setAddingKnowledge] = React.useState(false);

  // Step 5: AI Permissions
  const [autonomyMode, setAutonomyMode] = React.useState<'LIMITED_ACCESS' | 'NO_AUTONOMOUS_ACCESS'>('LIMITED_ACCESS');
  const [, setTopicPermissions] = React.useState<Record<string, PermissionTopicConfig>>({});

  // Step 6: Gmail Connection
  const [gmailStatus, setGmailStatus] = React.useState<string>('not_connected');
  const [gmailEmail, setGmailEmail] = React.useState<string | null>(null);
  const [checkingGmail, setCheckingGmail] = React.useState(false);

  // Refresh Gmail connection state
  const refreshGmailStatus = React.useCallback(async (companyIdOverride?: string) => {
    const cId = companyIdOverride || company?.id;
    if (!cId) return;

    setCheckingGmail(true);
    try {
      const connRes = await fetch(`/api/companies/${cId}/automations/email/connection?t=${Date.now()}`);
      if (connRes.ok) {
        const connJson = await connRes.json();
        if (connJson.success && connJson.data) {
          setGmailStatus(connJson.data.status || 'not_connected');
          setGmailEmail(connJson.data.displayName || null);
        }
      }
    } catch {
      // Ignore network hiccup
    } finally {
      setCheckingGmail(false);
    }
  }, [company?.id]);

  // Check auth and load real database records
  const loadWorkspaceData = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Authenticate user and resolve tenant session
      const meRes = await fetch('/api/auth/me');
      if (meRes.status === 401) {
        router.push('/login');
        return;
      }
      if (!meRes.ok) throw new Error('Failed to authenticate session.');
      const meData = await meRes.json();
      if (!meData.success || !meData.data?.company) {
        throw new Error('Active company workspace not found.');
      }

      const activeUser = meData.data.user;
      const activeCompany = meData.data.company;

      // Existing completed companies should not be in onboarding
      if (activeCompany.onboardingCompleted) {
        router.push('/dashboard');
        return;
      }

      setUser(activeUser);
      setCompany(activeCompany);

      // Resume behavior: read persisted step from DB
      const persistedStep = activeCompany.onboardingStep || 1;
      const stepParam = searchParams.get('step');
      const targetStep = stepParam ? Math.max(1, Math.min(7, parseInt(stepParam, 10))) : persistedStep;
      setCurrentStep(targetStep);

      // Pre-fill profile fields
      setProfileName(activeCompany.name || '');
      setProfileIndustry(activeCompany.industry || 'Software Consulting');
      setProfileWebsite(activeCompany.website || '');
      setProfilePhone(activeCompany.phone || '');
      setProfileAddress(activeCompany.address || '');
      setProfileCity(activeCompany.city || '');
      setProfileState(activeCompany.state || '');
      setProfileCountry(activeCompany.country || '');
      setProfileTimezone(activeCompany.timezone || 'UTC');

      // 2. Fetch full company detail (including businessHours & communicationSettings)
      const companyRes = await fetch(`/api/companies/${activeCompany.id}`);
      if (companyRes.ok) {
        const companyJson = await companyRes.json();
        if (companyJson.success && companyJson.data) {
          const comp = companyJson.data;
          if (comp.businessHours?.schedule) {
            setSchedule((prev) => ({ ...prev, ...comp.businessHours.schedule }));
          }
          if (comp.communicationSettings) {
            setCommTone(comp.communicationSettings.tone || 'professional');
            setCommDelay(comp.communicationSettings.responseDelay || 'immediate');
            setCommSignature(comp.communicationSettings.signature || '');
            setCommSignatureEnabled(Boolean(comp.communicationSettings.signatureEnabled));
          }
        }
      }

      // 3. Fetch Knowledge items
      const knowledgeRes = await fetch(`/api/companies/${activeCompany.id}/knowledge`);
      if (knowledgeRes.ok) {
        const knowledgeJson = await knowledgeRes.json();
        if (knowledgeJson.success && Array.isArray(knowledgeJson.data)) {
          setKnowledgeList(knowledgeJson.data);
        }
      }

      // 4. Fetch AI Permissions
      const permRes = await fetch(`/api/companies/${activeCompany.id}/control-center`);
      if (permRes.ok) {
        const permJson = await permRes.json();
        if (permJson.success && permJson.data) {
          setAutonomyMode(permJson.data.autonomyMode || 'LIMITED_ACCESS');
          setTopicPermissions(permJson.data.topicPermissions || {});
        }
      }

      // 5. Fetch Gmail Connection Status
      await refreshGmailStatus(activeCompany.id);

      // Handle OAuth return query params
      if (searchParams.get('google_connected') === 'true') {
        setSuccessNotice('Gmail connected successfully via Google OAuth 2.0.');
        setCurrentStep(6);
      } else if (searchParams.get('google_error')) {
        setError(`Google OAuth Error: ${decodeURIComponent(searchParams.get('google_error') || '')}`);
        setCurrentStep(6);
      }
    } catch (err: unknown) {
      console.error('[Onboarding Load Error]:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize workspace data.');
    } finally {
      setLoading(false);
    }
  }, [router, searchParams, refreshGmailStatus]);

  React.useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  // Persist current step to database
  const saveStepToDb = async (stepNumber: number) => {
    if (!company?.id) return;
    try {
      await fetch(`/api/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboardingStep: stepNumber }),
      });
      setCompany((prev) => (prev ? { ...prev, onboardingStep: stepNumber } : null));
    } catch (err) {
      console.warn('[Onboarding]: Failed to persist step state:', err);
    }
  };

  const navigateToStep = async (stepNumber: number) => {
    setError(null);
    setSuccessNotice(null);
    const safeStep = Math.max(1, Math.min(7, stepNumber));
    setCurrentStep(safeStep);
    await saveStepToDb(safeStep);
  };

  // Step 2 Save: Company Profile
  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!company?.id) return;

    if (!profileName.trim()) {
      setError('Company / Workspace name is required.');
      return;
    }
    if (!profileIndustry.trim()) {
      setError('Industry is required.');
      return;
    }

    setSavingStep(true);
    setError(null);

    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileName.trim(),
          industry: profileIndustry.trim(),
          website: profileWebsite.trim() || null,
          phone: profilePhone.trim() || null,
          address: profileAddress.trim() || null,
          city: profileCity.trim() || null,
          state: profileState.trim() || null,
          country: profileCountry.trim() || null,
          timezone: profileTimezone.trim() || null,
          onboardingStep: 3,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update company profile.');
      }

      setCompany((prev) => ({
        ...(prev || {}),
        id: company.id,
        name: profileName.trim(),
        industry: profileIndustry.trim(),
        onboardingStep: 3,
      }));
      setCurrentStep(3);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error updating profile.');
    } finally {
      setSavingStep(false);
    }
  };

  // Step 3 Save: Business Hours & Communication
  const handleSaveHoursAndComm = async () => {
    if (!company?.id) return;
    setSavingStep(true);
    setError(null);

    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessHours: {
            timezone: profileTimezone,
            schedule,
          },
          communicationSettings: {
            tone: commTone,
            responseDelay: commDelay,
            signature: commSignature.trim() || null,
            signatureEnabled: commSignatureEnabled,
          },
          onboardingStep: 4,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update hours & communication settings.');
      }

      setCurrentStep(4);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error saving settings.');
    } finally {
      setSavingStep(false);
    }
  };

  // Step 4: Add Knowledge
  const handleAddKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company?.id) return;
    if (!newKnowledgeTitle.trim() || !newKnowledgeContent.trim()) {
      setError('Title and knowledge details are required.');
      return;
    }

    setAddingKnowledge(true);
    setError(null);

    try {
      const res = await fetch(`/api/companies/${company.id}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newKnowledgeTitle.trim(),
          content: newKnowledgeContent.trim(),
          category: newKnowledgeCategory,
          verified: true,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to save knowledge item.');
      }

      setKnowledgeList((prev) => [json.data, ...prev]);
      setNewKnowledgeTitle('');
      setNewKnowledgeContent('');
      setSuccessNotice('Knowledge entry added successfully!');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add knowledge.');
    } finally {
      setAddingKnowledge(false);
    }
  };

  // Step 4: Delete Knowledge
  const handleDeleteKnowledge = async (itemId: string) => {
    if (!company?.id) return;
    try {
      const res = await fetch(`/api/companies/${company.id}/knowledge/${itemId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setKnowledgeList((prev) => prev.filter((k) => k.id !== itemId));
      }
    } catch (err) {
      console.error('Failed to delete knowledge item:', err);
    }
  };

  // Step 5 Save: AI Permissions
  const handleSavePermissions = async () => {
    if (!company?.id) return;
    setSavingStep(true);
    setError(null);

    try {
      const res = await fetch(`/api/companies/${company.id}/control-center`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autonomyMode,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update AI permissions.');
      }

      await saveStepToDb(6);
      setCurrentStep(6);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save permissions.');
    } finally {
      setSavingStep(false);
    }
  };

  // Step 6: Connect Gmail
  const handleConnectGmail = () => {
    if (!company?.id) return;
    window.location.href = `/api/integrations/google/start?companyId=${encodeURIComponent(
      company.id
    )}&returnTo=/onboarding`;
  };

  // Step 7: Finish Setup
  const handleFinishSetup = async () => {
    if (!company?.id) return;
    setSavingStep(true);
    setError(null);

    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboardingCompleted: true,
          onboardingCompletedAt: new Date().toISOString(),
          onboardingStep: 7,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to complete onboarding.');
      }

      // Route smoothly to the company dashboard
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to finalize setup.');
      setSavingStep(false);
    }
  };

  // Sign out helper
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch {
      router.push('/login');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-500 mb-3" />
        <p className="text-sm font-medium">Preparing your FillFlow workspace...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 text-white shadow-md shadow-indigo-500/20">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <span className="font-bold text-lg text-white tracking-tight">
                Fill<span className="text-indigo-400">Flow</span>
              </span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                Guided Setup
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-block text-xs text-slate-400">
              {company?.name} ({user?.email})
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="text-xs text-slate-400 hover:text-white border-slate-800"
            >
              <LogOut className="h-3.5 w-3.5 mr-1" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col justify-start">
        {/* Progress Bar & Steps Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold text-slate-300">
              Step {currentStep} of 7: {STEP_METADATA[currentStep - 1]?.title}
            </span>
            <span>{Math.round((currentStep / 7) * 100)}% Completed</span>
          </div>

          {/* Progress bar track */}
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-6">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
              style={{ width: `${(currentStep / 7) * 100}%` }}
            />
          </div>

          {/* Step Pills for Desktop */}
          <div className="hidden sm:grid grid-cols-7 gap-2">
            {STEP_METADATA.map((m) => {
              const isCurrent = m.step === currentStep;
              const isPast = m.step < currentStep;
              const StepIcon = m.icon;

              return (
                <button
                  key={m.step}
                  onClick={() => navigateToStep(m.step)}
                  className={`flex items-center gap-1.5 p-2 rounded-lg text-xs font-medium border transition-all text-left ${
                    isCurrent
                      ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/30'
                      : isPast
                      ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-400 hover:border-slate-700'
                      : 'border-slate-800/80 bg-slate-900/40 text-slate-500 hover:text-slate-400'
                  }`}
                >
                  <StepIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{m.short}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Global Alert Notification */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-slate-400 hover:text-slate-200 text-sm font-bold"
            >
              ×
            </button>
          </div>
        )}

        {successNotice && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{successNotice}</span>
            </div>
            <button
              onClick={() => setSuccessNotice(null)}
              className="text-slate-400 hover:text-slate-200 text-sm font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* Wizard Card Body */}
        <Card className="border border-slate-800 bg-slate-900/80 backdrop-blur-xl shadow-2xl p-6 sm:p-8 rounded-2xl">
          {/* ================= STEP 1: WELCOME ================= */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center max-w-xl mx-auto space-y-2">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-400 mb-2">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  Welcome to FillFlow
                </h1>
                <p className="text-sm text-slate-400">
                  Let&apos;s get your AI workspace ready to manage customer communication safely and efficiently.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/50 space-y-2">
                  <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
                    <Bot className="h-4 w-4" />
                    <span>Understand Customer Needs</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    FillFlow analyzes inbound client messages across your communication channels with contextual comprehension.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/50 space-y-2">
                  <div className="flex items-center gap-2 text-purple-400 font-semibold text-sm">
                    <BookOpen className="h-4 w-4" />
                    <span>Teach Your Company Rules</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Provide knowledge about your services, pricing policies, and guidelines so the AI operates within your bounds.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/50 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                    <ShieldCheck className="h-4 w-4" />
                    <span>AI Safety & Approvals</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Low-risk topics can auto-reply, while commercial commitments, refunds, and contracts require your explicit authorization.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/50 space-y-2">
                  <div className="flex items-center gap-2 text-sky-400 font-semibold text-sm">
                    <Mail className="h-4 w-4" />
                    <span>Seamless Email Automation</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Connect your business Gmail securely via OAuth 2.0 to automate drafts and customer qualification.
                  </p>
                </div>
              </div>

              <div className="pt-6 flex justify-end">
                <Button
                  onClick={() => navigateToStep(2)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-6 py-2 shadow-lg shadow-indigo-600/30"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* ================= STEP 2: COMPANY PROFILE ================= */}
          {currentStep === 2 && (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-indigo-400" />
                  Company Profile
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Tell us about your organization. Required fields help FillFlow tailor customer communications.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Company / Organization Name <span className="text-rose-400">*</span>
                  </label>
                  <Input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="e.g. Acme Studio"
                    className="bg-slate-950 border-slate-800 text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Industry <span className="text-rose-400">*</span>
                  </label>
                  <Input
                    type="text"
                    value={profileIndustry}
                    onChange={(e) => setProfileIndustry(e.target.value)}
                    placeholder="e.g. Software Consulting, Marketing Agency"
                    className="bg-slate-950 border-slate-800 text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Website URL (Optional)
                  </label>
                  <Input
                    type="url"
                    value={profileWebsite}
                    onChange={(e) => setProfileWebsite(e.target.value)}
                    placeholder="https://example.com"
                    className="bg-slate-950 border-slate-800 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Business Phone (Optional)
                  </label>
                  <Input
                    type="text"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="bg-slate-950 border-slate-800 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Timezone (Optional)
                  </label>
                  <Input
                    type="text"
                    value={profileTimezone}
                    onChange={(e) => setProfileTimezone(e.target.value)}
                    placeholder="e.g. America/New_York, UTC, Asia/Kolkata"
                    className="bg-slate-950 border-slate-800 text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Street Address (Optional)
                  </label>
                  <Input
                    type="text"
                    value={profileAddress}
                    onChange={(e) => setProfileAddress(e.target.value)}
                    placeholder="123 Business Way, Suite 400"
                    className="bg-slate-950 border-slate-800 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    City (Optional)
                  </label>
                  <Input
                    type="text"
                    value={profileCity}
                    onChange={(e) => setProfileCity(e.target.value)}
                    placeholder="San Francisco"
                    className="bg-slate-950 border-slate-800 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    State / Region (Optional)
                  </label>
                  <Input
                    type="text"
                    value={profileState}
                    onChange={(e) => setProfileState(e.target.value)}
                    placeholder="California"
                    className="bg-slate-950 border-slate-800 text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Country (Optional)
                  </label>
                  <Input
                    type="text"
                    value={profileCountry}
                    onChange={(e) => setProfileCountry(e.target.value)}
                    placeholder="United States"
                    className="bg-slate-950 border-slate-800 text-sm"
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-slate-800 flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigateToStep(1)}
                  className="border-slate-800 text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Back
                </Button>

                <Button
                  type="submit"
                  disabled={savingStep}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                >
                  {savingStep ? 'Saving...' : 'Save & Continue'}
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </form>
          )}

          {/* ================= STEP 3: BUSINESS HOURS & COMMUNICATION ================= */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Clock className="h-5 w-5 text-indigo-400" />
                  Business Hours & Communication
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Define your operating schedule and how FillFlow should draft email responses. You can also skip this and adjust anytime later.
                </p>
              </div>

              {/* Business Hours */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Operating Hours Schedule
                </h3>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
                  {(Object.keys(schedule) as (keyof WeeklySchedule)[]).map((dayKey) => {
                    const dayData = schedule[dayKey];
                    return (
                      <div
                        key={dayKey}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1 border-b border-slate-800/40 last:border-0"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id={`day-${dayKey}`}
                            checked={dayData.open}
                            onChange={(e) =>
                              setSchedule((prev) => ({
                                ...prev,
                                [dayKey]: { ...prev[dayKey], open: e.target.checked },
                              }))
                            }
                            className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                          />
                          <label
                            htmlFor={`day-${dayKey}`}
                            className={`text-xs font-medium capitalize w-24 cursor-pointer ${
                              dayData.open ? 'text-slate-200' : 'text-slate-500'
                            }`}
                          >
                            {dayKey}
                          </label>
                        </div>

                        {dayData.open ? (
                          <div className="flex items-center gap-2 text-xs text-slate-400 pl-6 sm:pl-0">
                            <span>From:</span>
                            <Input
                              type="time"
                              value={dayData.openTime}
                              onChange={(e) =>
                                setSchedule((prev) => ({
                                  ...prev,
                                  [dayKey]: { ...prev[dayKey], openTime: e.target.value },
                                }))
                              }
                              className="w-24 h-7 text-xs bg-slate-900 border-slate-800 py-0"
                            />
                            <span>To:</span>
                            <Input
                              type="time"
                              value={dayData.closeTime}
                              onChange={(e) =>
                                setSchedule((prev) => ({
                                  ...prev,
                                  [dayKey]: { ...prev[dayKey], closeTime: e.target.value },
                                }))
                              }
                              className="w-24 h-7 text-xs bg-slate-900 border-slate-800 py-0"
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600 italic pl-6 sm:pl-0">
                            Closed
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Communication Preferences */}
              <div className="space-y-4 pt-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Email Communication Preferences
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Response Tone
                    </label>
                    <select
                      value={commTone}
                      onChange={(e) => setCommTone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="professional">Professional (Standard corporate tone)</option>
                      <option value="friendly">Friendly (Warm and conversational)</option>
                      <option value="concise">Concise (Brief, direct answers)</option>
                      <option value="formal">Formal (Executive and structured)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Response Timing Preference
                    </label>
                    <select
                      value={commDelay}
                      onChange={(e) => setCommDelay(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="immediate">Immediate (Fastest turnaround)</option>
                      <option value="short_delay">Short delay (Paced: 1-2 minutes)</option>
                      <option value="thoughtful_delay">Thoughtful delay (Batched: 5-10 minutes)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-300">
                      Company Email Signature
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={commSignatureEnabled}
                        onChange={(e) => setCommSignatureEnabled(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                      />
                      <span>Include signature on outgoing emails</span>
                    </label>
                  </div>
                  <textarea
                    rows={3}
                    value={commSignature}
                    onChange={(e) => setCommSignature(e.target.value)}
                    placeholder="Best regards,&#10;Team Acme&#10;contact@acme.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-md p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-slate-800 flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigateToStep(2)}
                  className="border-slate-800 text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Back
                </Button>

                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => navigateToStep(4)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Skip for now
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSaveHoursAndComm}
                    disabled={savingStep}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                  >
                    {savingStep ? 'Saving...' : 'Save & Continue'}
                    <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 4: TEACH FILLFLOW ================= */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-indigo-400" />
                  Teach FillFlow
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  What should FillFlow know about your company? Add knowledge items below so the AI understands your services, pricing guidelines, and workflows.
                </p>
              </div>

              {/* Add Knowledge Form */}
              <form
                onSubmit={handleAddKnowledge}
                className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-3"
              >
                <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5 text-indigo-400" />
                  Add Knowledge Item
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Title
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. Core Consulting Offerings & Timelines"
                      value={newKnowledgeTitle}
                      onChange={(e) => setNewKnowledgeTitle(e.target.value)}
                      className="bg-slate-900 border-slate-800 text-xs h-9"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Category
                    </label>
                    <select
                      value={newKnowledgeCategory}
                      onChange={(e) => setNewKnowledgeCategory(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-md px-2.5 h-9 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="company">About Company</option>
                      <option value="services">Services & Products</option>
                      <option value="commercial">Pricing & Policies</option>
                      <option value="partnerships">Partnerships</option>
                      <option value="communication">Communication</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Details / Guidelines
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. We provide custom web and mobile development. Typical project timelines are 4 to 8 weeks. Pricing begins at $5,000 for discovery and MVP build."
                    value={newKnowledgeContent}
                    onChange={(e) => setNewKnowledgeContent(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-md p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={addingKnowledge || !newKnowledgeTitle.trim() || !newKnowledgeContent.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-8"
                  >
                    {addingKnowledge ? 'Adding...' : 'Add Knowledge'}
                  </Button>
                </div>
              </form>

              {/* Knowledge Items List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Saved Knowledge ({knowledgeList.length})
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Persisted in PostgreSQL
                  </span>
                </div>

                {knowledgeList.length === 0 ? (
                  <div className="p-6 text-center rounded-xl border border-dashed border-slate-800 bg-slate-950/30 text-slate-500 text-xs">
                    No knowledge items added yet. You can add one above or configure knowledge later from the AI Control Center.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {knowledgeList.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-lg border border-slate-800 bg-slate-950/40 flex items-start justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">
                              {item.title}
                            </span>
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-indigo-500/30 text-indigo-400">
                              {item.category}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-400 line-clamp-2">
                            {item.content}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteKnowledge(item.id)}
                          className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                          title="Delete knowledge item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-slate-800 flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigateToStep(3)}
                  className="border-slate-800 text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Back
                </Button>

                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => navigateToStep(5)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Skip for now
                  </Button>
                  <Button
                    type="button"
                    onClick={() => navigateToStep(5)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                  >
                    Continue
                    <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 5: AI SAFETY & PERMISSIONS ================= */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-indigo-400" />
                  AI Safety & Permissions
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  FillFlow automatically handles low-risk conversations while sensitive commercial and legal actions require your approval.
                </p>
              </div>

              {/* Autonomy Mode Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  AI Autonomy Mode
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => setAutonomyMode('LIMITED_ACCESS')}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      autonomyMode === 'LIMITED_ACCESS'
                        ? 'border-indigo-500/60 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white">
                        Limited Autonomy (Recommended)
                      </span>
                      {autonomyMode === 'LIMITED_ACCESS' && (
                        <CheckCircle2 className="h-4 w-4 text-indigo-400" />
                      )}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Safe topics (company intro, services, tech stack) can auto-respond. All pricing, legal, and SLA requests trigger human review.
                    </p>
                  </div>

                  <div
                    onClick={() => setAutonomyMode('NO_AUTONOMOUS_ACCESS')}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      autonomyMode === 'NO_AUTONOMOUS_ACCESS'
                        ? 'border-indigo-500/60 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white">
                        Strict / Manual Review Only
                      </span>
                      {autonomyMode === 'NO_AUTONOMOUS_ACCESS' && (
                        <CheckCircle2 className="h-4 w-4 text-indigo-400" />
                      )}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Zero automated replies. Every incoming conversation produces a draft that must be manually approved in the Approval Queue.
                    </p>
                  </div>
                </div>
              </div>

              {/* Topic Permissions Overview */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Topic Guardrails & Safeguards
                </h3>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 divide-y divide-slate-800/40 text-xs">
                  {/* Safe Topics */}
                  <div className="p-3.5 flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200">
                          General Information & Services
                        </span>
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-emerald-500/30 text-emerald-400">
                          Low Risk
                        </Badge>
                      </div>
                      <p className="text-slate-400">
                        Company overview, capabilities, technologies, and team qualifications.
                      </p>
                    </div>
                    <span className="text-emerald-400 font-medium shrink-0">
                      Auto-Reply Safe
                    </span>
                  </div>

                  {/* Commercial Topics */}
                  <div className="p-3.5 flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200">
                          Pricing, Discounts & Refunds
                        </span>
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-500/30 text-amber-400">
                          Commercial
                        </Badge>
                      </div>
                      <p className="text-slate-400">
                        Fee quotations, promotional discounts, and refund agreements.
                      </p>
                    </div>
                    <span className="text-amber-400 font-medium shrink-0 flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      Requires Approval
                    </span>
                  </div>

                  {/* Legal Topics */}
                  <div className="p-3.5 flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200">
                          Contracts, SLAs & Guarantees
                        </span>
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-rose-500/30 text-rose-400">
                          High Risk
                        </Badge>
                      </div>
                      <p className="text-slate-400">
                        Formal contracts, legal liability commitments, delivery guarantees.
                      </p>
                    </div>
                    <span className="text-rose-400 font-medium shrink-0 flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      Locked to Humans
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-800 flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigateToStep(4)}
                  className="border-slate-800 text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Back
                </Button>

                <Button
                  type="button"
                  onClick={handleSavePermissions}
                  disabled={savingStep}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                >
                  {savingStep ? 'Saving...' : 'Save & Continue'}
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ================= STEP 6: CONNECT GMAIL ================= */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Mail className="h-5 w-5 text-indigo-400" />
                  Connect Gmail
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  FillFlow can use your business Gmail to understand customer emails and respond according to your AI permissions.
                </p>
              </div>

              {gmailStatus === 'connected' ? (
                <div className="p-6 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-center space-y-3">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-bold text-white">
                    Gmail Connected Successfully
                  </h3>
                  <p className="text-xs text-slate-300">
                    Your mailbox <span className="font-semibold text-white">{gmailEmail || 'Business Gmail'}</span> is connected and synchronized with FillFlow AI automation.
                  </p>
                  <div className="pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => refreshGmailStatus()}
                      disabled={checkingGmail}
                      className="text-xs border-slate-700 text-slate-300"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${checkingGmail ? 'animate-spin' : ''}`} />
                      Refresh Connection Status
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-xl border border-slate-800 bg-slate-950/60 text-center space-y-4">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-400">
                    <Mail className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white">
                      Connect your business Gmail
                    </h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                      Authorize FillFlow securely via Google OAuth 2.0. No passwords or tokens are stored in the browser, and you can disconnect anytime.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                    <Button
                      onClick={handleConnectGmail}
                      className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium px-6 shadow-lg shadow-indigo-600/20"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Connect Gmail via Google
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => refreshGmailStatus()}
                      disabled={checkingGmail}
                      className="w-full sm:w-auto text-xs border-slate-800 text-slate-400 hover:text-white"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${checkingGmail ? 'animate-spin' : ''}`} />
                      Check Status
                    </Button>
                  </div>
                </div>
              )}

              <div className="pt-6 border-t border-slate-800 flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigateToStep(5)}
                  className="border-slate-800 text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Back
                </Button>

                <div className="flex items-center gap-3">
                  {gmailStatus !== 'connected' && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => navigateToStep(7)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Skip for now
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={() => navigateToStep(7)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                  >
                    Continue to Review
                    <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 7: REVIEW & FINISH ================= */}
          {currentStep === 7 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-indigo-400" />
                  Review & Finish Setup
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Here is the setup readiness checklist based on your live workspace database.
                </p>
              </div>

              {/* Checklist based on actual DB records */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 divide-y divide-slate-800/40 text-xs">
                {/* 1. Company Profile */}
                <div className="p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      ✓
                    </div>
                    <div>
                      <p className="font-semibold text-slate-200">Company Profile</p>
                      <p className="text-slate-400">
                        {profileName} &bull; {profileIndustry}
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">
                    Complete
                  </Badge>
                </div>

                {/* 2. AI Safety & Permissions */}
                <div className="p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      ✓
                    </div>
                    <div>
                      <p className="font-semibold text-slate-200">AI Safety & Permissions</p>
                      <p className="text-slate-400">
                        {autonomyMode === 'LIMITED_ACCESS'
                          ? 'Limited Autonomy (Safe topics auto-reply)'
                          : 'Strict Manual Review (All messages queued)'}
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">
                    Complete
                  </Badge>
                </div>

                {/* 3. Company Knowledge */}
                <div className="p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
                        knowledgeList.length > 0
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {knowledgeList.length > 0 ? '✓' : '!'}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-200">Company Knowledge</p>
                      <p className="text-slate-400">
                        {knowledgeList.length > 0
                          ? `${knowledgeList.length} verified item(s) saved in PostgreSQL`
                          : 'No knowledge items added yet'}
                      </p>
                    </div>
                  </div>
                  {knowledgeList.length > 0 ? (
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">
                      Complete
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px]">
                      Recommended
                    </Badge>
                  )}
                </div>

                {/* 4. Business Hours & Communication */}
                <div className="p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      ✓
                    </div>
                    <div>
                      <p className="font-semibold text-slate-200">Communication Preferences</p>
                      <p className="text-slate-400">
                        Tone: {commTone} &bull; Timing: {commDelay}
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">
                    Configured
                  </Badge>
                </div>

                {/* 5. Gmail Connection */}
                <div className="p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
                        gmailStatus === 'connected'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {gmailStatus === 'connected' ? '✓' : '!'}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-200">Gmail Integration</p>
                      <p className="text-slate-400">
                        {gmailStatus === 'connected'
                          ? `Connected (${gmailEmail || 'Google Mail'})`
                          : 'Not connected (Optional, connect from Email Automation)'}
                      </p>
                    </div>
                  </div>
                  {gmailStatus === 'connected' ? (
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px]">
                      Recommended
                    </Badge>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 text-xs text-slate-300 space-y-1">
                <p className="font-semibold text-indigo-300">Ready to Launch Workspace</p>
                <p className="text-slate-400 leading-relaxed">
                  Your workspace is ready. Clicking &quot;Finish Setup&quot; will mark onboarding as complete and take you directly to your company dashboard.
                </p>
              </div>

              <div className="pt-6 border-t border-slate-800 flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigateToStep(6)}
                  className="border-slate-800 text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Back
                </Button>

                <Button
                  type="button"
                  onClick={handleFinishSetup}
                  disabled={savingStep}
                  className="bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-medium px-6 py-2 shadow-lg shadow-indigo-600/20"
                >
                  {savingStep ? 'Finalizing Setup...' : 'Finish Setup & Launch Dashboard'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
          <RefreshCw className="h-8 w-8 animate-spin text-indigo-500 mb-3" />
          <p className="text-sm font-medium">Loading FillFlow Onboarding...</p>
        </div>
      }
    >
      <OnboardingWizard />
    </React.Suspense>
  );
}
