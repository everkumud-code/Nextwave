"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RadioTower, CheckCircle2 } from "lucide-react";

export default function AcceptTeamInvitePage(){
 const params=useSearchParams(); const router=useRouter(); const token=params.get("token")||"";
 const [name,setName]=useState(""); const [password,setPassword]=useState(""); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");try{const r=await fetch("/api/team/accept",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,name,password})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to accept invitation.");router.replace("/");router.refresh();}catch(e){setError(e instanceof Error?e.message:"Unable to accept invitation.");}finally{setBusy(false);}}
 return <main className="flex min-h-screen items-center justify-center bg-[#f3f7f3] px-4 py-10"><div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#173d2c] text-white"><RadioTower size={20}/></span><span className="text-xl font-bold">nextwave<span className="text-emerald-600">.</span></span></div><div className="mt-8 flex items-center gap-2 text-emerald-700"><CheckCircle2 size={18}/><span className="text-xs font-bold uppercase tracking-[.16em]">Team invitation</span></div><h1 className="mt-3 text-2xl font-semibold">Join the workspace</h1><p className="mt-2 text-sm leading-6 text-slate-500">Complete your account setup to accept this invitation. If you already have a NextWave account, the invitation will add this workspace to your access.</p>
 {error&&<p className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
 <form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm font-medium">Your name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Full name (for new accounts)" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"/></label><label className="block text-sm font-medium">Set a password<input required type="password" minLength={10} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 10 characters" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"/></label><button disabled={!token||busy} className="w-full rounded-xl bg-[#1c4b35] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?"Joining…":"Accept invitation"}</button></form>
 {!token&&<p className="mt-4 text-sm text-rose-600">Invitation token is missing. Ask your workspace admin for a fresh link.</p>}
 </div></main>;
}
