/**
 * UsageDashboard — admin-only Gemini token usage monitor.
 *
 * Reads the `tokenUsage` Firestore collection (one doc per AI call, written
 * by the callGemini Cloud Function) and shows:
 *   • Total spend today / last 7 days / last 30 days
 *   • Per-feature breakdown (analyzeFoodEntry vs sendChatMessage vs ...)
 *   • Per-user breakdown (top users by spend)
 *
 * Gated by ADMIN_UIDS in constants.tsx + matching isAdmin() in firestore.rules.
 * Reading this collection without an admin UID will be denied at the rules
 * layer, so non-admins won't see anything even if they bypass the UI.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../services/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  Timestamp,
  getDocs,
} from 'firebase/firestore';

interface UsageRow {
  uid: string;
  userEmail: string | null;
  feature: string;
  model: string;
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number;
  timestamp: Date;
}

type Window = '24h' | '7d' | '30d';

const WINDOW_MS: Record<Window, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d':  7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const formatUsd = (n: number): string => {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1)    return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
};

const formatTokens = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
};

export const UsageDashboard: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [window, setWindow] = useState<Window>('24h');
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch usage data when window changes or on mount.
  useEffect(() => {
    if (!db) {
      setError('Firebase not configured.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const since = new Date(Date.now() - WINDOW_MS[window]);
    const q = query(
      collection(db, 'tokenUsage'),
      where('timestamp', '>=', Timestamp.fromDate(since)),
      orderBy('timestamp', 'desc'),
    );

    getDocs(q)
      .then(snap => {
        if (cancelled) return;
        const docs: UsageRow[] = [];
        snap.forEach(d => {
          const data = d.data() as any;
          const ts = data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date();
          docs.push({
            uid: String(data.uid ?? ''),
            userEmail: data.userEmail ?? null,
            feature: String(data.feature ?? 'unknown'),
            model: String(data.model ?? '?'),
            promptTokens: Number(data.promptTokens ?? 0),
            candidatesTokens: Number(data.candidatesTokens ?? 0),
            totalTokens: Number(data.totalTokens ?? 0),
            costUsd: Number(data.costUsd ?? 0),
            durationMs: Number(data.durationMs ?? 0),
            timestamp: ts,
          });
        });
        setRows(docs);
        setLoading(false);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err?.message ?? 'Failed to load usage data.');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [window]);

  // ---- Aggregations ------------------------------------------------------
  const totals = useMemo(() => {
    const calls = rows.length;
    let totalTokens = 0;
    let costUsd = 0;
    let promptTokens = 0;
    let candidatesTokens = 0;
    for (const r of rows) {
      totalTokens += r.totalTokens;
      costUsd += r.costUsd;
      promptTokens += r.promptTokens;
      candidatesTokens += r.candidatesTokens;
    }
    return { calls, totalTokens, costUsd, promptTokens, candidatesTokens };
  }, [rows]);

  const byFeature = useMemo(() => {
    const map = new Map<string, { calls: number; tokens: number; costUsd: number }>();
    for (const r of rows) {
      const prev = map.get(r.feature) || { calls: 0, tokens: 0, costUsd: 0 };
      prev.calls += 1;
      prev.tokens += r.totalTokens;
      prev.costUsd += r.costUsd;
      map.set(r.feature, prev);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].costUsd - a[1].costUsd);
  }, [rows]);

  const byUser = useMemo(() => {
    const map = new Map<string, { email: string | null; calls: number; tokens: number; costUsd: number }>();
    for (const r of rows) {
      const prev = map.get(r.uid) || { email: r.userEmail, calls: 0, tokens: 0, costUsd: 0 };
      prev.calls += 1;
      prev.tokens += r.totalTokens;
      prev.costUsd += r.costUsd;
      prev.email = prev.email || r.userEmail;
      map.set(r.uid, prev);
    }
    return [...map.entries()]
      .map(([uid, v]) => ({ uid, ...v }))
      .sort((a, b) => b.costUsd - a.costUsd);
  }, [rows]);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.92)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-2xl glass rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh', background: '#0a0a0a' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3 shrink-0 border-b border-white/5">
          <div>
            <h2 className="text-white text-lg font-bold tracking-tight">AI Usage</h2>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mt-0.5">Admin · Token monitor</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-gray-400"
          >
            ✕
          </button>
        </div>

        {/* Time window chips */}
        <div className="flex gap-1.5 px-6 pt-4 shrink-0">
          {(['24h', '7d', '30d'] as Window[]).map(w => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`text-[10px] uppercase tracking-widest font-bold px-3 py-1.5 rounded-full border transition-all ${
                window === w
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                  : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
              }`}
            >
              {w === '24h' ? 'Last 24h' : w === '7d' ? '7 days' : '30 days'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-6 py-5 space-y-5">
          {loading && (
            <div className="text-center py-12 text-sm text-gray-500">Loading usage data…</div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
              Couldn&rsquo;t load usage: {error}
              <div className="text-[11px] text-red-500/70 mt-2">
                Check that your UID is in <code className="font-mono">ADMIN_UIDS</code> (constants.tsx),
                and that <code className="font-mono">isAdmin()</code> in <code className="font-mono">firestore.rules</code>
                lists the same UID.
              </div>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Top stats grid */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <div className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-1">Spend</div>
                  <div className="text-xl font-mono font-bold text-emerald-400 tabular-nums">{formatUsd(totals.costUsd)}</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <div className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-1">Tokens</div>
                  <div className="text-xl font-mono font-bold text-cyan-300 tabular-nums">{formatTokens(totals.totalTokens)}</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <div className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-1">Calls</div>
                  <div className="text-xl font-mono font-bold text-white tabular-nums">{totals.calls}</div>
                </div>
              </div>

              {/* Input vs output split */}
              <div className="bg-white/[0.03] rounded-xl p-3 text-[11px] text-gray-400 flex justify-between font-mono tabular-nums">
                <span><span className="text-gray-500">In:</span> {formatTokens(totals.promptTokens)} tokens</span>
                <span><span className="text-gray-500">Out:</span> {formatTokens(totals.candidatesTokens)} tokens</span>
                <span><span className="text-gray-500">Avg/call:</span> {totals.calls > 0 ? formatUsd(totals.costUsd / totals.calls) : '—'}</span>
              </div>

              {/* By feature */}
              <section>
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">By feature</h3>
                {byFeature.length === 0 ? (
                  <div className="text-[11px] text-gray-600 italic">No AI calls in this window.</div>
                ) : (
                  <div className="space-y-1.5">
                    {byFeature.map(([feature, v]) => {
                      const pct = totals.costUsd > 0 ? (v.costUsd / totals.costUsd) * 100 : 0;
                      return (
                        <div key={feature} className="bg-white/[0.03] rounded-lg px-3 py-2">
                          <div className="flex justify-between items-baseline mb-1">
                            <span className="text-xs font-bold text-white truncate">{feature}</span>
                            <div className="flex gap-3 text-[10px] font-mono tabular-nums shrink-0">
                              <span className="text-gray-500">{v.calls} calls</span>
                              <span className="text-gray-400">{formatTokens(v.tokens)}</span>
                              <span className="text-emerald-400">{formatUsd(v.costUsd)}</span>
                            </div>
                          </div>
                          <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-cyan-500/60" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* By user */}
              <section>
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">By user</h3>
                {byUser.length === 0 ? (
                  <div className="text-[11px] text-gray-600 italic">No users active in this window.</div>
                ) : (
                  <div className="space-y-1.5">
                    {byUser.map(u => (
                      <div key={u.uid} className="bg-white/[0.03] rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white truncate">
                            {u.email || <span className="text-gray-500 italic">no email</span>}
                          </div>
                          <div className="text-[9px] text-gray-600 font-mono truncate">{u.uid}</div>
                        </div>
                        <div className="flex gap-3 text-[10px] font-mono tabular-nums shrink-0">
                          <span className="text-gray-500">{u.calls} calls</span>
                          <span className="text-gray-400">{formatTokens(u.tokens)}</span>
                          <span className="text-emerald-400">{formatUsd(u.costUsd)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Footer note */}
              <p className="text-[10px] text-gray-600 italic pt-2">
                Cost is estimated from published Gemini pricing × token counts. Actual billing may
                differ for image inputs and edge cases. Verify against Google Cloud Console invoices.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default UsageDashboard;
