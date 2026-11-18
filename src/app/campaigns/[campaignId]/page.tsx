"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { renderMessageTemplate } from "@/lib/message-template";
import { ArrowLeft, CalendarClock, Check, Loader2, RefreshCw, Save, Send, Users } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { kindLabel, type MediaKind } from "@/lib/media";
import { isShortMapsLink, parseMapsLink } from "@/lib/maps-link";

type Contact = { id: string; phoneNumberE164: string; firstName: string | null; lastName: string | null; email: string | null; company: string | null; tags?: string[] };
type Sender = { id: string; displayName: string; phoneNumberE164: string; status: string; connector?: string };
type OfficialTemplate = { name: string; language: string; category: string | null; bodyText: string; bodyVariableCount: number; hasHeaderMedia: boolean; hasButtonVariables: boolean };
type ContactGroup = { id: string; name: string; _count: { members: number } };
type Validation = { ready: boolean; issues: string[]; checks: { hasMessage: boolean; senderConnected: boolean; selectedRecipients: number; currentlyEligibleRecipients: number; suppressedRecipients: number } };
type MessageStats = { total: number; queued: number; submitted: number; sent: number; delivered: number; read: number; failed: number; cancelled: number };
type MessageRecord = { id: string; recipientE164: string; status: string; attemptCount: number; maxAttempts: number; errorCode: string | null; errorMessage: string | null; submittedAt: string | null; deliveredAt: string | null; readAt: string | null; createdAt: string };
type MediaInfo = { id: string; kind: MediaKind; filename: string; sizeBytes: number };
type Campaign = { locationLat?: number | null; locationLng?: number | null; locationName?: string | null; locationAddress?: string | null; templateName?: string | null; templateLanguage?: string | null; templateParams?: string[]; extraSenderIds?: string[]; mediaAsset?: MediaInfo | null; campaignCode?: string | null; id: string; name: string; description: string | null; messageBody: string | null; status: string; scheduledAt: string | null; sender: Sender | null; recipients: { contact: { id: string } }[]; _count: { recipients: number; messages: number } };
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
  const [contactGroups, setContactGroups] = useState<ContactGroup[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [extraSenders, setExtraSenders] = useState<string[]>([]);
  const [templates, setTemplates] = useState<OfficialTemplate[]>([]);
  const [templatesError, setTemplatesError] = useState("");
  const [tpl, setTpl] = useState<{ name: string; language: string; params: string[] } | null>(null);
  const [pin, setPin] = useState({ lat: "", lng: "", name: "", address: "", link: "" });
  const [form, setForm] = useState({ name: "", description: "", messageBody: "", senderId: "", scheduledAt: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [validation, setValidation] = useState<Validation | null>(null);
  const [validating, setValidating] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [query, setQuery] = useState("");
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [recentMedia, setRecentMedia] = useState<MediaInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [working, setWorking] = useState(false);

  const tagList = (() => {
    const counts = new Map<string, number>();
    for (const contact of contacts) for (const tag of contact.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 200);
  })();

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [campaignData, audienceData, senderData, groupData] = await Promise.all([
        readJson(await fetch(`/api/campaigns/${campaignId}`, { cache: "no-store" })),
        readJson(await fetch("/api/campaigns/audience?includeContacts=1", { cache: "no-store" })),
        readJson(await fetch("/api/senders", { cache: "no-store" })),
        readJson(await fetch("/api/contact-groups", { cache: "no-store" })),
      ]);
      const item = campaignData.campaign as Campaign;
      const statsData = item.status !== "DRAFT" ? await readJson(await fetch(`/api/campaigns/${campaignId}/messages`, { cache: "no-store" })) : null;
      setMessageStats(statsData?.counts ?? null);
      setMessages(statsData?.messages ?? []);
      setCampaign(item);
      setMedia(item.mediaAsset ?? null);
      setExtraSenders(item.extraSenderIds ?? []);
      setTpl(item.templateName ? { name: item.templateName, language: item.templateLanguage ?? "en", params: item.templateParams ?? [] } : null);
      setPin({ lat: item.locationLat === null || item.locationLat === undefined ? "" : String(item.locationLat), lng: item.locationLng === null || item.locationLng === undefined ? "" : String(item.locationLng), name: item.locationName ?? "", address: item.locationAddress ?? "", link: "" });
      setContacts((audienceData.contacts ?? []).slice(0, 50000));
      setSenders(senderData.senders.filter((sender: Sender) => sender.status === "CONNECTED"));
      setContactGroups(groupData.groups ?? []);
      setSelected(item.recipients.map(row => row.contact.id));
      setForm({ name: item.name, description: item.description ?? "", messageBody: item.messageBody ?? "", senderId: item.sender?.id ?? "", scheduledAt: localDateTime(item.scheduledAt) });
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load campaign."); }
    finally { setLoading(false); }
  }, [campaignId]);

  useEffect(() => { void load(); }, [load]);

  async function addContactGroup(groupId: string) {
    if (!groupId || !editable) return;
    setError(""); setNotice("");
    try {
      const data = await readJson(await fetch(`/api/contact-groups/${groupId}`, { cache: "no-store" }));
      const eligibleIds = new Set(contacts.map(contact => contact.id));
      const groupIds = (data.group.contacts as Contact[]).map(contact => contact.id);
      const eligibleGroupIds = groupIds.filter(id => eligibleIds.has(id));
      const skipped = groupIds.length - eligibleGroupIds.length;
      setSelected(current => [...new Set([...current, ...eligibleGroupIds])].slice(0, 50000));
      setValidation(null);
      setNotice(`${eligibleGroupIds.length} eligible group contacts added${skipped ? `; ${skipped} not currently eligible and excluded` : ""}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to add group contacts."); }
  }

  // an official (Meta) number sends an approved template; an ordinary number does not use one
  const selectedSender = senders.find(sender => sender.id === form.senderId);
  const isOfficial = selectedSender?.connector === "META_CLOUD_API";
  function tplBody() {
    return isOfficial && tpl ? { templateName: tpl.name, templateLanguage: tpl.language, templateParams: tpl.params } : { templateName: null };
  }
  useEffect(() => {
    if (!isOfficial || !form.senderId) { setTemplates([]); return; }
    let alive = true;
    setTemplatesError("");
    void fetch(`/api/senders/${form.senderId}/templates`, { cache: "no-store" }).then(async r => { const d = await r.json(); if (!alive) return; if (!r.ok) setTemplatesError(d.error || "The templates could not be loaded."); else setTemplates(d.templates ?? []); }).catch(() => { if (alive) setTemplatesError("The templates could not be loaded."); });
    return () => { alive = false; };
  }, [isOfficial, form.senderId]);

  // the map pin that goes with the campaign (null = none)
  function pinBody() {
    if (!pin.lat.trim() && !pin.lng.trim()) return null;
    return { lat: pin.lat, lng: pin.lng, name: pin.name, address: pin.address };
  }
  function readMapsLink(text: string) {
    const found = parseMapsLink(text);
    if (found) { setPin(current => ({ ...current, lat: String(found.lat), lng: String(found.lng), link: text })); setError(""); setValidation(null); }
    else { setPin(current => ({ ...current, link: text })); if (text.trim()) setError(isShortMapsLink(text) ? "That is a short Google Maps link, which hides the position. Open it in your browser, then copy the long address from the address bar (or type the latitude and longitude)." : "No position was found in that link. Type the latitude and longitude instead."); }
  }

  function addTag(tag: string) {
    if (!tag || !editable) return;
    const ids = contacts.filter(contact => contact.tags?.includes(tag)).map(contact => contact.id);
    setSelected(current => [...new Set([...current, ...ids])].slice(0, 50000));
    setValidation(null);
    setNotice(`${ids.length} contact${ids.length === 1 ? "" : "s"} tagged #${tag} added to the selection.`);
  }

  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await readJson(await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, description: form.description, messageBody: form.messageBody, senderId: form.senderId || null, extraSenderIds: extraSenders.filter(id => id !== form.senderId),
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
          mediaAssetId: media?.id ?? null, location: pinBody(), ...tplBody(), recipientContactIds: selected,
        }),
      }));
      setNotice(`Draft saved · ${data.campaign._count.recipients} recipients`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save campaign."); }
    finally { setBusy(false); }
  }

  // One button: save what is on the screen, check it, and start sending. Nothing to validate or queue by hand.
  async function sendNow() {
    setQueueing(true); setValidating(true); setError(""); setNotice(""); setValidation(null);
    try {
      await readJson(await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, description: form.description, messageBody: form.messageBody, senderId: form.senderId || null, extraSenderIds: extraSenders.filter(id => id !== form.senderId),
          scheduledAt: null,
          mediaAssetId: media?.id ?? null, location: pinBody(), ...tplBody(), recipientContactIds: selected,
        }),
      }));
      const check = await readJson(await fetch(`/api/campaigns/${campaignId}/validate`, { method: "POST" }));
      if (!check.ready) { setValidation(check); setError("Fix the points below, then press Send again."); return; }
      await readJson(await fetch(`/api/campaigns/${campaignId}/queue`, { method: "POST" }));
      setNotice("Sending has started. The first message goes out now and the others follow one by one.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to start sending."); }
    finally { setQueueing(false); setValidating(false); }
  }

  async function scheduleCampaign() {
    setScheduling(true); setError(""); setNotice("");
    try {
      await readJson(await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, description: form.description, messageBody: form.messageBody, senderId: form.senderId || null, extraSenderIds: extraSenders.filter(id => id !== form.senderId),
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
          mediaAssetId: media?.id ?? null, location: pinBody(), ...tplBody(), recipientContactIds: selected,
        }),
      }));
      const data = await readJson(await fetch(`/api/campaigns/${campaignId}/schedule`, { method: "POST" }));
      setNotice(`Campaign scheduled for ${new Date(data.campaign.scheduledAt).toLocaleString()} · ${data.campaign.recipientCount} recipients`);
      setValidation(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to schedule campaign."); }
    finally { setScheduling(false); }
  }

  // the page follows a campaign that is sending, without a reload
  const refreshProgress = useCallback(async () => {
    try {
      const [campaignData, statsData] = await Promise.all([
        readJson(await fetch(`/api/campaigns/${campaignId}`, { cache: "no-store" })),
        readJson(await fetch(`/api/campaigns/${campaignId}/messages`, { cache: "no-store" })),
      ]);
      setCampaign(current => current ? { ...current, status: campaignData.campaign.status } : current);
      setMessageStats(statsData.counts ?? null);
      setMessages(statsData.messages ?? []);
    } catch { /* the next tick will try again */ }
  }, [campaignId]);
  useEffect(() => {
    if (!campaign || !["QUEUED", "RUNNING"].includes(campaign.status)) return;
    const timer = window.setInterval(() => { void refreshProgress(); }, 5000);
    return () => window.clearInterval(timer);
  }, [campaign, refreshProgress]);
  useEffect(() => {
    void fetch("/api/media", { cache: "no-store" }).then(response => response.json()).then(data => setRecentMedia(data.assets ?? [])).catch(() => undefined);
  }, [media]);

  async function uploadFile(file?: File) {
    if (!file) return;
    setUploading(true); setError(""); setNotice("");
    try {
      const body = new FormData(); body.set("file", file);
      const data = await readJson(await fetch("/api/media", { method: "POST", body }));
      setMedia(data.asset as MediaInfo); setValidation(null);
      setNotice(data.reused ? "This file was already uploaded; it is attached." : "File attached. Save or send to use it.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to upload the file."); }
    finally { setUploading(false); }
  }

  function addLink() {
    const url = linkUrl.trim();
    if (!/^https?:\/\/[^\s]+\.[^\s]+$/i.test(url)) { setError("Enter a link that starts with https://"); return; }
    setError("");
    const line = `${linkLabel.trim() ? linkLabel.trim() + ": " : ""}${url}`;
    setForm(current => ({ ...current, messageBody: (current.messageBody.trim() ? current.messageBody.trimEnd() + "\n\n" : "") + "\u{1F449} " + line }));
    setLinkLabel(""); setLinkUrl(""); setValidation(null);
  }

  async function sendTest() {
    setWorking(true); setError(""); setNotice("");
    try {
      await readJson(await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, description: form.description, messageBody: form.messageBody, senderId: form.senderId || null, extraSenderIds: extraSenders.filter(id => id !== form.senderId), scheduledAt: null, mediaAssetId: media?.id ?? null, location: pinBody(), ...tplBody(), recipientContactIds: selected }),
      }));
      const data = await readJson(await fetch(`/api/campaigns/${campaignId}/test`, { method: "POST" }));
      setNotice(`Test queued for ${data.to}. Open the "Message yourself" chat on that phone.`);
      for (let attempt = 0; attempt < 15; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 3000));
        const status = await readJson(await fetch(`/api/messages/${data.message.id}`, { cache: "no-store" })).catch(() => null);
        const state = status?.message?.status;
        if (state && state !== "QUEUED") { setNotice(state === "FAILED" ? `The test could not be sent: ${status.message.errorMessage || status.message.errorCode}` : `Test sent to ${data.to} (${state.toLowerCase()}). Check the "Message yourself" chat.`); break; }
        if (attempt === 14) setNotice("The test is still waiting. It is sent by the sending worker; if the worker is off it will go when the worker is on.");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to send the test."); }
    finally { setWorking(false); }
  }

  async function cloneCampaign() {
    setWorking(true); setError(""); setNotice("");
    try {
      const data = await readJson(await fetch(`/api/campaigns/${campaignId}/clone`, { method: "POST" }));
      window.location.href = `/campaigns/${data.campaign.id}`;
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to copy the campaign."); setWorking(false); }
  }

  async function retryFailed() {
    setWorking(true); setError(""); setNotice("");
    try {
      const data = await readJson(await fetch(`/api/campaigns/${campaignId}/retry-failed`, { method: "POST" }));
      setNotice(data.message); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to send the failed messages again."); }
    finally { setWorking(false); }
  }

  async function cancelCampaign() {
    if (!window.confirm("Cancel this campaign? Messages not yet sent will not be sent, and their cost goes back to your balance.")) return;
    setWorking(true); setError(""); setNotice("");
    try {
      const data = await readJson(await fetch(`/api/campaigns/${campaignId}/cancel`, { method: "POST" }));
      setNotice(data.message); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to cancel the campaign."); }
    finally { setWorking(false); }
  }

  async function resumeCampaign() {
    setQueueing(true); setError(""); setNotice("");
    try {
      const data = await readJson(await fetch(`/api/campaigns/${campaignId}/resume`, { method: "POST" }));
      setNotice(data.message || "Campaign resumed.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to resume campaign."); }
    finally { setQueueing(false); }
  }

  const visible = contacts.filter(contact => {
    const haystack = [contact.firstName, contact.lastName, contact.phoneNumberE164, contact.email, contact.company].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const editable = campaign?.status === "DRAFT";

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#F2F7FC] text-sm text-slate-500"><RefreshCw className="mr-2 animate-spin" size={16}/> Loading campaign…</div>;

  return <div className="min-h-screen bg-[#F2F7FC]">
    <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur-xl md:px-8">
      <div className="flex items-center gap-3"><Link href="/campaigns" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ArrowLeft size={18}/></Link><BrandLogo className="hidden h-8 w-auto sm:block" /><div><p className="text-xs text-slate-400">Workspace / Campaigns</p><h1 className="text-lg font-semibold text-slate-900">Campaign editor</h1></div></div>
      {editable && <div className="flex items-center gap-2"><button onClick={() => void save()} disabled={busy || validating || queueing || scheduling} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">{busy?<Loader2 className="animate-spin" size={16}/>:<Save size={16}/>} Save draft</button><button onClick={() => void sendTest()} disabled={busy || validating || queueing || scheduling || working} title="Sends this message to the sender's own number so you can see it as a customer will" className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-900 disabled:opacity-50">{working ? <Loader2 className="animate-spin" size={16}/> : <Send size={16}/>} Send test to my number</button><button onClick={() => void sendNow()} disabled={busy || validating || queueing || scheduling} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{queueing?<Loader2 className="animate-spin" size={16}/>:<Send size={16}/>} Send now</button>{form.scheduledAt && new Date(form.scheduledAt).getTime() > Date.now() && <button onClick={() => void scheduleCampaign()} disabled={scheduling || busy || queueing || validating} className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{scheduling?<Loader2 className="animate-spin" size={16}/>:<CalendarClock size={16}/>} Schedule for later</button>}</div>}
    </header>
    <main className="mx-auto max-w-[1200px] p-5 md:p-8">
      {error && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      {notice && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p>}
      {!editable && campaign && <div className="mb-4 flex flex-wrap items-center gap-2"><button onClick={() => void cloneCampaign()} disabled={working} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Copy campaign</button>{(messageStats?.failed ?? 0) > 0 && <button onClick={() => void retryFailed()} disabled={working} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900 disabled:opacity-50">Send the {messageStats?.failed} failed again</button>}{["SCHEDULED", "QUEUED", "RUNNING", "PAUSED"].includes(campaign.status) && <button onClick={() => void cancelCampaign()} disabled={working} className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-800 disabled:opacity-50">Cancel campaign</button>}<a href="/reports" className="text-sm font-semibold text-emerald-800 underline">Download reports</a></div>}
      {validation && <section className={`mb-5 rounded-2xl border p-4 ${validation.ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><div className="flex items-center justify-between gap-3"><h3 className={`text-sm font-semibold ${validation.ready ? "text-emerald-900" : "text-amber-900"}`}>{validation.ready ? "Campaign checks passed" : "Campaign needs attention"}</h3><span className="text-xs font-semibold">{validation.checks.currentlyEligibleRecipients}/{validation.checks.selectedRecipients} recipients eligible</span></div>{validation.issues.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">{validation.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}{validation.ready && <p className="mt-2 text-xs text-emerald-800">The draft currently meets the campaign readiness checks. This does not queue or send messages.</p>}</section>}

      {!campaign ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Campaign not found.</div> : <>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-slate-500">{campaign.campaignCode && <span className="mr-2 select-all font-mono text-xs font-semibold text-slate-700">{campaign.campaignCode}</span>}Draft configuration and consent-filtered recipient snapshot</p><h2 className="mt-1 text-2xl font-semibold text-slate-900">{campaign.name}</h2></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{campaign.status}</span></div>
        {campaign.status === "PAUSED" && <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4"><div><h3 className="text-sm font-semibold text-amber-900">This campaign was paused</h3><p className="mt-1 text-xs text-amber-800">It stopped by itself (the sender was disconnected, or many messages failed to deliver), so the number is not made worse. Check the sender, then resume; the waiting messages will be spaced out again.</p></div><button type="button" disabled={queueing} onClick={resumeCampaign} className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Resume campaign</button></section>}
        {!editable && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Only draft campaigns can be edited. Scheduled campaigns are picked up automatically by the queue worker when their send time arrives.</p>}
        {campaign.status !== "DRAFT" && messageStats && <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-slate-900">Message queue</h3><p className="mt-1 text-xs text-slate-500">Persistent jobs · delivery depends on an enabled dispatch worker</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{messageStats.total} jobs</span></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase text-slate-400">Queued</p><p className="mt-1 text-xl font-semibold text-slate-900">{messageStats.queued}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase text-slate-400">Submitted</p><p className="mt-1 text-xl font-semibold text-slate-900">{messageStats.submitted}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase text-slate-400">Sent</p><p className="mt-1 text-xl font-semibold text-slate-900">{messageStats.sent}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase text-slate-400">Delivered</p><p className="mt-1 text-xl font-semibold text-slate-900">{messageStats.delivered}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase text-slate-400">Read</p><p className="mt-1 text-xl font-semibold text-slate-900">{messageStats.read}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase text-slate-400">Failed</p><p className="mt-1 text-xl font-semibold text-slate-900">{messageStats.failed}</p></div></div></section>}
        {campaign.status !== "DRAFT" && messageStats && <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 px-5 py-4"><h3 className="font-semibold text-slate-900">Recipient delivery log</h3><p className="mt-1 text-xs text-slate-500">Latest 50 message records · status updates as provider receipts arrive</p></div>{messages.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3 font-semibold">Recipient</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Attempts</th><th className="px-4 py-3 font-semibold">Submitted</th><th className="px-5 py-3 font-semibold">Failure detail</th></tr></thead><tbody className="divide-y divide-slate-100">{messages.map(message=><tr key={message.id}><td className="px-5 py-3 font-medium text-slate-800">{message.recipientE164}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${["DELIVERED","READ"].includes(message.status)?"bg-emerald-50 text-emerald-700":message.status==="FAILED"?"bg-rose-50 text-rose-700":message.status==="QUEUED"?"bg-amber-50 text-amber-700":"bg-slate-100 text-slate-600"}`}>{message.status}</span></td><td className="px-4 py-3 text-slate-600">{message.attemptCount}/{message.maxAttempts}</td><td className="px-4 py-3 text-slate-500">{message.submittedAt ? new Date(message.submittedAt).toLocaleString() : "—"}</td><td className="max-w-[260px] px-5 py-3 text-slate-500">{message.errorCode ? <span title={message.errorMessage ?? ""}><span className="font-semibold text-rose-700">{message.errorCode}</span><span className="block truncate">{message.errorMessage}</span></span> : "—"}</td></tr>)}</tbody></table></div> : <p className="p-8 text-center text-xs text-slate-500">No message jobs have been created for this campaign.</p>}</section>}

        <div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="font-semibold text-slate-900">Campaign settings</h3>
            <label className="block text-xs font-semibold text-slate-700">Campaign name<input disabled={!editable} maxLength={120} value={form.name} onChange={e=>{setForm({...form,name:e.target.value});setValidation(null)}} className={field+" mt-1.5"}/></label>
            <label className="block text-xs font-semibold text-slate-700">Description<textarea disabled={!editable} maxLength={1000} rows={4} value={form.description} onChange={e=>{setForm({...form,description:e.target.value});setValidation(null)}} className={field+" mt-1.5"}/></label>
            <label className="block text-xs font-semibold text-slate-700">Message content<textarea disabled={!editable} maxLength={4096} rows={7} value={form.messageBody} onChange={e=>{setForm({...form,messageBody:e.target.value});setValidation(null)}} placeholder="Hello {{firstName}}, we have an update for you…" className={field+" mt-1.5"}/><span className="mt-1 block text-[11px] font-normal text-slate-400">Up to 4,096 characters. Variables: {"{{firstName}}"}, {"{{lastName}}"}, {"{{company}}"}, {"{{phoneNumber}}"} .</span></label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Personalisation preview</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{renderMessageTemplate(form.messageBody || "Hello {{firstName}}, welcome to {{company}}.", contacts.find(contact=>selected.includes(contact.id)) ?? {})}</p><p className="mt-2 text-[10px] text-slate-400">Preview uses the first selected eligible contact.</p></div>
            {editable && <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1.4fr_auto]"><input value={linkLabel} onChange={e=>setLinkLabel(e.target.value)} maxLength={60} placeholder="Button name, e.g. Book now" className={field}/><input value={linkUrl} onChange={e=>setLinkUrl(e.target.value)} placeholder="https://your-link" className={field}/><button type="button" onClick={addLink} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Add link</button><p className="text-[11px] text-slate-500 sm:col-span-3">WhatsApp does not show real buttons for a number linked this way, so the link is added to the message as a line that the customer can tap.</p></div>}
            <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-semibold text-slate-700">Picture, video, audio or PDF (optional)</p>{media ? <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs"><div className="flex items-center justify-between gap-2"><span className="truncate"><b>{kindLabel(media.kind)}</b> &middot; {media.filename} &middot; {(media.sizeBytes / 1048576).toFixed(1)} MB</span>{editable && <button type="button" onClick={() => { setMedia(null); setValidation(null); }} className="shrink-0 font-semibold text-rose-700">Remove</button>}</div>{media.kind === "IMAGE" && <img src={`/api/media/${media.id}`} alt="" className="mt-2 max-h-44 rounded-lg"/>}{media.kind === "VIDEO" && <video controls src={`/api/media/${media.id}`} className="mt-2 max-h-48 w-full rounded-lg"/>}{media.kind === "AUDIO" && <audio controls src={`/api/media/${media.id}`} className="mt-2 w-full"/>}{media.kind === "DOCUMENT" && <a href={`/api/media/${media.id}`} target="_blank" rel="noopener" className="mt-2 inline-block font-semibold text-emerald-800 underline">Open the PDF</a>}</div> : <p className="mt-1 text-[11px] text-slate-500">Up to 16 MB: JPG, PNG, WebP, MP4, 3GP, MP3, M4A, OGG, AMR or PDF. An audio file carries no text; with the others your message is the caption.</p>}{editable && <div className="mt-2 flex flex-wrap items-center gap-2"><label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">{uploading ? "Uploading..." : "Choose a file"}<input type="file" hidden disabled={uploading} accept=".jpg,.jpeg,.png,.webp,.mp4,.3gp,.mp3,.m4a,.ogg,.amr,.pdf" onChange={e => { void uploadFile(e.target.files?.[0]); e.target.value = ""; }}/></label>{recentMedia.length > 0 && <select value="" onChange={e => { const found = recentMedia.find(item => item.id === e.target.value); if (found) { setMedia(found); setValidation(null); } }} className="rounded-lg border border-slate-200 px-2 py-2 text-xs"><option value="">Use an earlier file...</option>{recentMedia.map(item => <option key={item.id} value={item.id}>{kindLabel(item.kind)}: {item.filename}</option>)}</select>}</div>}</div>
            {isOfficial && <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3"><p className="text-xs font-semibold text-sky-900">Official WhatsApp number: choose an approved template</p>
              <p className="mt-1 text-[11px] text-sky-900/80">A business-started chat on the official API must use a template that Meta approved. Create and approve templates in Meta Business Manager; they show here when approved. Clear the message text above: only the template is sent.</p>
              {templatesError && <p className="mt-2 rounded-lg bg-rose-50 p-2 text-[11px] text-rose-700">{templatesError}</p>}
              <select disabled={!editable} value={tpl ? `${tpl.name}|${tpl.language}` : ""} onChange={e => { const [name, language] = e.target.value.split("|"); const found = templates.find(item => item.name === name && item.language === language); setTpl(found ? { name: found.name, language: found.language, params: Array.from({ length: found.bodyVariableCount }, (_, i) => tpl?.name === found.name ? (tpl.params[i] ?? "") : "") } : null); setValidation(null); }} className={field + " mt-2"}><option value="">Choose a template…</option>{tpl && !templates.some(item => item.name === tpl.name && item.language === tpl.language) && <option value={`${tpl.name}|${tpl.language}`}>{tpl.name} ({tpl.language})</option>}{templates.map(item => <option key={`${item.name}|${item.language}`} value={`${item.name}|${item.language}`}>{item.name} &middot; {item.language}{item.category ? ` · ${item.category.toLowerCase()}` : ""}</option>)}</select>
              {tpl && (() => { const found = templates.find(item => item.name === tpl.name && item.language === tpl.language); return <div className="mt-2 space-y-2">{found && <p className="whitespace-pre-wrap rounded-lg bg-white p-2 text-xs text-slate-700">{found.bodyText}</p>}{found?.hasHeaderMedia && <p className="text-[11px] text-amber-700">This template has a picture, video or document header, which is not supported yet. Choose a text template.</p>}{found?.hasButtonVariables && <p className="text-[11px] text-amber-700">This template has a button with a variable link, which is not supported yet.</p>}{tpl.params.map((value, i) => <label key={i} className="block text-[11px] font-semibold text-slate-700">Value for {`{{${i + 1}}}`}<input disabled={!editable} value={value} onChange={e => { const params = tpl.params.slice(); params[i] = e.target.value; setTpl({ ...tpl, params }); setValidation(null); }} list="tpl-fields" placeholder="firstName, company, city or text:Diwali sale" className={field + " mt-1"}/></label>)}<datalist id="tpl-fields"><option value="firstName"/><option value="lastName"/><option value="company"/><option value="phoneNumber"/></datalist></div>; })()}</div>}
            <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-semibold text-slate-700">Location: a map pin (optional)</p><p className="mt-1 text-[11px] text-slate-500">The customer gets a WhatsApp location they can open in Maps. Your message text, if any, follows it. Use a pin or a file in one campaign, not both.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2"><input disabled={!editable || Boolean(media)} value={pin.link} onChange={e => readMapsLink(e.target.value)} placeholder="Paste the Google Maps address here" className={field + " sm:col-span-2"}/>
                <input disabled={!editable || Boolean(media)} value={pin.lat} onChange={e => { setPin({ ...pin, lat: e.target.value }); setValidation(null); }} inputMode="decimal" placeholder="Latitude, e.g. 23.3441" className={field}/><input disabled={!editable || Boolean(media)} value={pin.lng} onChange={e => { setPin({ ...pin, lng: e.target.value }); setValidation(null); }} inputMode="decimal" placeholder="Longitude, e.g. 85.3096" className={field}/>
                <input disabled={!editable || Boolean(media)} value={pin.name} onChange={e => setPin({ ...pin, name: e.target.value })} maxLength={100} placeholder="Place name (optional)" className={field}/><input disabled={!editable || Boolean(media)} value={pin.address} onChange={e => setPin({ ...pin, address: e.target.value })} maxLength={200} placeholder="Address line (optional)" className={field}/></div>
              {(pin.lat || pin.lng) && editable && <button type="button" onClick={() => { setPin({ lat: "", lng: "", name: "", address: "", link: "" }); setValidation(null); }} className="mt-2 text-xs font-semibold text-rose-700">Remove the location</button>}
              {media && <p className="mt-2 text-[11px] text-amber-700">Remove the attached file first to use a location.</p>}</div>
            <label className="block text-xs font-semibold text-slate-700">Connected sender<select disabled={!editable} value={form.senderId} onChange={e=>{setForm({...form,senderId:e.target.value});setValidation(null)}} className={field+" mt-1.5"}><option value="">Assign later</option>{senders.map(sender=><option key={sender.id} value={sender.id}>{sender.displayName} · {sender.phoneNumberE164}</option>)}</select></label>
            {senders.filter(sender=>sender.id!==form.senderId).length>0&&<fieldset disabled={!editable} className="rounded-xl border border-slate-200 p-3"><legend className="px-1 text-xs font-semibold text-slate-700">Also send from (rotation, optional)</legend><p className="mb-2 text-[11px] text-slate-500">Tick more numbers and the messages are shared between them one by one. Each number keeps its own pace and daily limit, so a big list finishes sooner and no single number is overloaded.</p><div className="flex flex-wrap gap-x-4 gap-y-1">{senders.filter(sender=>sender.id!==form.senderId).map(sender=><label key={sender.id} className="flex items-center gap-1.5 text-xs text-slate-700"><input type="checkbox" checked={extraSenders.includes(sender.id)} onChange={e=>{setExtraSenders(current=>e.target.checked?[...current,sender.id]:current.filter(id=>id!==sender.id));setValidation(null)}}/>{sender.displayName} · {sender.phoneNumberE164}</label>)}</div></fieldset>}
            <label className="block text-xs font-semibold text-slate-700"><span className="inline-flex items-center gap-2"><CalendarClock size={14}/> Planned send time</span><input disabled={!editable} type="datetime-local" value={form.scheduledAt} onChange={e=>{setForm({...form,scheduledAt:e.target.value});setValidation(null)}} className={field+" mt-1.5"}/><span className="mt-1 block text-[11px] font-normal text-slate-400">Save a future time, validate the campaign, then choose Schedule. The worker queues it when due.</span></label>
            <div className="rounded-xl bg-emerald-50 p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Selected audience</p><p className="mt-1 text-2xl font-semibold text-emerald-950">{selected.length}</p><p className="mt-1 text-[11px] text-emerald-800">Only active contacts with current WhatsApp marketing consent are selectable.</p></div>
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-900">Recipient selection</h3><p className="mt-1 text-xs text-slate-400">{contacts.length} eligible contacts available in the selection list</p></div><span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Users size={14}/>{selected.length} selected</span></div><div className="mt-4 flex flex-wrap gap-2"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search eligible contacts…" className={field+" min-w-[220px] flex-1"}/><select disabled={!editable || contactGroups.length===0} defaultValue="" onChange={e=>{void addContactGroup(e.target.value);e.target.value=""}} className={field+" max-w-xs"}><option value="">Add contacts from group…</option>{contactGroups.map(group=><option key={group.id} value={group.id}>{group.name} ({group._count.members})</option>)}</select><select disabled={!editable || tagList.length===0} defaultValue="" onChange={e=>{addTag(e.target.value);e.target.value=""}} className={field+" max-w-xs"}><option value="">Add contacts with tag…</option>{tagList.map(([tag,count])=><option key={tag} value={tag}>#{tag} ({count})</option>)}</select></div><div className="mt-3 flex gap-2"><button disabled={!editable} onClick={()=>{setSelected(contacts.map(c=>c.id));setValidation(null)}} className="text-xs font-semibold text-emerald-800 disabled:opacity-40">Select all shown</button><button disabled={!editable} onClick={()=>{setSelected([]);setValidation(null)}} className="text-xs font-semibold text-slate-500 disabled:opacity-40">Clear selection</button></div></div>
            <div className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">{visible.map(contact=><label key={contact.id} className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-slate-50"><input type="checkbox" disabled={!editable} checked={selected.includes(contact.id)} onChange={e=>{setSelected(current=>e.target.checked?[...current,contact.id]:current.filter(id=>id!==contact.id));setValidation(null)}} className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"/><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{[contact.firstName,contact.lastName].filter(Boolean).join(" ") || "Unnamed contact"}</span><span className="block truncate text-[11px] text-slate-400">{contact.phoneNumberE164} · {contact.company || contact.email || "No additional details"}</span></span>{selected.includes(contact.id)&&<Check size={15} className="text-emerald-700"/>}</label>)}</div>
            {contacts.length===0 && <p className="p-8 text-center text-xs text-slate-500">No eligible contacts. Grant valid marketing consent before adding recipients.</p>}
            <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-[11px] text-slate-500">Audience is revalidated by the server when you save. Dispatch is not enabled yet.</div>
          </section>
        </div>
      </>}
    </main>
  </div>;
}
