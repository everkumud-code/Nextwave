"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, FolderPlus, Loader2, RefreshCw, Search, Trash2, Users } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

type Contact = { id: string; firstName: string | null; lastName: string | null; phoneNumberE164: string; email: string | null; company: string | null; status: string };
type Group = { id: string; name: string; description: string | null; createdAt: string; updatedAt: string; _count: { members: number } };
async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export default function ContactGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [groupData, firstPage] = await Promise.all([
        readJson(await fetch("/api/contact-groups", { cache: "no-store" })),
        readJson(await fetch("/api/contacts", { cache: "no-store" })),
      ]);
      const all: Contact[] = [...firstPage.contacts];
      let cursor: string | null = firstPage.nextCursor ?? null;
      let pages = 0;
      while (cursor && all.length < 5000 && pages < 100) {
        const next = await readJson(await fetch(`/api/contacts?cursor=${encodeURIComponent(cursor)}`, { cache: "no-store" }));
        all.push(...next.contacts);
        cursor = next.nextCursor ?? null;
        pages++;
      }
      setGroups(groupData.groups);
      setContacts(all.slice(0, 5000));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load contact groups."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter(contact => [contact.firstName, contact.lastName, contact.phoneNumberE164, contact.email, contact.company].filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [contacts, query]);

  function startNew() {
    setActiveId(null); setName(""); setDescription(""); setSelected([]); setError(""); setNotice("");
  }

  async function editGroup(group: Group) {
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await readJson(await fetch(`/api/contact-groups/${group.id}`, { cache: "no-store" }));
      setActiveId(group.id); setName(data.group.name); setDescription(data.group.description ?? "");
      setSelected(data.group.contacts.map((contact: Contact) => contact.id));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to open group."); }
    finally { setBusy(false); }
  }

  function toggleContact(id: string) {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  async function saveGroup() {
    if (!name.trim()) { setError("Enter a group name."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(activeId ? `/api/contact-groups/${activeId}` : "/api/contact-groups", {
        method: activeId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, contactIds: selected }),
      });
      await readJson(response);
      setNotice(activeId ? "Contact group updated." : "Contact group created.");
      await load();
      if (!activeId) startNew();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save group."); }
    finally { setBusy(false); }
  }

  async function deleteGroup(group: Group) {
    if (!window.confirm(`Delete group “${group.name}”? Contacts will not be deleted.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await readJson(await fetch(`/api/contact-groups/${group.id}`, { method: "DELETE" }));
      if (activeId === group.id) startNew();
      setNotice("Group deleted. Contacts remain in your database.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to delete group."); }
    finally { setBusy(false); }
  }

  return <div className="min-h-screen bg-[#F2F7FC]">
    <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur-xl md:px-8">
      <div className="flex items-center gap-3"><Link href="/contacts" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ArrowLeft size={18}/></Link><BrandLogo className="hidden h-8 w-auto sm:block" /><div><p className="text-xs text-slate-400">Workspace / Contacts</p><h1 className="text-lg font-semibold text-slate-900">Contact groups</h1></div></div>
      <button onClick={startNew} className="inline-flex items-center gap-2 rounded-xl bg-[#0A78CC] px-4 py-2.5 text-sm font-semibold text-white"><FolderPlus size={16}/> New group</button>
    </header>
    <main className="mx-auto grid max-w-[1400px] gap-5 p-5 lg:grid-cols-[340px_1fr] md:p-8">
      {error && <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700 lg:col-span-2">{error}</p>}
      {notice && <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 lg:col-span-2">{notice}</p>}
      <section className="h-fit overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 p-4"><div><h2 className="font-semibold text-slate-900">Your groups</h2><p className="mt-1 text-xs text-slate-500">{groups.length} saved groups</p></div><button onClick={() => void load()} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50"><RefreshCw size={15}/></button></div>
        {loading ? <div className="p-8 text-center text-xs text-slate-400"><Loader2 className="mx-auto mb-2 animate-spin" size={17}/>Loading…</div> : groups.length ? <div className="divide-y divide-slate-100">{groups.map(group => <div key={group.id} className={`flex items-center gap-2 p-4 ${activeId === group.id ? "bg-emerald-50/70" : ""}`}><button onClick={() => void editGroup(group)} className="min-w-0 flex-1 text-left"><p className="truncate text-sm font-semibold text-slate-800">{group.name}</p><p className="mt-1 text-xs text-slate-500">{group._count.members} contacts</p></button><button onClick={() => void deleteGroup(group)} disabled={busy} title="Delete group" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15}/></button></div>)}</div> : <div className="p-8 text-center"><Users className="mx-auto text-slate-300" size={24}/><p className="mt-2 text-sm font-medium text-slate-700">No groups yet</p><p className="mt-1 text-xs text-slate-500">Create groups to organise your contacts.</p></div>}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900">{activeId ? "Edit contact group" : "Create contact group"}</h2><p className="mt-1 text-xs text-slate-500">Select contacts from this workspace. Group membership does not change consent status.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{selected.length} selected</span></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-xs font-semibold text-slate-700">Group name<input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="e.g. Ranchi corporate leads" className={field+" mt-1.5"}/></label><label className="text-xs font-semibold text-slate-700">Description<input value={description} onChange={e => setDescription(e.target.value)} maxLength={500} placeholder="Optional group description" className={field+" mt-1.5"}/></label></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div><h3 className="text-sm font-semibold text-slate-800">Choose contacts</h3><p className="mt-1 text-xs text-slate-500">Loaded up to {contacts.length.toLocaleString()} contacts</p></div><div className="relative w-full md:max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search contacts…" className={field+" pl-9"}/></div></div>
        <div className="max-h-[520px] overflow-auto">{visible.length ? <div className="divide-y divide-slate-50">{visible.map(contact => <label key={contact.id} className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-slate-50"><input type="checkbox" checked={selected.includes(contact.id)} onChange={() => toggleContact(contact.id)} className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"/><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed contact"}</span><span className="mt-0.5 block truncate text-[11px] text-slate-500">{contact.phoneNumberE164} · {contact.company || contact.email || contact.status}</span></span>{selected.includes(contact.id) && <Check size={16} className="text-emerald-700"/>}</label>)}</div> : <p className="p-10 text-center text-xs text-slate-400">No matching contacts.</p>}</div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 p-4"><button onClick={startNew} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600">Clear</button><button onClick={() => void saveGroup()} disabled={busy || !name.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#0A78CC] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? <Loader2 className="animate-spin" size={16}/> : <Check size={16}/>} {activeId ? "Save group" : "Create group"}</button></div>
      </section>
    </main>
  </div>;
}
