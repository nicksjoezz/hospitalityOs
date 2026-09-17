import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Input, Badge, Empty, money } from '../components/ui';

interface Shift {
  id: string;
  openingFloat: number;
  expectedCash: number;
  countedCash: number | null;
  variance: number | null;
  status: string;
}

interface DynamicVirtualAccount {
  id: string;
  accountNumber: string;
  bankName: string;
  accountName: string;
  reference: string;
  amountExpectedMinor: number | null;
  status: string;
  reservation: {
    id: string;
    status: string;
    guest: { name: string; phone: string };
    room: { roomNumber: string } | null;
  };
}

export function Cash() {
  const qc = useQueryClient();
  const current = useQuery({ queryKey: ['cash-current'], queryFn: () => apiGet<Shift | null>('/cash-drawer/current') });
  const shifts = useQuery({ queryKey: ['cash-shifts'], queryFn: () => apiGet<Shift[]>('/cash-drawer') });
  
  // Standout Feature: Dynamic Virtual Accounts
  const virtualAccounts = useQuery({
    queryKey: ['virtual-accounts'],
    queryFn: () => apiGet<DynamicVirtualAccount[]>('/payments/virtual-accounts'),
  });

  const [openingFloat, setOpeningFloat] = useState('');
  const [counted, setCounted] = useState('');
  const [reconMsg, setReconMsg] = useState<string | null>(null);

  const open = async () => {
    await apiWrite('POST', '/cash-drawer/open', { openingFloat: Math.round(Number(openingFloat) * 100) });
    setOpeningFloat('');
    await qc.invalidateQueries();
  };
  const close = async () => {
    await apiWrite('POST', '/cash-drawer/close', { countedCash: Math.round(Number(counted) * 100) });
    setCounted('');
    await qc.invalidateQueries();
  };
  const reconcile = async (id: string) => {
    await apiWrite('POST', `/cash-drawer/${id}/reconcile`, {});
    await qc.invalidateQueries({ queryKey: ['cash-shifts'] });
  };

  const simulateTransfer = async (dva: DynamicVirtualAccount) => {
    try {
      const amount = dva.amountExpectedMinor || 5000000;
      await apiWrite('POST', '/payments/virtual-accounts/reconcile', {
        accountNumber: dva.accountNumber,
        reference: dva.reference,
        amountMinor: amount,
        senderName: dva.reservation.guest.name,
        bankSessionId: `NIP_${Date.now()}`,
      });
      setReconMsg(`✅ Bank transfer of ${money(amount)} reconciled automatically for ${dva.accountName}. Folio balance updated.`);
      await qc.invalidateQueries({ queryKey: ['virtual-accounts'] });
    } catch (err) {
      setReconMsg(err instanceof Error ? err.message : 'Reconciliation failed');
    }
  };

  return (
    <div className="space-y-6">
      <PageTitle title="Cash & Bank Transfer Reconciliation" />

      {/* Dynamic Virtual Accounts (DVA) Standout Feature */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">🏦 Dynamic Virtual Accounts (DVA)</h3>
            <p className="text-xs text-slate-500">Automated bank transfer reconciliation — payments settle guest folios instantly</p>
          </div>
          <Badge tone="sky">Zero Reconciliation Fraud</Badge>
        </div>

        {reconMsg && (
          <Card className="bg-emerald-50 border-emerald-200">
            <p className="text-sm font-medium text-emerald-800">{reconMsg}</p>
          </Card>
        )}

        {virtualAccounts.isLoading ? (
          <Empty>Loading virtual accounts…</Empty>
        ) : (
          <Table headers={['Guest & Room', 'Dedicated Account', 'Bank Name', 'Account Name', 'Expected', 'Status', 'Automated Reconcile']}>
            {virtualAccounts.data?.map((d) => (
              <tr key={d.id}>
                <Td>
                  <span className="font-semibold text-slate-800">{d.reservation.guest.name}</span>
                  {d.reservation.room && <span className="text-xs block text-slate-400">Room {d.reservation.room.roomNumber}</span>}
                </Td>
                <Td><span className="font-mono text-sm font-bold text-brand">{d.accountNumber}</span></Td>
                <Td>{d.bankName}</Td>
                <Td><span className="text-xs text-slate-600">{d.accountName}</span></Td>
                <Td><span className="font-semibold">{d.amountExpectedMinor ? money(d.amountExpectedMinor) : '—'}</span></Td>
                <Td><Badge tone={d.status === 'ACTIVE' ? 'sky' : 'green'}>{d.status}</Badge></Td>
                <Td>
                  {d.status === 'ACTIVE' && (
                    <Button size="sm" variant="success" onClick={() => simulateTransfer(d)}>
                      ⚡ Simulate Inflow
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
            {virtualAccounts.data?.length === 0 && <tr><Td>No active virtual accounts provisioned yet.</Td></tr>}
          </Table>
        )}
      </div>

      {/* Cash Drawer Shift Management */}
      <div>
        <h3 className="mb-2 text-base font-semibold text-slate-800">Cash Drawer Shifts</h3>
        <Card>
          {current.data ? (
            <div className="space-y-2">
              <p className="text-sm">Open shift — float {money(current.data.openingFloat)}, collected {money(current.data.expectedCash)}, expected total {money(current.data.openingFloat + current.data.expectedCash)}</p>
              <div className="flex gap-2">
                <Input placeholder="Counted cash (major units)" value={counted} onChange={(e) => setCounted(e.target.value)} className="max-w-xs" />
                <Button variant="danger" onClick={close}>Close & reconcile</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input placeholder="Opening float (major units)" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} className="max-w-xs" />
              <Button onClick={open}>Open Shift</Button>
            </div>
          )}
        </Card>
      </div>

      {shifts.isLoading ? (
        <Empty>Loading…</Empty>
      ) : (
        <Table headers={['Shift', 'Float', 'Collected', 'Counted', 'Variance', 'Status', '']}>
          {shifts.data?.map((s) => (
            <tr key={s.id}>
              <Td>{s.id.slice(0, 8)}</Td>
              <Td>{money(s.openingFloat)}</Td>
              <Td>{money(s.expectedCash)}</Td>
              <Td>{s.countedCash === null ? '—' : money(s.countedCash)}</Td>
              <Td>{s.variance === null ? '—' : <Badge tone={s.variance === 0 ? 'green' : 'red'}>{money(s.variance)}</Badge>}</Td>
              <Td><Badge tone={s.status === 'RECONCILED' ? 'green' : s.status === 'CLOSED' ? 'sky' : 'amber'}>{s.status}</Badge></Td>
              <Td>{s.status === 'CLOSED' && <Button size="sm" variant="secondary" onClick={() => reconcile(s.id)}>Reconcile</Button>}</Td>
            </tr>
          ))}
          {shifts.data?.length === 0 && <tr><Td>No shifts.</Td></tr>}
        </Table>
      )}
    </div>
  );
}
