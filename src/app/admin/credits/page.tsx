"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

type AdminSender = { id: string; displayName: string; phoneNumberE164: string | null; status: string; dailyLimitOverride: number | null };
type Client = { createdAt?: string; memberships?: { user: { name: string | null; email: string } }[]; senders?: AdminSender[]; clientCode?: string | null; id: string; name: string; slug: string; status: string; creditAccount: { balancePaise: number; pricePerMessagePaise: number; defaultIntervalSeconds: number } | null };
const rupees = (p: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(p / 100);

export default function AdminCreditsPage() {
  const [clients,setClients]=useState<Client[]>([]);
  const [selected,setSelected]=useState("");
  const [amount,setAmount]=useState("0");
  const [deductAmount,setDeductAmount]=useState("");
  const [deductReason,setDeductReason]=useState("");
  const [rate,setRate]=useState("10");
  const [description,setDescription]=useState("");
  const [busy,setBusy]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [limits,setLimits]=useState<Record<string,string>>({});
  const [nc,setNc]=useState({organizationName:"",ownerName:"",ownerEmail:"",password:"",initialCreditRupees:"",pricePerMessagePaise:"10"});
  const [showNcPass,setShowNcPass]=useState(false);

  async function load() {
    setBusy(true); setError("");
    try {
      const r=await fetch("/api/admin/credits",{cache:"no-store"}); const d=await r.json();
      if(!r.ok) throw new Error(d.error || "Unable to load admin accounts.");
      setClients(d.organizations || []);
      if(!selected && d.organizations?.[0]) { setSelected(d.organizations[0].id); setRate(String(d.organizations[0].creditAccount?.pricePerMessagePaise ?? 10)); }
    } catch(e) { setError(e instanceof Error ? e.message : "Unable to load admin accounts."); }
    finally { setBusy(false); }
  }
  useEffect(()=>{void load();},[]);
  const current=clients.find(c=>c.id===selected);
  function choose(id:string) { setSelected(id); const c=clients.find(x=>x.id===id); setRate(String(c?.creditAccount?.pricePerMessagePaise ?? 10)); }

  async function addClient(e:FormEvent) {
    e.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const r=await fetch("/api/admin/clients",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(nc)});
      const d=await r.json(); if(!r.ok) throw new Error(d.error || "Unable to add the client.");
      setNotice(`Client added: ${d.client.clientCode} · ${d.client.organizationName}. The owner can sign in with ${d.client.ownerEmail} and the first password you set.`);
      setNc({organizationName:"",ownerName:"",ownerEmail:"",password:"",initialCreditRupees:"",pricePerMessagePaise:"10"}); setShowNcPass(false); await load();
    } catch(err) { setError(err instanceof Error ? err.message : "Unable to add the client."); }
    finally { setSaving(false); }
  }

  async function saveLimit(senderId:string) {
    setError(""); setNotice("");
    try {
      const r=await fetch(`/api/admin/senders/${senderId}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({dailyLimit:(limits[senderId] ?? "").trim()===""?null:Number(limits[senderId])})});
      const d=await r.json(); if(!r.ok) throw new Error(d.error || "Unable to save the daily limit.");
      setNotice(d.dailyLimit===null?"Daily limit cleared: the automatic warm-up schedule applies.":`Daily limit set to ${d.dailyLimit} messages.`); await load();
    } catch(err) { setError(err instanceof Error ? err.message : "Unable to save the daily limit."); }
  }

  async function deduct(e:FormEvent) {
    e.preventDefault(); setSaving(true); setError(""); setNotice("");
    const rupees=Number(deductAmount);
    if(!selected || !Number.isFinite(rupees) || rupees<=0 || deductReason.trim().length<3) { setError("Choose a client, enter the amount to deduct and a reason (at least 3 characters)."); setSaving(false); return; }
    try {
      const r=await fetch("/api/admin/credits",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organizationId:selected,deductPaise:Math.round(rupees*100),reason:deductReason})});
      const d=await r.json(); if(!r.ok) throw new Error(d.error || "Unable to deduct credit.");
      setNotice("Credit deducted. The correction is written in the client&apos;s ledger with your reason."); setDeductAmount(""); setDeductReason(""); await load();
    } catch(err) { setError(err instanceof Error ? err.message : "Unable to deduct credit."); }
    finally { setSaving(false); }
  }

  async function submit(e:FormEvent) {
    e.preventDefault(); setSaving(true); setError(""); setNotice("");
    const rupeeValue=Number(amount || 0); const paiseRate=Number(rate);
    if(!Number.isFinite(rupeeValue) || rupeeValue<0 || rupeeValue>20000000 || !Number.isSafeInteger(paiseRate) || paiseRate<1) {
      setError("Enter a valid top-up amount and per-message rate in paise."); setSaving(false); return;
    }
    try {
      const r=await fetch("/api/admin/credits",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organizationId:selected,amountPaise:Math.round(rupeeValue*100),pricePerMessagePaise:paiseRate,description})});
      const d=await r.json(); if(!r.ok) throw new Error(d.error || "Unable to update credits.");
      setNotice("Client wallet and pricing updated successfully."); await load();
    } catch(e) { setError(e instanceof Error ? e.message : "Unable to update credits."); }
    finally { setSaving(false); }
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8"><div className="mx-auto max-w-6xl">
    <BrandLogo className="mb-4 h-10 w-auto" /><Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft size={16}/> Back to workspace</Link>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Platform control</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Client credits & pricing</h1><p className="mt-2 text-sm text-slate-500">Allocate prepaid balances and set each client’s per-message rate.</p></div><div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><ShieldCheck size={15}/> Platform admin only</div></div>
    {error&&<p className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{notice&&<p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    {busy?<p className="mt-8 text-sm text-slate-500">Loading client accounts…</p>:<div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 px-6 py-5"><h2 className="font-semibold">Client workspaces</h2><p className="mt-1 text-sm text-slate-500">Select a permanent workspace ID to manage its wallet.</p></div>
        {clients.length===0?<p className="p-8 text-center text-sm text-slate-400">No client workspaces found.</p>:<div className="divide-y divide-slate-100">{clients.map(c=><button key={c.id} onClick={()=>choose(c.id)} className={`flex w-full items-center justify-between gap-4 px-6 py-4 text-left hover:bg-slate-50 ${selected===c.id?"bg-emerald-50/60":""}`}><span className="min-w-0"><span className="block truncate text-sm font-semibold">{c.name}</span><span className="block truncate font-mono text-[11px] font-semibold text-slate-600">{c.clientCode ?? ""}{c.createdAt && Date.now() - new Date(c.createdAt).getTime() < 7 * 86400000 && <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 font-sans text-[10px] font-bold text-white">NEW</span>}</span>{c.memberships?.[0] && <span className="block truncate text-xs text-slate-700">{c.memberships[0].user.name ?? "-"} &middot; {c.memberships[0].user.email}{c.createdAt ? ` · joined ${new Date(c.createdAt).toLocaleString()}` : ""}</span>}<span className="mt-1 block truncate text-xs text-slate-400">{c.slug} · {c.id}</span></span><span className="shrink-0 text-right"><span className="block text-sm font-semibold">{rupees(c.creditAccount?.balancePaise ?? 0)}</span><span className="text-xs text-slate-400">{c.creditAccount ? (c.creditAccount.pricePerMessagePaise+" paise/msg") : "Wallet not initialized"}</span></span></button>)}</div>}
      </section>
      <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6"><div className="flex items-center gap-2"><Wallet size={18} className="text-emerald-700"/><h2 className="font-semibold">Wallet adjustment</h2></div>
        {current?<><p className="mt-2 text-sm text-slate-500">Selected client: <strong className="text-slate-800">{current.name}</strong></p><p className="mt-4 text-2xl font-semibold">{rupees(current.creditAccount?.balancePaise ?? 0)}<span className="ml-2 text-xs font-normal text-slate-400">current balance</span></p></>:<p className="mt-4 text-sm text-slate-400">Select a client workspace to continue.</p>}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">Add credit (₹)<input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"/></label>
          <label className="block text-sm font-medium">Per-message charge (paise)<input type="number" min="1" step="1" value={rate} onChange={e=>setRate(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"/><span className="mt-1 block text-xs text-slate-400">10 = ₹0.10/message · 30 = ₹0.30/message</span></label>
          <label className="block text-sm font-medium">Ledger note (optional)<input value={description} onChange={e=>setDescription(e.target.value)} maxLength={240} placeholder="Prepaid package / invoice reference" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"/></label>
          <button disabled={!selected||saving} className="w-full rounded-xl bg-[#0A78CC] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving?"Updating wallet…":"Add credit & save rate"}</button>
        </form>
        <form onSubmit={deduct} className="mt-6 space-y-3 rounded-2xl border border-rose-200 bg-rose-50/60 p-5"><h3 className="text-sm font-semibold text-rose-900">Deduct credit (a correction or a refund)</h3><p className="text-xs text-rose-800">Takes money off this client&apos;s wallet. It cannot go below zero, a reason is needed, and it is written in the client&apos;s ledger and in the audit log.</p><label className="block text-sm font-medium">Amount to deduct (&#8377;)<input type="number" min="0.01" step="0.01" value={deductAmount} onChange={e=>setDeductAmount(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"/></label><label className="block text-sm font-medium">Reason<input value={deductReason} maxLength={240} onChange={e=>setDeductReason(e.target.value)} placeholder="For example: top-up entered twice" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"/></label><button disabled={saving || !selected} className="rounded-xl bg-rose-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">Deduct from wallet</button></form>
        <form onSubmit={addClient} className="mt-6 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5"><h3 className="text-sm font-semibold text-emerald-900">Add a new client</h3><p className="text-xs text-emerald-800">Creates the client&apos;s workspace with its own client number (BPML/year/NR…), the owner&apos;s login and a wallet. Tell the owner the first password yourself; they can change it later.</p>
          <input required value={nc.organizationName} onChange={e=>setNc({...nc,organizationName:e.target.value})} placeholder="Business / client name" maxLength={100} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/>
          <div className="grid gap-3 sm:grid-cols-2"><input required value={nc.ownerName} onChange={e=>setNc({...nc,ownerName:e.target.value})} placeholder="Owner&apos;s name" maxLength={80} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/><input required type="email" value={nc.ownerEmail} onChange={e=>setNc({...nc,ownerEmail:e.target.value})} placeholder="Owner&apos;s e-mail" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></div>
          <div className="flex items-center gap-3"><input required minLength={10} maxLength={128} type={showNcPass?"text":"password"} autoComplete="new-password" value={nc.password} onChange={e=>setNc({...nc,password:e.target.value})} placeholder="First password (10+ characters)" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/><label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={showNcPass} onChange={e=>setShowNcPass(e.target.checked)}/> Show</label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-slate-700">Opening credit (₹, optional)<input type="number" min="0" step="0.01" value={nc.initialCreditRupees} onChange={e=>setNc({...nc,initialCreditRupees:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label><label className="text-xs font-medium text-slate-700">Per-message charge (paise)<input type="number" min="1" step="1" value={nc.pricePerMessagePaise} onChange={e=>setNc({...nc,pricePerMessagePaise:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label></div>
          <button disabled={saving} className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving?"Adding…":"Add client"}</button></form>
        {current&&<div className="mt-6 rounded-2xl border border-slate-200 p-5"><h3 className="text-sm font-semibold text-slate-900">Daily sending limit per number</h3><p className="mt-1 text-xs text-slate-500">Empty = automatic warm-up (50, 100, 200, then 400 a day). Set a number to allow more or fewer messages a day for that sender.</p>
          {(current.senders??[]).length===0?<p className="mt-3 text-xs text-slate-400">This client has no senders yet.</p>:<div className="mt-3 space-y-2">{(current.senders??[]).map(s=><div key={s.id} className="flex flex-wrap items-center gap-2 text-xs"><span className="min-w-0 flex-1 truncate font-medium text-slate-700">{s.displayName} · {s.phoneNumberE164 ?? "no number"} · {s.status.toLowerCase()}</span><input type="number" min="1" max="5000" placeholder="auto" value={limits[s.id] ?? (s.dailyLimitOverride===null?"":String(s.dailyLimitOverride))} onChange={e=>setLimits({...limits,[s.id]:e.target.value})} className="w-24 rounded-lg border border-slate-300 px-2 py-1.5"/><button type="button" onClick={()=>void saveLimit(s.id)} className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white">Save</button></div>)}</div>}</div>}
        <p className="mt-4 text-xs leading-5 text-slate-400">Credit allocations and price changes are recorded in the audit log. Price changes apply to campaigns queued after the change; already queued campaigns retain their original charge.</p>
      </section>
    </div>}
    <div className="mt-6"><button onClick={load} className="inline-flex items-center gap-2 text-sm font-medium text-slate-500"><RefreshCw size={15}/> Refresh client list</button></div>
  </div></main>;
}
