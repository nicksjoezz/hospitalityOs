import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Input, Badge, Empty } from '../components/ui';

interface Task {
  id: string;
  type: string;
  status: string;
  priority: string;
  room: { id: string; roomNumber: string };
  note: string | null;
  startedAt: string | null;
  completedAt: string | null;
  inspectionResult: string | null;
  createdAt: string;
}

const prTone: Record<string, 'red' | 'amber' | 'slate' | 'green'> = {
  URGENT: 'red',
  HIGH: 'amber',
  MEDIUM: 'slate',
  LOW: 'slate',
};

const statusTone: Record<string, 'red' | 'amber' | 'sky' | 'green' | 'slate'> = {
  PENDING: 'slate',
  ASSIGNED: 'sky',
  IN_PROGRESS: 'amber',
  AWAITING_INSPECTION: 'sky',
  PASSED: 'green',
  FAILED: 'red',
};

const DEFAULT_PROOF_PHOTOS = [
  'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=600&auto=format&fit=crop&q=80',
];

export function Housekeeping() {
  const qc = useQueryClient();
  const { data: tasks, isLoading } = useQuery({
    queryKey: ['hk-tasks'],
    queryFn: () => apiGet<Task[]>('/housekeeping/tasks'),
    refetchInterval: 5000,
  });

  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [inspectingTaskId, setInspectingTaskId] = useState<string | null>(null);

  // Cleaner completion form state
  const [checklist, setChecklist] = useState({
    bedding: true,
    bathroom: true,
    floor: true,
    restock: true,
  });
  const [photoUrl, setPhotoUrl] = useState<string>(DEFAULT_PROOF_PHOTOS[0]);
  const [cleanerNote, setCleanerNote] = useState('');
  const [submittingProof, setSubmittingProof] = useState(false);

  // Supervisor inspect form state
  const [failNote, setFailNote] = useState('');

  // Maintenance escalation form state
  const [maintTaskId, setMaintTaskId] = useState<string | null>(null);
  const [maintTitle, setMaintTitle] = useState('');
  const [maintCategory, setMaintCategory] = useState('PLUMBING');

  const startTask = async (id: string) => {
    await apiWrite('POST', `/housekeeping/tasks/${id}/start`, {});
    await qc.invalidateQueries({ queryKey: ['hk-tasks'] });
  };

  const submitCompletion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingTaskId) return;
    setSubmittingProof(true);
    try {
      const activeChecklistItems = Object.entries(checklist)
        .filter(([, checked]) => checked)
        .map(([key]) => {
          if (key === 'bedding') return 'Linen & Duvet Sanitized';
          if (key === 'bathroom') return 'Bathroom Disinfected & Polished';
          if (key === 'floor') return 'Floor Vacuumed & Mopped';
          return 'Amenities & Mini-Bar Restocked';
        });

      await apiWrite('POST', `/housekeeping/tasks/${completingTaskId}/complete`, {
        note: cleanerNote || 'Room turnover completed with photo proof.',
        photoProof: photoUrl,
        checklist: activeChecklistItems,
      });

      setCompletingTaskId(null);
      setCleanerNote('');
      await qc.invalidateQueries({ queryKey: ['hk-tasks'] });
      await qc.invalidateQueries({ queryKey: ['rooms'] });
    } catch (err: any) {
      alert('Failed to complete task: ' + err.message);
    } finally {
      setSubmittingProof(false);
    }
  };

  const handleInspect = async (id: string, result: 'PASS' | 'FAIL') => {
    try {
      await apiWrite('POST', `/housekeeping/tasks/${id}/inspect`, {
        result,
        note: result === 'FAIL' ? failNote || 'Supervisor requested recleaning.' : undefined,
      });
      setInspectingTaskId(null);
      setFailNote('');
      await qc.invalidateQueries({ queryKey: ['hk-tasks'] });
      await qc.invalidateQueries({ queryKey: ['rooms'] });
    } catch (err: any) {
      alert('Failed to inspect: ' + err.message);
    }
  };

  const submitMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintTaskId || !maintTitle) return;
    try {
      await apiWrite('POST', `/housekeeping/tasks/${maintTaskId}/maintenance-issue`, {
        category: maintCategory,
        title: maintTitle,
        description: `Escalated by Housekeeper from cleaning task.`,
        priority: 'HIGH',
      });
      setMaintTaskId(null);
      setMaintTitle('');
      await qc.invalidateQueries({ queryKey: ['hk-tasks'] });
      alert('Maintenance ticket opened and room flagged!');
    } catch (err: any) {
      alert('Failed to escalate: ' + err.message);
    }
  };

  // Helper to safely parse task note json
  const parseProof = (note: string | null) => {
    if (!note) return null;
    try {
      const parsed = JSON.parse(note);
      if (parsed.photoProof || parsed.checklist) return parsed;
      return null;
    } catch {
      return null;
    }
  };

  const pendingCount = tasks?.filter((t) => t.status === 'PENDING' || t.status === 'ASSIGNED').length ?? 0;
  const inProgressCount = tasks?.filter((t) => t.status === 'IN_PROGRESS').length ?? 0;
  const awaitingInspectionCount = tasks?.filter((t) => t.status === 'AWAITING_INSPECTION').length ?? 0;
  const passedCount = tasks?.filter((t) => t.status === 'PASSED').length ?? 0;

  const filteredTasks = tasks?.filter((t) => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'PENDING') return t.status === 'PENDING' || t.status === 'ASSIGNED';
    if (activeTab === 'IN_PROGRESS') return t.status === 'IN_PROGRESS';
    if (activeTab === 'INSPECTION') return t.status === 'AWAITING_INSPECTION';
    if (activeTab === 'PASSED') return t.status === 'PASSED';
    return true;
  });

  return (
    <div className="space-y-6">
      <PageTitle
        title="Housekeeping & Cleanliness Inspection"
        action={
          <div className="flex items-center gap-2">
            <Badge tone="green">Stayflexi Photo Proof</Badge>
            <Badge tone="sky">Supervisor Sign-Off</Badge>
          </div>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-slate-200">
          <p className="text-xs text-slate-500 font-medium">Dirty / Unassigned</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{pendingCount}</p>
          <span className="text-[11px] text-slate-400">Needs turnover</span>
        </Card>
        <Card className="border-amber-200 bg-amber-50/20">
          <p className="text-xs text-amber-800 font-medium">Cleaning in Progress</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{inProgressCount}</p>
          <span className="text-[11px] text-amber-600">Active housekeepers</span>
        </Card>
        <Card className="border-sky-300 bg-sky-50/30">
          <p className="text-xs text-sky-800 font-medium">Awaiting Inspection Proof</p>
          <p className="text-2xl font-bold text-sky-700 mt-1">{awaitingInspectionCount}</p>
          <span className="text-[11px] text-sky-600">Requires supervisor check</span>
        </Card>
        <Card className="border-emerald-300 bg-emerald-50/30">
          <p className="text-xs text-emerald-800 font-medium">Inspected &amp; Ready</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{passedCount}</p>
          <span className="text-[11px] text-emerald-600">Available for check-in</span>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 text-xs">
        {[
          { id: 'ALL', label: `All Tasks (${tasks?.length ?? 0})` },
          { id: 'PENDING', label: `Pending Clean (${pendingCount})` },
          { id: 'IN_PROGRESS', label: `In Progress (${inProgressCount})` },
          { id: 'INSPECTION', label: `Awaiting Inspection (${awaitingInspectionCount})` },
          { id: 'PASSED', label: `Ready for Guest (${passedCount})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Task List */}
      {isLoading ? (
        <Empty>Loading housekeeping queue…</Empty>
      ) : (
        <Table headers={['Room', 'Task Type', 'Priority', 'Status', 'Cleanliness Proof', 'Actions']}>
          {filteredTasks?.map((t) => {
            const proof = parseProof(t.note);
            return (
              <tr key={t.id} className="hover:bg-slate-50/70 transition">
                <Td className="font-bold text-slate-900 text-sm">
                  Room {t.room.roomNumber}
                </Td>
                <Td>
                  <span className="text-xs text-slate-700 capitalize font-medium">
                    {t.type.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </Td>
                <Td>
                  <Badge tone={prTone[t.priority] ?? 'slate'}>{t.priority}</Badge>
                </Td>
                <Td>
                  <Badge tone={statusTone[t.status] ?? 'slate'}>
                    {t.status.replace(/_/g, ' ')}
                  </Badge>
                </Td>
                <Td>
                  {proof?.photoProof ? (
                    <div className="flex items-center gap-2">
                      <img
                        src={proof.photoProof}
                        alt="Proof"
                        className="w-10 h-10 rounded-lg object-cover border border-slate-200 shadow-xs cursor-pointer hover:opacity-90"
                        onClick={() => window.open(proof.photoProof, '_blank')}
                      />
                      <div className="text-[11px] text-slate-500 space-y-0.5">
                        <span className="font-semibold text-emerald-700 flex items-center gap-1">
                          ✓ {proof.checklist?.length ?? 0} Checks Passed
                        </span>
                        <p className="truncate max-w-[150px] italic">"{proof.note}"</p>
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">No proof submitted</span>
                  )}
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Cleaner Actions */}
                    {(t.status === 'PENDING' || t.status === 'ASSIGNED') && (
                      <Button size="sm" onClick={() => startTask(t.id)}>
                        Start Cleaning
                      </Button>
                    )}

                    {t.status === 'IN_PROGRESS' && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => setCompletingTaskId(t.id)}
                      >
                        📷 Submit Proof &amp; Finish
                      </Button>
                    )}

                    {/* Supervisor Inspection Actions */}
                    {t.status === 'AWAITING_INSPECTION' && (
                      <>
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => handleInspect(t.id, 'PASS')}
                        >
                          ✓ Approve &amp; Mark Ready
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setInspectingTaskId(t.id)}
                        >
                          ✕ Reject
                        </Button>
                      </>
                    )}

                    {t.status === 'PASSED' && (
                      <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                        ✓ Ready for Guest
                      </span>
                    )}

                    {/* Escalate Maintenance */}
                    <button
                      type="button"
                      onClick={() => setMaintTaskId(t.id)}
                      className="text-[11px] text-slate-400 hover:text-amber-700 underline underline-offset-2 ml-1"
                    >
                      Report Fault
                    </button>
                  </div>
                </Td>
              </tr>
            );
          })}
          {filteredTasks?.length === 0 && (
            <tr>
              <Td colSpan={6} className="text-center py-8 text-slate-400 text-xs">
                No housekeeping tasks match this filter.
              </Td>
            </tr>
          )}
        </Table>
      )}

      {/* MODAL: Cleaner Submit Photo Proof */}
      {completingTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-w-lg w-full bg-white shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  📷 Cleanliness Photo Proof Submission
                </h3>
                <p className="text-xs text-slate-500">
                  Document sanitized room before submitting for supervisor sign-off.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompletingTaskId(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={submitCompletion} className="space-y-4">
              {/* Hygiene Checklist */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-2">Hygiene &amp; Turnover Checklist</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checklist.bedding}
                      onChange={(e) => setChecklist({ ...checklist, bedding: e.target.checked })}
                      className="rounded text-brand"
                    />
                    <span>Bed linen &amp; duvet fresh</span>
                  </label>
                  <label className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checklist.bathroom}
                      onChange={(e) => setChecklist({ ...checklist, bathroom: e.target.checked })}
                      className="rounded text-brand"
                    />
                    <span>Bathroom sanitized</span>
                  </label>
                  <label className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checklist.floor}
                      onChange={(e) => setChecklist({ ...checklist, floor: e.target.checked })}
                      className="rounded text-brand"
                    />
                    <span>Floor vacuumed/mopped</span>
                  </label>
                  <label className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checklist.restock}
                      onChange={(e) => setChecklist({ ...checklist, restock: e.target.checked })}
                      className="rounded text-brand"
                    />
                    <span>Amenities restocked</span>
                  </label>
                </div>
              </div>

              {/* Photo Proof Selection */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Upload / Select Turnover Photo Proof</label>
                <div className="flex items-center gap-2 mb-2">
                  {DEFAULT_PROOF_PHOTOS.map((src, i) => (
                    <img
                      key={src}
                      src={src}
                      alt="Preset"
                      onClick={() => setPhotoUrl(src)}
                      className={`w-16 h-14 rounded-lg object-cover border-2 cursor-pointer transition ${
                        photoUrl === src ? 'border-brand ring-2 ring-brand/30' : 'border-slate-200 opacity-60'
                      }`}
                    />
                  ))}
                  <div className="text-[11px] text-slate-500">
                    Click preset or paste custom photo link below:
                  </div>
                </div>
                <Input
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="https://... photo URL or data URI"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Housekeeper Notes (Optional)</label>
                <Input
                  value={cleanerNote}
                  onChange={(e) => setCleanerNote(e.target.value)}
                  placeholder="e.g. Extra pillows added, room fragrant and spotless."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <Button type="button" variant="secondary" onClick={() => setCompletingTaskId(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submittingProof} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {submittingProof ? 'Uploading Proof…' : 'Submit for Inspection'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* MODAL: Supervisor Reject / Reclean */}
      {inspectingTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-w-md w-full bg-white shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-red-900">Request Room Recleaning</h3>
            <p className="text-xs text-slate-600">
              Provide specific feedback so the housekeeper knows what needs remediation before the room can be approved.
            </p>
            <Input
              value={failNote}
              onChange={(e) => setFailNote(e.target.value)}
              placeholder="e.g. Mirror smudges in bathroom, dust on headboard"
              required
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setInspectingTaskId(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => handleInspect(inspectingTaskId, 'FAIL')}
              >
                Send Back for Recleaning
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* MODAL: Maintenance Escalation */}
      {maintTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-w-md w-full bg-white shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Escalate Maintenance Fault</h3>
            <p className="text-xs text-slate-500">
              Found a broken AC, plumbing leak, or electrical fault during cleaning? Log it directly to the engineering team.
            </p>
            <form onSubmit={submitMaintenance} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Issue Category</label>
                <select
                  value={maintCategory}
                  onChange={(e) => setMaintCategory(e.target.value)}
                  className="w-full rounded-md border border-slate-300 p-2 text-xs"
                >
                  <option value="PLUMBING">Plumbing (Faucet/Shower/Toilet)</option>
                  <option value="HVAC">HVAC / Air Conditioning</option>
                  <option value="ELECTRICAL">Electrical / Lighting</option>
                  <option value="APPLIANCE">TV / Fridge / Safe</option>
                  <option value="FURNITURE">Bed / Furniture / Door Lock</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Description</label>
                <Input
                  value={maintTitle}
                  onChange={(e) => setMaintTitle(e.target.value)}
                  placeholder="e.g. Shower drain clogged in Room 204"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="secondary" onClick={() => setMaintTaskId(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="danger">
                  Open Maintenance Ticket
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
