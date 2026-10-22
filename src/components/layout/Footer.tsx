import Link from 'next/link';
import { FileSpreadsheet, Layers, ShieldCheck, Zap } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';

export function Footer() {
  return (
    <footer className="w-full border-t border-[#1f375e] bg-[#152644] text-slate-300 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Brand Column */}
        <div className="space-y-4 md:col-span-1">
          <Logo variant="full" size="sm" href="/" />
          <p className="text-xs leading-relaxed text-slate-400">
            Automating lead qualification and requirement collection for software & IT service companies.
          </p>
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium pt-1">
            <ShieldCheck className="h-4 w-4" />
            AI Discovery & Inbound Scoping
          </div>
        </div>

        {/* Column 2: Product */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Product</h4>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/dashboard" className="hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                Company Dashboard
              </Link>
            </li>
            <li>
              <Link href="/dashboard/automations/email" className="hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-purple-400" />
                Email Automation
              </Link>
            </li>
            <li>
              <Link href="/dashboard" className="hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                Structured Excel Export
              </Link>
            </li>
          </ul>
        </div>

        {/* Column 3: Workflow */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Workflow</h4>
          <ul className="space-y-2 text-sm text-slate-400">
            <li>1. WhatsApp & Gmail Inbound</li>
            <li>2. Contextual AI Qualification</li>
            <li>3. Scope & Budget Extraction</li>
            <li>4. Structured Project Brief</li>
          </ul>
        </div>

        {/* Column 4: Agency Value */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Why FillFlow?</h4>
          <p className="text-xs leading-relaxed text-slate-400">
            Instead of spending days in slow email exchanges and losing cold leads overnight, get structured project briefs automatically.
          </p>
          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
            <span className="font-semibold text-indigo-300">Continuous Inbound Triage:</span> Capture and structure customer requirements round the clock.
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl mt-12 pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
        <p>© {new Date().getFullYear()} FillFlow SaaS. Built for IT & Software Service Companies.</p>
        <div className="flex items-center gap-4 sm:gap-6">
          <Link href="/privacy" className="hover:text-slate-300 transition-colors">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-slate-300 transition-colors">
            Terms of Service
          </Link>
          <span className="text-slate-600 hidden sm:inline">•</span>
          <span className="text-slate-400">Gmail & WhatsApp Ready</span>
        </div>
      </div>
    </footer>
  );
}
