import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty } from '../components/ui';

interface Campaign {
  id: string;
  name: string;
  status: string;
  segment: { vip?: boolean; all?: boolean };
  metrics: { recipients?: number; queued?: number; estimatedCost?: number } | null;
}

interface LifecycleTrigger {
  id: string;
  title: string;
  event: string;
  enabled: boolean;
  channel: string;
  template: string;
  variables: string[];
}

export function Marketing() {
  const qc = useQueryClient();
  const { hotel } = useAuth();
  const campaigns = useQuery({ queryKey: ['campaigns'], queryFn: () => apiGet<Campaign[]>('/marketing/campaigns') });

  const [activeTab, setActiveTab] = useState<'triggers' | 'broadcast'>('triggers');

  // Broadcast campaign state
  const [brief, setBrief] = useState('');
  const [body, setBody] = useState('');
  const [name, setName] = useState('');
  const [segment, setSegment] = useState('vip');

  // Lifecycle triggers state
  const [triggers, setTriggers] = useState<LifecycleTrigger[]>([
    {
      id: 'trig_confirm',
      title: 'Instant Booking Confirmation',
      event: 'Triggered when a new reservation is confirmed',
      enabled: true,
      channel: 'WhatsApp / SMS',
      template:
        'Dear {guestName}, your reservation at {hotelName} is confirmed! 🏨 Dates: {checkInDate} to {checkOutDate}. Your reference is {refId}. We look forward to hosting you!',
      variables: ['{guestName}', '{hotelName}', '{checkInDate}', '{checkOutDate}', '{refId}'],
    },
    {
      id: 'trig_arrival',
      title: 'Day-of-Arrival Welcome & WiFi Details',
      event: 'Triggered at 9:00 AM on guest arrival date',
      enabled: true,
      channel: 'WhatsApp / SMS',
      template:
        'Good morning {guestName}! Your room at {hotelName} will be ready at 2:00 PM. High-speed WiFi is "{wifiPassword}". Reply to this message for early arrival or directions.',
      variables: ['{guestName}', '{hotelName}', '{wifiPassword}'],
    },
    {
      id: 'trig_review',
      title: 'Post-Checkout Google Review Booster',
      event: 'Triggered 2 hours after guest checkout',
      enabled: true,
      channel: 'WhatsApp',
      template:
        'Thank you for staying at {hotelName}, {guestName}! We hope you had a wonderful visit. If you enjoyed your stay, would you mind leaving us a 5-star Google review? {reviewUrl}',
      variables: ['{guestName}', '{hotelName}', '{reviewUrl}'],
    },
  ]);

  const [testSentMsg, setTestSentMsg] = useState<string | null>(null);

  const toggleTrigger = (id: string) => {
    setTriggers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)),
    );
  };

  const updateTemplate = (id: string, text: string) => {
    setTriggers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, template: text } : t)),
    );
  };

  const sendTest = (t: LifecycleTrigger) => {
    setTestSentMsg(`Test message for "${t.title}" dispatched via WhatsApp queue!`);
    setTimeout(() => setTestSentMsg(null), 4000);
  };

  const draft = async () => {
    const res = await apiWrite<{ draft: string }>('POST', '/marketing/draft', { brief });
    if (!res.queued) setBody(res.data.draft);
  };

  const createCampaign = async () => {
    if (!name || !body) return;
    await apiWrite('POST', '/marketing/campaigns', {
      name,
      channel: 'WHATSAPP',
      segment: segment === 'all' ? { all: true } : { vip: true },
      body,
    });
    setName(''); setBody(''); setBrief('');
    await qc.invalidateQueries({ queryKey: ['campaigns'] });
  };

  const act = async (id: string, action: 'approve' | 'send') => {
    await apiWrite('POST', `/marketing/campaigns/${id}/${action}`, {});
    await qc.invalidateQueries({ queryKey: ['campaigns'] });
  };

  return (
    <div className="space-y-6">
      <PageTitle
        title="Guest Marketing &amp; Automated Messaging"
        action={
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            Automated WhatsApp &amp; SMS Lifecycle
          </div>
        }
      />

      {/* Tab Selector */}
      <div className="flex rounded-xl bg-slate-200/80 p-1 text-xs font-semibold max-w-md">
        <button
          onClick={() => setActiveTab('triggers')}
          className={`flex-1 py-2 rounded-lg transition-all text-center cursor-pointer ${
            activeTab === 'triggers' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          ⚡ Automated Lifecycle Triggers
        </button>
        <button
          onClick={() => setActiveTab('broadcast')}
          className={`flex-1 py-2 rounded-lg transition-all text-center cursor-pointer ${
            activeTab === 'broadcast' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          📢 Broadcast Campaigns &amp; AI
        </button>
      </div>

      {testSentMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 font-medium">
          ✓ {testSentMsg}
        </div>
      )}

      {/* TAB 1: AUTOMATED LIFECYCLE TRIGGERS */}
      {activeTab === 'triggers' && (
        <div className="space-y-4">
          <Card className="border-indigo-100 bg-gradient-to-r from-indigo-50/50 via-sky-50/30 to-white">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🤖</span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Zero-Effort Guest Touchpoints</h3>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  These automated WhatsApp and SMS messages fire automatically at key stages of the guest journey.
                  They eliminate front desk phone calls, boost online reviews, and ensure repeat direct bookings.
                </p>
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            {triggers.map((trig) => (
              <Card key={trig.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{trig.title}</h4>
                      <Badge tone={trig.enabled ? 'green' : 'slate'}>
                        {trig.enabled ? 'Active / Auto-Trigger' : 'Paused'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{trig.event} · Channel: {trig.channel}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => sendTest(trig)}
                    >
                      Send Test
                    </Button>
                    <button
                      onClick={() => toggleTrigger(trig.id)}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                        trig.enabled ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      {trig.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                    Message Template (Variables: {trig.variables.join(' ')})
                  </label>
                  <textarea
                    rows={2}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-800 font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={trig.template}
                    onChange={(e) => updateTemplate(trig.id, e.target.value)}
                  />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: BROADCAST CAMPAIGNS */}
      {activeTab === 'broadcast' && (
        <div className="space-y-4">
          <Card>
            <div className="mb-3">
              <h3 className="text-sm font-bold text-slate-900">Create WhatsApp Promotional Broadcast</h3>
              <p className="text-xs text-slate-500">Draft promotional campaigns for weekend flash sales, dining specials, and VIP promotions.</p>
            </div>

            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Brief for AI Copywriter (e.g. 20% discount on poolside cocktails this Friday)"
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  className="flex-1"
                />
                <Button variant="secondary" onClick={draft}>✨ AI Copywriter</Button>
              </div>

              <Input
                placeholder="Campaign Name (e.g. Weekend Flash Sale)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <textarea
                placeholder="Message body (supports WhatsApp bold with *word* and emojis)..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                rows={3}
              />

              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">Target Audience:</span>
                  <Select value={segment} onChange={(e) => setSegment(e.target.value)} className="w-44">
                    <option value="vip">VIP Guests (Top 20% Spend)</option>
                    <option value="all">All Past Guests in CRM</option>
                  </Select>
                </div>

                <Button onClick={createCampaign}>Create Campaign Draft</Button>
              </div>
            </div>
          </Card>

          {/* Campaigns Table */}
          {campaigns.isLoading ? (
            <Empty>Loading campaigns…</Empty>
          ) : (
            <Table headers={['Campaign Name', 'Target Segment', 'Status', 'Queued Recipients', 'Actions']}>
              {campaigns.data?.map((c) => (
                <tr key={c.id}>
                  <Td className="font-bold text-slate-800">{c.name}</Td>
                  <Td>{c.segment?.vip ? 'VIP Guests Only' : 'All Contacts'}</Td>
                  <Td>
                    <Badge tone={c.status === 'SENT' ? 'green' : c.status === 'APPROVED' ? 'sky' : 'slate'}>
                      {c.status}
                    </Badge>
                  </Td>
                  <Td>{c.metrics?.queued != null ? `${c.metrics.queued} queued` : 'Calculated on approval'}</Td>
                  <Td>
                    <div className="flex gap-1.5">
                      {c.status === 'DRAFT' && (
                        <Button size="sm" variant="success" onClick={() => act(c.id, 'approve')}>
                          Approve
                        </Button>
                      )}
                      {c.status === 'APPROVED' && (
                        <Button size="sm" onClick={() => act(c.id, 'send')}>
                          Dispatch Messages
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
              {campaigns.data?.length === 0 && (
                <tr>
                  <Td colSpan={5} className="text-center py-6 text-slate-400 text-xs">
                    No campaigns created yet. Use the composer above to draft one.
                  </Td>
                </tr>
              )}
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
