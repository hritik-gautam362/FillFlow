'use client';

import * as React from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileSpreadsheet, Check, Download, Layers } from 'lucide-react';
import { Lead } from '@/types';

interface ExportModalProps {
  leads: Lead[];
  isOpen: boolean;
  onClose: () => void;
}

export function ExportModal({ leads, isOpen, onClose }: ExportModalProps) {
  const [format, setFormat] = React.useState<'xlsx' | 'csv'>('xlsx');
  const [selectedFields, setSelectedFields] = React.useState({
    clientInfo: true,
    score: true,
    budget: true,
    timeline: true,
    techStack: true,
    notes: true,
  });
  const [isExporting, setIsExporting] = React.useState(false);
  const [downloadSuccess, setDownloadSuccess] = React.useState(false);

  const toggleField = (key: keyof typeof selectedFields) => {
    setSelectedFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleTriggerExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      setDownloadSuccess(true);

      // Generate a CSV Blob for actual download
      const headers = ['Lead ID', 'Client Name', 'Company Name', 'Channel', 'Qualification Score', 'Estimated Budget', 'Timeline', 'Status'];
      const rows = leads.map(l => [
        l.id,
        `"${l.clientName}"`,
        `"${l.companyName}"`,
        l.channel,
        l.qualificationScore,
        `"${l.estimatedBudget}"`,
        `"${l.requestedTimeline}"`,
        l.status
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Client_AI_Leads_Report.${format}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => setDownloadSuccess(false), 3000);
    }, 800);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Export Leads & Project Briefs to Excel"
      description="Download structured client requirement datasets for your sales & project engineering team."
      maxWidth="lg"
    >
      <div className="space-y-6 text-xs text-slate-300">
        
        {/* Export Format Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white">Select Export Format</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setFormat('xlsx')}
              className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                format === 'xlsx'
                  ? 'border-indigo-500 bg-indigo-500/10 text-white font-semibold'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
              }`}
            >
              <span className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                Excel Workbook (.xlsx)
              </span>
              {format === 'xlsx' && <Badge variant="purple">Selected</Badge>}
            </button>

            <button
              onClick={() => setFormat('csv')}
              className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                format === 'csv'
                  ? 'border-indigo-500 bg-indigo-500/10 text-white font-semibold'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
              }`}
            >
              <span className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-400" />
                Standard CSV (.csv)
              </span>
              {format === 'csv' && <Badge variant="purple">Selected</Badge>}
            </button>
          </div>
        </div>

        {/* Column Selection */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white">Include Data Columns ({leads.length} Records)</label>
          <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800">
            {Object.entries(selectedFields).map(([key, isChecked]) => (
              <label key={key} className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleField(key as keyof typeof selectedFields)}
                  className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="capitalize text-slate-200 text-xs">
                  {key.replace(/([A-Z])/g, ' $1')}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="glow"
            size="sm"
            onClick={handleTriggerExport}
            disabled={isExporting}
            className="flex items-center gap-2"
          >
            {isExporting ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                Exporting Data...
              </span>
            ) : downloadSuccess ? (
              <span className="flex items-center gap-2 text-emerald-300">
                <Check className="h-4 w-4" /> Download Complete!
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Download className="h-4 w-4" /> Export {leads.length} Records
              </span>
            )}
          </Button>
        </div>

      </div>
    </Dialog>
  );
}
