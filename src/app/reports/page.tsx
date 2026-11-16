"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileSpreadsheet } from "lucide-react";

export default function ReportsPage() {
  const [from,setFrom]=useState("");
  const [to,setTo]=useState("");
  const [status,setStatus]=useState("");
  const [campaignId,setCampaignId]=useState("");
  const query=useMemo(()=>{
    const p=new URLSearchParams();
    if(from) p.set("from",new Date(from+"T00:00:00").toISOString());
    if(to) p.set("to",new Date(to+"T23:59:59.999").toISOString());
    if(status) p.set("status",status);
    if(campaignId.trim()) p.set("campaignId",campaignId.trim());
    return p.toString();
  },[from,to,status,campaignId]);
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8"><div className="mx-auto max-w-4xl">
    <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500"><ArrowLeft size={16}/> Back to workspace</Link>
    <p className="mt-7 text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Data exports</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Reports & downloads</h1><p className="mt-2 text-sm text-slate-500">Export your contacts or build a filtered message delivery report.</p>
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800"><FileSpreadsheet size={20}/></span><div><h2 className="font-semibold">Contact database</h2><p className="mt-1 text-sm text-slate-500">Download up to 50,000 contacts with source and status fields.</p></div></div><a href="/api/contacts/export" className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"><Download size={16}/> Download contacts CSV</a></section>
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-800"><Download size={20}/></span><div><h2 className="font-semibold">Message delivery report</h2><p className="mt-1 text-sm text-slate-500">Filter by date, delivery status or campaign. Includes per-message charge and provider IDs.</p></div></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">From date<input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3"/></label><label className="text-sm font-medium">To date<input type="date" value={to} onChange={e=>setTo(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3"/></label><label className="text-sm font-medium">Delivery status<select value={status} onChange={e=>setStatus(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3"><option value="">All statuses</option>{["QUEUED","SUBMITTED","SENT","DELIVERED","READ","FAILED","CANCELLED"].map(s=><option key={s}>{s}</option>)}</select></label><label className="text-sm font-medium">Campaign ID (optional)<input value={campaignId} onChange={e=>setCampaignId(e.target.value)} placeholder="Paste campaign ID" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3"/></label></div>
      <a href={`/api/reports/messages/export${query?"?"+query:""}`} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#1c4b35] px-5 py-3 text-sm font-semibold text-white"><Download size={16}/> Download filtered report CSV</a><p className="mt-3 text-xs text-slate-400">Exports are limited to the latest 50,000 matching records and are scoped to your workspace.</p>
    </section>
  </div></main>;
}
