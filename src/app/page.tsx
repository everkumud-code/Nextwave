"use client";

import Link from "next/link";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { SenderConnection } from "@/components/sender-connection";
import {
  Activity, Building2, Check, ChevronDown, CircleHelp, Contact, FileText,
  LayoutDashboard, LogOut, Menu, MessageSquare, Plus, RadioTower, Search,
  Send, Settings, ShieldCheck, Users, Wallet, X, Pencil, Archive, RefreshCw
} from "lucide-react";

type AuthContext = {
  user: { id: string; name: string | null; email: string; image?: string | null };
  organization: { id: string; name: string; slug: string; timezone: string };
  role: string;
};
type Sender = {
  id: string;
  displayName: string;
  phoneNumber: string;
  phoneNumberE164: string;
  ownership: "CUSTOMER" | "PLATFORM";
  connector: "QR_SESSION" | "META_CLOUD_API" | "OTHER";
  status: "PENDING" | "CONNECTED" | "ATTENTION" | "DISCONNECTED" | "RESTRICTED" | "ARCHIVED";
  assignedLabel: string | null;
  lastConnectedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
};

const connectorLabels: Record<Sender["connector"], string> = {
  QR_SESSION: "QR session",
  META_CLOUD_API: "Meta Cloud API",
  OTHER: "Other connector",
};
const statusStyles: Record<Sender["status"], string> = {
  PENDING: "bg-amber-50 text-amber-700",
  CONNECTED: "bg-emerald-50 text-emerald-700",
  ATTENTION: "bg-orange-50 text-orange-700",
  DISCONNECTED: "bg-slate-100 text-slate-600",
  RESTRICTED: "bg-rose-50 text-rose-700",
  ARCHIVED: "bg-slate-100 text-slate-500",
};

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

