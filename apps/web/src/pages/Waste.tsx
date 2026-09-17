import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Empty, money } from '../components/ui';

interface WasteReport {
  totalCost: number;
  byItem: { name: string; quantity: number; cost: number; unit: string }[];
  byReason: Record<string, { count: number; cost: number }>;
}

export function Waste() {
  const report = useQuery({ queryKey: ['waste'], queryFn: () => apiGet<WasteReport>('/inventory/waste-report') });
  const [insight, setInsight] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const getInsight = async () => {
    setBusy(true);
    try {
      const r = await apiGet<{ insight: string }>('/inventory/waste-insights');
      setInsight(r.insight);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageTitle
        title="Waste (last 30 days)"
        action={
          <div className="flex items-center gap-3">
            {report.data && <span className="text-sm font-semibold">Total: {money(report.data.totalCost)}</span>}
            <Button variant="secondary" onClick={getInsight} disabled={busy}>{busy ? '…' : 'AI insights'}</Button>
          </div>
        }
      />

      {insight && <Card className="border-sky-200 bg-sky-50"><p className="text-sm text-sky-800">{insight}</p></Card>}

      {report.isLoading ? <Empty>Loading…</Empty> : (
        <>
          <Table headers={['Item', 'Quantity', 'Cost']}>
            {report.data?.byItem.map((i) => (
              <tr key={i.name}>
                <Td>{i.name}</Td>
                <Td>{i.quantity} {i.unit}</Td>
                <Td>{money(i.cost)}</Td>
              </tr>
            ))}
            {report.data?.byItem.length === 0 && <tr><Td>No wastage logged.</Td></tr>}
          </Table>
          {report.data && Object.keys(report.data.byReason).length > 0 && (
            <Card>
              <h3 className="mb-2 text-sm font-semibold text-slate-600">By reason</h3>
              <ul className="space-y-1 text-sm text-slate-600">
                {Object.entries(report.data.byReason).map(([r, v]) => (
                  <li key={r} className="flex justify-between"><span>{r}</span><span>{v.count}× · {money(v.cost)}</span></li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
