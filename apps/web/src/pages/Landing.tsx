import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

interface HotelHit {
  name: string;
  slug: string;
}

/**
 * Public root. Visitors either find their hotel (→ /h/<slug> scoped login) or
 * register a new one. The master controller has a discreet link of its own.
 */
export function Landing() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<HotelHit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      apiGet<HotelHit[]>(`/platform/find-hotels?q=${encodeURIComponent(term)}`)
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const go = (slug: string) => {
    window.location.href = `/h/${slug}`;
  };

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-brand">
            Hospitality<span className="text-brand-accent">OS</span>
          </h1>
          <p className="mt-2 text-slate-500">The AI operating system for hotels.</p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {/* Find your hotel → scoped staff/owner login */}
          <div className="rounded-xl bg-white p-6 shadow">
            <h2 className="font-semibold text-slate-700">Sign in to your hotel</h2>
            <p className="mt-1 text-sm text-slate-500">
              Find your hotel to sign in. Staff: use the link your manager shared.
            </p>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type your hotel name…"
              className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2"
            />
            <div className="mt-2 divide-y divide-slate-100">
              {hits.map((h) => (
                <button
                  key={h.slug}
                  onClick={() => go(h.slug)}
                  className="flex w-full items-center justify-between py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-800">{h.name}</span>
                  <span className="text-xs text-brand">Sign in →</span>
                </button>
              ))}
              {q.trim().length >= 2 && !searching && hits.length === 0 && (
                <p className="py-2 text-sm text-slate-400">
                  No match. Check the spelling or use your hotel's login link.
                </p>
              )}
            </div>
          </div>

          {/* Register a new hotel */}
          <div className="flex flex-col rounded-xl bg-white p-6 shadow">
            <h2 className="font-semibold text-slate-700">New here?</h2>
            <p className="mt-1 text-sm text-slate-500">
              Create your hotel account and start a free trial — no card required.
              You'll get your own login link to share with staff.
            </p>
            <a
              href="/register"
              className="mt-4 inline-block rounded-md bg-brand px-4 py-2 text-center font-medium text-white"
            >
              Register your hotel
            </a>
          </div>
        </div>

        <div className="mt-10 text-center">
          <a href="/master" className="text-xs text-slate-400 hover:text-slate-600">
            Platform operator? Master controller →
          </a>
        </div>
      </div>
    </div>
  );
}
