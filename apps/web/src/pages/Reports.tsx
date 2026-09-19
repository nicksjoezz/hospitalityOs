import { useState } from 'react';
import { downloadFile } from '../lib/api';
import { Card, Button, Input, Badge } from '../components/ui';
import { StayflexiMasterReport } from '../components/StayflexiMasterReport';

const REPORTS = [
  {
    key: 'Cash reconciliation',
    desc: 'Audit drawer cash shifts, float amounts, recorded collections, and cash variance.',
    base: '/reports/cash-reconciliation',
    csv: true,
    pdf: true,
  },
  {
    key: 'Revenue report',
    desc: 'ADR, RevPAR, room night realization, and payment breakdown by gateway and cash.',
    base: '/reports/revenue',
    csv: true,
    pdf: true,
  },
  {
    key: 'Inventory loss & shrinkage',
    desc: 'Stock counts, recipe variance, spoilage deductions, and variance alert logs.',
    base: '/reports/inventory-loss',
    csv: true,
    pdf: false,
  },
  {
    key: 'Maintenance & asset health',
    desc: 'Work order resolution rate, preventative maintenance schedule, and repair cost ledger.',
    base: '/maintenance/report',
    csv: true,
    pdf: true,
  },
];

export function Reports() {
  const [activeTab, setActiveTab] = useState<'master' | 'financial' | 'scheduled'>('master');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const qs = from || to ? `?${[from && `from=${from}`, to && `to=${to}`].filter(Boolean).join('&')}` : '';

  return (
    <div className="space-y-6">
      {/* Top Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setActiveTab('master')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
              activeTab === 'master'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>▤</span>
            <span>Master Report (Stayflexi Books)</span>
          </button>
          <button
            onClick={() => setActiveTab('financial')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
              activeTab === 'financial'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📊</span>
            <span>Financial &amp; Operations Audits</span>
          </button>
          <button
            onClick={() => setActiveTab('scheduled')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
              activeTab === 'scheduled'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🗓</span>
            <span>Scheduled Reports</span>
          </button>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          HospitalityOS &middot; Enterprise Accounting &amp; Stayflexi Parity
        </div>
      </div>

      {/* Tab 1: Flagship Master Report */}
      {activeTab === 'master' && (
        <StayflexiMasterReport
          title="Master Report"
          subtitle="Detailed transaction and booking history"
        />
      )}

      {/* Tab 2: Financial & Operational Reports */}
      {activeTab === 'financial' && (
        <div className="space-y-5 animate-fadeIn">
          <div>
            <h3 className="text-base font-bold text-slate-900">Financial &amp; Audit Reports</h3>
            <p className="text-xs text-slate-500">
              Download formal auditor-verified ledgers and balance sheet attachments.
            </p>
          </div>

          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-bold text-slate-700">
                <span>From Date</span>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" />
              </label>
              <label className="text-xs font-bold text-slate-700">
                <span>To Date</span>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" />
              </label>
              <span className="text-xs text-slate-400 pb-2">
                Date range applies to cash shifts, payments, and revenue reconciliations.
              </span>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            {REPORTS.map((r) => (
              <Card key={r.key} className="flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{r.key}</h4>
                  <p className="mt-1 text-xs text-slate-500">{r.desc}</p>
                </div>
                <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                  {r.csv && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => downloadFile(`${r.base}/export.csv${qs}`, `${r.key.toLowerCase().replace(/\s+/g, '-')}.csv`)}
                    >
                      Export CSV
                    </Button>
                  )}
                  {r.pdf && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => downloadFile(`${r.base}/export.pdf${qs}`, `${r.key.toLowerCase().replace(/\s+/g, '-')}.pdf`)}
                    >
                      Print PDF
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Scheduled Reports */}
      {activeTab === 'scheduled' && (
        <div className="space-y-4 animate-fadeIn">
          <div>
            <h3 className="text-base font-bold text-slate-900">Scheduled Automated Reports</h3>
            <p className="text-xs text-slate-500">
              Configure recurring delivery of nightly, weekly, and month-end audit packages to owners and accounts.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg">🌙</span>
                <Badge tone="green">ACTIVE</Badge>
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Night Audit Summary</h4>
              <p className="mt-1 text-xs text-slate-500">Dispatched at 02:00 AM after room charge roll.</p>
              <p className="mt-3 text-[11px] font-semibold text-indigo-600">Recipients: GM, Night Auditor, Finance</p>
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg">📈</span>
                <Badge tone="green">ACTIVE</Badge>
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Weekly Revenue &amp; Channel Pace</h4>
              <p className="mt-1 text-xs text-slate-500">Dispatched every Monday at 07:00 AM.</p>
              <p className="mt-3 text-[11px] font-semibold text-indigo-600">Recipients: Owner, Revenue Manager</p>
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg">💰</span>
                <Badge tone="green">ACTIVE</Badge>
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Month-End Master Ledger</h4>
              <p className="mt-1 text-xs text-slate-500">Dispatched on the 1st of every month.</p>
              <p className="mt-3 text-[11px] font-semibold text-indigo-600">Recipients: Managing Director, CPA Auditor</p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
