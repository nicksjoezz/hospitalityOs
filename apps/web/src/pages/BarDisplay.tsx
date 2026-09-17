import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { StationBoard } from '../components/StationBoard';
import { Card, Button, Input, Select } from '../components/ui';

interface Item { id: string; name: string; unit: string; category: string }

/** Bar Display — drink tickets (separate from kitchen) + pour logging. */
export function BarDisplay() {
  const { data: items } = useQuery({
    queryKey: ['bar-stock'],
    queryFn: () => apiGet<Item[]>('/inventory/items?category=BEVERAGE_ALCOHOL'),
  });
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('1');
  const [msg, setMsg] = useState<string | null>(null);

  const logPour = async () => {
    if (!itemId) return;
    const item = items?.find((i) => i.id === itemId);
    await apiWrite('POST', '/bar/pours', { inventoryItemId: itemId, quantity: Number(qty), unit: item?.unit ?? 'unit' });
    setMsg(`Logged ${qty} ${item?.unit ?? ''} of ${item?.name ?? ''}`);
    setTimeout(() => setMsg(null), 2500);
  };

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-600">Log a pour (decrements bar stock)</h3>
        <div className="flex flex-wrap gap-2">
          <Select value={itemId} onChange={(e) => setItemId(e.target.value)} className="w-56">
            <option value="">Choose bottle/item…</option>
            {items?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
          <Input value={qty} onChange={(e) => setQty(e.target.value)} className="w-24" />
          <Button onClick={logPour}>Log pour</Button>
          {msg && <span className="self-center text-sm text-emerald-600">{msg}</span>}
        </div>
      </Card>
      <StationBoard station="bar" title="Bar display" />
    </div>
  );
}
