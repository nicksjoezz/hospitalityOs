import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite, downloadFile } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty, money } from '../components/ui';

interface Tax { id: string; name: string; kind: string; percentBps: number; inclusive: boolean }
interface Company { id: string; name: string; balance: number }
interface Invoice { id: string; number: string; status: string; total: number; currency: string; billToName: string | null }

export function Billing() {
  const qc = useQueryClient();
  const taxes = useQuery({ queryKey: ['taxes'], queryFn: () => apiGet<Tax[]>('/billing/taxes') });
  const companies = useQuery({ queryKey: ['companies'], queryFn: () => apiGet<Company[]>('/billing/companies') });
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: () => apiGet<Invoice[]>('/billing/invoices') });
  const [tax, setTax] = useState({ name: '', kind: 'VAT', percent: '' });
  const [company, setCompany] = useState('');
  const [resId, setResId] = useState('');

  const addTax = async () => {
    if (!tax.name || !tax.percent) return;
    await apiWrite('POST', '/billing/taxes', { name: tax.name, kind: tax.kind, percentBps: Math.round(Number(tax.percent) * 100) });
    setTax({ name: '', kind: 'VAT', percent: '' });
    await qc.invalidateQueries({ queryKey: ['taxes'] });
  };
  const addCompany = async () => {
    if (!company) return;
    await apiWrite('POST', '/billing/companies', { name: company });
    setCompany('');
    await qc.invalidateQueries({ queryKey: ['companies'] });
  };
  const genInvoice = async () => {
    if (!resId) return;
    await apiWrite('POST', '/billing/invoices', { reservationId: resId });
    setResId('');
    await qc.invalidateQueries({ queryKey: ['invoices'] });
  };

  return (
    <div className="space-y-5">
      <PageTitle title="Billing — tax, invoices, city ledger" />

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Tax rates</h3>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Name" value={tax.name} onChange={(e) => setTax({ ...tax, name: e.target.value })} className="w-28" />
            <Select value={tax.kind} onChange={(e) => setTax({ ...tax, kind: e.target.value })} className="w-28">
              {['VAT', 'SERVICE', 'OCCUPANCY', 'OTHER'].map((k) => <option key={k}>{k}</option>)}
            </Select>
            <Input placeholder="%" value={tax.percent} onChange={(e) => setTax({ ...tax, percent: e.target.value })} className="w-20" />
            <Button onClick={addTax}>Add</Button>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {taxes.data?.map((t) => <li key={t.id}>{t.name} · {t.percentBps / 100}% {t.inclusive ? '(incl.)' : ''}</li>)}
          </ul>
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Company accounts (city ledger)</h3>
          <div className="flex gap-2">
            <Input placeholder="Company name" value={company} onChange={(e) => setCompany(e.target.value)} />
            <Button onClick={addCompany}>Add</Button>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {companies.data?.map((c) => <li key={c.id} className="flex justify-between"><span>{c.name}</span><span>AR {money(c.balance)}</span></li>)}
          </ul>
        </Card>
      </div>

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-600">Generate invoice from a reservation</h3>
        <div className="flex gap-2">
          <Input placeholder="Reservation id" value={resId} onChange={(e) => setResId(e.target.value)} />
          <Button onClick={genInvoice}>Generate</Button>
        </div>
      </Card>

      {invoices.isLoading ? <Empty>Loading…</Empty> : (
        <Table headers={['Invoice', 'Bill to', 'Total', 'Status', 'PDF']}>
          {invoices.data?.map((i) => (
            <tr key={i.id}>
              <Td>{i.number}</Td>
              <Td>{i.billToName ?? '—'}</Td>
              <Td>{money(i.total, i.currency)}</Td>
              <Td><Badge tone={i.status === 'PAID' ? 'green' : 'sky'}>{i.status}</Badge></Td>
              <Td><Button size="sm" variant="secondary" onClick={() => downloadFile(`/billing/invoices/${i.id}/pdf`, `${i.number}.pdf`)}>PDF</Button></Td>
            </tr>
          ))}
          {invoices.data?.length === 0 && <tr><Td>No invoices yet.</Td></tr>}
        </Table>
      )}
    </div>
  );
}
