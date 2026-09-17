import { useState } from 'react';
import { apiWrite } from '../lib/api';

interface GmAnswer {
  answer: string;
  data: unknown;
}

const suggestions = [
  'How is the hotel today?',
  'What needs my attention right now?',
  'How much revenue have we collected today?',
];

export function GM() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = async (q: string) => {
    if (!q.trim()) return;
    setBusy(true);
    setAnswer(null);
    try {
      const res = await apiWrite<GmAnswer>('POST', '/gm/ask', { question: q });
      setAnswer(res.queued ? 'Offline — try again when connected.' : res.data.answer);
    } catch (e) {
      setAnswer(e instanceof Error ? e.message : 'Failed to ask the GM.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">AI General Manager</h2>
        <p className="text-xs text-slate-500">
          Ask anything — answers use real, computed numbers (never invented).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => {
              setQuestion(s);
              void ask(s);
            }}
            className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void ask(question)}
          placeholder="Ask the GM…"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2"
        />
        <button
          onClick={() => void ask(question)}
          disabled={busy}
          className="rounded-md bg-brand px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {busy ? '…' : 'Ask'}
        </button>
      </div>

      {answer && (
        <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
          {answer}
        </div>
      )}
    </div>
  );
}
