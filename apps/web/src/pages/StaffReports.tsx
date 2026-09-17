import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty } from '../components/ui';

interface Report {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  anonymous: boolean;
  reporterId: string | null;
  subjectFreeText: string | null;
  resolutionNote?: string | null;
  at: string;
}

const CATS = [
  'SAFETY',
  'HARASSMENT',
  'MISCONDUCT',
  'POLICY_VIOLATION',
  'THEFT_SUSPICION',
  'PERFORMANCE',
  'ABSENCE',
  'PRAISE',
  'OTHER',
];

const STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'ACTION_TAKEN', 'DISMISSED', 'RESOLVED'];

export function StaffReports() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isManager = user?.role === 'OWNER' || user?.role === 'MANAGER';
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Manager sees all hotel reports
  const allReports = useQuery({
    queryKey: ['staff-reports', filterStatus],
    queryFn: () =>
      apiGet<Report[]>(filterStatus === 'ALL' ? '/staff-reports' : `/staff-reports?status=${filterStatus}`),
    enabled: isManager,
  });

  // Regular staff member sees reports they submitted
  const myReports = useQuery({
    queryKey: ['my-staff-reports'],
    queryFn: () => apiGet<Report[]>('/staff-reports/mine'),
  });

  const [form, setForm] = useState({
    subjectFreeText: '',
    category: 'SAFETY',
    severity: 'MEDIUM',
    title: '',
    description: '',
    anonymous: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const submit = async () => {
    if (!form.title || !form.description) {
      alert('Please fill in both title and description');
      return;
    }
    if (!form.subjectFreeText) {
      alert('Please state who or what department this report is regarding');
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      await apiWrite('POST', '/staff-reports', {
        ...form,
        subjectFreeText: form.subjectFreeText,
      });
      setForm({
        subjectFreeText: '',
        category: 'SAFETY',
        severity: 'MEDIUM',
        title: '',
        description: '',
        anonymous: false,
      });
      setFeedback('Report submitted confidentially. Management has been notified.');
      await qc.invalidateQueries({ queryKey: ['my-staff-reports'] });
      if (isManager) await qc.invalidateQueries({ queryKey: ['staff-reports'] });
    } catch (e: any) {
      alert(e?.message ?? 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    await apiWrite('PATCH', `/staff-reports/${id}/status`, { status });
    await qc.invalidateQueries({ queryKey: ['staff-reports'] });
    await qc.invalidateQueries({ queryKey: ['my-staff-reports'] });
  };

  const reveal = async (id: string) => {
    if (!confirm('This action is strictly logged in the audit trail. Reveal anonymous reporter?')) return;
    const res = await apiWrite<{ reporter: { name: string; role: string } | null }>(
      'POST',
      `/staff-reports/${id}/reveal-reporter`,
      {},
    );
    if (!res.queued) {
      alert(`Reporter: ${res.data.reporter?.name ?? 'Unknown'} (${res.data.reporter?.role ?? 'N/A'})`);
    }
  };

  const severityTone = (sev: string): 'red' | 'amber' | 'blue' | 'slate' => {
    if (sev === 'CRITICAL' || sev === 'HIGH') return 'red';
    if (sev === 'MEDIUM') return 'amber';
    if (sev === 'LOW') return 'blue';
    return 'slate';
  };

  const statusTone = (st: string): 'green' | 'amber' | 'blue' | 'slate' | 'red' => {
    if (st === 'RESOLVED' || st === 'ACTION_TAKEN') return 'green';
    if (st === 'UNDER_REVIEW') return 'amber';
    if (st === 'DISMISSED') return 'slate';
    return 'blue';
  };

  return (
    <div className="space-y-6">
      <PageTitle
        title="Grievances & Confidential Reports"
        action={
          <div className="text-xs text-slate-500 font-medium">
            Protected Staff Whistleblowing &amp; Workplace Safety
          </div>
        }
      />

      {/* Trust & Policy Explainer Banner */}
      <div className="rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50 via-indigo-50/50 to-white p-4 text-sky-950 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🛡️</span>
          <div>
            <h4 className="text-sm font-semibold text-sky-900">Confidential &amp; Retaliation-Free Channel</h4>
            <p className="mt-0.5 text-xs text-sky-800 leading-relaxed">
              Every staff member has the right to a safe, fair, and respectful workplace. Reports can be submitted with your name or
              completely <strong>anonymously</strong>. The person being reported will <strong>never</strong> know who submitted the report.
            </p>
          </div>
        </div>
      </div>

      {/* Submission Form */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Submit a Confidential Incident / Grievance</h3>
            <p className="text-xs text-slate-500">Report safety hazards, harassment, workplace disputes, theft, or policy breaches directly to leadership.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Category</label>
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATS.map((c) => (
                <option key={c} value={c}>{c.replace('_', ' ')}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Severity Level</label>
            <Select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              <option value="LOW">Low (Minor policy or feedback)</option>
              <option value="MEDIUM">Medium (Operational friction/complaint)</option>
              <option value="HIGH">High (Harassment / Theft / Safety risk)</option>
              <option value="CRITICAL">Critical (Immediate danger or gross misconduct)</option>
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Subject (Person / Dept / Area)</label>
            <Input
              placeholder="e.g. Head Chef, Room 204, Kitchen Manager"
              value={form.subjectFreeText}
              onChange={(e) => setForm({ ...form, subjectFreeText: e.target.value })}
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-xs font-semibold text-slate-600 block mb-1">Summary Title</label>
            <Input
              placeholder="Brief summary of the incident or issue"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-xs font-semibold text-slate-600 block mb-1">Detailed Description &amp; What Occurred</label>
            <textarea
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              rows={3}
              placeholder="Provide exact details, dates, times, and context. Be as thorough as possible..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <label className="flex items-center gap-2 text-sm text-slate-700 select-none cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={form.anonymous}
              onChange={(e) => setForm({ ...form, anonymous: e.target.checked })}
            />
            <span className="font-medium">Submit completely anonymously</span>
            <span className="text-xs text-slate-400">(Your name is hidden from all managers)</span>
          </label>

          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit Confidential Report'}
          </Button>
        </div>

        {feedback && (
          <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800 font-medium">
            ✓ {feedback}
          </div>
        )}
      </Card>

      {/* Staff's Own Submitted Reports Tracking */}
      {!isManager && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-800">My Submitted Reports &amp; Status</h3>
          <p className="text-xs text-slate-500">Track how leadership is reviewing your reports. Only you and hotel leadership can see this.</p>

          {myReports.isLoading ? (
            <Empty>Loading your reports…</Empty>
          ) : (
            <Table headers={['Date', 'Title & Details', 'Category', 'Target', 'Status']}>
              {myReports.data?.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap text-xs text-slate-500">
                    {new Date(r.at).toLocaleDateString()}
                  </Td>
                  <Td>
                    <div className="font-semibold text-slate-900 text-sm">{r.title}</div>
                    <div className="text-xs text-slate-500 line-clamp-2 mt-0.5">{r.description}</div>
                    {r.resolutionNote && (
                      <div className="mt-1 text-xs text-emerald-700 bg-emerald-50 p-1 rounded font-medium">
                        Management Note: {r.resolutionNote}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <Badge tone="slate">{r.category.replace('_', ' ')}</Badge>
                  </Td>
                  <Td className="text-xs text-slate-600">{r.subjectFreeText || 'N/A'}</Td>
                  <Td>
                    <Badge tone={statusTone(r.status)}>{r.status.replace('_', ' ')}</Badge>
                  </Td>
                </tr>
              ))}
              {(!myReports.data || myReports.data.length === 0) && (
                <tr>
                  <Td colSpan={5} className="text-center py-6 text-slate-400 text-xs">
                    You have not submitted any identified reports yet.
                  </Td>
                </tr>
              )}
            </Table>
          )}
        </div>
      )}

      {/* Management Investigation & Action Dashboard */}
      {isManager && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Hotel Grievances &amp; Incident Reviews</h3>
              <p className="text-xs text-slate-500">Confidential leadership queue. Review incidents, assign investigation status, and record resolutions.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Filter Status:</span>
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="ALL">All Statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </Select>
            </div>
          </div>

          {allReports.isLoading ? (
            <Empty>Loading incident log…</Empty>
          ) : (
            <Table headers={['Incident & Subject', 'Category & Severity', 'Reporter', 'Review Status', 'Actions']}>
              {allReports.data?.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <div className="font-bold text-slate-900 text-sm">{r.title}</div>
                    <div className="text-xs text-slate-600 mt-1 max-w-md">{r.description}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                      <span>Regarding: <strong>{r.subjectFreeText || 'Unspecified'}</strong></span>
                      <span>·</span>
                      <span>{new Date(r.at).toLocaleString()}</span>
                    </div>
                  </Td>
                  <Td>
                    <div className="space-y-1">
                      <div><Badge tone="slate">{r.category.replace('_', ' ')}</Badge></div>
                      <div><Badge tone={severityTone(r.severity)}>{r.severity}</Badge></div>
                    </div>
                  </Td>
                  <Td>
                    {r.anonymous ? (
                      <Badge tone="amber">Anonymous Whistleblower</Badge>
                    ) : (
                      <div className="text-xs">
                        <span className="font-semibold text-slate-700">Staff Member</span>
                        <div className="text-[11px] text-slate-400 font-mono">{r.reporterId?.slice(0, 8)}</div>
                      </div>
                    )}
                  </Td>
                  <Td>
                    <Select
                      value={r.status}
                      onChange={(e) => setStatus(r.id, e.target.value)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s.replace('_', ' ')}</option>
                      ))}
                    </Select>
                    <div className="mt-1">
                      <Badge tone={statusTone(r.status)}>{r.status.replace('_', ' ')}</Badge>
                    </div>
                  </Td>
                  <Td>
                    {r.anonymous && user?.role === 'OWNER' && (
                      <Button size="sm" variant="danger" onClick={() => reveal(r.id)}>
                        Audit Reveal
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
              {allReports.data?.length === 0 && (
                <tr>
                  <Td colSpan={5} className="text-center py-6 text-slate-400 text-xs">
                    No reports found for this filter.
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
