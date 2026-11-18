"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCheck, RefreshCw } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

type Reply = { id: string; fromE164: string; body: string; isOptOut: boolean; readAt: string | null; receivedAt: string; contact: { id: string; firstName: string | null; lastName: string | null } | null; sender: { displayName: string; phoneNumberE164: string | null } };

export default function InboxPage() {
  const [replies, setReplies] = useState<Reply[]>([]);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/inbox${unreadOnly ? "?unread=1" : ""}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load replies.");
      setReplies(data.replies); setUnread(data.unread); setTotal(data.total); setNextCursor(data.nextCursor);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load replies."); }
    finally { setLoading(false); }
  }, [unreadOnly]);
  useEffect(() => { void load(); const timer = window.setInterval(() => { void load(); }, 20000); return () => window.clearInterval(timer); }, [load]);

  async function loadMore() {
    if (!nextCursor) return;
    const response = await fetch(`/api/inbox?cursor=${nextCursor}${unreadOnly ? "&unread=1" : ""}`, { cache: "no-store" });
    const data = await response.json();
    if (response.ok) { setReplies(current => [...current, ...data.replies]); setNextCursor(data.nextCursor); }
  }
  async function mark(id: string, read: boolean) {
    await fetch(`/api/inbox/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read }) });
    setReplies(current => current.map(item => item.id === id ? { ...item, readAt: read ? new Date().toISOString() : null } : item));
    setUnread(count => Math.max(0, count + (read ? -1 : 1)));
  }
  async function markAll() { await fetch("/api/inbox/read-all", { method: "POST" }); await load(); }

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8"><div className="mx-auto max-w-4xl">
    <BrandLogo className="mb-4 h-10 w-auto" /><Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500"><ArrowLeft size={16}/> Back to workspace</Link>
    <div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Customer replies</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Replies inbox</h1><p className="mt-2 text-sm text-slate-500">Everything customers answer to your messages, kept here. To answer a customer, reply from the WhatsApp app of that number. A STOP reply is handled for you: the person is removed from future campaigns.</p></div>
      <div className="flex items-center gap-2"><label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)}/> Unread only ({unread})</label><button onClick={() => void markAll()} disabled={!unread} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"><CheckCheck size={14}/> Mark all read</button><button onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><RefreshCw size={14}/> Refresh</button></div></div>
    {error && <p className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {loading && replies.length === 0 ? <p className="p-10 text-center text-sm text-slate-400">Loading replies…</p> : replies.length === 0 ? <p className="p-10 text-center text-sm text-slate-400">No replies yet. When a customer answers one of your messages, it shows up here.</p> : <ul className="divide-y divide-slate-100">{replies.map(reply => <li key={reply.id} className={`flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between ${reply.readAt ? "" : "bg-sky-50/50"}`}>
        <div className="min-w-0"><p className="text-sm font-semibold text-slate-900">{[reply.contact?.firstName, reply.contact?.lastName].filter(Boolean).join(" ") || reply.fromE164}{reply.contact && <span className="ml-2 text-xs font-normal text-slate-400">{reply.fromE164}</span>}{reply.isOptOut && <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">STOP</span>}{!reply.readAt && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-sky-500" aria-label="unread"/>}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{reply.body}</p><p className="mt-1 text-[11px] text-slate-400">to {reply.sender.displayName}{reply.sender.phoneNumberE164 ? ` · ${reply.sender.phoneNumberE164}` : ""} · {new Date(reply.receivedAt).toLocaleString()}</p></div>
        <button onClick={() => void mark(reply.id, !reply.readAt)} className="shrink-0 text-xs font-semibold text-emerald-800 hover:underline">{reply.readAt ? "Mark unread" : "Mark read"}</button></li>)}</ul>}
      {nextCursor && <div className="border-t border-slate-100 p-3 text-center"><button onClick={() => void loadMore()} className="text-xs font-semibold text-[#0A78CC]">Load more ({total - replies.length} more)</button></div>}
    </section>
  </div></main>;
}
