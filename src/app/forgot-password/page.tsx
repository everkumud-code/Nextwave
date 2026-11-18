"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { emailEnabled: boolean }>(null);
  const [error, setError] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changed, setChanged] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Something went wrong.");
      setDone({ emailEnabled: data.emailEnabled });
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  }
  async function useCode(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/reset-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, otp, password: newPassword }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Something went wrong.");
      setChanged(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
    <BrandLogo className="mb-6 h-10 w-auto" />
    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Forgot your password?</h1>
    {done ? <div className="mt-5 space-y-3 text-sm text-slate-600">{done.emailEnabled ? <p className="rounded-xl bg-emerald-50 p-4 text-emerald-900">If this e-mail has an account, we have sent a link to choose a new password. It works for one hour. Please also look in the spam folder.</p> : <p className="rounded-xl bg-amber-50 p-4 text-amber-900">Reset by e-mail is not switched on for this platform yet. Please contact the NextWave team and they will reset your password for you.</p>}{done.emailEnabled && !changed && <form onSubmit={useCode} className="space-y-3 rounded-xl border border-slate-200 p-4"><p className="text-xs text-slate-600">Prefer the 6-digit code from the e-mail? Type it here with a new password.</p><input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="6-digit code" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm tracking-[.4em]"/><input required minLength={10} maxLength={128} type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password (10+ characters)" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/>{error && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Saving" + String.fromCharCode(8230) : "Change password with the code"}</button></form>}{changed && <p className="rounded-xl bg-emerald-50 p-4 text-emerald-900">Your password has been changed. You can sign in now.</p>}<Link href="/" className="inline-block font-semibold text-[#0A78CC]">Back to sign in</Link></div> :
    <form onSubmit={submit} className="mt-5 space-y-4"><p className="text-sm text-slate-500">Enter the e-mail address you signed up with. We will send you a link to choose a new password.</p>
      <label className="block text-sm font-medium text-slate-700">Email<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"/></label>
      {error && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-[#0A78CC] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Sending…" : "Send the link"}</button>
      <Link href="/" className="block text-center text-sm text-slate-500">Back to sign in</Link></form>}
  </div></main>;
}
