'use client';

import * as React from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Users,
  Settings,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Save,
  LogOut,
  Clock,
  MessageSquare,
  Globe,
  Phone,
  MapPin,
} from 'lucide-react';

interface DaySchedule {
  open: boolean;
  openTime: string;
  closeTime: string;
}

type WeeklySchedule = Record<string, DaySchedule>;

const DEFAULT_SCHEDULE: WeeklySchedule = {
  monday: { open: true, openTime: '09:00', closeTime: '17:00' },
  tuesday: { open: true, openTime: '09:00', closeTime: '17:00' },
  wednesday: { open: true, openTime: '09:00', closeTime: '17:00' },
  thursday: { open: true, openTime: '09:00', closeTime: '17:00' },
  friday: { open: true, openTime: '09:00', closeTime: '17:00' },
  saturday: { open: false, openTime: '09:00', closeTime: '17:00' },
  sunday: { open: false, openTime: '09:00', closeTime: '17:00' },
};

const DAYS_OF_WEEK = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

interface CompanyData {
  id: string;
  name: string;
  industry: string | null;
  teamSize: string | null;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  timezone?: string | null;
  businessHours?: {
    timezone: string | null;
    schedule: WeeklySchedule | null;
  } | null;
  communicationSettings?: {
    tone: string;
    responseDelay: string;
    signature: string | null;
    signatureEnabled: boolean;
  } | null;
}

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function CompanySettingsPage() {
  const router = useRouter();
  const [company, setCompany] = React.useState<CompanyData | null>(null);
  const [currentUser, setCurrentUser] = React.useState<UserData | null>(null);

  // Profile fields
  const [companyName, setCompanyName] = React.useState('');
  const [industry, setIndustry] = React.useState('Software Consulting');
  const [teamSize, setTeamSize] = React.useState('1-10');
  const [website, setWebsite] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [city, setCity] = React.useState('');
  const [stateRegion, setStateRegion] = React.useState('');
  const [country, setCountry] = React.useState('');
  const [timezone, setTimezone] = React.useState('UTC');

  // Business Hours
  const [schedule, setSchedule] = React.useState<WeeklySchedule>(DEFAULT_SCHEDULE);

  // Communication Settings
  const [tone, setTone] = React.useState('professional');
  const [responseDelay, setResponseDelay] = React.useState('immediate');
  const [signature, setSignature] = React.useState('');
  const [signatureEnabled, setSignatureEnabled] = React.useState(false);

  const [saving, setSaving] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);
  const [, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const authRes = await fetch('/api/auth/me');
        if (authRes.status === 401) {
          router.push('/login');
          return;
        }
        if (!authRes.ok) throw new Error('Please log in to view settings.');
        const authJson = await authRes.json();

        if (authJson.success && authJson.data) {
          const authCompany = authJson.data.company;
          setCurrentUser(authJson.data.user);

          // Fetch full company details including relations
          const compRes = await fetch(`/api/companies/${authCompany.id}`);
          if (compRes.ok) {
            const compJson = await compRes.json();
            if (compJson.success && compJson.data) {
              const c = compJson.data as CompanyData;
              setCompany(c);
              setCompanyName(c.name || '');
              if (c.industry) setIndustry(c.industry);
              if (c.teamSize) setTeamSize(c.teamSize);
              if (c.website) setWebsite(c.website);
              if (c.phone) setPhone(c.phone);
              if (c.address) setAddress(c.address);
              if (c.city) setCity(c.city);
              if (c.state) setStateRegion(c.state);
              if (c.country) setCountry(c.country);
              if (c.timezone) setTimezone(c.timezone);

              // Business hours
              if (c.businessHours && c.businessHours.schedule) {
                setSchedule({
                  ...DEFAULT_SCHEDULE,
                  ...c.businessHours.schedule,
                });
                if (c.businessHours.timezone) {
                  setTimezone(c.businessHours.timezone);
                }
              }

              // Communication settings
              if (c.communicationSettings) {
                if (c.communicationSettings.tone) setTone(c.communicationSettings.tone);
                if (c.communicationSettings.responseDelay) setResponseDelay(c.communicationSettings.responseDelay);
                if (c.communicationSettings.signature) setSignature(c.communicationSettings.signature);
                setSignatureEnabled(Boolean(c.communicationSettings.signatureEnabled));
              }
              return;
            }
          }

          // Fallback to auth company
          setCompany(authCompany);
          setCompanyName(authCompany.name || '');
          if (authCompany.industry) setIndustry(authCompany.industry);
          if (authCompany.teamSize) setTeamSize(authCompany.teamSize);
        }
      } catch (err: unknown) {
        if (err instanceof Error) setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [router]);

  const handleDayToggle = (dayKey: string) => {
    setSchedule((prev) => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        open: !prev[dayKey]?.open,
      },
    }));
  };

  const handleTimeChange = (dayKey: string, field: 'openTime' | 'closeTime', value: string) => {
    setSchedule((prev) => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        [field]: value,
      },
    }));
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;

    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: companyName,
          industry,
          teamSize,
          website: website.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          state: stateRegion.trim() || null,
          country: country.trim() || null,
          timezone: timezone.trim() || null,
          businessHours: {
            timezone: timezone.trim() || null,
            schedule,
          },
          communicationSettings: {
            tone,
            responseDelay,
            signature: signature.trim() || null,
            signatureEnabled,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update company settings.');
      }
      setCompany(json.data);
      setSuccessMsg('Company profile and communication settings saved successfully.');
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (err) {
      console.error(err);
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Link href="/dashboard" className="hover:text-white flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
          <span>/</span>
          <span className="text-slate-200">Company Settings</span>
        </div>

        <div className="flex items-center justify-between border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
              <Settings className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Company & Workspace Settings
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Manage your business profile, operating schedule, and AI customer communication preferences.
              </p>
            </div>
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

        <form onSubmit={handleSaveAll} className="space-y-6">
          {/* Section 1: Company Profile */}
          <Card className="p-6 border-slate-800 bg-slate-900/80 space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Building2 className="h-4 w-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white">Company Profile</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Company / Agency Name *
                </label>
                <Input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="bg-slate-950/70 border-slate-800 text-white text-xs"
                  placeholder="e.g. Acme Studio"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Industry / Domain
                </label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-800 bg-slate-950/70 px-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="Software Consulting">Software Consulting</option>
                  <option value="Web & Mobile Dev">Web & Mobile Dev</option>
                  <option value="Design & Product">Design & Product</option>
                  <option value="IT Services">IT Services</option>
                  <option value="Digital Marketing">Digital Marketing</option>
                  <option value="Legal & Finance">Legal & Finance</option>
                  <option value="E-Commerce">E-Commerce</option>
                  <option value="General Business">General Business</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Team Size
                </label>
                <select
                  value={teamSize}
                  onChange={(e) => setTeamSize(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-800 bg-slate-950/70 px-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="1-10">1-10 members</option>
                  <option value="11-50">11-50 members</option>
                  <option value="51-200">51-200 members</option>
                  <option value="200+">200+ members</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  <span className="flex items-center gap-1">
                    <Globe className="h-3 w-3 text-slate-400" /> Website
                  </span>
                </label>
                <Input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="bg-slate-950/70 border-slate-800 text-white text-xs"
                  placeholder="https://example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3 text-slate-400" /> Business Phone
                  </span>
                </label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="bg-slate-950/70 border-slate-800 text-white text-xs"
                  placeholder="+1 (555) 000-0000"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-slate-400" /> Business Timezone
                  </span>
                </label>
                <Input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="bg-slate-950/70 border-slate-800 text-white text-xs"
                  placeholder="e.g. America/New_York, UTC, Asia/Kolkata"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-slate-400" /> Business Street Address
                  </span>
                </label>
                <Input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="bg-slate-950/70 border-slate-800 text-white text-xs"
                  placeholder="123 Market St, Suite 400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  City
                </label>
                <Input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="bg-slate-950/70 border-slate-800 text-white text-xs"
                  placeholder="e.g. San Francisco"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    State / Region
                  </label>
                  <Input
                    type="text"
                    value={stateRegion}
                    onChange={(e) => setStateRegion(e.target.value)}
                    className="bg-slate-950/70 border-slate-800 text-white text-xs"
                    placeholder="CA"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Country
                  </label>
                  <Input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="bg-slate-950/70 border-slate-800 text-white text-xs"
                    placeholder="USA"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Section 2: Business Hours */}
          <Card className="p-6 border-slate-800 bg-slate-900/80 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-white">Business Hours & Operating Schedule</h2>
              </div>
              <span className="text-[11px] text-slate-400">
                Timezone: <span className="text-slate-200">{timezone || 'UTC'}</span>
              </span>
            </div>

            <p className="text-xs text-slate-400">
              Set the days and hours your business operates. The AI uses this as factual context when answering inquiries.
            </p>

            <div className="space-y-2.5">
              {DAYS_OF_WEEK.map(({ key, label }) => {
                const dayConfig = schedule[key] || { open: false, openTime: '09:00', closeTime: '17:00' };
                return (
                  <div
                    key={key}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border border-slate-800/80 bg-slate-950/50 gap-2 sm:gap-4"
                  >
                    <div className="flex items-center gap-3 w-32">
                      <input
                        type="checkbox"
                        id={`day-${key}`}
                        checked={dayConfig.open}
                        onChange={() => handleDayToggle(key)}
                        className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-0 focus:ring-offset-0 h-4 w-4 cursor-pointer"
                      />
                      <label
                        htmlFor={`day-${key}`}
                        className={`text-xs font-medium cursor-pointer ${
                          dayConfig.open ? 'text-white' : 'text-slate-500'
                        }`}
                      >
                        {label}
                      </label>
                    </div>

                    {dayConfig.open ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[11px] text-slate-400">Open:</span>
                        <Input
                          type="time"
                          value={dayConfig.openTime}
                          onChange={(e) => handleTimeChange(key, 'openTime', e.target.value)}
                          className="h-8 w-28 bg-slate-900 border-slate-800 text-white text-xs"
                        />
                        <span className="text-slate-500">to</span>
                        <Input
                          type="time"
                          value={dayConfig.closeTime}
                          onChange={(e) => handleTimeChange(key, 'closeTime', e.target.value)}
                          className="h-8 w-28 bg-slate-900 border-slate-800 text-white text-xs"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 italic">Closed</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Section 3: Communication Preferences */}
          <Card className="p-6 border-slate-800 bg-slate-900/80 space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <MessageSquare className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-white">Communication Preferences</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  AI Communication Tone
                </label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-800 bg-slate-950/70 px-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="professional">Professional (Courteous & clear)</option>
                  <option value="warm">Warm & Welcoming (Consultative)</option>
                  <option value="concise">Concise & Direct (Brief & focused)</option>
                  <option value="formal">Formal & Structured (Corporate)</option>
                  <option value="casual">Friendly & Approachable</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Guides the voice and phrasing used by the AI when interacting with customers.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Response Timing Preference
                </label>
                <select
                  value={responseDelay}
                  onChange={(e) => setResponseDelay(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-800 bg-slate-950/70 px-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="immediate">Immediate (Standard auto-reply)</option>
                  <option value="5_mins">5 minutes</option>
                  <option value="15_mins">15 minutes</option>
                  <option value="30_mins">30 minutes</option>
                  <option value="1_hour">1 hour</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Stored preference for customer response timing pacing.
                </p>
              </div>

              <div className="sm:col-span-2 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-300">
                    Default Email Signature
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="signature-enabled-toggle"
                      checked={signatureEnabled}
                      onChange={(e) => setSignatureEnabled(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer"
                    />
                    <label
                      htmlFor="signature-enabled-toggle"
                      className="text-xs text-slate-300 cursor-pointer font-medium"
                    >
                      Enable signature
                    </label>
                  </div>
                </div>

                <textarea
                  rows={4}
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder={`Best regards,\n${companyName || 'Team FillFlow'}\n${website || 'https://fillflow.io'}`}
                  className="w-full rounded-md border border-slate-800 bg-slate-950/70 p-3 text-xs text-white font-sans focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-500">
                  Company-owned email signature. Stored separately from AI knowledge.
                </p>
              </div>
            </div>
          </Card>

          {/* Action Bar */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="submit"
              variant="glow"
              size="sm"
              disabled={saving}
              className="text-xs px-6 py-2"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? 'Saving Changes...' : 'Save Settings'}
            </Button>
          </div>
        </form>

        {/* Section 4: Current Account & Membership */}
        <Card className="p-6 border-slate-800 bg-slate-900/80 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Users className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Your Account & Membership</h2>
          </div>

          {currentUser && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/50">
                  <div className="text-slate-400 text-[11px] mb-1">Name</div>
                  <div className="text-white font-medium">{currentUser.name}</div>
                </div>
                <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/50">
                  <div className="text-slate-400 text-[11px] mb-1">Email</div>
                  <div className="text-white font-mono">{currentUser.email}</div>
                </div>
                <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/50">
                  <div className="text-slate-400 text-[11px] mb-1">Workspace Role</div>
                  <Badge variant={currentUser.role === 'platform_admin' ? 'purple' : 'outline'} className="text-[10px]">
                    {currentUser.role}
                  </Badge>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Logged in as <span className="text-white">{currentUser.name}</span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="text-xs border-slate-700 bg-slate-950 text-slate-300 hover:text-rose-400 hover:border-rose-500/30"
                >
                  <LogOut className="h-3.5 w-3.5 mr-1.5" />
                  {loggingOut ? 'Signing out...' : 'Sign out of account'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </main>

      <Footer />
    </div>
  );
}
