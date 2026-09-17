import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty } from '../components/ui';

interface Conn {
  id: string;
  channel: string;
  name: string;
  active: boolean;
  lastSyncAt: string | null;
}

interface RoomType {
  id: string;
  name: string;
}

export function Channels() {
  const qc = useQueryClient();
  const conns = useQuery({ queryKey: ['channels'], queryFn: () => apiGet<Conn[]>('/channel-manager/connections') });
  const roomTypes = useQuery({
    queryKey: ['public-room-types'],
    queryFn: async () => {
      const data = await apiGet<{ roomTypes: RoomType[] }>('/public/room-types');
      return data.roomTypes ?? [];
    },
  });

  const [form, setForm] = useState({ channel: 'BOOKING_COM', name: '' });
  const [msg, setMsg] = useState<string | null>(null);

  // iCal Sync States
  const [exportRoomTypeId, setExportRoomTypeId] = useState<string>('');
  const [importForm, setImportForm] = useState({
    roomTypeId: '',
    channelName: 'Airbnb',
    icalUrl: '',
  });
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const selectedExportId = exportRoomTypeId || (roomTypes.data?.[0]?.id ?? '');
  const exportUrl = selectedExportId
    ? `${window.location.origin}/api/v1/channel-manager/ical/export/${selectedExportId}.ics`
    : '';

  const connect = async () => {
    if (!form.name) return;
    await apiWrite('POST', '/channel-manager/connections', form);
    setForm({ channel: 'BOOKING_COM', name: '' });
    await qc.invalidateQueries({ queryKey: ['channels'] });
  };

  const push = async (id: string) => {
    const res = await apiWrite<{ pushed: number; channel: string }>('POST', `/channel-manager/connections/${id}/push`, {});
    if (!res.queued) setMsg(`Pushed ${res.data.pushed} availability/rate rows to ${res.data.channel}.`);
    await qc.invalidateQueries({ queryKey: ['channels'] });
  };

  const handleIcalSync = async (e: React.FormEvent) => {
    e.preventDefault();
    const rtId = importForm.roomTypeId || (roomTypes.data?.[0]?.id ?? '');
    if (!rtId || !importForm.icalUrl) {
      alert('Please select a room type and paste a valid iCal URL');
      return;
    }

    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await apiWrite<{ message: string; importedCount: number }>('POST', '/channel-manager/ical/sync', {
        roomTypeId: rtId,
        icalUrl: importForm.icalUrl.trim(),
        channelName: importForm.channelName,
      });
      if (!res.queued) {
        setSyncResult(res.data.message || `Successfully synced ${res.data.importedCount} reservations!`);
        setImportForm({ ...importForm, icalUrl: '' });
        await qc.invalidateQueries({ queryKey: ['reservations'] });
        await qc.invalidateQueries({ queryKey: ['rack'] });
      }
    } catch (err: any) {
      alert(err?.message ?? 'Failed to sync iCal calendar');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageTitle
        title="Channel Manager &amp; OTA Distribution"
        action={
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            Two-Way Calendar Sync · Zero Double-Bookings
          </div>
        }
      />

      {/* Overview Card */}
      <Card className="border-sky-200 bg-gradient-to-r from-sky-50 via-indigo-50/40 to-white">
        <div className="flex items-start gap-3 text-sky-950">
          <span className="text-2xl">🔄</span>
          <div>
            <h4 className="text-sm font-bold text-sky-900">Multi-Channel Distribution (Direct &amp; OTAs)</h4>
            <p className="mt-0.5 text-xs text-sky-800 leading-relaxed">
              Synchronize room rates and availability with <strong>Booking.com</strong>, <strong>Airbnb</strong>, <strong>Expedia</strong>, and <strong>VRBO</strong>.
              Use Direct iCal Calendar Sync for zero-cost instant synchronization, or enterprise API credentials for real-time push.
            </p>
          </div>
        </div>
      </Card>

      {/* STANDOUT MOAT: DIRECT TWO-WAY ICAL CALENDAR SYNC */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Export Feed to Airbnb / Booking.com */}
        <Card className="space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">1. Export iCal Feed (Outbound)</h3>
              <Badge tone="green">RFC 5545</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Paste this link into your Airbnb, Booking.com, or VRBO calendar export settings. Whenever a room is booked on HospitalityOS, OTAs will automatically block those dates.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Select Room Category</label>
            <Select
              value={selectedExportId}
              onChange={(e) => setExportRoomTypeId(e.target.value)}
              className="w-full"
            >
              {roomTypes.data?.map((rt) => (
                <option key={rt.id} value={rt.id}>{rt.name}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Your Public .ICS Calendar URL</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-slate-100 p-2.5 text-xs text-slate-700 font-mono truncate select-all border border-slate-200">
                {exportUrl || 'Select a room category above'}
              </code>
              <Button
                size="sm"
                onClick={() => {
                  if (!exportUrl) return;
                  void navigator.clipboard?.writeText(exportUrl);
                  alert('Copied iCal export URL to clipboard!');
                }}
              >
                Copy URL
              </Button>
            </div>
          </div>
        </Card>

        {/* 2. Import External Airbnb / Booking.com Calendar */}
        <Card className="space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">2. Import External OTA Calendar (Inbound)</h3>
              <Badge tone="sky">Auto-Block Dates</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Paste your Airbnb or Booking.com calendar sync link here. HospitalityOS will import the bookings and block the dates on your Visual Rack.
            </p>
          </div>

          <form onSubmit={handleIcalSync} className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Room Category</label>
                <Select
                  value={importForm.roomTypeId || selectedExportId}
                  onChange={(e) => setImportForm({ ...importForm, roomTypeId: e.target.value })}
                  className="w-full"
                >
                  {roomTypes.data?.map((rt) => (
                    <option key={rt.id} value={rt.id}>{rt.name}</option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">OTA Platform</label>
                <Select
                  value={importForm.channelName}
                  onChange={(e) => setImportForm({ ...importForm, channelName: e.target.value })}
                  className="w-full"
                >
                  <option value="Airbnb">Airbnb Calendar</option>
                  <option value="Booking.com">Booking.com iCal</option>
                  <option value="VRBO">VRBO / HomeAway</option>
                  <option value="TripAdvisor">TripAdvisor iCal</option>
                  <option value="Other OTA">Other Calendar URL</option>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Remote iCal Calendar URL</label>
              <Input
                placeholder="https://www.airbnb.com/calendar/ical/12345.ics?s=..."
                value={importForm.icalUrl}
                onChange={(e) => setImportForm({ ...importForm, icalUrl: e.target.value })}
                required
              />
            </div>

            <div className="pt-1 flex items-center justify-between">
              {syncResult ? (
                <span className="text-xs font-semibold text-emerald-700">✓ {syncResult}</span>
              ) : <div />}
              <Button type="submit" disabled={syncing}>
                {syncing ? 'Fetching & Blocking Dates…' : 'Sync Calendar Now'}
              </Button>
            </div>
          </form>
        </Card>
      </div>

      {/* Enterprise Certified API Connections */}
      <Card>
        <div className="mb-3">
          <h3 className="text-sm font-bold text-slate-900">Direct API Channels &amp; Webhooks</h3>
          <p className="text-xs text-slate-500">
            Certified API integrations for large distribution channel accounts.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} className="w-44">
            {['BOOKING_COM', 'EXPEDIA', 'AIRBNB', 'GENERIC'].map((c) => (
              <option key={c} value={c}>{c.replace('_', '.')}</option>
            ))}
          </Select>
          <Input placeholder="Connection / Property ID" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Button onClick={connect}>Add Direct Connection</Button>
        </div>
      </Card>

      {msg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 font-medium">
          ✓ {msg}
        </div>
      )}

      {/* Connections Table */}
      {conns.isLoading ? (
        <Empty>Loading active connections…</Empty>
      ) : (
        <Table headers={['Channel', 'Connection Name', 'Status', 'Last Synced', 'Manual Action']}>
          {conns.data?.map((c) => (
            <tr key={c.id}>
              <Td className="font-bold text-slate-800">{c.channel.replace('_', '.')}</Td>
              <Td>{c.name}</Td>
              <Td><Badge tone={c.active ? 'green' : 'slate'}>{c.active ? 'active' : 'off'}</Badge></Td>
              <Td className="text-xs text-slate-500">{c.lastSyncAt ? new Date(c.lastSyncAt).toLocaleString() : 'Never synced'}</Td>
              <Td>
                <Button size="sm" variant="secondary" onClick={() => push(c.id)}>
                  Push Live Inventory
                </Button>
              </Td>
            </tr>
          ))}
          {conns.data?.length === 0 && (
            <tr>
              <Td colSpan={5} className="text-center py-6 text-slate-400 text-xs">
                No direct API connections created yet. Use the Two-Way iCal Sync cards above for instant setup.
              </Td>
            </tr>
          )}
        </Table>
      )}
    </div>
  );
}
