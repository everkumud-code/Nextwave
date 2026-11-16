"use client";

import { useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, Bot, Building2, Check,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Cloud,
  Command, Contact, CreditCard, FileText, Filter, Gauge, Headphones,
  LayoutDashboard, LifeBuoy, LogOut, Menu, MessageCircle, MessageSquare,
  MoreHorizontal, Plus, RadioTower, Search, Send, Settings, ShieldCheck,
  Sparkles, Users, Wallet, Workflow, X, Zap
} from "lucide-react";

type SenderStatus = "Connected" | "Attention" | "Disconnected";
type Sender = { id: number; name: string; number: string; connector: string; owner: string; status: SenderStatus; lastActive: string };

const initialSenders: Sender[] = [
  { id: 1, name: "Aangan Resort – Main", number: "+91 98••• ••210", connector: "Cloud API", owner: "Platform", status: "Connected", lastActive: "2 min ago" },
  { id: 2, name: "Boom Bites – Campaigns", number: "+91 99••• ••481", connector: "Cloud API", owner: "Customer", status: "Connected", lastActive: "8 min ago" },
  { id: 3, name: "NextWave Demo", number: "+91 87••• ••903", connector: "QR provider", owner: "Platform", status: "Attention", lastActive: "Yesterday" },
  { id: 4, name: "Agency Workspace 01", number: "+91 90••• ••116", connector: "Cloud API", owner: "Customer", status: "Connected", lastActive: "18 min ago" },
  { id: 5, name: "Retail Demo Number", number: "+91 76••• ••552", connector: "QR provider", owner: "Customer", status: "Disconnected", lastActive: "3 days ago" },
];

const navGroups = [
  { label: "WORKSPACE", items: [
    { name: "Overview", icon: LayoutDashboard },
    { name: "Sender Manager", icon: RadioTower, count: "5" },
    { name: "Campaigns", icon: Send },
    { name: "Contacts", icon: Contact },
    { name: "Templates", icon: FileText },
    { name: "Team Inbox", icon: MessageCircle, count: "12" },
    { name: "Automation", icon: Workflow },
    { name: "Analytics", icon: Activity },
  ]},
  { label: "MANAGE", items: [
    { name: "Billing & Plans", icon: Wallet },
    { name: "Team & Access", icon: Users },
    { name: "Settings", icon: Settings },
  ]},
];

