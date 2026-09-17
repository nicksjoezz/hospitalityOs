import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Input, Badge, Empty } from '../components/ui';

interface Item {
  id: string;
  name: string;
  category: string;
  unit: string;
  currentQty: string | number;
  reorderPoint: string | number;
}
interface LossAlert {
  itemId: string;
  name: string;
  variancePct: number;
  variance: number;
  unit: string;
  probableCause: string;
}

export function Inventory() {
  const qc = useQueryClient();
  const items = useQuery({ queryKey: ['inv-items'], queryFn: () => apiGet<Item[]>('/inventory/items') });
  const loss = useQuery({ queryKey: ['inv-loss'], queryFn: () => apiGet<{ alerts: LossAlert[] }>('/reports/inventory-loss') });
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('piece');

  const addItem = async () => {
    if (!name) return;
    await apiWrite('POST', '/inventory/items', { name, unit, category: 'OTHER', currentQty: 0, reorderPoint: 0 });
    setName('');
    await qc.invalidateQueries({ queryKey: ['inv-items'] });
  };
  const count = async (id: string) => {
    const v = prompt('Physical count quantity?');
    if (v === null) return;
    await apiWrite('POST', `/inventory/items/${id}/count`, { countedQty: Number(v) });
    await qc.invalidateQueries();
  };
  const wastage = async (id: string) => {
    const v = prompt('Wastage quantity?');
    if (v === null) return;
    await apiWrite('POST', `/inventory/items/${id}/wastage`, { quantity: Number(v), reason: 'manual' });
    await qc.invalidateQueries({ queryKey: ['inv-items'] });
  };

  return (
    <div className="space-y-5">
      <PageTitle title="Inventory" />

      {(loss.data?.alerts.length ?? 0) > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <h3 className="mb-2 text-sm font-semibold text-amber-800">Loss / shrinkage alerts</h3>
          <ul className="space-y-1 text-sm text-amber-800">
            {loss.data!.alerts.map((a) => (
              <li key={a.itemId}>
                <b>{a.name}</b>: {a.variancePct}% below expected (missing {a.variance} {a.unit}) — {a.probableCause}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="flex gap-2">
          <Input placeholder="New item name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="unit" value={unit} onChange={(e) => setUnit(e.target.value)} className="w-28" />
          <Button onClick={addItem}>Add</Button>
        </div>
      </Card>

      {items.isLoading ? (
        <Empty>Loading…</Empty>
      ) : (
        <Table headers={['Item', 'Category', 'On hand', 'Reorder at', 'Actions']}>
          {items.data?.map((i) => {
            const qty = Number(i.currentQty);
            const low = qty <= Number(i.reorderPoint);
            return (
              <tr key={i.id}>
                <Td>{i.name}</Td>
                <Td>{i.category}</Td>
                <Td>
                  {qty} {i.unit} {low && <Badge tone="amber">low</Badge>}
                </Td>
                <Td>{Number(i.reorderPoint)}</Td>
                <Td>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => count(i.id)}>Count</Button>
                    <Button size="sm" variant="secondary" onClick={() => wastage(i.id)}>Wastage</Button>
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
