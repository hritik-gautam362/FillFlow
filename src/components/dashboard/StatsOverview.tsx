import { Users, CheckCircle2, Zap, FileSpreadsheet, ArrowUpRight } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface StatsProps {
  totalLeads: number;
  qualifiedLeads: number;
  briefsCount: number;
  avgScore?: number;
}

export function StatsOverview({ totalLeads, qualifiedLeads, briefsCount, avgScore }: StatsProps) {
  const qualificationRate = totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 100) : 0;
  const briefsRate = totalLeads > 0 ? Math.round((briefsCount / totalLeads) * 100) : 0;

  const stats = [
    {
      title: 'Total Inbound Leads',
      value: totalLeads,
      change: `${totalLeads} in database`,
      icon: Users,
      color: 'text-indigo-400 border-indigo-500/20 bg-indigo-500/10',
    },
    {
      title: 'AI Qualified Leads',
      value: qualifiedLeads,
      change: `${qualificationRate}% Qualification Rate`,
      icon: CheckCircle2,
      color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10',
    },
    {
      title: 'Structured Briefs Ready',
      value: briefsCount,
      change: `${briefsRate}% Brief Conversion`,
      icon: FileSpreadsheet,
      color: 'text-purple-400 border-purple-500/20 bg-purple-500/10',
    },
    {
      title: 'Avg Qualification Score',
      value: avgScore !== undefined ? `${avgScore}/100` : '< 2.4s',
      change: 'Real-time Lead Scorer',
      icon: Zap,
      color: 'text-amber-400 border-amber-500/20 bg-amber-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, idx) => {
        const Icon = stat.icon;
        return (
          <Card key={idx} className="p-5 border-slate-800 bg-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">{stat.title}</span>
              <div className={`p-2 rounded-lg border ${stat.color}`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-white tracking-tight">{stat.value}</span>
              <span className="text-[11px] text-slate-400 font-medium flex items-center gap-0.5">
                {stat.change} <ArrowUpRight className="h-3 w-3 text-emerald-400 inline" />
              </span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
