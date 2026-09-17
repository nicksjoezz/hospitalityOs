import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Badge, Empty, money } from '../components/ui';

interface Analytics {
  occupancyPct: number;
  adr: number;
  revpar: number;
  roomRevenue: number;
  currency: string;
}
interface Suggestion {
  id: string;
  roomTypeId: string;
  date: string;
  suggestedPrice: number;
  reason: string;
  status: string;
}

export function Revenue() {
  const qc = useQueryClient();
  const analytics = useQuery({ queryKey: ['rev-analytics'], queryFn: () => apiGet<Analytics>('/revenue/analytics') });
  const suggestions = useQuery({ queryKey: ['rev-sugg'], queryFn: () => apiGet<Suggestion[]>('/revenue/suggestions') });
  const cur = analytics.data?.currency ?? 'NGN';

  const generate = async () => {
    await apiWrite('POST', '/revenue/suggestions/generate', { horizonDays: 14 });
    await qc.invalidateQueries({ queryKey: ['rev-sugg'] });
  };
  const autoApply = async () => {
    if (!confirm('Auto-apply AI rates to the calendar for the next 14 days?')) return;
    await apiWrite('POST', '/revenue/auto-apply', { horizonDays: 14 });
    await qc.invalidateQueries({ queryKey: ['rev-sugg'] });
  };
  const act = async (id: string, action: 'approve' | 'reject' | 'apply') => {
    await apiWrite('POST', `/revenue/suggestions/${id}/${action}`, {});
    await qc.invalidateQueries({ queryKey: ['rev-sugg'] });
  };

  return (
    <div className="space-y-5">
      <PageTitle title="Revenue" action={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={generate}>Generate suggestions</Button>
          <Button onClick={autoApply}>AI auto-apply</Button>
        </div>
      } />

      {analytics.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card><p className="text-xs text-slate-400">Occupancy (30d)</p><p className="text-xl font-bold text-brand">{analytics.data.occupancyPct}%</p></Card>
          <Card><p className="text-xs text-slate-400">ADR</p><p className="text-xl font-bold text-brand">{money(analytics.data.adr, cur)}</p></Card>
          <Card><p className="text-xs text-slate-400">RevPAR</p><p className="text-xl font-bold text-brand">{money(analytics.data.revpar, cur)}</p></Card>
          <Card><p className="text-xs text-slate-400">Room revenue</p><p className="text-xl font-bold text-brand">{money(analytics.data.roomRevenue, cur)}</p></Card>
        </div>
      )}

      <h3 className="text-sm font-semibold text-slate-600">Price suggestions</h3>
      {suggestions.isLoading ? (
        <Empty>Loading…</Empty>
      ) : (
        <Table headers={['Date', 'Suggested', 'Reason', 'Status', 'Actions']}>
          {suggestions.data?.map((s) => (
            <tr key={s.id}>
              <Td>{s.date?.slice(0, 10)}</Td>
              <Td>{money(s.suggestedPrice, cur)}</Td>
              <Td><span className="text-xs text-slate-500">{s.reason}</span></Td>
              <Td><Badge tone={s.status === 'APPLIED' ? 'green' : s.status === 'APPROVED' ? 'sky' : s.status === 'REJECTED' ? 'red' : 'slate'}>{s.status}</Badge></Td>
              <Td>
                <div className="flex gap-1">
                  {s.status === 'SUGGESTED' && <>
                    <Button size="sm" variant="success" onClick={() => act(s.id, 'approve')}>Approve</Button>
                    <Button size="sm" variant="danger" onClick={() => act(s.id, 'reject')}>Reject</Button>
                  </>}
                  {s.status === 'APPROVED' && <Button size="sm" onClick={() => act(s.id, 'apply')}>Apply</Button>}
                </div>
              </Td>
            </tr>
          ))}
          {suggestions.data?.length === 0 && <tr><Td>No suggestions yet — generate some.</Td></tr>}
        </Table>
      )}
    </div>
  );
}