export default function Home() {
  const [auth, setAuth] = useState<AuthContext | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authForm, setAuthForm] = useState({ name: "", organizationName: "", email: "", password: "" });
  const [senders, setSenders] = useState<Sender[]>([]);
  const [loadingSenders, setLoadingSenders] = useState(false);
  const [senderError, setSenderError] = useState("");
  const [query, setQuery] = useState("");
  const [showSenderForm, setShowSenderForm] = useState(false);
  const [editing, setEditing] = useState<Sender | null>(null);
  const [senderBusy, setSenderBusy] = useState(false);
  const [senderForm, setSenderForm] = useState({ displayName: "", phoneNumber: "", connector: "QR_SESSION", ownership: "CUSTOMER" });
  const [notice, setNotice] = useState("");

  const loadSenders = useCallback(async () => {
    setLoadingSenders(true);
    setSenderError("");
    try {
      const data = await readJson(await fetch("/api/senders", { cache: "no-store" }));
      setSenders(data.senders);
    } catch (error) {
      setSenderError(error instanceof Error ? error.message : "Unable to load senders.");
    } finally {
      setLoadingSenders(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(readJson)
      .then((data) => { if (active) setAuth(data.user ? data : null); })
      .catch(() => { if (active) setAuth(null); })
      .finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => { if (auth) void loadSenders(); }, [auth, loadSenders]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true); setAuthError("");
    try {
      const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      await readJson(await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authForm),
      }));
      const me = await readJson(await fetch("/api/auth/me", { cache: "no-store" }));
      setAuth(me);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to authenticate.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuth(null); setSenders([]);
  }

  function openCreate() {
    setEditing(null);
    setSenderForm({ displayName: "", phoneNumber: "", connector: "QR_SESSION", ownership: "CUSTOMER" });
    setShowSenderForm(true);
  }

  function openEdit(sender: Sender) {
    setEditing(sender);
    setSenderForm({ displayName: sender.displayName, phoneNumber: sender.phoneNumber, connector: sender.connector, ownership: sender.ownership });
    setShowSenderForm(true);
  }

  async function saveSender(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSenderBusy(true); setSenderError("");
    try {
      if (editing) {
        await readJson(await fetch(`/api/senders/${editing.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: senderForm.displayName }),
        }));
        setNotice("Sender details updated.");
      } else {
        await readJson(await fetch("/api/senders", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(senderForm),
        }));
        setNotice("Sender added to this workspace.");
      }
      setShowSenderForm(false);
      await loadSenders();
    } catch (error) {
      setSenderError(error instanceof Error ? error.message : "Unable to save sender.");
    } finally {
      setSenderBusy(false);
    }
  }

  async function archiveSender(sender: Sender) {
    if (!window.confirm(`Archive ${sender.displayName}? This removes it from the active sender list.`)) return;
    try {
      await readJson(await fetch(`/api/senders/${sender.id}`, { method: "DELETE" }));
      setNotice("Sender archived.");
      await loadSenders();
    } catch (error) {
      setSenderError(error instanceof Error ? error.message : "Unable to archive sender.");
    }
  }

  const visibleSenders = senders.filter((sender) =>
    sender.displayName.toLowerCase().includes(query.toLowerCase()) ||
    sender.phoneNumberE164.includes(query)
  );

  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-[#f6f8f6]"><div className="flex items-center gap-3 text-sm text-slate-500"><RefreshCw className="animate-spin" size={17}/> Loading NextWave workspace…</div></div>;

  if (!auth) return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f7f3] px-4 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl md:grid-cols-[1fr_1fr]">
        <div className="relative hidden flex-col justify-between overflow-hidden bg-[#173d2c] p-10 text-white md:flex">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full border border-white/10"/><div className="absolute -bottom-24 -left-16 h-80 w-80 rounded-full border border-white/10"/>
          <div className="relative flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10"><RadioTower size={22}/></div><div><div className="text-xl font-bold tracking-tight">nextwave<span className="text-emerald-300">.</span></div><div className="text-[10px] font-semibold tracking-[.2em] text-emerald-100/60">MULTISENDER</div></div></div>
          <div className="relative max-w-sm"><p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-200">Messaging operations, unified</p><h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight">One workspace.<br/>Every sender.<br/><span className="text-emerald-300">Total clarity.</span></h1><p className="mt-5 text-sm leading-7 text-emerald-50/70">Manage sender accounts, teams and messaging workflows from a single, organised workspace.</p></div>
          <div className="relative flex items-center gap-2 text-xs text-emerald-100/60"><ShieldCheck size={15}/> Workspace-level access control</div>
        </div>
        <div className="p-7 sm:p-10">
          <div className="mb-8 flex items-center gap-3 md:hidden"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#173d2c] text-white"><RadioTower size={19}/></div><div className="text-lg font-bold text-slate-900">nextwave<span className="text-emerald-600">.</span></div></div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-emerald-700">{authMode === "register" ? "Get started" : "Welcome back"}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{authMode === "register" ? "Create your workspace" : "Sign in to NextWave"}</h2>
          <p className="mt-2 text-sm text-slate-500">{authMode === "register" ? "Set up your organisation and invite your team later." : "Enter your account details to continue."}</p>
          <form onSubmit={submitAuth} className="mt-7 space-y-4">
            {authMode === "register" && <><Field label="Your name"><input required value={authForm.name} onChange={e=>setAuthForm({...authForm,name:e.target.value})} placeholder="Full name" className={fieldClass}/></Field><Field label="Workspace name"><input required value={authForm.organizationName} onChange={e=>setAuthForm({...authForm,organizationName:e.target.value})} placeholder="Company or agency name" className={fieldClass}/></Field></>}
            <Field label="Work email"><input required type="email" autoComplete="email" value={authForm.email} onChange={e=>setAuthForm({...authForm,email:e.target.value})} placeholder="you@company.com" className={fieldClass}/></Field>
            <Field label="Password"><input required type="password" minLength={authMode === "register" ? 10 : 1} autoComplete={authMode === "register" ? "new-password" : "current-password"} value={authForm.password} onChange={e=>setAuthForm({...authForm,password:e.target.value})} placeholder={authMode === "register" ? "At least 10 characters" : "Your password"} className={fieldClass}/></Field>
            {authError && <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-xs text-rose-700">{authError}</p>}
            <button disabled={authBusy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1c4b35] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#153b29] disabled:opacity-60">{authBusy ? <RefreshCw size={16} className="animate-spin"/> : <Check size={16}/>} {authMode === "register" ? "Create workspace" : "Sign in"}</button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500">{authMode === "register" ? "Already have an account?" : "New to NextWave?"} <button onClick={()=>{setAuthMode(authMode==="register"?"login":"register");setAuthError("");}} className="font-semibold text-emerald-800 hover:underline">{authMode === "register" ? "Sign in" : "Create workspace"}</button></p>
          <p className="mt-8 text-center text-[11px] leading-5 text-slate-400">By continuing, you agree to use the platform responsibly and maintain appropriate access to your workspace.</p>
        </div>
      </div>
    </main>
  );

  return (
    <div className="min-h-screen bg-[#f6f8f6]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-[76px] items-center gap-3 border-b border-slate-100 px-6"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#173d2c] text-white"><RadioTower size={19}/></div><div><p className="text-[15px] font-bold tracking-tight text-slate-900">nextwave<span className="text-emerald-600">.</span></p><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">MULTISENDER</p></div></div>
        <div className="px-4 pt-5"><div className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><Building2 size={16}/></span><span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-800">{auth.organization.name}</span><span className="block text-[10px] text-slate-400">{auth.role.toLowerCase()} workspace</span></span><ChevronDown size={14} className="ml-auto text-slate-400"/></div></div>
        <nav className="flex-1 space-y-6 px-3 py-6">
          <div><p className="mb-2 px-3 text-[10px] font-bold tracking-[.15em] text-slate-400">WORKSPACE</p><NavItem icon={LayoutDashboard} label="Overview"/><NavItem icon={RadioTower} label="Sender Manager" active count={String(senders.length)}/><Link href="/campaigns" className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50"><Send size={17}/>Campaigns</Link><Link href="/contacts" className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50"><Contact size={17}/>Contacts</Link><Link href="/analytics" className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50"><Activity size={17}/>Analytics</Link><NavItem icon={FileText} label="Templates" disabled/><NavItem icon={MessageSquare} label="Team Inbox" disabled/></div>
          <div><p className="mb-2 px-3 text-[10px] font-bold tracking-[.15em] text-slate-400">MANAGE</p><NavItem icon={Wallet} label="Billing & Plans" disabled/><NavItem icon={Users} label="Team & Access" disabled/><NavItem icon={Settings} label="Settings" disabled/></div>
        </nav>
        <div className="border-t border-slate-100 p-4"><div className="rounded-xl bg-[#f2f7f3] p-3"><div className="flex items-center gap-2 text-xs font-semibold text-[#1c4b35]"><ShieldCheck size={15}/> Workspace protected</div><p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">Your sender records are isolated to this organisation.</p></div><button className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-500"><CircleHelp size={15}/> Help & support</button></div>
      </aside>

      <main className="min-h-screen lg:pl-[248px]">
        <header className="sticky top-0 z-10 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur-xl md:px-8"><div className="flex items-center gap-3"><button className="rounded-lg p-2 text-slate-500 lg:hidden"><Menu size={20}/></button><div><div className="flex items-center gap-2 text-xs text-slate-400"><span>Workspace</span><span>/</span><span className="text-slate-700">Sender Manager</span></div><h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Sender Manager</h1></div></div><div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-xs font-semibold text-slate-800">{auth.user.name || auth.user.email}</p><p className="text-[10px] text-slate-400">{auth.user.email}</p></div><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e7efe9] text-xs font-bold text-[#1c4b35]">{(auth.user.name || auth.user.email).slice(0,2).toUpperCase()}</div><button onClick={signOut} title="Sign out" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><LogOut size={17}/></button></div></header>

        <div className="mx-auto max-w-[1450px] p-5 md:p-8">
          <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm text-slate-500">Manage the messaging accounts in your organisation</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 md:text-[28px]">Your senders</h2><p className="mt-1 text-sm text-slate-500">A live inventory loaded from your workspace database.</p></div><button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1c4b35] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#153b29]"><Plus size={16}/> Add sender</button></div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Metric label="Total senders" value={String(senders.length)} detail="Active records" icon={RadioTower}/>
            <Metric label="Connected" value={String(senders.filter(s=>s.status==="CONNECTED").length)} detail="Provider-confirmed" icon={Check}/>
            <Metric label="Pending / offline" value={String(senders.filter(s=>s.status!=="CONNECTED").length)} detail="Not currently connected" icon={Activity}/>
          </div>

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between"><div><h3 className="font-semibold text-slate-900">Sender accounts</h3><p className="mt-1 text-xs text-slate-400">{senders.length} records in {auth.organization.name}</p></div><div className="relative w-full md:max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search sender or number…" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"/></div></div>
            {senderError && <div className="mx-4 mt-4 rounded-xl bg-rose-50 px-3 py-2.5 text-xs text-rose-700">{senderError}</div>}
            {loadingSenders ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-400"><RefreshCw size={16} className="animate-spin"/> Loading sender records…</div> : visibleSenders.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-[.12em] text-slate-400"><th className="px-5 py-3">Sender account</th><th className="px-4 py-3">Connector</th><th className="px-4 py-3">Ownership</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Created</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody>{visibleSenders.map(sender=><tr key={sender.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-[#1c4b35]"><MessageSquare size={16}/></div><div><p className="text-xs font-semibold text-slate-800">{sender.displayName}</p><p className="mt-1 text-[11px] text-slate-400">{sender.phoneNumberE164}</p></div></div></td><td className="px-4 py-4 text-xs text-slate-600">{connectorLabels[sender.connector]}</td><td className="px-4 py-4 text-xs text-slate-600">{sender.ownership === "CUSTOMER" ? "Customer" : "Platform"}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusStyles[sender.status]}`}>{sender.status.replace("_"," ")}</span></td><td className="px-4 py-4 text-xs text-slate-500">{new Date(sender.createdAt).toLocaleDateString()}</td><td className="px-5 py-4"><div className="flex justify-end gap-1">{sender.connector === "QR_SESSION" && <SenderConnection senderId={sender.id} senderName={sender.displayName} onStatusChange={(status) => setSenders((current) => current.some((item) => item.id === sender.id && item.status !== status) ? current.map((item) => item.id === sender.id ? { ...item, status } : item) : current)}/>}<button onClick={()=>openEdit(sender)} title="Edit sender name" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={15}/></button><button onClick={()=>archiveSender(sender)} title="Archive sender" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Archive size={15}/></button></div></td></tr>)}</tbody></table></div> : <div className="px-6 py-14 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-[#1c4b35]"><RadioTower size={22}/></div><h4 className="mt-4 text-sm font-semibold text-slate-900">{query ? "No matching senders" : "No senders yet"}</h4><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">{query ? "Try a different name or phone number." : "Add your first sender account to begin building your messaging workspace."}</p>{!query && <button onClick={openCreate} className="mt-4 rounded-xl bg-[#1c4b35] px-4 py-2.5 text-xs font-semibold text-white"><Plus size={14} className="mr-1 inline"/> Add first sender</button>}</div>}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-5 py-3"><span className="text-[11px] text-slate-400">Workspace: {auth.organization.slug}</span><button onClick={()=>void loadSenders()} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"><RefreshCw size={13}/> Refresh</button></div>
          </section>
          {notice && <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-800"><span className="flex items-center gap-2"><Check size={15}/>{notice}</span><button onClick={()=>setNotice("")}><X size={14}/></button></div>}
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4"><ShieldCheck className="mt-0.5 shrink-0 text-blue-700" size={17}/><p className="text-xs leading-relaxed text-blue-900"><b>Live database records.</b> Sender names, phone numbers, connector selections and statuses are read from PostgreSQL. New records start in PENDING status; a provider connection is a separate step.</p></div>
          <footer className="mt-8 flex flex-col justify-between gap-2 border-t border-slate-200 pt-5 text-[11px] text-slate-400 sm:flex-row"><span>© 2026 NextWave MultiSender</span><span>Workspace-scoped sender inventory · v0.2.0</span></footer>
        </div>
      </main>

      {showSenderForm && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h3 className="text-lg font-semibold text-slate-900">{editing ? "Edit sender" : "Add sender account"}</h3><p className="mt-1 text-xs text-slate-500">{editing ? "Update the sender display name." : "Create a sender record in this workspace."}</p></div><button onClick={()=>setShowSenderForm(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div><form onSubmit={saveSender} className="mt-6 space-y-4"><Field label="Sender display name"><input required maxLength={80} value={senderForm.displayName} onChange={e=>setSenderForm({...senderForm,displayName:e.target.value})} placeholder="e.g. Customer Support" className={fieldClass}/></Field>{!editing && <><Field label="Phone number (E.164)"><input required value={senderForm.phoneNumber} onChange={e=>setSenderForm({...senderForm,phoneNumber:e.target.value})} placeholder="+91 98765 43210" className={fieldClass}/><span className="mt-1 block text-[11px] text-slate-400">Include + and country code.</span></Field><Field label="Connector"><select value={senderForm.connector} onChange={e=>setSenderForm({...senderForm,connector:e.target.value})} className={fieldClass}><option value="QR_SESSION">QR session</option><option value="META_CLOUD_API">Meta Cloud API</option><option value="OTHER">Other connector</option></select></Field><Field label="Ownership"><select value={senderForm.ownership} onChange={e=>setSenderForm({...senderForm,ownership:e.target.value})} className={fieldClass}><option value="CUSTOMER">Customer-owned</option><option value="PLATFORM">Platform-owned</option></select></Field></>}{senderError && <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-xs text-rose-700">{senderError}</p>}<div className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">New sender records are saved as PENDING. Connection status is updated by the provider integration, not manually.</div><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={()=>setShowSenderForm(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600">Cancel</button><button disabled={senderBusy} type="submit" className="rounded-xl bg-[#1c4b35] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{senderBusy ? "Saving…" : editing ? "Save changes" : "Save sender"}</button></div></form></div></div>}
    </div>
  );
}

const fieldClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>{children}</label>; }
function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof RadioTower }) { return <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-[#1c4b35]"><Icon size={19}/></div><p className="mt-4 text-sm text-slate-500">{label}</p><div className="mt-1 flex items-end justify-between gap-2"><p className="text-3xl font-semibold tracking-tight text-slate-900">{value}</p><p className="pb-1 text-xs text-slate-400">{detail}</p></div></div>; }
function NavItem({ icon: Icon, label, active = false, disabled = false, count }: { icon: typeof RadioTower; label: string; active?: boolean; disabled?: boolean; count?: string }) { return <button disabled={disabled} className={`mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-emerald-50 font-semibold text-[#1c4b35]" : "text-slate-600"} ${disabled ? "cursor-not-allowed opacity-40" : "hover:bg-slate-50"}`}><span className="flex items-center gap-3"><Icon size={17}/>{label}</span>{count && <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] text-[#1c4b35]">{count}</span>}</button>; }
