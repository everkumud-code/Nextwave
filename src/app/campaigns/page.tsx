"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Megaphone, Plus, RefreshCw, Users, X } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

type Campaign = {
  campaignCode?: string | null; id: string; name: string; description: string | null; status: string; channel: string;
  createdAt: string; sender: { id: string; displayName: string; phoneNumberE164: string; status: string } | null;
  _count: { recipients: number; messages: number };
};
type Sender = { id: string; displayName: string; phoneNumberE164: string; status: string };
type Audience = { eligible: number; total: number; suppressed: number; withdrawnOrUnsubscribed: number; inactiveOrBlocked: number; rule: string };

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", senderId: "" });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [campaignData, senderData, audienceData] = await Promise.all([
        readJson(await fetch("/api/campaigns", { cache: "no-store" })),
        readJson(await fetch("/api/senders", { cache: "no-store" })),
        readJson(await fetch("/api/campaigns/audience", { cache: "no-store" })),
      ]);
      setCampaigns(campaignData.campaigns);
      setSenders(senderData.senders.filter((sender: Sender) => sender.status === "CONNECTED"));
      setAudience(audienceData);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load campaigns."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const data = await readJson(await fetch("/api/campaigns", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }));
      setNotice(`Draft created with ${data.campaign._count.recipients} eligible recipients.`);
      setForm({ name: "", description: "", senderId: "" });
      setOpen(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create campaign."); }
    finally { setBusy(false); }
  }

  return <div className="min-h-screen bg-[#F2F7FC]">
    <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur-xl md:px-8">
      <div className="flex items-center gap-3"><Link href="/" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ArrowLeft size={18}/></Link><BrandLogo className="hidden h-8 w-auto sm:block" /><div><p className="text-xs text-slate-400">Workspace / Campaigns</p><h1 className="text-lg font-semibold text-slate-900">Campaign Manager</h1></div></div>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#0A78CC] px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16}/> New campaign</button>
    </header>
    <main className="mx-auto max-w-[1400px] p-5 md:p-8">
      <div className="mb-7"><p className="text-sm text-slate-500">Plan and organise messaging campaigns across your workspace</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 md:text-[28px]">Campaigns</h2><p className="mt-1 text-sm text-slate-500">Campaign creation currently saves drafts and snapshots the eligible audience. Message dispatch is a separate milestone.</p></div>
      {error && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      {notice && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p>}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Metric label="Total campaigns" value={campaigns.length}/>
        <Metric label="Eligible audience" value={audience?.eligible ?? "—"}/>
        <Metric label="Suppressed contacts" value={audience?.suppressed ?? "—"}/>
      </div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4"><h3 className="font-semibold text-slate-900">Campaign workspace</h3><p className="mt-1 text-xs text-slate-400">Drafts and audience snapshots for this organisation</p></div>
        {loading ? <div className="flex items-center justify-center gap-2 p-14 text-sm text-slate-400"><RefreshCw className="animate-spin" size={16}/> Loading campaigns…</div> : campaigns.length ? <div className="divide-y divide-slate-100">{campaigns.map(campaign => <div key={campaign.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800"><Megaphone size={18}/></span><div><Link href={`/campaigns/${campaign.id}`} className="text-sm font-semibold text-slate-900 hover:text-emerald-800">{campaign.name}</Link>{campaign.campaignCode && <p className="mt-0.5 select-all font-mono text-[11px] font-semibold text-slate-500">{campaign.campaignCode}</p>}<p className="mt-1 text-xs text-slate-500">{campaign.description || "No description"} · Created {new Date(campaign.createdAt).toLocaleDateString()}</p><p className="mt-1 text-xs text-slate-500">{campaign.sender ? `${campaign.sender.displayName} · ${campaign.sender.phoneNumberE164}` : "Sender not assigned"}</p></div></div><div className="flex items-center gap-4 text-xs"><span className="inline-flex items-center gap-1.5 text-slate-600"><Users size={14}/>{campaign._count.recipients} recipients</span><span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">{campaign.status}</span></div></div>)}</div> : <div className="px-6 py-16 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-[#0A78CC]"><Megaphone size={22}/></div><h4 className="mt-4 text-sm font-semibold text-slate-900">No campaigns yet</h4><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">Create your first draft. NextWave will build its audience from active contacts with the latest WhatsApp marketing consent granted.</p><button onClick={() => setOpen(true)} className="mt-4 rounded-xl bg-[#0A78CC] px-4 py-2.5 text-xs font-semibold text-white">Create campaign</button></div>}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-5 py-3"><span className="text-[11px] text-slate-400">Draft planning only · no messages are sent</span><button onClick={() => void load()} className="inline-flex items-center gap-1.5 text-xs text-slate-500"><RefreshCw size={13}/> Refresh</button></div>
      </section>
      {audience && <div className="mt-5 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4"><Users className="mt-0.5 shrink-0 text-blue-700" size={17}/><p className="text-xs leading-relaxed text-blue-900"><b>Audience rule:</b> {audience.rule} {audience.withdrawnOrUnsubscribed} withdrawn or unsubscribed and {audience.inactiveOrBlocked} invalid or blocked contacts are excluded.</p></div>}
    </main>
    {open && <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h3 className="text-lg font-semibold text-slate-900">Create campaign draft</h3><p className="mt-1 text-xs text-slate-500">Build a consent-filtered audience snapshot.</p></div><button onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div>
      <form onSubmit={createCampaign} className="mt-6 space-y-4"><label className="block text-xs font-semibold text-slate-700">Campaign name *<input required maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. November product update" className={field+" mt-1.5"}/></label><label className="block text-xs font-semibold text-slate-700">Description<textarea maxLength={1000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="What is this campaign about?" className={field+" mt-1.5"} rows={3}/></label><label className="block text-xs font-semibold text-slate-700">Connected sender (optional)<select value={form.senderId} onChange={e=>setForm({...form,senderId:e.target.value})} className={field+" mt-1.5"}><option value="">Assign later</option>{senders.map(sender=><option key={sender.id} value={sender.id}>{sender.displayName} · {sender.phoneNumberE164}</option>)}</select></label><div className="rounded-xl bg-emerald-50 p-4"><div className="flex items-center gap-2 text-xs font-semibold text-emerald-900"><Users size={15}/> Eligible audience snapshot</div><p className="mt-1 text-2xl font-semibold text-emerald-950">{audience?.eligible ?? 0} contacts</p><p className="mt-1 text-[11px] leading-relaxed text-emerald-800">Only active contacts with latest WhatsApp marketing consent granted will be added. All others are excluded.</p></div><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={()=>setOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600">Cancel</button><button disabled={busy || !audience?.eligible} type="submit" className="rounded-xl bg-[#0A78CC] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy?"Creating…":"Create draft"}</button></div></form>
    </div></div>}
  </div>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p></div>;
}
