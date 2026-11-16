"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Wallet, Clock3, RefreshCw } from "lucide-react";

type Account = { balancePaise: number; balanceRupees: number; pricePerMessagePaise: number; pricePerMessageRupees: number; defaultIntervalSeconds: number };
type Transaction = { id: string; type: string; amountPaise: number; balanceAfterPaise: number; messageCount: number | null; description: string | null; createdAt: string };

const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

export default function BillingPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [interval, setInterval] = useState(60);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/credits", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load credit account.");
      setAccount(data.account); setTransactions(data.transactions || []);
      setInterval(data.account.defaultIntervalSeconds || 60);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load credit account."); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, []);

  async function saveInterval() {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/credits/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultIntervalSeconds: interval }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save preference.");
      setNotice("Default spacing preference saved.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save preference."); }
    finally { setSaving(false); }
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8">
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft size={16}/> Back to workspace</Link>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Account finance</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Credits & usage</h1><p className="mt-2 text-sm text-slate-500">Prepaid balance, message pricing and transaction history.</p></div><button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold"><RefreshCw size={15}/> Refresh</button></div>
      {error && <p className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      {busy ? <div className="mt-8 text-sm text-slate-500">Loading credit account…</div> : account && <>
        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-[#173d2c] p-6 text-white"><div className="flex items-center gap-2 text-sm text-emerald-100"><Wallet size={17}/> Available credit</div><p className="mt-4 text-4xl font-semibold">{money(account.balancePaise)}</p><p className="mt-2 text-xs text-emerald-100/70">Prepaid wallet balance</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-sm text-slate-500">Current message rate</p><p className="mt-4 text-3xl font-semibold">{money(account.pricePerMessagePaise)}<span className="ml-1 text-sm font-normal text-slate-400">/ message</span></p><p className="mt-2 text-xs text-slate-400">Set by NextWave platform admin</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-sm text-slate-500">Estimated messages remaining</p><p className="mt-4 text-3xl font-semibold">{account.pricePerMessagePaise > 0 ? Math.floor(account.balancePaise / account.pricePerMessagePaise).toLocaleString("en-IN") : "—"}</p><p className="mt-2 text-xs text-slate-400">Based on current per-message rate</p></div>
        </section>
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2"><Clock3 size={18} className="text-emerald-700"/><h2 className="font-semibold">Default send spacing</h2></div>
          <p className="mt-1 text-sm text-slate-500">Choose a preferred interval. Actual throughput remains subject to the connected provider’s approved limits; automatic interval rotation is not enabled.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3"><select value={interval} onChange={e=>setInterval(Number(e.target.value))} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm">{[10,20,30,40,50,60,70,80,90].map(n=><option key={n} value={n}>{n} seconds</option>)}</select><button onClick={saveInterval} disabled={saving} className="rounded-xl bg-[#1c4b35] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save preference"}</button><span className="text-xs text-slate-400">Default: 60 seconds</span></div>
        </section>
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-6 py-5"><h2 className="font-semibold">Credit ledger</h2><p className="mt-1 text-sm text-slate-500">Top-ups and campaign charges recorded against your workspace.</p></div>
          {transactions.length === 0 ? <p className="px-6 py-10 text-center text-sm text-slate-400">No credit transactions yet.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-6 py-3">Date</th><th className="px-6 py-3">Activity</th><th className="px-6 py-3">Amount</th><th className="px-6 py-3">Balance after</th></tr></thead><tbody>{transactions.map(t=><tr key={t.id} className="border-t border-slate-100"><td className="whitespace-nowrap px-6 py-4 text-slate-500">{new Date(t.createdAt).toLocaleString("en-IN")}</td><td className="px-6 py-4"><span className="font-medium">{t.type === "CREDIT" ? "Credit added" : t.type === "DEBIT" ? "Campaign usage" : "Adjustment"}</span><span className="mt-1 block text-xs text-slate-400">{t.description || (t.messageCount ? t.messageCount+" messages" : "")}</span></td><td className={`px-6 py-4 font-semibold ${t.type === "DEBIT" ? "text-rose-600" : "text-emerald-700"}`}>{t.type === "DEBIT" ? "−" : "+"}{money(t.amountPaise)}</td><td className="px-6 py-4 font-medium">{money(t.balanceAfterPaise)}</td></tr>)}</tbody></table></div>}
        </section>
      </>}
    </div>
  </main>;
}
