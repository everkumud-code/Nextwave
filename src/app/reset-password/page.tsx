"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (password !== again) { setError("The two passwords are not the same."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Something went wrong.");
      setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  }
  if (!token) return <p className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">This link is not complete. Open the link from your e-mail again, or <Link href="/forgot-password" className="font-semibold underline">ask for a new one</Link>.</p>;
  if (done) return <div className="mt-5 space-y-3"><p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">Your password has been changed. You can sign in now.</p><Link href="/" className="inline-block rounded-xl bg-[#0A78CC] px-5 py-2.5 text-sm font-semibold text-white">Go to sign in</Link></div>;
  return <form onSubmit={submit} className="mt-5 space-y-4">
    <label className="block text-sm font-medium text-slate-700">New password (at least 10 characters)<input required minLength={10} maxLength={128} type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"/></label>
    <label className="block text-sm font-medium text-slate-700">Type it again<input required type={show ? "text" : "password"} autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"/></label>
    <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)}/> Show password</label>
    {error && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
    <button disabled={busy} className="w-full rounded-xl bg-[#0A78CC] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : "Save the new password"}</button>
  </form>;
}

export default function ResetPasswordPage() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><BrandLogo className="mb-6 h-10 w-auto" /><h1 className="text-2xl font-semibold tracking-tight text-slate-900">Choose a new password</h1><Suspense fallback={null}><ResetForm /></Suspense></div></main>;
}
