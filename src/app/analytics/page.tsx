"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, Contact, MessageSquare, RadioTower, RefreshCw, Send, TrendingUp } from "lucide-react";

type Analytics = {
  generatedAt: string;
  contacts: { total: number; active: number };
  senders: { total: number; connected: number };
  campaigns: { total: number; byStatus: Record<string, number> };
  messages: { total: number; byStatus: Record<string, number>; delivered: number; read: number; failed: number; deliveryRate: number; failureRate: number };
  daily: Array<{ day: string; total: number; delivered: number; failed: number; read: number }>;
};
async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Unable to load analytics.");
  return data;
}
const number = (value: number) => value.toLocaleString("en-IN");
const card = "rounded-2xl border border-slate-200 bg-white p-5";

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await readJson(await fetch("/api/analytics", { cache: "no-store" }))); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load analytics."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const max = Math.max(1, ...(data?.daily.map(day => day.total) ?? []));
  return <div className="min-h-screen bg-[#f6f8f6]">
    <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur-xl md:px-8">
      <div className="flex items-center gap-3"><Link href="/" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ArrowLeft size={18}/></Link><div><p className="text-xs text-slate-400">Workspace / Reports</p><h1 className="text-lg font-semibold text-slate-900">Analytics overview</h1></div></div>
      <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"><RefreshCw size={15} className={loading ? "animate-spin" : ""}/> Refresh</button>
    </header>
    <main className="mx-auto max-w-[1400px] space-y-5 p-5 md:p-8">
      {error && <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      {loading && !data ? <div className="flex items-center gap-2 p-10 text-sm text-slate-500"><RefreshCw size={16} className="animate-spin"/> Loading workspace analytics…</div> : data && <>
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold text-slate-900">Workspace performance</h2><p className="mt-1 text-xs text-slate-500">All-time totals with a daily message trend for the last 14 days.</p></div><p className="text-[11px] text-slate-400">Updated {new Date(data.generatedAt).toLocaleString()}</p></div>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className={card}><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">Contacts</span><Contact size={17} className="text-emerald-700"/></div><p className="mt-4 text-3xl font-semibold text-slate-900">{number(data.contacts.total)}</p><p className="mt-1 text-xs text-slate-500">{number(data.contacts.active)} active</p></div>
          <div className={card}><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">Connected senders</span><RadioTower size={17} className="text-emerald-700"/></div><p className="mt-4 text-3xl font-semibold text-slate-900">{number(data.senders.connected)}</p><p className="mt-1 text-xs text-slate-500">of {number(data.senders.total)} non-archived senders</p></div>
          <div className={card}><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">Campaigns</span><Send size={17} className="text-emerald-700"/></div><p className="mt-4 text-3xl font-semibold text-slate-900">{number(data.campaigns.total)}</p><p className="mt-1 text-xs text-slate-500">{number(data.campaigns.byStatus.COMPLETED ?? 0)} completed · {number(data.campaigns.byStatus.SCHEDULED ?? 0)} scheduled</p></div>
          <div className={card}><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">Messages</span><MessageSquare size={17} className="text-emerald-700"/></div><p className="mt-4 text-3xl font-semibold text-slate-900">{number(data.messages.total)}</p><p className="mt-1 text-xs text-slate-500">{data.messages.deliveryRate}% delivered/read · {data.messages.failureRate}% failed</p></div>
        </section>
        <section className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <div className={card}><div className="flex items-center justify-between"><div><h3 className="font-semibold text-slate-900">Message volume</h3><p className="mt-1 text-xs text-slate-500">Daily created messages · last 14 days</p></div><Activity size={18} className="text-emerald-700"/></div>
            {data.daily.length ? <div className="mt-7 flex h-52 items-end gap-2">{data.daily.map(day => <div key={day.day} className="flex min-w-0 flex-1 flex-col items-center gap-2"><div title={`${day.total} messages`} className="w-full rounded-t-md bg-emerald-700/80" style={{ height: `${Math.max(4, day.total / max * 150)}px` }}/><span className="text-[9px] text-slate-400">{new Date(day.day+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}</span></div>)}</div> : <div className="flex h-52 items-center justify-center text-xs text-slate-400">No message activity in this period.</div>}
          </div>
          <div className={card}><div className="flex items-center justify-between"><div><h3 className="font-semibold text-slate-900">Delivery outcomes</h3><p className="mt-1 text-xs text-slate-500">Current message status</p></div><TrendingUp size={18} className="text-emerald-700"/></div>
            <div className="mt-6 space-y-4">{[["Read",data.messages.read],["Delivered",data.messages.delivered],["Failed",data.messages.failed],["Queued",data.messages.byStatus.QUEUED ?? 0],["Submitted",data.messages.byStatus.SUBMITTED ?? 0],["Sent",data.messages.byStatus.SENT ?? 0]].map(([label,value]) => <div key={String(label)}><div className="mb-1.5 flex justify-between text-xs"><span className="text-slate-600">{label}</span><span className="font-semibold tabular-nums text-slate-800">{number(Number(value))}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-700" style={{width:`${data.messages.total ? Number(value)/data.messages.total*100 : 0}%`}}/></div></div>)}</div>
          </div>
        </section>
        <section className={card}><h3 className="font-semibold text-slate-900">Campaign status</h3><div className="mt-4 flex flex-wrap gap-2">{Object.entries(data.campaigns.byStatus).map(([status,count])=><span key={status} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-600">{status.replaceAll("_"," ")} · {number(count)}</span>)}</div></section>
      </>}
    </main>
  </div>;
}
