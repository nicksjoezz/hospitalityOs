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
  contact?: string;
  creditLimit: number;
  balance: number;
  active: boolean;
}

interface Invoice {
  id: string;
  number: string;
  status: string;
  total: number;
  currency: string;
  billToName: string | null;
  billToCompany: string | null;
  issuedAt: string;
}

interface CompanyStatement {
  company: Company;
  invoices: Invoice[];
  totalBilled: number;
  balance: number;
}

export function Billing() {
  const qc = useQueryClient();
  const { hotel } = useAuth();
  const taxes = useQuery({ queryKey: ['taxes'], queryFn: () => apiGet<Tax[]>('/billing/taxes') });
  const companies = useQuery({ queryKey: ['companies'], queryFn: () => apiGet<Company[]>('/billing/companies') });
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: () => apiGet<Invoice[]>('/billing/invoices') });

  const [activeTab, setActiveTab] = useState<'city-ledger' | 'invoices' | 'taxes' | 'erp'>('city-ledger');

  // ERP & Accounting State
  const [erpDate, setErpDate] = useState(new Date().toISOString().slice(0, 10));
  const glQuery = useQuery({
    queryKey: ['erp-gl', erpDate],
    queryFn: () => apiGet<any>(`/billing/erp/gl?date=${erpDate}`),
    enabled: activeTab === 'erp',
  });

  // Direct Billing state
  const [newCompanyModal, setNewCompanyModal] = useState(false);
  const [compName, setCompName] = useState('');
  const [compContact, setCompContact] = useState('');
  const [compCreditLimit, setCompCreditLimit] = useState('5000000'); // ₦50,000 in minor

  // Payment Recording Modal
  const [paymentModal, setPaymentModal] = useState<{ open: boolean; company?: Company }>({ open: false });
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payLoading, setPayLoading] = useState(false);

  // Statement Drawer
  const [statementCompany, setStatementCompany] = useState<Company | null>(null);
  const [statementData, setStatementData] = useState<CompanyStatement | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  // Direct Folio to Company Bill Modal
  const [directBillModal, setDirectBillModal] = useState(false);
  const [directBillResId, setDirectBillResId] = useState('');
  const [directBillCompId, setDirectBillCompId] = useState('');
  const [directBillLoading, setDirectBillLoading] = useState(false);

  // Tax and invoice state
  const [tax, setTax] = useState({ name: '', kind: 'VAT', percent: '' });
  const [resId, setResId] = useState('');
  const [calcAmount, setCalcAmount] = useState('50000');
  const [invoiceSearch, setInvoiceSearch] = useState('');

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

  const handleRegisterCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compName.trim()) return;
    try {
      await apiWrite('POST', '/billing/companies', {
        name: compName.trim(),
        contact: compContact.trim() || undefined,
        creditLimit: Math.round(Number(compCreditLimit) * 100) || 0,
      });
      setCompName('');
      setCompContact('');
      setNewCompanyModal(false);
      await qc.invalidateQueries({ queryKey: ['companies'] });
    } catch (err) {
      console.error('Failed to register corporate account:', err);
      alert('Error registering company account.');
    }
  };

  const handleRecordPayment = async () => {
    if (!paymentModal.company || !payAmount) return;
    setPayLoading(true);
    try {
      await apiWrite('POST', `/billing/companies/${paymentModal.company.id}/payments`, {
        amount: Math.round(Number(payAmount) * 100),
        note: payNote.trim() || 'Direct B2B Wire Settlement',
      });
      setPaymentModal({ open: false });
      setPayAmount('');
      setPayNote('');
      await qc.invalidateQueries({ queryKey: ['companies'] });
      alert('Corporate payment recorded successfully!');
    } catch (err) {
      console.error('Failed to record payment:', err);
      alert('Error recording payment.');
    } finally {
      setPayLoading(false);
    }
  };

  const handleOpenStatement = async (comp: Company) => {
    setStatementCompany(comp);
    setStatementLoading(true);
    try {
      const data = await apiGet<CompanyStatement>(`/billing/companies/${comp.id}/statement`);
      setStatementData(data);
    } catch (err) {
      console.error('Failed to load statement:', err);
    } finally {
      setStatementLoading(false);
    }
  };

  const handleDirectBillFolio = async () => {
    if (!directBillResId.trim() || !directBillCompId) {
      alert('Please provide reservation reference and select company.');
      return;
    }
    setDirectBillLoading(true);
    try {
      const comp = companies.data?.find((c) => c.id === directBillCompId);
      await apiWrite('POST', '/billing/invoices', {
        reservationId: directBillResId.trim(),
        companyAccountId: directBillCompId,
        billToCompany: comp?.name,
      });
      setDirectBillModal(false);
      setDirectBillResId('');
      setDirectBillCompId('');
      await qc.invalidateQueries({ queryKey: ['invoices'] });
      await qc.invalidateQueries({ queryKey: ['companies'] });
      alert('Reservation folio posted to corporate City Ledger account!');
    } catch (err) {
      console.error('Failed to direct bill:', err);
      alert('Could not post folio to City Ledger.');
    } finally {
      setDirectBillLoading(false);
    }
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

  const filteredInvoices = (invoices.data || []).filter((i) => {
    if (!invoiceSearch.trim()) return true;
    const q = invoiceSearch.toLowerCase();
    return (
      i.number.toLowerCase().includes(q) ||
      i.billToName?.toLowerCase().includes(q) ||
      i.billToCompany?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <PageTitle
        title="Direct Billing, City Ledger &amp; Tax Invoicing"
        action={
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span>Corporate AR</span> · <span>VAT &amp; Service Charge</span>
          </div>
        }
      />

      {/* Primary Tabs */}
      <div className="flex rounded-xl bg-slate-200/80 p-1 text-xs font-semibold max-w-xl">
        <button
          onClick={() => setActiveTab('city-ledger')}
          className={`flex-1 py-2 rounded-lg transition-all text-center cursor-pointer ${
            activeTab === 'city-ledger' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          🏢 Direct Billing (City Ledger AR)
        </button>
        <button
          onClick={() => setActiveTab('invoices')}
          className={`flex-1 py-2 rounded-lg transition-all text-center cursor-pointer ${
            activeTab === 'invoices' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          🧾 Tax Invoices &amp; Statements
        </button>
        <button
          onClick={() => setActiveTab('taxes')}
          className={`flex-1 py-2 rounded-lg transition-all text-center cursor-pointer ${
            activeTab === 'taxes' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          ⚖️ Statutory Taxes &amp; Surcharges
        </button>
        <button
          onClick={() => setActiveTab('erp')}
          className={`flex-1 py-2 rounded-lg transition-all text-center cursor-pointer ${
            activeTab === 'erp' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          📊 ERP &amp; Accounting Exports
        </button>
      </div>

      {/* TAB 1: DIRECT BILLING & CITY LEDGER */}
      {activeTab === 'city-ledger' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div>
              <h3 className="text-sm font-bold text-white">Corporate Accounts Master</h3>
              <p className="text-xs text-slate-400">
                Manage corporate B2B clients, credit limits, NET payment terms, and direct folio billing.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDirectBillModal(true)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
              >
                📥 Direct Bill a Guest Folio
              </button>
              <button
                onClick={() => setNewCompanyModal(true)}
                className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-indigo-500 transition-colors"
              >
                + Register Corporate Account
              </button>
            </div>
          </div>

          {companies.isLoading ? (
            <Empty>Loading corporate accounts…</Empty>
          ) : (
            <Table headers={['Corporate Client', 'Contact Info', 'Credit Limit', 'Current AR Balance', 'Utilization', 'Account Actions']}>
              {companies.data?.map((c) => {
                const limit = c.creditLimit || 0;
                const bal = c.balance || 0;
                const utilPct = limit > 0 ? Math.min(Math.round((bal / limit) * 100), 100) : 0;

                return (
                  <tr key={c.id}>
                    <Td className="font-bold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <span>🏢</span>
                        <span>{c.name}</span>
                      </div>
                    </Td>
                    <Td className="text-xs text-slate-500">{c.contact || 'No contact specified'}</Td>
                    <Td className="font-mono text-xs">{limit > 0 ? money(limit) : 'No limit set'}</Td>
                    <Td className="font-mono font-bold text-xs text-slate-800">
                      <span className={bal > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                        {money(bal)}
                      </span>
                    </Td>
                    <Td className="w-40">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>{utilPct}% used</span>
                          <span>{limit > 0 ? money(Math.max(0, limit - bal)) : '—'} left</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              utilPct > 85 ? 'bg-rose-500' : utilPct > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${utilPct}%` }}
                          />
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleOpenStatement(c)}
                        >
                          📄 Statement
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setPaymentModal({ open: true, company: c })}
                        >
                          💳 Record Payment
                        </Button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
              {companies.data?.length === 0 && (
                <tr>
                  <Td colSpan={6} className="text-center py-8 text-slate-400 text-xs">
                    No corporate accounts registered yet. Click "+ Register Corporate Account" to begin.
                  </Td>
                </tr>
              )}
            </Table>
          )}
        </div>
      )}

      {/* TAB 2: INVOICES */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div>
              <h3 className="text-sm font-bold text-white">Tax Invoices &amp; Guest Folio Bills</h3>
              <p className="text-xs text-slate-400">
                Official statutory tax invoices with sequential numbering and downloadable PDF copies.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search Invoice # or Client…"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                className="w-48 text-xs"
              />
              <Input
                placeholder="Reservation ID"
                value={resId}
                onChange={(e) => setResId(e.target.value)}
                className="w-40 text-xs"
              />
              <Button onClick={genInvoice}>Generate Invoice</Button>
            </div>
          </div>

          {invoices.isLoading ? (
            <Empty>Loading invoices…</Empty>
          ) : (
            <Table headers={['Invoice #', 'Billed Entity', 'Corporate Account', 'Total Amount', 'Status', 'Date', 'Action']}>
              {filteredInvoices.map((i) => (
                <tr key={i.id}>
                  <Td className="font-mono font-bold">{i.number}</Td>
                  <Td>{i.billToName ?? 'Guest Direct'}</Td>
                  <Td className="text-xs text-slate-500">
                    {i.billToCompany ? (
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700 font-semibold">
                        {i.billToCompany}
                      </span>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td className="font-bold">{money(i.total, i.currency)}</Td>
                  <Td><Badge tone={i.status === 'PAID' ? 'green' : 'sky'}>{i.status}</Badge></Td>
                  <Td className="text-xs text-slate-400">{i.issuedAt.slice(0, 10)}</Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => downloadFile(`/billing/invoices/${i.id}/pdf`, `${i.number}.pdf`)}
                    >
                      📥 Download PDF
                    </Button>
                  </Td>
                </tr>
              ))}
              {filteredInvoices.length === 0 && (
                <tr>
                  <Td colSpan={7} className="text-center py-6 text-slate-400 text-xs">
                    No matching invoices found.
                  </Td>
                </tr>
              )}
            </Table>
          )}
        </div>
      )}

      {/* TAB 3: TAXES */}
      {activeTab === 'taxes' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
      )}

      {/* TAB 4: ERP & ACCOUNTING EXPORTS (QuickBooks / Xero / Tally) */}
      {activeTab === 'erp' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">General Ledger (GL) Journal Sync &amp; ERP Hub</h3>
                <Badge tone="green">Balanced Voucher</Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Automatically generate daily balanced accounting journals for <strong>QuickBooks Online</strong>, <strong>Xero</strong>, and <strong>Tally ERP</strong>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-slate-300 font-semibold flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                Audit Date:
                <input
                  type="date"
                  value={erpDate}
                  onChange={(e) => setErpDate(e.target.value)}
                  className="bg-slate-950 text-white rounded px-2 py-1 text-xs border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </label>

              <Button
                size="sm"
                onClick={() =>
                  downloadFile(`/billing/erp/quickbooks.csv?date=${erpDate}`, `quickbooks-journal-${erpDate}.csv`)
                }
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                📥 QuickBooks CSV
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  downloadFile(`/billing/erp/xero.csv?date=${erpDate}`, `xero-journal-${erpDate}.csv`)
                }
                className="bg-sky-600 hover:bg-sky-700 text-white"
              >
                📥 Xero CSV
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  downloadFile(`/billing/erp/tally.xml?date=${erpDate}`, `tally-journal-${erpDate}.xml`)
                }
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                📥 Tally XML
              </Button>
            </div>
          </div>

          {/* GL Voucher Summary Card */}
          {glQuery.isLoading ? (
            <Empty>Computing daily General Ledger journal balances…</Empty>
          ) : glQuery.data ? (
            <Card className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Daily Audit Journal Voucher · {glQuery.data.date}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {glQuery.data.hotelName} ({glQuery.data.currency}) · Double-Entry Standard
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <span className="text-slate-600">
                    Total Debits: <strong className="text-slate-900">{money(glQuery.data.totalDebits, glQuery.data.currency)}</strong>
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-600">
                    Total Credits: <strong className="text-slate-900">{money(glQuery.data.totalCredits, glQuery.data.currency)}</strong>
                  </span>
                  <Badge tone={glQuery.data.totalDebits === glQuery.data.totalCredits ? 'green' : 'red'}>
                    {glQuery.data.totalDebits === glQuery.data.totalCredits ? '✓ Zero Variance Balanced' : 'Variance Detected'}
                  </Badge>
                </div>
              </div>

              {/* Journal Lines Table */}
              <Table headers={['Account #', 'Account Title', 'Type', 'Debit', 'Credit', 'Audit Description']}>
                {glQuery.data.entries.map((e: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/70 transition">
                    <Td className="font-mono text-xs font-bold text-indigo-700">{e.accountCode}</Td>
                    <Td className="font-semibold text-slate-800">{e.accountName}</Td>
                    <Td>
                      <Badge tone={e.type === 'DEBIT' ? 'sky' : 'amber'}>{e.type}</Badge>
                    </Td>
                    <Td className="font-mono text-xs font-semibold">
                      {e.debit > 0 ? money(e.debit, glQuery.data.currency) : '—'}
                    </Td>
                    <Td className="font-mono text-xs font-semibold">
                      {e.credit > 0 ? money(e.credit, glQuery.data.currency) : '—'}
                    </Td>
                    <Td className="text-xs text-slate-500 italic">{e.description}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          ) : null}
        </div>
      )}

      {/* Register Corporate Account Modal */}
      {newCompanyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleRegisterCompany}
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Register Corporate Account (City Ledger)</h3>
              <button
                type="button"
                onClick={() => setNewCompanyModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Company / Organization Name</label>
              <input
                type="text"
                required
                value={compName}
                onChange={(e) => setCompName(e.target.value)}
                placeholder="e.g. Chevron Nigeria Ltd, PwC, Dangote Group"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Contact Person &amp; Email / Phone</label>
              <input
                type="text"
                value={compContact}
                onChange={(e) => setCompContact(e.target.value)}
                placeholder="Tunde Davies · accounting@chevron.com · 08033333333"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Credit Limit ({hotel?.currency || 'NGN'})</label>
              <input
                type="number"
                value={compCreditLimit}
                onChange={(e) => setCompCreditLimit(e.target.value)}
                placeholder="5000000"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewCompanyModal(false)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                Create Account
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Record B2B Payment Modal */}
      {paymentModal.open && paymentModal.company && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Record Corporate Payment · {paymentModal.company.name}
              </h3>
              <button
                onClick={() => setPaymentModal({ open: false })}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl bg-slate-950 p-3 text-xs border border-slate-800">
              <span className="text-slate-400 block">Current Outstanding Balance:</span>
              <span className="text-base font-bold text-amber-400">
                {money(paymentModal.company.balance)}
              </span>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Payment Amount Received ({hotel?.currency || 'NGN'})
              </label>
              <input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="e.g. 2500000"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Reference / Note</label>
              <input
                type="text"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder="Wire Ref #TRX-98214 - Zenith Bank"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setPaymentModal({ open: false })}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={!payAmount || payLoading}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                {payLoading ? 'Recording…' : 'Record Credit Settlement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Statement of Account Drawer */}
      {statementCompany && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
          <div className="flex h-full w-full max-w-lg flex-col bg-slate-950 border-l border-slate-800 p-6 shadow-2xl overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">{statementCompany.name}</h3>
                <p className="text-xs text-slate-400">Corporate Statement of Account</p>
              </div>
              <button
                onClick={() => setStatementCompany(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {statementLoading ? (
              <div className="text-center py-12 text-xs text-slate-500">Loading statement…</div>
            ) : statementData ? (
              <>
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-900 p-4 border border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Total Invoiced</span>
                    <span className="font-bold text-white text-sm">
                      {money(statementData.totalBilled)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Net Outstanding AR</span>
                    <span className="font-bold text-amber-400 text-sm">
                      {money(statementData.balance)}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Invoices Posted to Account ({statementData.invoices.length})
                  </h4>
                  <div className="space-y-2">
                    {statementData.invoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs"
                      >
                        <div>
                          <span className="font-bold text-white block">{inv.number}</span>
                          <span className="text-[10px] text-slate-400">
                            {inv.issuedAt.slice(0, 10)} · {inv.billToName || 'Resident Guest'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-200">
                            {money(inv.total, inv.currency)}
                          </span>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              downloadFile(`/billing/invoices/${inv.id}/pdf`, `${inv.number}.pdf`)
                            }
                          >
                            PDF
                          </Button>
                        </div>
                      </div>
                    ))}
                    {statementData.invoices.length === 0 && (
                      <p className="text-xs text-slate-500 text-center py-4">
                        No invoices posted to this account yet.
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Direct Bill Guest Folio Modal */}
      {directBillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Direct Bill Guest Folio to Corporate AR</h3>
              <button
                onClick={() => setDirectBillModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Reservation Reference ID</label>
              <input
                type="text"
                value={directBillResId}
                onChange={(e) => setDirectBillResId(e.target.value)}
                placeholder="Paste Reservation UUID"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Corporate Client (City Ledger)</label>
              <select
                value={directBillCompId}
                onChange={(e) => setDirectBillCompId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="">-- Select Corporate Client --</option>
                {companies.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (AR: {money(c.balance)})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDirectBillModal(false)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleDirectBillFolio}
                disabled={!directBillResId || !directBillCompId || directBillLoading}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                {directBillLoading ? 'Posting…' : 'Post to City Ledger'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
