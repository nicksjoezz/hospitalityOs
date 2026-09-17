import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty, money } from '../components/ui';

interface Supplier { id: string; name: string; phone: string }
interface PO { id: string; status: string; total: number; note: string | null }

const tone = (s: string) =>
  s === 'RECEIVED' ? 'green' : s === 'APPROVED' || s === 'SENT' ? 'sky' : s === 'CANCELLED' ? 'red' : 'amber';

export function Procurement() {
  const qc = useQueryClient();
  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: () => apiGet<Supplier[]>('/procurement/suppliers') });
  const pos = useQuery({ queryKey: ['pos'], queryFn: () => apiGet<PO[]>('/procurement/purchase-orders') });
  const [sName, setSName] = useState('');
  const [sPhone, setSPhone] = useState('');
  const [draftSupplier, setDraftSupplier] = useState('');

  const addSupplier = async () => {
    if (!sName || !sPhone) return;
    await apiWrite('POST', '/procurement/suppliers', { name: sName, phone: sPhone });
    setSName(''); setSPhone('');
    await qc.invalidateQueries({ queryKey: ['suppliers'] });
  };
  const draftLowStock = async () => {
    if (!draftSupplier) return;
    await apiWrite('POST', '/procurement/purchase-orders/draft-from-low-stock', { supplierId: draftSupplier });
    await qc.invalidateQueries({ queryKey: ['pos'] });
  };
  const act = async (id: string, action: 'approve' | 'send' | 'receive') => {
    await apiWrite('POST', `/procurement/purchase-orders/${id}/${action}`, {});
    await qc.invalidateQueries({ queryKey: ['pos'] });
  };

  return (
    <div className="space-y-5">
      <PageTitle title="Procurement" />

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Add supplier</h3>
          <div className="flex gap-2">
            <Input placeholder="Name" value={sName} onChange={(e) => setSName(e.target.value)} />
            <Input placeholder="Phone" value={sPhone} onChange={(e) => setSPhone(e.target.value)} />
            <Button onClick={addSupplier}>Add</Button>
          </div>
          <ul className="mt-3 space-y-1 text-sm text-slate-600">
            {suppliers.data?.map((s) => <li key={s.id}>{s.name} · {s.phone}</li>)}
          </ul>
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Draft PO from low stock</h3>
          <div className="flex gap-2">
            <Select value={draftSupplier} onChange={(e) => setDraftSupplier(e.target.value)}>
              <option value="">Select supplier…</option>
              {suppliers.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Button onClick={draftLowStock}>Draft</Button>
          </div>
        </Card>
      </div>

      <h3 className="text-sm font-semibold text-slate-600">Purchase orders</h3>
      {pos.isLoading ? (
        <Empty>Loading…</Empty>
      ) : (
        <Table headers={['PO', 'Total', 'Status', 'Actions']}>
          {pos.data?.map((p) => (
            <tr key={p.id}>
              <Td>{p.id.slice(0, 8)} {p.note && <span className="text-xs text-slate-400">· {p.note}</span>}</Td>
              <Td>{money(p.total)}</Td>
              <Td><Badge tone={tone(p.status)}>{p.status}</Badge></Td>
              <Td>
                <div className="flex gap-1">
                  {(p.status === 'DRAFT' || p.status === 'PENDING_APPROVAL') && <Button size="sm" variant="success" onClick={() => act(p.id, 'approve')}>Approve</Button>}
                  {p.status === 'APPROVED' && <Button size="sm" onClick={() => act(p.id, 'send')}>Send</Button>}
                  {(p.status === 'SENT' || p.status === 'APPROVED') && <Button size="sm" variant="secondary" onClick={() => act(p.id, 'receive')}>Receive</Button>}
                </div>
              </Td>
            </tr>
          ))}
          {pos.data?.length === 0 && <tr><Td>No purchase orders.</Td></tr>}
        </Table>
      )}
    </div>
  );
}
