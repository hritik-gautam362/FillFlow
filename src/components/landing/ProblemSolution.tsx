import { AlertTriangle, CheckCircle2, Clock, XCircle, Bot, Zap, MessageSquare } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function ProblemSolution() {
  return (
    <section className="py-16 md:py-24 bg-slate-950/60 border-y border-slate-800/80 relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <Badge variant="purple" className="px-3 py-1 text-xs">
            The Fundamental Agency Bottleneck
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Why IT Service Companies Lose Deals Overnight
          </h2>
          <p className="text-slate-400 text-base sm:text-lg">
            When a potential client asks for a quote after working hours, every minute of delay reduces conversion by 80%. Here is how FillFlow fixes it.
          </p>
        </div>

        {/* Before vs After Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Old Manual Way */}
          <Card className="border-red-900/40 bg-slate-900/40 p-6 sm:p-8 space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 px-4 py-1.5 bg-red-500/10 border-b border-l border-red-500/20 text-red-400 text-xs font-semibold rounded-bl-xl flex items-center gap-1.5">
              <XCircle className="h-4 w-4" /> Traditional Manual Flow
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-red-500/10 text-red-400 shrink-0">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-white text-base">10:30 PM — Lead Reaches Out</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Prospect sends &quot;Hi, we need a 3BHK portal + mobile app, what is the cost?&quot; on WhatsApp or website form.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-white text-base">9:30 AM Next Day — Delayed Reply</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Sales representative sees the message 11 hours later: &quot;Hi sir, which location & budget?&quot;.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-red-500/10 text-red-400 shrink-0">
                  <XCircle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-white text-base">Lead Went Cold & Unqualified</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    The client has already contacted 4 rival software agencies. Requirements notes are messy and missing key details.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-red-950/20 border border-red-900/30 text-xs text-red-300">
              <strong className="block mb-1 text-red-200">Result:</strong> Lost deal, wasted sales time, and incomplete project specifications.
            </div>
          </Card>

          {/* New FillFlow Way */}
          <Card className="border-indigo-500/40 bg-slate-900/80 p-6 sm:p-8 space-y-6 relative overflow-hidden shadow-xl shadow-indigo-500/10">
            <div className="absolute top-0 right-0 px-4 py-1.5 bg-emerald-500/10 border-b border-l border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-bl-xl flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> FillFlow Flow
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-white text-base">10:30 PM — 2-Second AI Engagement</h4>
                  <p className="text-xs text-slate-300 mt-1">
                    AI Agent immediately greets the prospect on WhatsApp/Web and asks structured project discovery questions.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 shrink-0">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-white text-base">10:35 PM — Scope & Budget Qualified</h4>
                  <p className="text-xs text-slate-300 mt-1">
                    AI extracts technical stack requirements, timeline, budget range ($25k-$35k), and core features interactively.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-white text-base">9:00 AM — Project Brief & Excel Ready</h4>
                  <p className="text-xs text-slate-300 mt-1">
                    Your team opens the dashboard to find a complete structured Project Brief with Excel download available.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between">
              <div>
                <strong className="block text-emerald-200">Result:</strong> High-intent qualified lead, zero manual scoping work.
              </div>
              <MessageSquare className="h-5 w-5 text-emerald-400 shrink-0" />
            </div>
          </Card>

        </div>
      </div>
    </section>
  );
}
