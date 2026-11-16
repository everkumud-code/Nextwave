"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Contact, Plus, RefreshCw, Search, ShieldCheck, UserPlus, X } from "lucide-react";

type Consent = { channel: string; purpose: string; status: "GRANTED" | "WITHDRAWN" | "UNKNOWN"; createdAt: string };
type ContactRecord = {
  id: string; phoneNumber: string; phoneNumberE164: string; firstName: string | null;
  lastName: string | null; email: string | null; company: string | null;
  status: "ACTIVE" | "UNSUBSCRIBED" | "INVALID" | "BLOCKED";
  source: string | null; createdAt: string; consents: Consent[];
};
async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", phoneNumber: "", email: "", company: "", whatsappConsent: false });

  const loadContacts = useCallback(async (search = query) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      const data = await readJson(await fetch("/api/contacts?" + params.toString(), { cache: "no-store" }));
      setContacts(data.contacts); setTotal(data.total);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load contacts."); }
    finally { setLoading(false); }
  }, [query]);

  useEffect(() => { void loadContacts(""); }, [loadContacts]);

  async function addContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await readJson(await fetch("/api/contacts", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      }));
      setForm({ firstName: "", lastName: "", phoneNumber: "", email: "", company: "", whatsappConsent: false });
      setShowForm(false); setNotice("Contact added to your workspace."); await loadContacts();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to add contact."); }
    finally { setBusy(false); }
  }

  async function recordConsent(contact: ContactRecord) {
    const current = contact.consents.find(c => c.channel === "WHATSAPP" && c.purpose === "MARKETING");
    const next = current?.status === "GRANTED" ? "WITHDRAWN" : "GRANTED";
    try {
      await readJson(await fetch(`/api/contacts/${contact.id}/consent`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "WHATSAPP", purpose: "MARKETING", status: next, source: "WORKSPACE_CONTACTS" }),
      }));
      setNotice(next === "GRANTED" ? "WhatsApp marketing consent recorded." : "WhatsApp marketing consent withdrawn.");
      await loadContacts();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update consent."); }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadContacts(query); }, 250);
    return () => window.clearTimeout(timer);
  }, [query, loadContacts]);

  return <div className="min-h-screen bg-[#f6f8f6]">
    <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur-xl md:px-8">
      <div className="flex items-center gap-3"><Link href="/" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ArrowLeft size={18}/></Link><div><p className="text-xs text-slate-400">Workspace / Contacts</p><h1 className="text-lg font-semibold text-slate-900">Contact Manager</h1></div></div>
      <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#1c4b35] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#153b29]"><Plus size={16}/> Add contact</button>
    </header>
    <main className="mx-auto max-w-[1400px] p-5 md:p-8">
      <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm text-slate-500">A workspace-scoped customer and audience database</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 md:text-[28px]">Your contacts</h2><p className="mt-1 text-sm text-slate-500">Normalized phone numbers, duplicate protection and consent history.</p></div><div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Total contacts</p><p className="mt-1 text-2xl font-semibold text-slate-900">{total.toLocaleString()}</p></div></div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between"><div><h3 className="font-semibold text-slate-900">Contact database</h3><p className="mt-1 text-xs text-slate-400">Search by name, phone, email or company</p></div><div className="relative w-full md:max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search contacts…" className={field + " pl-9"}/></div></div>
        {error && <div className="mx-4 mt-4 rounded-xl bg-rose-50 px-3 py-2.5 text-xs text-rose-700">{error}</div>}
        {notice && <div className="mx-4 mt-4 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">{notice}<button onClick={()=>setNotice("")} className="float-right"><X size={14}/></button></div>}
        {loading ? <div className="flex items-center justify-center gap-2 p-14 text-sm text-slate-400"><RefreshCw className="animate-spin" size={16}/> Loading contacts…</div> : contacts.length ? <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead><tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-400"><th className="px-5 py-3">Contact</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Company</th><th className="px-4 py-3">Contact status</th><th className="px-4 py-3">WhatsApp consent</th><th className="px-5 py-3 text-right">Updated</th></tr></thead><tbody>{contacts.map(contact => { const consent = contact.consents.find(c=>c.channel==="WHATSAPP"&&c.purpose==="MARKETING"); return <tr key={contact.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60"><td className="px-5 py-4"><p className="text-xs font-semibold text-slate-800">{[contact.firstName,contact.lastName].filter(Boolean).join(" ") || "Unnamed contact"}</p><p className="mt-1 text-[11px] text-slate-400">{contact.email || "No email"}</p></td><td className="px-4 py-4 text-xs text-slate-600">{contact.phoneNumberE164}</td><td className="px-4 py-4 text-xs text-slate-600">{contact.company || "—"}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${contact.status==="ACTIVE"?"bg-emerald-50 text-emerald-700":contact.status==="UNSUBSCRIBED"?"bg-amber-50 text-amber-700":"bg-slate-100 text-slate-600"}`}>{contact.status}</span></td><td className="px-4 py-4"><button onClick={()=>void recordConsent(contact)} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${consent?.status==="GRANTED"?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600"}`}>{consent?.status==="GRANTED"?"Granted · withdraw":"Not granted · record"}</button></td><td className="px-5 py-4 text-right text-xs text-slate-500">{new Date(contact.createdAt).toLocaleDateString()}</td></tr>; })}</tbody></table></div> : <div className="px-6 py-16 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-[#1c4b35]"><Contact size={22}/></div><h4 className="mt-4 text-sm font-semibold text-slate-900">{query?"No matching contacts":"Your contact database is empty"}</h4><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">Add a contact to start building your workspace audience. CSV import is the next CRM milestone.</p><button onClick={()=>setShowForm(true)} className="mt-4 rounded-xl bg-[#1c4b35] px-4 py-2.5 text-xs font-semibold text-white"><UserPlus size={14} className="mr-1 inline"/> Add first contact</button></div>}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-5 py-3"><span className="text-[11px] text-slate-400">Contacts are isolated by workspace</span><button onClick={()=>void loadContacts()} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800"><RefreshCw size={13}/> Refresh</button></div>
      </section>
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4"><ShieldCheck className="mt-0.5 shrink-0 text-blue-700" size={17}/><p className="text-xs leading-relaxed text-blue-900"><b>Consent is recorded as an auditable event.</b> Grant or withdrawal creates a new consent record; the previous record is retained in the contact history. Only explicitly granted contacts should be selected for marketing campaigns.</p></div>
    </main>
    {showForm && <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h3 className="text-lg font-semibold text-slate-900">Add contact</h3><p className="mt-1 text-xs text-slate-500">Indian mobile numbers can be entered as 10 digits.</p></div><button onClick={()=>setShowForm(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div><form onSubmit={addContact} className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-700">First name<input value={form.firstName} onChange={e=>setForm({...form,firstName:e.target.value})} className={field+" mt-1.5"} maxLength={80}/></label><label className="text-xs font-semibold text-slate-700">Last name<input value={form.lastName} onChange={e=>setForm({...form,lastName:e.target.value})} className={field+" mt-1.5"} maxLength={80}/></label><label className="text-xs font-semibold text-slate-700 sm:col-span-2">Phone number *<input required value={form.phoneNumber} onChange={e=>setForm({...form,phoneNumber:e.target.value})} placeholder="98765 43210 or +1 415 555 2671" className={field+" mt-1.5"}/></label><label className="text-xs font-semibold text-slate-700">Email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className={field+" mt-1.5"}/></label><label className="text-xs font-semibold text-slate-700">Company<input value={form.company} onChange={e=>setForm({...form,company:e.target.value})} className={field+" mt-1.5"}/></label><label className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 sm:col-span-2"><input type="checkbox" checked={form.whatsappConsent} onChange={e=>setForm({...form,whatsappConsent:e.target.checked})} className="mt-0.5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"/> WhatsApp marketing consent has been obtained and I want to record it now.</label><div className="flex justify-end gap-2 pt-2 sm:col-span-2"><button type="button" onClick={()=>setShowForm(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600">Cancel</button><button disabled={busy} type="submit" className="rounded-xl bg-[#1c4b35] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy?"Saving…":"Save contact"}</button></div></form></div></div>}
  </div>;
}
