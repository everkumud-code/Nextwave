"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileUp, RadioTower, Send, ShieldCheck, Users, RefreshCw } from "lucide-react";

type Workspace={id:string;name:string;slug:string;creditAccount:{balancePaise:number;pricePerMessagePaise:number}|null;senders:{id:string;displayName:string;phoneNumberE164:string|null;status:string;provider:string}[];_count:{contacts:number;campaigns:number;messages:number}};
type Campaign={id:string;name:string;messageBody:string|null;status:string;sender:{id:string;displayName:string;phoneNumberE164:string|null;status:string}|null;_count:{recipients:number;messages:number}};
const money=(paise:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(paise/100);

export default function AdminOperationsPage(){
 const [workspaces,setWorkspaces]=useState<Workspace[]>([]);
 const [orgId,setOrgId]=useState("");
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [audience,setAudience]=useState(0);
 const [senderId,setSenderId]=useState("");
 const [name,setName]=useState("");
 const [body,setBody]=useState("");
 const [file,setFile]=useState<File|null>(null);
 const [preview,setPreview]=useState<{totalRows:number;validCount:number;invalidCount:number;duplicateCount:number}|null>(null);
 const [busy,setBusy]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");

 const selected=workspaces.find(w=>w.id===orgId)||null;
 const connectedSenders=selected?.senders.filter(s=>s.status==="CONNECTED")||[];
 const estimatedCost=audience*(selected?.creditAccount?.pricePerMessagePaise||0);

 async function loadWorkspaces(){
  setBusy(true);setError("");
  try{const r=await fetch("/api/admin/workspaces",{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to load workspaces.");setWorkspaces(d.organizations||[]);if(!orgId&&d.organizations?.[0])setOrgId(d.organizations[0].id);}
  catch(e){setError(e instanceof Error?e.message:"Unable to load workspaces.");}finally{setBusy(false);}
 }
 async function loadCampaigns(id:string){
  if(!id){setCampaigns([]);setAudience(0);return;}
  try{const r=await fetch("/api/campaigns?organizationId="+encodeURIComponent(id),{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to load campaigns.");setCampaigns(d.campaigns||[]);setAudience(d.eligibleAudience||0);}
  catch(e){setError(e instanceof Error?e.message:"Unable to load campaigns.");}
 }
 useEffect(()=>{void loadWorkspaces();},[]);
 useEffect(()=>{setSenderId("");setPreview(null);void loadCampaigns(orgId);},[orgId]);

 async function createCampaign(e:React.FormEvent){
  e.preventDefault();if(!selected)return;setSaving(true);setError("");setNotice("");
  try{
   const r=await fetch("/api/campaigns",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organizationId:orgId,name,messageBody:body,senderId})});
   const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to create campaign.");
   setName("");setBody("");setNotice("Campaign draft created for "+selected.name+". Review the audience and credit estimate before queueing.");await loadCampaigns(orgId);
  }catch(e){setError(e instanceof Error?e.message:"Unable to create campaign.");}finally{setSaving(false);}
 }
 async function queueCampaign(c:Campaign){
  if(!selected)return;
  const estimate=c._count.recipients*(selected.creditAccount?.pricePerMessagePaise||0);
  if(!window.confirm("Queue campaign '"+c.name+"' for "+selected.name+"? Up to "+c._count.recipients+" opted-in contacts. Estimated maximum charge: "+money(estimate)+". This action cannot be undone."))return;
  setSaving(true);setError("");setNotice("");
  try{
   const r=await fetch("/api/campaigns/"+encodeURIComponent(c.id)+"/queue",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organizationId:orgId})});
   const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to queue campaign.");
   setNotice("Campaign queued. "+d.result.queuedCount+" new messages charged "+money(d.result.chargedPaise)+". Remaining balance: "+money(d.result.balanceAfterPaise)+".");await loadCampaigns(orgId);await loadWorkspaces();
  }catch(e){setError(e instanceof Error?e.message:"Unable to queue campaign.");}finally{setSaving(false);}
 }

 async function previewFile(){
  if(!file||!selected)return;setSaving(true);setError("");setNotice("");setPreview(null);
  try{const form=new FormData();form.append("file",file);form.append("preview","true");form.append("organizationId",orgId);
   const r=await fetch("/api/contacts/import",{method:"POST",body:form});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to preview upload.");setPreview(d);setNotice("File preview ready. Review valid, duplicate and invalid rows before importing.");
  }catch(e){setError(e instanceof Error?e.message:"Unable to preview upload.");}finally{setSaving(false);}
 }
 async function importFile(){
  if(!file||!selected)return;setSaving(true);setError("");setNotice("");
  try{const form=new FormData();form.append("file",file);form.append("preview","false");form.append("organizationId",orgId);
   const r=await fetch("/api/contacts/import",{method:"POST",body:form});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to import contacts.");setNotice(d.message||"Contacts imported.");setFile(null);setPreview(null);await loadCampaigns(orgId);await loadWorkspaces();
  }catch(e){setError(e instanceof Error?e.message:"Unable to import contacts.");}finally{setSaving(false);}
 }
 const reportUrl=useMemo(()=>orgId?"/api/reports/messages/export?organizationId="+encodeURIComponent(orgId):"#",[orgId]);

 return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8"><div className="mx-auto max-w-6xl">
  <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft size={16}/> Back to workspace</Link>
  <div className="mt-7 flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Delegated client operations</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Admin bulk campaigns</h1><p className="mt-2 text-sm text-slate-500">Upload client data, prepare campaigns, and queue them against the client’s connected sender.</p></div><span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><ShieldCheck size={15}/> Platform admin</span></div>
  {error&&<p className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{notice&&<p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
  {busy?<p className="mt-8 text-sm text-slate-500">Loading client workspaces…</p>:<>
   <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-6"><label className="block text-sm font-semibold">Select client workspace<select value={orgId} onChange={e=>setOrgId(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm">{workspaces.map(w=><option key={w.id} value={w.id}>{w.name} · {w.slug}</option>)}</select></label>
   {selected&&<div className="mt-5 grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Wallet balance</p><p className="mt-1 text-xl font-semibold">{money(selected.creditAccount?.balancePaise||0)}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Per-message rate</p><p className="mt-1 text-xl font-semibold">{selected.creditAccount?.pricePerMessagePaise??"—"} <span className="text-xs font-normal">paise</span></p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Contacts in CRM</p><p className="mt-1 text-xl font-semibold">{selected._count.contacts.toLocaleString("en-IN")}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Eligible opted-in audience</p><p className="mt-1 text-xl font-semibold">{audience.toLocaleString("en-IN")}</p></div></div>}</section>

   {selected&&<div className="mt-6 grid gap-6 lg:grid-cols-2">
    <section className="rounded-2xl border border-slate-200 bg-white p-6"><div className="flex items-center gap-2"><FileUp size={18} className="text-emerald-700"/><h2 className="font-semibold">Upload client contact data</h2></div><p className="mt-2 text-sm text-slate-500">CSV or XLSX, maximum 2 MB CSV / 5 MB XLSX. WhatsApp marketing consent must be explicitly recorded in the file.</p>
     <input type="file" accept=".csv,.xlsx" onChange={e=>{setFile(e.target.files?.[0]||null);setPreview(null);}} className="mt-5 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:font-semibold"/>
     <div className="mt-4 flex flex-wrap gap-2"><button onClick={previewFile} disabled={!file||saving} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Preview file</button><button onClick={importFile} disabled={!file||!preview||preview.validCount===0||saving} className="rounded-xl bg-[#1c4b35] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Import {preview?.validCount||0} valid contacts</button></div>
     {preview&&<div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">{[["Rows",preview.totalRows],["Valid",preview.validCount],["Invalid",preview.invalidCount],["Duplicates",preview.duplicateCount]].map(([label,value])=><div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>)}</div>}
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-6"><div className="flex items-center gap-2"><RadioTower size={18} className="text-emerald-700"/><h2 className="font-semibold">Create client campaign</h2></div><p className="mt-2 text-sm text-slate-500">Campaign audience is built from active contacts with current WhatsApp marketing consent.</p>
     <form onSubmit={createCampaign} className="mt-5 space-y-3"><input required value={name} onChange={e=>setName(e.target.value)} maxLength={120} placeholder="Campaign name" className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"/><select required value={senderId} onChange={e=>setSenderId(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"><option value="">Select connected client sender</option>{connectedSenders.map(s=><option key={s.id} value={s.id}>{s.displayName} · {s.phoneNumberE164||s.provider}</option>)}</select><textarea required value={body} onChange={e=>setBody(e.target.value)} maxLength={4096} rows={6} placeholder="Write message. Supported variables: firstName, lastName, company, phoneNumber." className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"/><div className="rounded-xl bg-slate-50 p-3 text-sm"><div className="flex justify-between"><span className="text-slate-500">Eligible audience</span><strong>{audience.toLocaleString("en-IN")}</strong></div><div className="mt-1 flex justify-between"><span className="text-slate-500">Estimated max. queue charge</span><strong>{money(estimatedCost)}</strong></div></div><button disabled={saving||!senderId||!audience} className="w-full rounded-xl bg-[#1c4b35] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving?"Creating…":"Create campaign draft"}</button></form>
    </section>
   </div>}

   {selected&&<section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5"><div><h2 className="font-semibold">Client campaign queue</h2><p className="mt-1 text-sm text-slate-500">Review drafts and queue campaigns. Charges are calculated on messages newly inserted into the queue.</p></div><button onClick={()=>loadCampaigns(orgId)} className="inline-flex items-center gap-2 text-sm text-slate-500"><RefreshCw size={15}/> Refresh</button></div>
    {campaigns.length===0?<p className="px-6 py-10 text-center text-sm text-slate-400">No campaigns in this workspace yet.</p>:<div className="divide-y divide-slate-100">{campaigns.map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4"><div className="min-w-0"><p className="truncate text-sm font-semibold">{c.name}</p><p className="mt-1 text-xs text-slate-400">{c.status} · {c._count.recipients} recipients · {c._count.messages} messages · {c.sender?.displayName||"No sender"}</p></div>{c.status==="DRAFT"&&<button disabled={saving||!c.sender||c.sender.status!=="CONNECTED"} onClick={()=>queueCampaign(c)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"><Send size={15}/> Queue campaign</button>}</div>)}</div>}
   </section>}
   {selected&&<div className="mt-6 flex flex-wrap gap-3"><a href={"/api/contacts/export?organizationId="+encodeURIComponent(orgId)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold"><Download size={16}/> Download client contacts</a><a href={reportUrl} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold"><Download size={16}/> Download message report</a><Link href="/admin/credits" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold">Manage client credits</Link></div>}
  </>}
 </div></main>;
}
