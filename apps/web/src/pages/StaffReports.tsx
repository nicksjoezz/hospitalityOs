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
  const isOwner = user?.role === 'OWNER';
  const isManager = isOwner || user?.role === 'MANAGER';
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Action / Resolution modal state for Owner & Manager
  const [actionReport, setActionReport] = useState<Report | null>(null);
  const [actionStatus, setActionStatus] = useState<string>('ACTION_TAKEN');
  const [actionNote, setActionNote] = useState<string>('');
  const [savingAction, setSavingAction] = useState(false);

  // Manager & Owner see all hotel reports
  const allReports = useQuery({
    queryKey: ['staff-reports', filterStatus],
    queryFn: () =>
      apiGet<Report[]>(filterStatus === 'ALL' ? '/staff-reports' : `/staff-reports?status=${filterStatus}`),
    enabled: isManager,
  });

  // Regular staff and managers see reports they personally submitted (Owner never submits reports)
  const myReports = useQuery({
    queryKey: ['my-staff-reports'],
    queryFn: () => apiGet<Report[]>('/staff-reports/mine'),
    enabled: !isOwner,
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

  const setStatus = async (id: string, status: string, note?: string) => {
    await apiWrite('PATCH', `/staff-reports/${id}/status`, { status, note });
    await qc.invalidateQueries({ queryKey: ['staff-reports'] });
    await qc.invalidateQueries({ queryKey: ['my-staff-reports'] });
  };

  const handleSaveAction = async () => {
    if (!actionReport) return;
    setSavingAction(true);
    try {
      await setStatus(actionReport.id, actionStatus, actionNote || undefined);
      setActionReport(null);
      setActionNote('');
    } catch (e: any) {
      alert(e?.message ?? 'Failed to update action');
    } finally {
      setSavingAction(false);
    }
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

  // Executive counts for owner oversight
  const reportsList = allReports.data ?? [];
  const pendingCount = reportsList.filter((r) => r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW').length;
  const urgentCount = reportsList.filter((r) => r.severity === 'CRITICAL' || r.severity === 'HIGH').length;
  const resolvedCount = reportsList.filter((r) => r.status === 'RESOLVED' || r.status === 'ACTION_TAKEN').length;

  return (
    <div className="space-y-6">
      <PageTitle
        title={isOwner ? 'Grievances & Incident Oversight' : user?.role === 'MANAGER' ? 'Grievance & Incident Management' : 'Grievances & Confidential Reports'}
        action={
          <div className="text-xs text-slate-500 font-medium">
            {isOwner ? 'Owner Executive Oversight & Action Desk' : user?.role === 'MANAGER' ? 'Manager Incident Resolution & Disciplinary Action Desk' : 'Protected Staff Whistleblowing & Workplace Safety'}
          </div>
        }
      />

      {/* Trust & Policy Explainer Banner / Leadership Oversight Header */}
      {isOwner ? (
        <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50/40 to-white p-4 text-amber-950 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-2xl">👑</span>
            <div>
              <h4 className="text-sm font-bold text-amber-900">Owner Executive Review &amp; Resolution Queue</h4>
              <p className="mt-0.5 text-xs text-amber-800 leading-relaxed">
                As the property owner, you have supreme oversight over all departmental grievances, manager submissions, and anonymous whistleblower reports.
                Review submitted evidence below, designate investigation statuses, and record executive actions taken.
              </p>
            </div>
          </div>
        </div>
      ) : user?.role === 'MANAGER' ? (
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-blue-50/40 to-white p-4 text-indigo-950 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-2xl">💼</span>
            <div>
              <h4 className="text-sm font-bold text-indigo-900">Manager Incident &amp; Grievance Handling Desk</h4>
              <p className="mt-0.5 text-xs text-indigo-800 leading-relaxed">
                As hotel manager, you have full authority to investigate staff grievances, manage operational disputes, update case statuses, and record disciplinary or corrective actions taken.
                You can also submit confidential incident reports to the owner when executive intervention is required.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50 via-indigo-50/50 to-white p-4 text-sky-950 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🛡️</span>
            <div>
              <h4 className="text-sm font-semibold text-sky-900">Confidential &amp; Retaliation-Free Channel</h4>
              <p className="mt-0.5 text-xs text-sky-800 leading-relaxed">
                Every team member has the right to a safe, fair, and respectful workplace. Reports can be submitted with your name or
                completely <strong>anonymously</strong>. The person being reported will <strong>never</strong> know who submitted the report.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Leadership Metrics Bar (Visible to both Owner and Manager!) */}
      {isManager && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div className="text-xs font-semibold text-slate-500">Total Incidents</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{reportsList.length}</div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 shadow-sm">
            <div className="text-xs font-semibold text-amber-800">Pending Review</div>
            <div className="mt-1 text-2xl font-bold text-amber-900">{pendingCount}</div>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-3.5 shadow-sm">
            <div className="text-xs font-semibold text-red-800">High / Urgent</div>
            <div className="mt-1 text-2xl font-bold text-red-900">{urgentCount}</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 shadow-sm">
            <div className="text-xs font-semibold text-emerald-800">Action Taken / Resolved</div>
            <div className="mt-1 text-2xl font-bold text-emerald-900">{resolvedCount}</div>
          </div>
        </div>
      )}

      {/* Submission Form (ONLY visible to Staff & Managers; OWNER does not report anyone) */}
      {!isOwner && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {user?.role === 'MANAGER' ? 'Submit Incident / Escalation Report to Owner' : 'Submit a Confidential Incident / Grievance'}
              </h3>
              <p className="text-xs text-slate-500">
                {user?.role === 'MANAGER'
                  ? 'Escalate serious staff misconduct, safety hazards, theft suspicion, or policy breaches to the property owner.'
                  : 'Report safety hazards, harassment, workplace disputes, theft, or policy breaches directly to leadership.'}
              </p>
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
                <option value="HIGH">High (Safety risk, theft suspicion, harassment)</option>
                <option value="CRITICAL">Critical (Immediate danger, violence, gross misconduct)</option>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Subject / Person / Department</label>
              <Input
                placeholder="e.g. John Doe, Night Shift Security, Kitchen..."
                value={form.subjectFreeText}
                onChange={(e) => setForm({ ...form, subjectFreeText: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-3 space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Incident Title</label>
              <Input
                placeholder="Brief summary of the issue..."
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Detailed Description &amp; Circumstances</label>
              <textarea
                className="w-full rounded-md border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                rows={3}
                placeholder="Describe what happened, where, date/time, and any witnesses..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.anonymous}
                  onChange={(e) => setForm({ ...form, anonymous: e.target.checked })}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>Submit as <strong>Anonymous Whistleblower</strong> (your name will not be attached)</span>
              </label>

              <div className="flex items-center gap-2">
                {feedback && <span className="text-xs font-semibold text-emerald-600">{feedback}</span>}
                <Button onClick={submit} disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit Confidential Report'}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* My Submitted Reports (visible to non-owners) */}
      {!isOwner && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-900">My Submitted Reports</h3>
          {myReports.isLoading ? (
            <Empty>Loading your reports…</Empty>
          ) : (
            <Table headers={['Date', 'Title & Notes', 'Category', 'Subject', 'Status']}>
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

      {/* Management & Owner Investigation & Action Dashboard */}
      {isManager && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {isOwner ? 'Hotel Grievances & Disciplinary Action Queue' : 'Hotel Grievances &amp; Incident Reviews'}
              </h3>
              <p className="text-xs text-slate-500">
                {isOwner
                  ? 'All staff and manager grievance filings. Review incidents, execute actions, and enter resolution notes.'
                  : 'Confidential leadership queue. Review incidents, assign investigation status, and record resolutions.'}
              </p>
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
            <Table headers={['Incident & Details', 'Category & Severity', 'Reporter', 'Review Status', 'Resolution & Action']}>
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
                    {r.resolutionNote && (
                      <div className="mt-2 rounded bg-emerald-50 p-2 text-xs text-emerald-800 border border-emerald-200">
                        <strong className="text-emerald-950 block">Action / Resolution Recorded:</strong>
                        {r.resolutionNote}
                      </div>
                    )}
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
                        <span className="font-semibold text-slate-700">Staff / Manager</span>
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
                    <div className="flex flex-col gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setActionReport(r);
                          setActionStatus(r.status);
                          setActionNote(r.resolutionNote || '');
                        }}
                      >
                        ⚡ Take Action
                      </Button>
                      {r.anonymous && isOwner && (
                        <Button size="sm" variant="danger" onClick={() => reveal(r.id)}>
                          Audit Reveal
                        </Button>
                      )}
                    </div>
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

      {/* Action / Resolution Modal for Owner & Manager */}
      {actionReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Record Action on Grievance</h3>
                <p className="text-xs text-slate-500">Incident: {actionReport.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setActionReport(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
              <div><strong>Subject:</strong> {actionReport.subjectFreeText || 'Unspecified'}</div>
              <div><strong>Description:</strong> {actionReport.description}</div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Set Resolution Status</label>
              <Select value={actionStatus} onChange={(e) => setActionStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Action Taken &amp; Resolution Notes</label>
              <textarea
                className="w-full rounded-md border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                rows={4}
                placeholder="Detail the investigation results, disciplinary actions taken, warnings issued, or resolution steps..."
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                This note will be logged in the audit trail and visible to leadership.
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="secondary" onClick={() => setActionReport(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveAction} disabled={savingAction}>
                {savingAction ? 'Saving…' : 'Save & Record Action'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
