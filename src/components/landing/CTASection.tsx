import Link from 'next/link';
import { ArrowRight, Bot, MessageSquare, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CTASection() {
  return (
    <section className="py-16 md:py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/60 via-slate-950 to-purple-950/40 pointer-events-none" />
      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center space-y-8">
        
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-xs text-indigo-300">
          <Bot className="h-4 w-4 text-indigo-400" />
          <span>Ready to Automate Inbound Requirement Collection?</span>
        </div>

        <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight max-w-3xl mx-auto leading-tight">
          Stop Losing Prospects to Faster Responding Competitors.
        </h2>

        <p className="text-slate-300 text-base sm:text-lg max-w-2xl mx-auto">
          Test the live client chat experience or explore the company dashboard right now.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link href="/chat">
            <Button variant="glow" size="lg" className="w-full sm:w-auto flex items-center justify-center gap-2 text-base px-8">
              <MessageSquare className="h-5 w-5" />
              Launch Client Chat Demo
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>

          <Link href="/dashboard">
            <Button variant="outline" size="lg" className="w-full sm:w-auto flex items-center justify-center gap-2 border-slate-700 bg-slate-900 px-8">
              <Zap className="h-4 w-4 text-amber-400" />
              Open Agency Dashboard
            </Button>
          </Link>
        </div>

      </div>
    </section>
  );
}
