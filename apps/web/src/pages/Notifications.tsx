import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageTitle, Card, Button, Badge, Input, Select, Empty } from '../components/ui';

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string;
  role?: string | null;
  readAt: string | null;
  at: string;
}

const DEPARTMENTS = [
  { value: 'ALL', label: '📢 All Staff (Hotel-wide Broadcast)' },
  { value: 'SECURITY', label: '🛡️ Security & Gate Guard' },
  { value: 'KITCHEN', label: '🍳 Kitchen & Chefs (KDS)' },
  { value: 'BAR', label: '🍸 Bar & Lounge' },
  { value: 'HOUSEKEEPING', label: '🧹 Housekeeping & Laundry' },
  { value: 'FRONT_DESK', label: '🛎️ Front Desk & Concierge' },
  { value: 'MAINTENANCE', label: '🔧 Maintenance & Facilities' },
  { value: 'ACCOUNTANT', label: '💼 Finance & Accounts' },
];

const ALERT_TYPES = [
  { value: 'alert.notice', label: 'Notice / Announcement' },
  { value: 'alert.urgent', label: '⚠️ Urgent Operational Alert' },
  { value: 'alert.security', label: '🚨 Critical / Security Alert' },
  { value: 'alert.kitchen', label: '🍽️ VIP Banquet / Rush Order' },
];

export function Notifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isManager = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const { data, isLoading } = useQuery({
    queryKey: ['notifs'],
    queryFn: () => apiGet<Notif[]>('/notifications'),
  });

  const [form, setForm] = useState({
    role: 'ALL',
    type: 'alert.notice',
    title: '',
    body: '',
  });
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const sendAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return;
    setSending(true);
    try {
      await apiWrite('POST', '/notifications', form);
      setForm({ role: 'ALL', type: 'alert.notice', title: '', body: '' });
      await qc.invalidateQueries({ queryKey: ['notifs'] });
    } finally {
      setSending(false);
    }
  };

  const markRead = async (id: string) => {
    await apiWrite('POST', `/notifications/${id}/read`, {});
    await qc.invalidateQueries({ queryKey: ['notifs'] });
  };

  const readAll = async () => {
    await apiWrite('POST', '/notifications/read-all', {});
    await qc.invalidateQueries({ queryKey: ['notifs'] });
  };

  const displayedNotifs = (data ?? []).filter((n) => {
    if (filter === 'unread') return !n.readAt;
    return true;
  });

  const unreadCount = (data ?? []).filter((n) => !n.readAt).length;

  return (
    <div className="space-y-5">
      <PageTitle
        title="Alerts & Department Dispatch"
        action={
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Badge tone="red">{unreadCount} unread</Badge>
            )}
            <Button variant="secondary" onClick={readAll}>
              Mark all read
            </Button>
          </div>
        }
      />

      {/* Management Dispatch Composer */}
      {isManager && (
        <Card className="border-brand/20 bg-slate-50/50">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">
                🚨 Dispatch Targeted Alert / Staff Notice
              </h3>
              <p className="text-xs text-slate-500">
                Send real-time alerts to specific departments (e.g. Security, Kitchen) or broadcast to all employees.
              </p>
            </div>
            <Badge tone="sky">Manager Action</Badge>
          </div>

          <form onSubmit={sendAlert} className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Target Department / Audience
                </label>
                <Select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Alert Priority &amp; Type
                </label>
                <Select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full"
                >
                  {ALERT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Alert Headline
              </label>
              <Input
                placeholder="e.g. Suspicious vehicle at main gate / VIP arrival in 30 mins"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Message &amp; Operational Instructions
              </label>
              <textarea
                rows={2}
                placeholder="Provide clear instructions for staff (e.g. inspect perimeter, double prep station 1)..."
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                className="w-full rounded-md border border-slate-300 p-2 text-sm focus:border-brand focus:outline-none"
                required
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={sending}>
                {sending ? 'Dispatching…' : 'Dispatch Alert'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Feed Filters */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`rounded-md px-3 py-1 text-xs font-medium ${
              filter === 'all'
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Alerts ({data?.length ?? 0})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`rounded-md px-3 py-1 text-xs font-medium ${
              filter === 'unread'
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>
      </div>

      {/* Feed Content */}
      {isLoading ? (
        <Empty>Loading alerts…</Empty>
      ) : (
        <div className="space-y-2">
          {displayedNotifs.map((n) => {
            const isUrgent =
              n.type.includes('urgent') ||
              n.type.includes('security') ||
              n.type.includes('incident');

            return (
              <Card
                key={n.id}
                className={`${n.readAt ? 'opacity-65' : 'border-l-4'} ${
                  isUrgent
                    ? 'border-l-red-500 bg-red-50/20'
                    : 'border-l-brand bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {n.title}
                      </span>
                      {n.role && (
                        <Badge tone="sky">Dept: {n.role}</Badge>
                      )}
                      {!n.role && (
                        <Badge tone="slate">All Staff</Badge>
                      )}
                      {isUrgent && <Badge tone="red">⚠️ High Priority</Badge>}
                      {!n.readAt && <Badge tone="amber">new</Badge>}
                    </div>
                    <p className="text-sm text-slate-600">{n.body}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(n.at).toLocaleString()}
                    </p>
                  </div>
                  {!n.readAt && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => markRead(n.id)}
                    >
                      Acknowledge
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
          {displayedNotifs.length === 0 && (
            <Empty>No {filter === 'unread' ? 'unread ' : ''}alerts.</Empty>
          )}
        </div>
      )}
    </div>
  );
}

