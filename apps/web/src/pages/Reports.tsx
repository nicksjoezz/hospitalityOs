import { useState } from 'react';
import { downloadFile } from '../lib/api';
import { PageTitle, Card, Button, Input } from '../components/ui';

const REPORTS = [
  { key: 'Cash reconciliation', base: '/reports/cash-reconciliation', csv: true, pdf: true },
  { key: 'Revenue', base: '/reports/revenue', csv: true, pdf: true },
  { key: 'Inventory loss', base: '/reports/inventory-loss', csv: true, pdf: false },
  { key: 'Maintenance', base: '/maintenance/report', csv: true, pdf: true },
];

export function Reports() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const qs = from || to ? `?${[from && `from=${from}`, to && `to=${to}`].filter(Boolean).join('&')}` : '';

  return (
    <div className="space-y-5">
      <PageTitle title="Report center" />
      <Card>
        <div className="flex items-end gap-3">
          <label className="text-sm">
            <span className="text-slate-600">From</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">To</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <span className="text-xs text-slate-400">Date range applies to cash & revenue.</span>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <Card key={r.key}>
            <div className="flex items-center justify-between">
              <span className="font-medium">{r.key}</span>
              <div className="flex gap-2">
                {r.csv && (
                  <Button size="sm" variant="secondary" onClick={() => downloadFile(`${r.base}/export.csv${qs}`, `${r.key}.csv`)}>
                    CSV
                  </Button>
                )}
                {r.pdf && (
                  <Button size="sm" variant="secondary" onClick={() => downloadFile(`${r.base}/export.pdf${qs}`, `${r.key}.pdf`)}>
                    PDF
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
