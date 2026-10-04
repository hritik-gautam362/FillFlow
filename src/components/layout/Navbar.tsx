'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bot,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  Shield,
  LogOut,
  Sparkles,
  ChevronDown,
  Layers,
  Menu,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface CompanyProfile {
  id: string;
  name: string;
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = React.useState<UserProfile | null>(null);
  const [company, setCompany] = React.useState<CompanyProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [automationsMenuOpen, setAutomationsMenuOpen] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  React.useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            setUser(json.data.user);
            setCompany(json.data.company);
          }
        }
      } catch {
        // Not logged in or network error
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setCompany(null);
      router.push('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const isPlatformAdmin = user?.role === 'platform_admin';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo & Company Scope */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 text-white shadow-md shadow-indigo-500/30 group-hover:scale-105 transition-transform">
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white tracking-tight">
                  Fill<span className="text-indigo-400">Flow</span>
                </span>
                {company && (
                  <Badge variant="purple" className="py-0 px-2 text-[10px] hidden sm:inline-flex max-w-[140px] truncate">
                    {company.name}
                  </Badge>
                )}
              </div>
              <span className="text-[10px] text-slate-400 hidden md:block">
                B2B AI Discovery & Onboarding
              </span>
            </div>
          </Link>
        </div>

        {/* Primary Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 text-sm">
          <Link
            href="/dashboard"
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
              pathname === '/dashboard'
                ? 'bg-slate-800/90 text-white font-medium'
                : 'text-slate-300 hover:text-white hover:bg-slate-900'
            }`}
          >
            <LayoutDashboard className="h-4 w-4 text-indigo-400" />
            Dashboard
          </Link>

          {/* Automations Dropdown */}
          <div className="relative">
            <button
              onClick={() => setAutomationsMenuOpen(!automationsMenuOpen)}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                pathname.startsWith('/dashboard/automations')
                  ? 'bg-slate-800/90 text-white font-medium'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Layers className="h-4 w-4 text-cyan-400" />
              Automations
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>

            {automationsMenuOpen && (
              <div
                className="absolute left-0 mt-2 w-52 rounded-xl border border-slate-800 bg-slate-900/95 backdrop-blur-xl shadow-xl py-1 z-50"
                onMouseLeave={() => setAutomationsMenuOpen(false)}
              >
                <Link
                  href="/dashboard/automations/web"
                  onClick={() => setAutomationsMenuOpen(false)}
                  className="block px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <div className="font-semibold text-white">Web Automation</div>
                  <div className="text-[10px] text-slate-400">Website AI chat & scoping</div>
                </Link>
                <Link
                  href="/dashboard/automations/whatsapp"
                  onClick={() => setAutomationsMenuOpen(false)}
                  className="block px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <div className="font-semibold text-white">WhatsApp Automation</div>
                  <div className="text-[10px] text-slate-400">Meta Cloud API discovery</div>
                </Link>
                <Link
                  href="/dashboard/automations/email"
                  onClick={() => setAutomationsMenuOpen(false)}
                  className="block px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <div className="font-semibold text-white">Email Automation</div>
                  <div className="text-[10px] text-slate-400">Inbound RFP scoping</div>
                </Link>
              </div>
            )}
          </div>

          <Link
            href="/chat"
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
              pathname === '/chat'
                ? 'bg-slate-800/90 text-white font-medium'
                : 'text-slate-300 hover:text-white hover:bg-slate-900'
            }`}
          >
            <MessageSquareText className="h-4 w-4 text-emerald-400" />
            Web Chat
          </Link>

          <Link
            href="/dashboard/settings"
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
              pathname === '/dashboard/settings'
                ? 'bg-slate-800/90 text-white font-medium'
                : 'text-slate-300 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Settings className="h-4 w-4 text-slate-400" />
            Settings
          </Link>

          {/* Platform Admin link (only for platform_admin role) */}
          {isPlatformAdmin && (
            <Link
              href="/admin/companies"
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                pathname.startsWith('/admin')
                  ? 'bg-purple-900/50 text-purple-200 border border-purple-500/40 font-medium'
                  : 'text-purple-300 hover:text-purple-200 hover:bg-purple-950/40'
              }`}
            >
              <Shield className="h-4 w-4 text-purple-400" />
              Platform Admin
            </Link>
          )}
        </nav>

        {/* User Account / Auth Actions & Mobile Hamburger */}
        <div className="flex items-center gap-2 sm:gap-3">
          {loading ? (
            <div className="h-8 w-20 bg-slate-800/60 rounded-md animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-medium text-white">{user.name}</span>
                <span className="text-[10px] text-slate-400">{user.email}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="text-xs h-8 px-2 sm:px-2.5 border-slate-800 bg-slate-900/60 text-slate-400 hover:text-rose-400 hover:bg-rose-950/20"
                title="Log out"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline ml-1.5">Sign out</span>
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm" className="text-xs text-slate-300 hover:text-white">
                  Sign In
                </Button>
              </Link>
              <Link href="/signup">
                <Button variant="glow" size="sm" className="text-xs flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Get Started</span>
                  <span className="sm:hidden">Join</span>
                </Button>
              </Link>
            </div>
          )}

          {/* Mobile Menu Hamburger Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-800 bg-slate-950/95 backdrop-blur-xl px-4 pt-3 pb-5 space-y-2">
          <Link
            href="/dashboard"
            onClick={() => setMobileMenuOpen(false)}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 text-xs font-medium transition-colors ${
              pathname === '/dashboard' ? 'bg-slate-800 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-900'
            }`}
          >
            <LayoutDashboard className="h-4 w-4 text-indigo-400" />
            Dashboard
          </Link>

          <div className="pl-3 py-1 space-y-1">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">Automations</span>
            <Link
              href="/dashboard/automations/web"
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3 py-1.5 rounded-md text-xs transition-colors ${
                pathname === '/dashboard/automations/web' ? 'text-indigo-400 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Web Automation
            </Link>
            <Link
              href="/dashboard/automations/whatsapp"
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3 py-1.5 rounded-md text-xs transition-colors ${
                pathname === '/dashboard/automations/whatsapp' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              WhatsApp Automation
            </Link>
            <Link
              href="/dashboard/automations/email"
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3 py-1.5 rounded-md text-xs transition-colors ${
                pathname === '/dashboard/automations/email' ? 'text-purple-400 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Email Automation
            </Link>
          </div>

          <Link
            href="/chat"
            onClick={() => setMobileMenuOpen(false)}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 text-xs font-medium transition-colors ${
              pathname === '/chat' ? 'bg-slate-800 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-900'
            }`}
          >
            <MessageSquareText className="h-4 w-4 text-emerald-400" />
            Client Web Chat
          </Link>

          <Link
            href="/dashboard/settings"
            onClick={() => setMobileMenuOpen(false)}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 text-xs font-medium transition-colors ${
              pathname === '/dashboard/settings' ? 'bg-slate-800 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Settings className="h-4 w-4 text-slate-400" />
            Company Settings
          </Link>

          {isPlatformAdmin && (
            <Link
              href="/admin/companies"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg flex items-center gap-2 text-xs font-medium bg-purple-950/40 text-purple-300 border border-purple-500/30"
            >
              <Shield className="h-4 w-4 text-purple-400" />
              Platform Admin
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
