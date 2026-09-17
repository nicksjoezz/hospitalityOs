import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Badge, Empty, money } from '../components/ui';

interface MenuItem { id: string; name: string; price: number }
interface Order { id: string; outlet: string; status: string; total: number }
interface EscposReceipt { orderId: string; type: string; asciiText: string; rawBase64: string; filename: string }

const tone = (s: string) => (s === 'PAID' ? 'green' : s === 'OPEN' ? 'amber' : 'sky');

export function POS() {
  const qc = useQueryClient();
  const menu = useQuery({ queryKey: ['menu'], queryFn: () => apiGet<MenuItem[]>('/restaurant/items') });
  const orders = useQuery({ queryKey: ['orders'], queryFn: () => apiGet<Order[]>('/restaurant/orders') });
  const [cart, setCart] = useState<Record<string, number>>({});
  const [activeReceipt, setActiveReceipt] = useState<EscposReceipt | null>(null);

  const addToCart = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const placeOrder = async () => {
    const lines = Object.entries(cart).filter(([, q]) => q > 0).map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
    if (lines.length === 0) return;
    await apiWrite('POST', '/restaurant/orders', { outlet: 'RESTAURANT', lines });
    setCart({});
    await qc.invalidateQueries({ queryKey: ['orders'] });
  };
  const act = async (id: string, action: 'send' | 'pay') => {
    await apiWrite('POST', `/restaurant/orders/${id}/${action}`, {});
    await qc.invalidateQueries();
  };

  const printThermal = async (orderId: string, type: 'receipt' | 'kot') => {
    try {
      const data = await apiGet<EscposReceipt>(`/restaurant/orders/${orderId}/escpos?type=${type}`);
      setActiveReceipt(data);
    } catch {
      alert('Failed to generate ESC/POS receipt');
    }
  };

  return (
    <div className="space-y-6">
      <PageTitle title="Restaurant & Bar POS" />

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-600">Menu</h3>
        {menu.data?.length === 0 && <Empty>No menu items. Add them via the API/kitchen.</Empty>}
        <div className="flex flex-wrap gap-2">
          {menu.data?.map((m) => (
            <button key={m.id} onClick={() => addToCart(m.id)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 transition-colors">
              {m.name} · {money(m.price)} {cart[m.id] ? <Badge tone="sky">{cart[m.id]}</Badge> : null}
            </button>
          ))}
        </div>
        {Object.keys(cart).length > 0 && (
          <div className="mt-3"><Button onClick={placeOrder}>Place order ({Object.values(cart).reduce((a, b) => a + b, 0)} items)</Button></div>
        )}
      </Card>

      {/* ESC/POS Thermal Receipt Modal */}
      {activeReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md bg-white p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-slate-800">
                🖨️ ESC/POS Thermal {activeReceipt.type === 'kot' ? 'Kitchen Ticket (KOT)' : 'Receipt'}
              </h3>
              <button onClick={() => setActiveReceipt(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <pre className="overflow-x-auto rounded bg-slate-900 p-4 font-mono text-xs text-emerald-400 whitespace-pre leading-relaxed shadow-inner">
              {activeReceipt.asciiText}
            </pre>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => window.print()}>Browser Print</Button>
              <Button onClick={() => {
                const blob = new Blob([activeReceipt.asciiText], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = activeReceipt.filename.replace('.bin', '.txt');
                a.click();
              }}>
                Export Thermal File
              </Button>
              <Button variant="secondary" onClick={() => setActiveReceipt(null)}>Close</Button>
            </div>
          </Card>
        </div>
      )}

      {orders.isLoading ? (
        <Empty>Loading…</Empty>
      ) : (
        <Table headers={['Order', 'Outlet', 'Total', 'Status', 'Print / Hardware', 'Actions']}>
          {orders.data?.map((o) => (
            <tr key={o.id}>
              <Td>{o.id.slice(0, 8)}</Td>
              <Td>{o.outlet}</Td>
              <Td>{money(o.total)}</Td>
              <Td><Badge tone={tone(o.status)}>{o.status}</Badge></Td>
              <Td>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => printThermal(o.id, 'receipt')}>
                    🧾 Receipt
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => printThermal(o.id, 'kot')}>
                    🍳 KOT
                  </Button>
                </div>
              </Td>
              <Td>
                <div className="flex gap-1">
                  {o.status === 'OPEN' && <Button size="sm" onClick={() => act(o.id, 'send')}>Send to Kitchen</Button>}
                  {o.status !== 'PAID' && o.status !== 'CANCELLED' && <Button size="sm" variant="success" onClick={() => act(o.id, 'pay')}>Pay</Button>}
                </div>
              </Td>
            </tr>
          ))}
          {orders.data?.length === 0 && <tr><Td>No orders.</Td></tr>}
        </Table>
      )}
    </div>
  );
}
