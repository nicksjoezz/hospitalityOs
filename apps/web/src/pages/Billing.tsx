import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite, downloadFile } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty, money } from '../components/ui';

interface Tax {
  id: string;
  name: string;
  kind: string;
  percentBps: number;
  inclusive: boolean;
}

interface Company {
  id: string;
  name: string;
  balance: number;
}

interface Invoice {
  id: string;
  number: string;
  status: string;
  total: number;
  currency: string;
  billToName: string | null;
}

export function Billing() {
  const qc = useQueryClient();
  const { hotel } = useAuth();
  const taxes = useQuery({ queryKey: ['taxes'], queryFn: () => apiGet<Tax[]>('/billing/taxes') });
  const companies = useQuery({ queryKey: ['companies'], queryFn: () => apiGet<Company[]>('/billing/companies') });
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: () => apiGet<Invoice[]>('/billing/invoices') });

  const [tax, setTax] = useState({ name: '', kind: 'VAT', percent: '' });
  const [company, setCompany] = useState('');
  const [resId, setResId] = useState('');
  const [calcAmount, setCalcAmount] = useState('50000');

  const addTax = async () => {
    if (!tax.name || !tax.percent) return;
    await apiWrite('POST', '/billing/taxes', {
      name: tax.name,
      kind: tax.kind,
      percentBps: Math.round(Number(tax.percent) * 100),
    });
    setTax({ name: '', kind: 'VAT', percent: '' });
    await qc.invalidateQueries({ queryKey: ['taxes'] });
  };

  const applyPreset = async (schemeName: string) => {
    if (schemeName === 'NG') {
      await apiWrite('POST', '/billing/taxes', { name: 'Value Added Tax (VAT)', kind: 'VAT', percentBps: 750 });
      await apiWrite('POST', '/billing/taxes', { name: 'Hotel Service Charge', kind: 'SERVICE', percentBps: 1000 });
      await apiWrite('POST', '/billing/taxes', { name: 'State Consumption Tax', kind: 'OCCUPANCY', percentBps: 500 });
    } else if (schemeName === 'UK') {
      await apiWrite('POST', '/billing/taxes', { name: 'Standard UK VAT', kind: 'VAT', percentBps: 2000 });
      await apiWrite('POST', '/billing/taxes', { name: 'Discretionary Service Charge', kind: 'SERVICE', percentBps: 1000 });
    } else if (schemeName === 'US') {
      await apiWrite('POST', '/billing/taxes', { name: 'Hotel Occupancy Tax', kind: 'OCCUPANCY', percentBps: 1200 });
      await apiWrite('POST', '/billing/taxes', { name: 'Resort & Service Fee', kind: 'SERVICE', percentBps: 1000 });
    }
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

  // Tax Simulator Calculations
  const simBase = parseFloat(calcAmount) || 0;
  const activeTaxes = taxes.data ?? [];
  const taxBreakdown = activeTaxes.map((t) => ({
    name: t.name,
    rate: t.percentBps / 100,
    amount: Math.round(simBase * (t.percentBps / 10000)),
  }));
  const totalTaxes = taxBreakdown.reduce((sum, t) => sum + t.amount, 0);
  const totalGross = simBase + totalTaxes;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Billing, Statutory Taxes &amp; Invoicing"
        action={
          <div className="text-xs text-slate-500 font-medium">
            VAT, Service Charge &amp; City Ledger AR
          </div>
        }
      />

      {/* Tax Configuration & Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tax Rules & Presets */}
        <Card className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Statutory Tax &amp; Surcharge Rates</h3>
              <p className="text-xs text-slate-500">Automatically itemized on all guest folios and restaurant POS receipts.</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 font-medium">Presets:</span>
              <Button size="sm" variant="secondary" onClick={() => applyPreset('NG')}>Nigeria</Button>
              <Button size="sm" variant="secondary" onClick={() => applyPreset('UK')}>UK</Button>
              <Button size="sm" variant="secondary" onClick={() => applyPreset('US')}>USA</Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Tax Name (e.g. VAT)"
              value={tax.name}
              onChange={(e) => setTax({ ...tax, name: e.target.value })}
              className="flex-1 min-w-[140px]"
            />
            <Select
              value={tax.kind}
              onChange={(e) => setTax({ ...tax, kind: e.target.value })}
              className="w-32"
            >
              <option value="VAT">VAT</option>
              <option value="SERVICE">Service Charge</option>
              <option value="OCCUPANCY">Consumption/City</option>
              <option value="OTHER">Other Levy</option>
            </Select>
            <Input
              placeholder="% Rate (e.g. 7.5)"
              value={tax.percent}
              onChange={(e) => setTax({ ...tax, percent: e.target.value })}
              className="w-24"
            />
            <Button onClick={addTax}>Add Tax Rule</Button>
          </div>

          {taxes.isLoading ? (
            <Empty>Loading tax rules…</Empty>
          ) : (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              {taxes.data?.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 text-xs">
                  <div>
                    <span className="font-bold text-slate-800">{t.name}</span>
                    <span className="text-slate-400 ml-2 font-mono">({t.kind})</span>
                  </div>
                  <Badge tone={t.kind === 'VAT' ? 'sky' : t.kind === 'SERVICE' ? 'green' : 'amber'}>
                    {t.percentBps / 100}%
                  </Badge>
                </div>
              ))}
              {taxes.data?.length === 0 && (
                <p className="text-xs text-slate-400 py-2 text-center">No taxes configured. Click a preset above to load standard hotel rates.</p>
              )}
            </div>
          )}
        </Card>

        {/* Live Bill Breakdown Simulator */}
        <Card className="space-y-3 bg-gradient-to-b from-slate-50 to-white border-slate-200">
          <div>
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider block">Live Folio Simulator</span>
            <h4 className="text-sm font-bold text-slate-800">Folio Tax Calculation Preview</h4>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-500 block mb-1">Sample Net Room Charge ({hotel?.currency || 'NGN'})</label>
            <Input
              type="number"
              value={calcAmount}
              onChange={(e) => setCalcAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5 text-xs border-t border-slate-200 pt-2.5 font-mono">
            <div className="flex justify-between text-slate-600">
              <span>Base Accommodation:</span>
              <span>{money(Math.round(simBase * 100))}</span>
            </div>
            {taxBreakdown.map((t) => (
              <div key={t.name} className="flex justify-between text-slate-500">
                <span>{t.name} ({t.rate}%):</span>
                <span>+{money(Math.round(t.amount * 100))}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t border-dashed border-slate-300 font-bold text-slate-900 text-sm">
              <span>Total Guest Payable:</span>
              <span>{money(Math.round(totalGross * 100))}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Corporate City Ledger & Formal Invoices */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Company Accounts (City Ledger) */}
        <Card className="space-y-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Corporate Accounts (City Ledger AR)</h3>
            <p className="text-xs text-slate-500">Post guest folios directly to corporate accounts with monthly invoicing.</p>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Corporate Client Name (e.g. Shell, MTN)"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
            <Button onClick={addCompany}>Register Account</Button>
          </div>

          <ul className="space-y-1.5 text-xs">
            {companies.data?.map((c) => (
              <li key={c.id} className="flex justify-between items-center p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="font-bold text-slate-800">{c.name}</span>
                <span className="font-mono font-semibold text-slate-700">AR Balance: {money(c.balance)}</span>
              </li>
            ))}
            {companies.data?.length === 0 && (
              <li className="text-xs text-slate-400 py-3 text-center">No corporate accounts registered yet.</li>
            )}
          </ul>
        </Card>

        {/* Generate Tax Invoice */}
        <Card className="space-y-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Generate Formal Tax Invoice</h3>
            <p className="text-xs text-slate-500">Generate a branded corporate PDF invoice for any reservation ID.</p>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Reservation ID (or paste ref)"
              value={resId}
              onChange={(e) => setResId(e.target.value)}
            />
            <Button onClick={genInvoice}>Generate Invoice</Button>
          </div>
        </Card>
      </div>

      {/* Invoices Table */}
      {invoices.isLoading ? (
        <Empty>Loading invoices…</Empty>
      ) : (
        <Table headers={['Invoice #', 'Billed To', 'Total Amount', 'Payment Status', 'Action']}>
          {invoices.data?.map((i) => (
            <tr key={i.id}>
              <Td className="font-mono font-bold">{i.number}</Td>
              <Td>{i.billToName ?? 'Guest Direct'}</Td>
              <Td className="font-bold">{money(i.total, i.currency)}</Td>
              <Td><Badge tone={i.status === 'PAID' ? 'green' : 'sky'}>{i.status}</Badge></Td>
              <Td>
                <Button size="sm" variant="secondary" onClick={() => downloadFile(`/billing/invoices/${i.id}/pdf`, `${i.number}.pdf`)}>
                  📥 Download PDF
                </Button>
              </Td>
            </tr>
          ))}
          {invoices.data?.length === 0 && (
            <tr>
              <Td colSpan={5} className="text-center py-6 text-slate-400 text-xs">
                No formal invoices generated yet.
              </Td>
            </tr>
          )}
        </Table>
      )}
    </div>
  );
}