function StatusPill({ status }: { status: SenderStatus }) {
  const styles: Record<SenderStatus, string> = {
    Connected: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    Attention: "bg-amber-50 text-amber-700 ring-amber-200",
    Disconnected: "bg-slate-100 text-slate-600 ring-slate-200",
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${styles[status]}`}><span className={`h-1.5 w-1.5 rounded-full ${status === "Connected" ? "bg-emerald-500" : status === "Attention" ? "bg-amber-500" : "bg-slate-400"}`} />{status}</span>;
}

function MetricCard({ label, value, delta, note, icon: Icon, positive = true }: { label: string; value: string; delta: string; note: string; icon: typeof Send; positive?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800"><Icon size={19} /></div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${positive ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{positive ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>} {delta}</span>
      </div>
      <p className="mt-4 text-sm text-slate-500">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2"><p className="text-3xl font-semibold tracking-tight text-ink">{value}</p><p className="pb-1 text-xs text-slate-400">{note}</p></div>
    </div>
  );
}

export default function Home() {
  const [active, setActive] = useState("Overview");
  const [senders, setSenders] = useState(initialSenders);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"All" | SenderStatus>("All");
  const [showAdd, setShowAdd] = useState(false);
  const [senderName, setSenderName] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  const [connector, setConnector] = useState("Official Cloud API");
  const [toast, setToast] = useState("");

  const filteredSenders = useMemo(() => senders.filter((s) =>
    (filter === "All" || s.status === filter) &&
    (s.name.toLowerCase().includes(query.toLowerCase()) || s.number.includes(query))
  ), [senders, filter, query]);

  function addSender(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!senderName.trim() || !senderNumber.trim()) return;
    setSenders((prev) => [{ id: Date.now(), name: senderName.trim(), number: senderNumber.trim(), connector: connector === "Official Cloud API" ? "Cloud API" : "QR provider", owner: "Customer", status: "Disconnected", lastActive: "Not connected" }, ...prev]);
    setSenderName(""); setSenderNumber(""); setShowAdd(false);
    setToast("Sender record added. Connect it through the configured provider to activate messaging.");
    window.setTimeout(() => setToast(""), 4500);
    setActive("Sender Manager");
  }

  const isSenderPage = active === "Sender Manager";
  const isOverview = active === "Overview";

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-[76px] items-center gap-3 border-b border-slate-100 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest text-white"><RadioTower size={19}/></div>
          <div><p className="text-[15px] font-bold tracking-tight text-ink">nextwave<span className="text-emerald-600">.</span></p><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">MULTISENDER</p></div>
        </div>
        <div className="px-4 pt-5">
          <button className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-left hover:bg-slate-50">
            <span className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><Building2 size={16}/></span><span><span className="block text-xs font-semibold text-slate-800">Boom Bites Pvt Ltd</span><span className="block text-[10px] text-slate-400">Agency workspace</span></span></span><ChevronDown size={15} className="text-slate-400"/>
          </button>
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-6">
          {navGroups.map((group) => <div key={group.label}><p className="mb-2 px-3 text-[10px] font-bold tracking-[.15em] text-slate-400">{group.label}</p><div className="space-y-1">{group.items.map((item) => { const Icon = item.icon; const selected = active === item.name; return <button key={item.name} onClick={() => setActive(item.name)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${selected ? "bg-emerald-50 font-semibold text-forest" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}><span className="flex items-center gap-3"><Icon size={17}/>{item.name}</span>{item.count && <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${selected ? "bg-white text-forest" : "bg-slate-100 text-slate-500"}`}>{item.count}</span>}</button>})}</div></div>)}
        </nav>
        <div className="border-t border-slate-100 p-4">
          <div className="rounded-xl bg-[#F2F7F3] p-3"><div className="flex items-center gap-2 text-xs font-semibold text-forest"><ShieldCheck size={15}/> Workspace protected</div><p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">Sender access and customer data are workspace-scoped.</p></div>
          <button className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-500 hover:bg-slate-50"><CircleHelp size={15}/> Help & support</button>
        </div>
      </aside>

      <main className="min-h-screen lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur-xl md:px-8">
          <div className="flex items-center gap-3"><button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"><Menu size={20}/></button><div><div className="flex items-center gap-2 text-xs text-slate-400"><span>Workspace</span><ChevronRight size={12}/><span className="text-slate-700">{active}</span></div><h1 className="mt-1 text-lg font-semibold tracking-tight text-ink">{active}</h1></div></div>
          <div className="flex items-center gap-2 md:gap-4"><div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400 md:flex"><Search size={14}/> Search anything <kbd className="ml-5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px]">⌘ K</kbd></div><button className="relative rounded-xl p-2 text-slate-500 hover:bg-slate-100"><Bell size={18}/><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-white"/></button><div className="hidden h-8 w-px bg-slate-200 md:block"/><button className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E7EFE9] text-xs font-bold text-forest">KR</div><span className="hidden text-left md:block"><span className="block text-xs font-semibold text-slate-800">Workspace Admin</span><span className="block text-[10px] text-slate-400">Owner</span></span><ChevronDown size={14} className="hidden text-slate-400 md:block"/></button></div>
        </header>

        <div className="mx-auto max-w-[1500px] p-5 md:p-8">
          {isOverview ? <>
            <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm text-slate-500">Monday, 16 November 2026</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink md:text-[28px]">Good morning, Kumud <span>✦</span></h2><p className="mt-1 text-sm text-slate-500">Here’s what’s happening across your messaging workspace.</p></div><div className="flex gap-2"><button onClick={() => setActive("Sender Manager")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"><RadioTower size={16}/> Manage senders</button><button onClick={() => setActive("Campaigns")} className="inline-flex items-center gap-2 rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#204d37]"><Plus size={16}/> New campaign</button></div></div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Connected senders" value="3 / 5" delta="+1" note="this month" icon={RadioTower}/><MetricCard label="Campaign messages" value="24,860" delta="+12.8%" note="vs last period" icon={Send}/><MetricCard label="Delivery rate" value="96.4%" delta="+2.4%" note="vs last period" icon={Check}/><MetricCard label="Active contacts" value="18,420" delta="+8.2%" note="this month" icon={Users}/></div>
            <div className="mt-6 grid gap-5 xl:grid-cols-[1.55fr_1fr]">
              <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft"><div className="flex items-center justify-between"><div><h3 className="font-semibold text-ink">Message activity</h3><p className="mt-1 text-xs text-slate-400">Campaign volume over the last 7 days</p></div><button className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">Last 7 days <ChevronDown size={13} className="ml-1 inline"/></button></div><div className="mt-7 flex h-[190px] items-end gap-3 border-b border-slate-100 px-2">{[42,58,48,78,61,92,72,84,65,100,76,88,59,79].map((h,i)=><div key={i} className="group flex h-full flex-1 items-end"><div style={{height:`${h}%`}} className={`w-full rounded-t-md transition-all ${i===9 ? "bg-forest" : "bg-emerald-100 group-hover:bg-emerald-200"}`}/></div>)}</div><div className="mt-3 flex justify-between text-[10px] text-slate-400"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div><div className="mt-5 flex gap-5 text-xs"><span className="flex items-center gap-2 text-slate-500"><span className="h-2 w-2 rounded-sm bg-forest"/> Submitted</span><span className="flex items-center gap-2 text-slate-500"><span className="h-2 w-2 rounded-sm bg-emerald-100"/> Previous period</span></div></section>
              <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft"><div className="flex items-center justify-between"><div><h3 className="font-semibold text-ink">Sender health</h3><p className="mt-1 text-xs text-slate-400">Connection overview</p></div><button onClick={() => setActive("Sender Manager")} className="text-xs font-semibold text-forest hover:underline">View all</button></div><div className="mt-5 flex items-center gap-5"><div className="relative flex h-28 w-28 items-center justify-center rounded-full" style={{background:"conic-gradient(#16834f 0 60%, #e9b44c 60% 80%, #e8ece9 80% 100%)"}}><div className="flex h-[82px] w-[82px] flex-col items-center justify-center rounded-full bg-white"><span className="text-2xl font-semibold text-ink">60%</span><span className="text-[9px] text-slate-400">connected</span></div></div><div className="flex-1 space-y-3"><div className="flex justify-between text-xs"><span className="flex items-center gap-2 text-slate-600"><span className="h-2 w-2 rounded-full bg-emerald-600"/> Connected</span><b>3</b></div><div className="flex justify-between text-xs"><span className="flex items-center gap-2 text-slate-600"><span className="h-2 w-2 rounded-full bg-amber-400"/> Attention</span><b>1</b></div><div className="flex justify-between text-xs"><span className="flex items-center gap-2 text-slate-600"><span className="h-2 w-2 rounded-full bg-slate-300"/> Disconnected</span><b>1</b></div></div></div><div className="mt-5 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800"><span className="font-semibold">1 sender needs attention.</span> Review its provider connection before assigning new work.</div></section>
            </div>
            <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-soft"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h3 className="font-semibold text-ink">Sender accounts</h3><p className="mt-1 text-xs text-slate-400">Your recently active messaging accounts</p></div><button onClick={() => setActive("Sender Manager")} className="text-xs font-semibold text-forest hover:underline">Manage senders <ChevronRight size={13} className="inline"/></button></div><SenderTable senders={senders.slice(0,4)}/></section>
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4"><ShieldCheck className="mt-0.5 shrink-0 text-blue-700" size={17}/><p className="text-xs leading-relaxed text-blue-900"><b>Messaging compliance:</b> Only contact people who have opted in to receive your messages. Provider restrictions and account health checks are enforced before campaign execution. Dashboard figures shown here are illustrative demo data.</p></div>
          </> : isSenderPage ? <>
            <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm text-slate-500">Manage connected accounts and assignments</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Sender Manager</h2></div><button onClick={() => setShowAdd(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#204d37]"><Plus size={16}/> Add sender</button></div>
            <div className="grid gap-4 sm:grid-cols-3"><MetricCard label="Total sender records" value={String(senders.length)} delta="Inventory" note="all workspaces" icon={RadioTower}/><MetricCard label="Connected" value={String(senders.filter(s=>s.status==="Connected").length)} delta="Live" note="provider status" icon={Check}/><MetricCard label="Needs attention" value={String(senders.filter(s=>s.status!=="Connected").length)} delta="Review" note="before assignment" icon={Activity} positive={false}/></div>
            <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-soft"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between"><div className="relative w-full md:max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search sender or number..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"/></div><div className="flex flex-wrap gap-2">{(["All","Connected","Attention","Disconnected"] as const).map(v=><button key={v} onClick={()=>setFilter(v)} className={`rounded-lg px-3 py-2 text-xs font-medium ${filter===v ? "bg-forest text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{v}</button>)}</div></div><SenderTable senders={filteredSenders}/>{filteredSenders.length===0 && <p className="p-8 text-center text-sm text-slate-400">No sender accounts match this filter.</p>}</section>
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-900"><b>Connector status:</b> This initial interface uses sample sender records. Live QR sessions and message delivery are not enabled yet. The QR connector remains disabled until an authorised provider integration passes security and policy review.</div>
          </> : <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-soft"><div className="mx-auto max-w-md py-12 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-forest"><Sparkles size={24}/></div><h2 className="mt-5 text-xl font-semibold text-ink">{active}</h2><p className="mt-2 text-sm leading-relaxed text-slate-500">This module is included in the product roadmap. The dashboard foundation is ready; this workspace will be implemented in the next development milestone.</p><button onClick={() => setActive("Overview")} className="mt-6 rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white">Back to overview</button></div></section>}
          <footer className="mt-8 flex flex-col justify-between gap-2 border-t border-slate-200 pt-5 text-[11px] text-slate-400 sm:flex-row"><span>© 2026 NextWave MultiSender. Built for responsible messaging.</span><span className="flex items-center gap-3"><span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/> All systems operational (demo)</span><span>v0.1.0</span></span></footer>
        </div>
      </main>

      {showAdd && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h3 className="text-lg font-semibold text-ink">Add sender account</h3><p className="mt-1 text-xs text-slate-500">Create a sender record in this workspace.</p></div><button onClick={()=>setShowAdd(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div><form onSubmit={addSender} className="mt-6 space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Sender display name</span><input required value={senderName} onChange={e=>setSenderName(e.target.value)} placeholder="e.g. Customer Support" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"/></label><label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Phone number</span><input required value={senderNumber} onChange={e=>setSenderNumber(e.target.value)} placeholder="+91 98765 43210" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"/></label><label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Connector type</span><select value={connector} onChange={e=>setConnector(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"><option>Official Cloud API</option><option>QR provider (experimental)</option></select></label><div className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">New sender records start disconnected. Provider authorisation and connection checks are required before use.</div><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={()=>setShowAdd(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600">Cancel</button><button type="submit" className="rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white">Save sender</button></div></form></div></div>}
      {toast && <div className="fixed bottom-5 right-5 z-[60] flex max-w-sm items-start gap-2 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-xl"><Check size={17} className="mt-0.5 shrink-0 text-emerald-400"/>{toast}</div>}
    </div>
  );
}

function SenderTable({ senders }: { senders: Sender[] }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-[.12em] text-slate-400"><th className="px-5 py-3">Sender account</th><th className="px-4 py-3">Connector</th><th className="px-4 py-3">Ownership</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last activity</th><th className="px-5 py-3"></th></tr></thead><tbody>{senders.map((s)=><tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-forest"><MessageSquare size={16}/></div><div><p className="text-xs font-semibold text-slate-800">{s.name}</p><p className="mt-1 text-[11px] text-slate-400">{s.number}</p></div></div></td><td className="px-4 py-4"><span className="inline-flex items-center gap-1.5 text-xs text-slate-600"><span className="h-1.5 w-1.5 rounded-full bg-slate-300"/>{s.connector}</span></td><td className="px-4 py-4 text-xs text-slate-600">{s.owner}</td><td className="px-4 py-4"><StatusPill status={s.status}/></td><td className="px-4 py-4 text-xs text-slate-500">{s.lastActive}</td><td className="px-5 py-4 text-right"><button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><MoreHorizontal size={17}/></button></td></tr>)}</tbody></table></div>;
}
