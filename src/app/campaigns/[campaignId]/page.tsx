"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { renderMessageTemplate } from "@/lib/message-template";
import { ArrowLeft, CalendarClock, Check, Loader2, RefreshCw, Save, Send, Users } from "lucide-react";

type Contact = { id: string; phoneNumberE164: string; firstName: string | null; lastName: string | null; email: string | null; company: string | null };
type Sender = { id: string; displayName: string; phoneNumberE164: string; status: string };
type Validation = { ready: boolean; issues: string[]; checks: { hasMessage: boolean; senderConnected: boolean; selectedRecipients: number; currentlyEligibleRecipients: number; suppressedRecipients: number } };
type MessageStats = { total: number; queued: number; submitted: number; sent: number; delivered: number; read: number; failed: number; cancelled: number };
type MessageRecord = { id: string; recipientE164: string; status: string; attemptCount: number; maxAttempts: number; errorCode: string | null; errorMessage: string | null; submittedAt: string | null; deliveredAt: string | null; readAt: string | null; createdAt: string };
type Campaign = { id: string; name: string; description: string | null; messageBody: string | null; status: string; scheduledAt: string | null; sender: Sender | null; recipients: { contact: { id: string } }[]; _count: { recipients: number; messages: number } };
async function readJson(response: Response) { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Something went wrong."); return data; }
const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function CampaignDetailPage() {
  const params = useParams<{ campaignId: string }>();
  const campaignId = params.campaignId;
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [messageStats, setMessageStats] = useState<MessageStats | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState({ name: "", description: "", messageBody: "", senderId: "", scheduledAt: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [validation, setValidation] = useState<Validation | null>(null);
  const [validating, setValidating] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [campaignData, audienceData, senderData] = await Promise.all([
        readJson(await fetch(`/api/campaigns/${campaignId}`, { cache: "no-store" })),
        readJson(await fetch("/api/campaigns/audience?includeContacts=1", { cache: "no-store" })),
        readJson(await fetch("/api/senders", { cache: "no-store" })),
      ]);
      const item = campaignData.campaign as Campaign;
      const statsData = item.status !== "DRAFT" ? await readJson(await fetch(`/api/campaigns/${campaignId}/messages`, { cache: "no-store" })) : null;
      setMessageStats(statsData?.counts ?? null);
      setMessages(statsData?.messages ?? []);
      setCampaign(item);
      setContacts((audienceData.contacts ?? []).slice(0, 5000));
      setSenders(senderData.senders.filter((sender: Sender) => sender.status === "CONNECTED"));
      setSelected(item.recipients.map(row => row.contact.id));
      setForm({ name: item.name, description: item.description ?? "", messageBody: item.messageBody ?? "", senderId: item.sender?.id ?? "", scheduledAt: localDateTime(item.scheduledAt) });
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load campaign."); }
    finally { setLoading(false); }
  }, [campaignId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await readJson(await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, description: form.description, messageBody: form.messageBody, senderId: form.senderId || null,
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
          recipientContactIds: selected,
        }),
      }));
      setNotice(`Draft saved · ${data.campaign._count.recipients} recipients`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save campaign."); }
    finally { setBusy(false); }
  }

  async function validateCampaign() {
    setValidating(true); setError(""); setValidation(null);
    try {
      const data = await readJson(await fetch(`/api/campaigns/${campaignId}/validate`, { method: "POST" }));
      setValidation(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to validate campaign."); }
    finally { setValidating(false); }
  }

  async function queueCampaign() {
    setQueueing(true); setError(""); setNotice("");
    try {
      const data = await readJson(await fetch(`/api/campaigns/${campaignId}/queue`, { method: "POST" }));
      setNotice(data.message || "Campaign jobs queued.");
      setValidation(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to queue campaign."); }
    finally { setQueueing(false); }
  }

  const visible = contacts.filter(contact => {
    const haystack = [contact.firstName, contact.lastName, contact.phoneNumberE164, contact.email, contact.company].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const editable = campaign?.status === "DRAFT";

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#f6f8f6] text-sm text-slate-500"><RefreshCw className="mr-2 animate-spin" size={16}/> Loading campaign…</div>;

  return <div className="min-h-screen bg-[#f6f8f6]">
    <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur-xl md:px-8">
      <div className="flex items-center gap-3"><Link href="/campaigns" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ArrowLeft size={18}/></Link><div><p className="text-xs text-slate-400">Workspace / Campaigns</p><h1 className="text-lg font-semibold text-slate-900">Campaign editor</h1></div></div>
      {editable && <div className="flex items-center gap-2"><button onClick={() => void validateCampaign()} disabled={validating || busy || queueing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">{validating?<Loader2 className="animate-spin" size={16}/>:<Check size={16}/>} Validate</button><button onClick={() => void save()} disabled={busy || validating || queueing} className="inline-flex items-center gap-2 rounded-xl bg-[#1c4b35] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy?<Loader2 className="animate-spin" size={16}/>:<Save size={16}/>} Save draft</button><button onClick={() => void queueCampaign()} disabled={!validation?.ready || queueing || busy || validating} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{queueing?<Loader2 className="animate-spin" size={16}/>:<Send size={16}/>} Queue jobs</button></div>}
    </header>
    <main className="mx-auto max-w-[1200px] p-5 md:p-8">
      {error && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      {notice && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p>}
      {validation && <section className={`mb-5 rounded-2xl border p-4 ${validation.ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><div className="flex items-center justify-between gap-3"><h3 className={`text-sm font-semibold ${validation.ready ? "text-emerald-900" : "text-amber-900"}`}>{validation.ready ? "Campaign checks passed" : "Campaign needs attention"}</h3><span className="text-xs font-semibold">{validation.checks.currentlyEligibleRecipients}/{validation.checks.selectedRecipients} recipients eligible</span></div>{validation.issues.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">{validation.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}{validation.ready && <p className="mt-2 text-xs text-emerald-800">The draft currently meets the campaign readiness checks. This does not queue or send messages.</p>}</section>}

      {!campaign ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Campaign not found.</div> : <>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-slate-500">Draft configuration and consent-filtered recipient snapshot</p><h2 className="mt-1 text-2xl font-semibold text-slate-900">{campaign.name}</h2></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{campaign.status}</span></div>
        {!editable && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Only draft campaigns can be edited.</p>}
        {campaign.status !== "DRAFT" && messageStats && <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-slate-900">Message queue</h3><p className="mt-1 text-xs text-slate-500">Persistent jobs · delivery depends on an enabled dispatch worker</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{messageStats.total} jobs</span></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase text-slate-400">Queued</p><p className="mt-1 text-xl font-semibold text-slate-900">{messageStats.queued}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase text-slate-400">Submitted</p><p className="mt-1 text-xl font-semibold text-slate-900">{messageStats.submitted}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase text-slate-400">Sent</p><p className="mt-1 text-xl font-semibold text-slate-900">{messageStats.sent}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase text-slate-400">Delivered</p><p className="mt-1 text-xl font-semibold text-slate-900">{messageStats.delivered}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase text-slate-400">Read</p><p className="mt-1 text-xl font-semibold text-slate-900">{messageStats.read}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase text-slate-400">Failed</p><p className="mt-1 text-xl font-semibold text-slate-900">{messageStats.failed}</p></div></div></section>}
        {campaign.status !== "DRAFT" && messageStats && <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 px-5 py-4"><h3 className="font-semibold text-slate-900">Recipient delivery log</h3><p className="mt-1 text-xs text-slate-500">Latest 50 message records · status updates as provider receipts arrive</p></div>{messages.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3 font-semibold">Recipient</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Attempts</th><th className="px-4 py-3 font-semibold">Submitted</th><th className="px-5 py-3 font-semibold">Failure detail</th></tr></thead><tbody className="divide-y divide-slate-100">{messages.map(message=><tr key={message.id}><td className="px-5 py-3 font-medium text-slate-800">{message.recipientE164}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${["DELIVERED","READ"].includes(message.status)?"bg-emerald-50 text-emerald-700":message.status==="FAILED"?"bg-rose-50 text-rose-700":message.status==="QUEUED"?"bg-amber-50 text-amber-700":"bg-slate-100 text-slate-600"}`}>{message.status}</span></td><td className="px-4 py-3 text-slate-600">{message.attemptCount}/{message.maxAttempts}</td><td className="px-4 py-3 text-slate-500">{message.submittedAt ? new Date(message.submittedAt).toLocaleString() : "—"}</td><td className="max-w-[260px] px-5 py-3 text-slate-500">{message.errorCode ? <span title={message.errorMessage ?? ""}><span className="font-semibold text-rose-700">{message.errorCode}</span><span className="block truncate">{message.errorMessage}</span></span> : "—"}</td></tr>)}</tbody></table></div> : <p className="p-8 text-center text-xs text-slate-500">No message jobs have been created for this campaign.</p>}</section>}

        <div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="font-semibold text-slate-900">Campaign settings</h3>
            <label className="block text-xs font-semibold text-slate-700">Campaign name<input disabled={!editable} maxLength={120} value={form.name} onChange={e=>{setForm({...form,name:e.target.value});setValidation(null)}} className={field+" mt-1.5"}/></label>
            <label className="block text-xs font-semibold text-slate-700">Description<textarea disabled={!editable} maxLength={1000} rows={4} value={form.description} onChange={e=>{setForm({...form,description:e.target.value});setValidation(null)}} className={field+" mt-1.5"}/></label>
            <label className="block text-xs font-semibold text-slate-700">Message content<textarea disabled={!editable} maxLength={4096} rows={7} value={form.messageBody} onChange={e=>{setForm({...form,messageBody:e.target.value});setValidation(null)}} placeholder="Hello {{firstName}}, we have an update for you…" className={field+" mt-1.5"}/><span className="mt-1 block text-[11px] font-normal text-slate-400">Up to 4,096 characters. Variables: {"{{firstName}}"}, {"{{lastName}}"}, {"{{company}}"}, {"{{phoneNumber}}"} .</span></label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Personalisation preview</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{renderMessageTemplate(form.messageBody || "Hello {{firstName}}, welcome to {{company}}.", contacts.find(contact=>selected.includes(contact.id)) ?? {})}</p><p className="mt-2 text-[10px] text-slate-400">Preview uses the first selected eligible contact.</p></div>
            <label className="block text-xs font-semibold text-slate-700">Connected sender<select disabled={!editable} value={form.senderId} onChange={e=>{setForm({...form,senderId:e.target.value});setValidation(null)}} className={field+" mt-1.5"}><option value="">Assign later</option>{senders.map(sender=><option key={sender.id} value={sender.id}>{sender.displayName} · {sender.phoneNumberE164}</option>)}</select></label>
            <label className="block text-xs font-semibold text-slate-700"><span className="inline-flex items-center gap-2"><CalendarClock size={14}/> Planned send time</span><input disabled={!editable} type="datetime-local" value={form.scheduledAt} onChange={e=>{setForm({...form,scheduledAt:e.target.value});setValidation(null)}} className={field+" mt-1.5"}/><span className="mt-1 block text-[11px] font-normal text-slate-400">Planning metadata only. Scheduling does not dispatch messages.</span></label>
            <div className="rounded-xl bg-emerald-50 p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Selected audience</p><p className="mt-1 text-2xl font-semibold text-emerald-950">{selected.length}</p><p className="mt-1 text-[11px] text-emerald-800">Only active contacts with current WhatsApp marketing consent are selectable.</p></div>
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-900">Recipient selection</h3><p className="mt-1 text-xs text-slate-400">{contacts.length} eligible contacts available in the selection list</p></div><span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Users size={14}/>{selected.length} selected</span></div><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search eligible contacts…" className={field+" mt-4"}/><div className="mt-3 flex gap-2"><button disabled={!editable} onClick={()=>{setSelected(contacts.map(c=>c.id));setValidation(null)}} className="text-xs font-semibold text-emerald-800 disabled:opacity-40">Select all shown</button><button disabled={!editable} onClick={()=>{setSelected([]);setValidation(null)}} className="text-xs font-semibold text-slate-500 disabled:opacity-40">Clear selection</button></div></div>
            <div className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">{visible.map(contact=><label key={contact.id} className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-slate-50"><input type="checkbox" disabled={!editable} checked={selected.includes(contact.id)} onChange={e=>{setSelected(current=>e.target.checked?[...current,contact.id]:current.filter(id=>id!==contact.id));setValidation(null)}} className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"/><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{[contact.firstName,contact.lastName].filter(Boolean).join(" ") || "Unnamed contact"}</span><span className="block truncate text-[11px] text-slate-400">{contact.phoneNumberE164} · {contact.company || contact.email || "No additional details"}</span></span>{selected.includes(contact.id)&&<Check size={15} className="text-emerald-700"/>}</label>)}</div>
            {contacts.length===0 && <p className="p-8 text-center text-xs text-slate-500">No eligible contacts. Grant valid marketing consent before adding recipients.</p>}
            <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-[11px] text-slate-500">Audience is revalidated by the server when you save. Dispatch is not enabled yet.</div>
          </section>
        </div>
      </>}
    </main>
  </div>;
}
