'use client';

import Link from 'next/link';
import { ArrowRight, Bot, CheckCircle2, Sparkles, FileText, FileSpreadsheet, ShieldCheck, Zap, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28">
      {/* Glow gradient backdrops */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-tr from-indigo-600/20 via-purple-600/20 to-transparent blur-[120px] pointer-events-none rounded-full" />
      <div className="absolute top-40 right-10 w-[300px] h-[300px] bg-emerald-500/10 blur-[100px] pointer-events-none rounded-full" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Hero Text */}
          <div className="lg:col-span-7 space-y-6 text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-medium text-indigo-300 backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
              <span>Built Specially for 10-50 Employee IT Agencies</span>
              <span className="h-1 w-1 rounded-full bg-indigo-400"></span>
              <span className="text-emerald-400 font-semibold">Zero Lost Leads</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
              Turn Messy Client Chats into{' '}
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
                Structured Project Briefs
              </span>{' '}
              Automatically.
            </h1>

            <p className="text-lg sm:text-xl text-slate-300 max-w-2xl font-normal leading-relaxed">
              Never let a late-night lead go cold again. FillFlow engages prospects 24/7 on WhatsApp & Web, qualifies budget & scope, and delivers clean, structured requirements directly to your team.
            </p>

            {/* Feature Pills */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>Instant 24/7 Qualification on WhatsApp</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>Auto-Extracted Scope, Budget & Tech Stack</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>One-Click Excel / CSV Requirements Export</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>Modular Architecture Ready for AI & DB</span>
              </div>
            </div>

            {/* Primary Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-4">
              <Link href="/chat">
                <Button variant="glow" size="lg" className="w-full sm:w-auto flex items-center justify-center gap-2 text-base">
                  <MessageSquare className="h-5 w-5" />
                  Try Interactive Client Chat
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>

              <Link href="/dashboard">
                <Button variant="outline" size="lg" className="w-full sm:w-auto flex items-center justify-center gap-2 border-slate-700 bg-slate-900/80">
                  <Zap className="h-4 w-4 text-amber-400" />
                  Explore Company Dashboard
                </Button>
              </Link>
            </div>

            {/* Social Proof Metric */}
            <div className="pt-4 flex items-center gap-6 border-t border-slate-800/80">
              <div>
                <p className="text-2xl font-bold text-white">100%</p>
                <p className="text-xs text-slate-400">Response Speed under 2 seconds</p>
              </div>
              <div className="h-8 w-px bg-slate-800"></div>
              <div>
                <p className="text-2xl font-bold text-indigo-400">3.5x</p>
                <p className="text-xs text-slate-400">Faster Project Scoping</p>
              </div>
              <div className="h-8 w-px bg-slate-800"></div>
              <div>
                <p className="text-2xl font-bold text-emerald-400">0</p>
                <p className="text-xs text-slate-400">Manual Requirements Notes</p>
              </div>
            </div>
          </div>

          {/* Right Column: Dynamic SaaS UI Showcase Preview */}
          <div className="lg:col-span-5 relative">
            <Card className="border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-md overflow-hidden">
              {/* Card Window Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500/80"></div>
                  <div className="h-3 w-3 rounded-full bg-amber-500/80"></div>
                  <div className="h-3 w-3 rounded-full bg-emerald-500/80"></div>
                  <span className="ml-2 text-xs font-medium text-slate-400">Live AI Transformation Engine</span>
                </div>
                <Badge variant="purple" className="py-0 text-[10px]">
                  Real-Time AI
                </Badge>
              </div>

              <div className="p-5 space-y-4">
                {/* Simulated Raw Chat Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1 text-slate-300 font-medium">
                      <MessageSquare className="h-3.5 w-3.5 text-indigo-400" />
                      Client WhatsApp Message (10:32 PM)
                    </span>
                    <span className="text-emerald-400 font-mono text-[11px]">Inbound Received</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-xs text-slate-300 leading-relaxed font-mono">
                    &quot;Hi ApexByte team! We need a mobile app for our delivery drivers + a web portal. Budget is around $30k, launch in 8 weeks. Must have live GPS & WhatsApp updates.&quot;
                  </div>
                </div>

                {/* Arrow animation */}
                <div className="flex items-center justify-center py-1">
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
                    <Bot className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
                    <span>AI Agent Extractor Active</span>
                  </div>
                </div>

                {/* Structured JSON Output Card */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1 text-slate-300 font-medium">
                      <FileText className="h-3.5 w-3.5 text-purple-400" />
                      Structured Project Brief Output
                    </span>
                    <span className="text-indigo-400 font-semibold text-[11px] flex items-center gap-1">
                      <FileSpreadsheet className="h-3.5 w-3.5" /> Ready for Excel
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/90 border border-indigo-500/30 space-y-3 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="font-semibold text-white">UrbanCart Delivery Hub</span>
                      <Badge variant="success">92% Qualified</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2 rounded bg-slate-900 border border-slate-800">
                        <span className="text-slate-400 block">Est. Budget</span>
                        <span className="font-semibold text-emerald-400">$25k - $35k</span>
                      </div>
                      <div className="p-2 rounded bg-slate-900 border border-slate-800">
                        <span className="text-slate-400 block">Timeline</span>
                        <span className="font-semibold text-white">8 - 10 Weeks</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400">Extracted Tech Stack & Features:</span>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        <Badge variant="secondary" className="text-[10px]">React Native</Badge>
                        <Badge variant="secondary" className="text-[10px]">Next.js Admin</Badge>
                        <Badge variant="secondary" className="text-[10px]">GPS Tracking</Badge>
                        <Badge variant="secondary" className="text-[10px]">WhatsApp API</Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                  <span className="flex items-center gap-1 text-slate-400">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Auto-saved to Dashboard
                  </span>
                  <Link href="/dashboard" className="text-indigo-400 hover:underline font-medium">
                    View in Dashboard &rarr;
                  </Link>
                </div>
              </div>
            </Card>
          </div>

        </div>
      </div>
    </section>
  );
}
