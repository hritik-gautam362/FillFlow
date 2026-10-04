'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, Building2, User, Mail, Lock, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [companyName, setCompanyName] = React.useState('');
  const [industry, setIndustry] = React.useState('Software Consulting');
  const [teamSize, setTeamSize] = React.useState('1-10');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          companyName,
          industry,
          teamSize,
          email,
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create workspace account.');
      }

      // Redirect immediately to company onboarding wizard
      router.push('/onboarding');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-radial-[circle_at_50%_10%] from-indigo-950/30 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <Link href="/" className="flex items-center justify-center gap-2.5 mb-6 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition-transform">
            <Bot className="h-6 w-6" />
          </div>
          <span className="font-bold text-xl text-white tracking-tight">
            Fill<span className="text-indigo-400">Flow</span>
          </span>
        </Link>
        <h2 className="text-center text-2xl font-bold tracking-tight text-white">
          Create your company workspace
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-indigo-400 hover:text-indigo-300">
            Sign in
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <Card className="py-8 px-6 shadow-xl border border-slate-800 bg-slate-900/80 backdrop-blur-xl sm:px-10">
          {error && (
            <div className="mb-5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Company / Agency Name
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <Input
                  type="text"
                  required
                  placeholder="Acme Digital Agency"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="pl-9 bg-slate-950/60 border-slate-800 text-white placeholder:text-slate-600 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Industry
                </label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-800 bg-slate-950/60 px-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="Software Consulting">Software Consulting</option>
                  <option value="Web & Mobile Dev">Web & Mobile Dev</option>
                  <option value="Design & Product">Design & Product</option>
                  <option value="IT Services">IT Services</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Team Size
                </label>
                <select
                  value={teamSize}
                  onChange={(e) => setTeamSize(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-800 bg-slate-950/60 px-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="1-10">1-10 members</option>
                  <option value="11-50">11-50 members</option>
                  <option value="51-200">51-200 members</option>
                  <option value="200+">200+ members</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Your Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <Input
                  type="text"
                  required
                  placeholder="Sarah Connor"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-9 bg-slate-950/60 border-slate-800 text-white placeholder:text-slate-600 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Work Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <Input
                  type="email"
                  required
                  placeholder="sarah@agency.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 bg-slate-950/60 border-slate-800 text-white placeholder:text-slate-600 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <Input
                  type="password"
                  required
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 bg-slate-950/60 border-slate-800 text-white placeholder:text-slate-600 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="glow"
                className="w-full flex items-center justify-center gap-2"
                disabled={loading}
              >
                {loading ? 'Creating Workspace...' : 'Create Workspace'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 p-3 rounded-lg border border-slate-800/80 bg-slate-950/40 text-[11px] text-slate-400 space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> Web Automation active on launch
              </div>
              <p className="text-slate-500">
                WhatsApp and Email automations can be activated anytime by your platform administrator.
              </p>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
