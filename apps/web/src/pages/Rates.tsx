import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Input, Select, Empty, money } from '../components/ui';

interface RoomType { id: string; name: string; basePrice: number }
interface CalDay { date: string; price: number; minStay: number | null; stopSell: boolean; closedToArrival: boolean }
interface Plan { id: string; name: string; code: string; kind: string; adjustmentType: string; adjustmentValue: number }

export function Rates() {
  const qc = useQueryClient();
  const types = useQuery({ queryKey: ['rt-rates'], queryFn: () => apiGet<RoomType[]>('/rooms/types') });
  const [rtId, setRtId] = useState('');
  const roomTypeId = rtId || types.data?.[0]?.id || '';
  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

  const calendar = useQuery({
    queryKey: ['cal', roomTypeId],
    queryFn: () => apiGet<CalDay[]>(`/rates/calendar?roomTypeId=${roomTypeId}&from=${today}&to=${in14}`),
    enabled: !!roomTypeId,
  });
  const plans = useQuery({
    queryKey: ['plans', roomTypeId],
    queryFn: () => apiGet<Plan[]>(`/rates/plans?roomTypeId=${roomTypeId}`),
    enabled: !!roomTypeId,
  });

  const [form, setForm] = useState({ from: today, to: in14, price: '', minStay: '', stopSell: false });
  const setCal = async () => {
    await apiWrite('POST', '/rates/calendar', {
      roomTypeId,
      from: form.from, to: form.to,
      price: form.price ? Math.round(Number(form.price) * 100) : undefined,
      minStay: form.minStay ? Number(form.minStay) : undefined,
      stopSell: form.stopSell,
    });
    await qc.invalidateQueries({ queryKey: ['cal', roomTypeId] });
  };
  const [plan, setPlan] = useState({ name: '', code: '', adjustmentType: 'PERCENT', adjustmentValue: '' });
  const addPlan = async () => {
    if (!plan.name || !plan.code) return;
    await apiWrite('POST', '/rates/plans', { roomTypeId, name: plan.name, code: plan.code, adjustmentType: plan.adjustmentType, adjustmentValue: Number(plan.adjustmentValue || 0) });
    setPlan({ name: '', code: '', adjustmentType: 'PERCENT', adjustmentValue: '' });
    await qc.invalidateQueries({ queryKey: ['plans', roomTypeId] });
  };

  return (
    <div className="space-y-5">
      <PageTitle title="Rates & calendar" action={
        <Select value={roomTypeId} onChange={(e) => setRtId(e.target.value)} className="w-48">
          {types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      } />

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-600">Set rates / restrictions for a date range</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">From<Input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></label>
          <label className="text-xs text-slate-500">To<Input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label>
          <label className="text-xs text-slate-500">Price/night<Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="w-28" /></label>
          <label className="text-xs text-slate-500">Min stay<Input value={form.minStay} onChange={(e) => setForm({ ...form, minStay: e.target.value })} className="w-20" /></label>
          <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={form.stopSell} onChange={(e) => setForm({ ...form, stopSell: e.target.checked })} /> Stop-sell</label>
          <Button onClick={setCal}>Apply</Button>
        </div>
      </Card>

      <Table headers={['Date', 'Price', 'Min stay', 'CTA', 'Stop-sell']}>
        {calendar.data?.map((d) => (
          <tr key={d.date}>
            <Td>{d.date}</Td>
            <Td>{money(d.price)}</Td>
            <Td>{d.minStay ?? '—'}</Td>
            <Td>{d.closedToArrival ? 'Yes' : '—'}</Td>
            <Td>{d.stopSell ? 'STOP' : '—'}</Td>
          </tr>
        ))}
        {calendar.data?.length === 0 && <tr><Td>No overrides — base price applies.</Td></tr>}
      </Table>

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-600">Rate plans</h3>
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Name (Non-refundable)" value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} className="w-44" />
          <Input placeholder="Code" value={plan.code} onChange={(e) => setPlan({ ...plan, code: e.target.value })} className="w-24" />
          <Select value={plan.adjustmentType} onChange={(e) => setPlan({ ...plan, adjustmentType: e.target.value })} className="w-32">
            <option value="PERCENT">% of base</option>
            <option value="FIXED">+/- fixed</option>
            <option value="ABSOLUTE">absolute</option>
          </Select>
          <Input placeholder="Value" value={plan.adjustmentValue} onChange={(e) => setPlan({ ...plan, adjustmentValue: e.target.value })} className="w-24" />
          <Button onClick={addPlan}>Add plan</Button>
        </div>
        <ul className="mt-3 space-y-1 text-sm text-slate-600">
          {plans.data?.map((p) => <li key={p.id}>{p.name} ({p.code}) · {p.adjustmentType} {p.adjustmentValue}</li>)}
        </ul>
      </Card>
    </div>
  );
}
