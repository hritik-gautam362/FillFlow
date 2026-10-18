import { Mail, Bot, ShieldCheck, FileSpreadsheet } from 'lucide-react';
import { Card } from '@/components/ui/card';

export function HowItWorks() {
  const steps = [
    {
      num: '01',
      icon: Mail,
      title: 'Gmail & Multi-Channel Inbound',
      description: 'Connect your company Gmail or Google Workspace via OAuth. New customer inquiries are captured via real-time push notifications.',
      badgeColor: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
    },
    {
      num: '02',
      icon: Bot,
      title: 'Contextual AI Scoping',
      description: 'Gemini AI classifies customer intent, extracts project requirements (budget, timeline, stack), and composes tailored draft responses.',
      badgeColor: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
    },
    {
      num: '03',
      icon: ShieldCheck,
      title: 'Policy Guardrails & Approval Queue',
      description: 'Automated replies are sent only when permitted by policy. Sensitive commercial terms or custom quotes are held for human approval.',
      badgeColor: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    },
    {
      num: '04',
      icon: FileSpreadsheet,
      title: 'Structured Briefs & Dashboard',
      description: 'Every qualified lead is converted into structured specifications and exported directly to your team via Dashboard, JSON, or Excel.',
      badgeColor: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
    },
  ];

  return (
    <section className="py-16 md:py-24 relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <span className="text-xs font-semibold text-indigo-400 uppercase tracking-widest">
            Streamlined 4-Step Pipeline
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            How FillFlow Operates
          </h2>
          <p className="text-slate-400 text-base">
            From initial hello to an actionable project specification ready for your engineering lead.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <Card
                key={idx}
                className="p-6 space-y-4 border-slate-800 bg-slate-900/60 hover:bg-slate-900/90 transition-all hover:-translate-y-1 relative"
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black text-slate-700 font-mono">{step.num}</span>
                  <div className={`p-2.5 rounded-xl border ${step.badgeColor}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>

                <h3 className="text-lg font-semibold text-white">{step.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{step.description}</p>
              </Card>
            );
          })}
        </div>

      </div>
    </section>
  );
}
