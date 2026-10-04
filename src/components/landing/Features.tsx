import { MessageSquare, FileSpreadsheet, Cpu, Layers, BarChart3, Database } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function Features() {
  const featureList = [
    {
      icon: MessageSquare,
      title: 'WhatsApp & Web Chat Native',
      description: 'Engage prospects wherever they are. Seamlessly integrates with WhatsApp Business API and custom website chat widgets.',
      badge: 'Multi-Channel',
    },
    {
      icon: Cpu,
      title: 'AI Lead Qualification Engine',
      description: 'Calculates a 0-100 lead score based on budget match, project timeline urgency, and decision-maker authority.',
      badge: 'Smart Scoring',
    },
    {
      icon: Layers,
      title: 'Requirement & Tech Stack Extractor',
      description: 'Automatically categorizes frontend, backend, database, third-party APIs, and security compliance requirements.',
      badge: 'Auto Extraction',
    },
    {
      icon: FileSpreadsheet,
      title: 'One-Click Excel / CSV Export',
      description: 'Export all qualified leads and technical specifications in clean tabular format ready for proposal creation.',
      badge: 'Excel Ready',
    },
    {
      icon: BarChart3,
      title: 'Agency Leadership Dashboard',
      description: 'Track conversion analytics, active conversations, qualified lead value, and team assignment in real time.',
      badge: 'Analytics',
    },
    {
      icon: Database,
      title: 'Modular & Ready for Next Integration',
      description: 'Built with clean TypeScript interfaces, ready for future PostgreSQL/Prisma schemas and custom LLM providers.',
      badge: 'Production Ready',
    },
  ];

  return (
    <section className="py-16 md:py-24 bg-slate-950/40 border-t border-slate-800/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <Badge variant="purple" className="px-3 py-1 text-xs">
            Purpose-Built Feature Suite
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Everything Small IT Companies Need to Scale Onboarding
          </h2>
          <p className="text-slate-400 text-base">
            No bloated enterprise features. Just clean, high-conversion AI requirement automation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {featureList.map((f, idx) => {
            const Icon = f.icon;
            return (
              <Card
                key={idx}
                className="p-6 space-y-4 border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-slate-700 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                    <Icon className="h-6 w-6" />
                  </div>
                  <Badge variant="secondary" className="text-[11px]">
                    {f.badge}
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold text-white">{f.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{f.description}</p>
              </Card>
            );
          })}
        </div>

      </div>
    </section>
  );
}
