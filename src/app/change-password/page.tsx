"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

const input = "mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export default function ChangePasswordPage() {
  const [mailEnabled, setMailEnabled] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [current, setCurrent] = useState("");
  const [otp, setOtp] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/me", { cache: "no-store" }).then(r => r.json()).then(data => { setMailEnabled(Boolean(data.mailEnabled)); setEmail(data.user?.email ?? ""); }).catch(() => setMailEnabled(false));
  }, []);

  async function sendCode() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/auth/password/otp", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The code could not be sent.");
      setSentTo(data.sentTo); setNotice(`We sent a 6-digit code to ${data.sentTo}. It works for ${data.validMinutes} minutes.`);
    } catch (e) { setError(e instanceof Error ? e.message : "The code could not be sent."); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (next !== again) { setError("The two new passwords are not the same."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password/change", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: current, otp, newPassword: next }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The password could not be changed.");
      setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : "The password could not be changed."); }
    finally { setBusy(false); }
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
    <BrandLogo className="mb-4 h-10 w-auto" /><Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft size={16}/> Back to workspace</Link>
    <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Change your password</h1>
    {done ? <div className="mt-5 space-y-3"><p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">Your password has been changed. Use the new one the next time you sign in.</p><Link href="/" className="inline-block rounded-xl bg-[#0A78CC] px-5 py-2.5 text-sm font-semibold text-white">Back to workspace</Link></div> :
    <form onSubmit={submit} className="mt-5 space-y-4">
      <p className="text-sm text-slate-500">{mailEnabled ? <>For your safety we send a 6-digit code to <b>{email}</b>. Press <b>Send code</b>, then type the code below.</> : "Type your current password and choose a new one."}</p>
      <label className="block text-sm font-medium text-slate-700">Current password<input required type={show ? "text" : "password"} autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} className={input}/></label>
      {mailEnabled && <div className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-slate-700">E-mail code (OTP)</span><button type="button" disabled={busy} onClick={() => void sendCode()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">{sentTo ? "Send again" : "Send code"}</button></div><input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="6-digit code" className={input + " tracking-[.4em]"}/></div>}
      <label className="block text-sm font-medium text-slate-700">New password (at least 10 characters)<input required minLength={10} maxLength={128} type={show ? "text" : "password"} autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} className={input}/></label>
      <label className="block text-sm font-medium text-slate-700">Type the new password again<input required type={show ? "text" : "password"} autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} className={input}/></label>
      <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)}/> Show passwords</label>
      {notice && <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p>}
      {error && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      <button disabled={busy || mailEnabled === null} className="w-full rounded-xl bg-[#0A78CC] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Please wait…" : "Change password"}</button>
    </form>}
  </div></main>;
}
