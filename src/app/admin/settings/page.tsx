"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, Mail, ShieldCheck, WalletCards, Waves } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

type Status = { key: string; label: string; secret: boolean; source: "screen" | "server" | null; value: string | null };
type Loaded = { settings: Status[]; encryptionAvailable: boolean; urls: { payuReturn: string; metaWebhook: string } };

const input = "mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export default function AdminSettingsPage() {
  const [data, setData] = useState<Loaded | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [testTo, setTestTo] = useState("");

  async function load() {
    try {
      const response = await fetch("/api/admin/settings", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load settings.");
      setData(body); setForm({});
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load settings."); }
  }
  useEffect(() => { void load(); }, []);

  const status = (key: string) => data?.settings.find(item => item.key === key);
  const shown = (key: string) => form[key] ?? status(key)?.value ?? "";
  const set = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));
  const badge = (key: string) => { const s = status(key); return s?.source === "screen" ? "saved here" : s?.source === "server" ? "set on the server" : "not set"; };

  async function save(group: string, keys: string[], event?: FormEvent) {
    event?.preventDefault(); setBusy(group); setError(""); setNotice("");
    const values: Record<string, string | null> = {};
    for (const key of keys) if (form[key] !== undefined && form[key] !== "") values[key] = form[key];
    if (!Object.keys(values).length) { setBusy(""); setNotice("Nothing was changed."); return; }
    try {
      const response = await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to save.");
      setNotice("Saved. It works from now on; no restart is needed."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save."); }
    finally { setBusy(""); }
  }
  async function clear(key: string) {
    if (!window.confirm("Remove this saved value?")) return;
    setError(""); setNotice("");
    const response = await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: { [key]: null } }) });
    if (response.ok) { setNotice("Removed."); await load(); } else setError((await response.json()).error || "Unable to remove.");
  }
  async function testMail() {
    setBusy("test"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/settings/test-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: testTo || undefined }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The test e-mail could not be sent.");
      setNotice(`Test e-mail sent to ${body.to}. Please check that inbox (and spam).`);
    } catch (e) { setError(e instanceof Error ? e.message : "The test e-mail could not be sent."); }
    finally { setBusy(""); }
  }
  const copy = (text: string) => { void navigator.clipboard?.writeText(text).then(() => setNotice("Copied.")).catch(() => setError("Copy failed. Select and copy it by hand.")); };
  const field = (key: string, label: string, opts: { type?: string; placeholder?: string } = {}) => {
    const s = status(key);
    return <label className="block text-xs font-semibold text-slate-700">{label} <span className={`ml-1 font-normal ${s?.source ? "text-emerald-700" : "text-slate-400"}`}>({badge(key)})</span>
      <div className="flex gap-2"><input type={opts.type ?? "text"} autoComplete="off" value={s?.secret ? (form[key] ?? "") : shown(key)} onChange={e => set(key, e.target.value)} placeholder={s?.secret && s.source ? "•••••••• saved (type to replace)" : opts.placeholder} className={input}/>{s?.source === "screen" && <button type="button" onClick={() => void clear(key)} className="mt-1.5 shrink-0 rounded-xl border border-slate-300 px-3 text-xs text-slate-600">Remove</button>}</div></label>;
  };

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8"><div className="mx-auto max-w-4xl">
    <BrandLogo className="mb-4 h-10 w-auto" /><Link href="/admin/credits" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500"><ArrowLeft size={16}/> Back to platform control</Link>
    <p className="mt-6 text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Platform control</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Settings: e-mail, payment, official WhatsApp</h1>
    <p className="mt-2 text-sm text-slate-500">Enter the accounts here once. Passwords and keys are stored encrypted, are never shown again, and work at once without any restart.</p>
    {data && !data.encryptionAvailable && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">The server has no encryption key, so passwords cannot be saved here yet.</p>}
    {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {notice && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    {!data ? <p className="mt-8 text-sm text-slate-500">Loading…</p> : <>
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"><div className="flex items-center gap-2"><Mail size={18} className="text-emerald-700"/><h2 className="font-semibold">E-mail and OTP</h2></div>
        <p className="mt-1 text-sm text-slate-500">Used for password reset, e-mail confirmation and the 6-digit OTP when a password is changed. With Gmail: turn on 2-step verification, create an <b>App password</b> (Google account, Security, App passwords) and paste the 16 letters below.</p>
        <form onSubmit={e => void save("mail", ["smtp.host", "smtp.port", "smtp.user", "smtp.pass", "smtp.from"], e)} className="mt-4 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => { set("smtp.host", "smtp.gmail.com"); set("smtp.port", "587"); }} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 sm:col-span-2 sm:w-fit">Fill the Gmail server details</button>
          {field("smtp.host", "Mail server", { placeholder: "smtp.gmail.com" })}{field("smtp.port", "Port", { placeholder: "587" })}
          {field("smtp.user", "Mail account (e-mail address)", { placeholder: "you@gmail.com" })}{field("smtp.pass", "App password", { type: "password" })}
          <div className="sm:col-span-2">{field("smtp.from", "Sender name and address (optional)", { placeholder: "NextWave <you@gmail.com>" })}</div>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2"><button disabled={busy === "mail"} className="rounded-xl bg-[#0A78CC] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy === "mail" ? "Saving…" : "Save e-mail settings"}</button>
            <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="Send the test to (default: you)" className="min-w-[200px] flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/><button type="button" disabled={busy === "test"} onClick={() => void testMail()} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">{busy === "test" ? "Sending…" : "Send a test e-mail"}</button></div>
        </form>
        <p className="mt-3 text-xs text-slate-500">After the account is saved, new users must confirm their e-mail before they can send campaigns (existing users are already confirmed).</p>
      </section>
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"><div className="flex items-center gap-2"><WalletCards size={18} className="text-emerald-700"/><h2 className="font-semibold">Online payment: PayU</h2></div>
        <p className="mt-1 text-sm text-slate-500">Clients pay for credit by UPI, card or net banking. Start in <b>test</b> mode with PayU&apos;s test key and salt, make a test payment, then switch to <b>live</b> with the real ones.</p>
        <form onSubmit={e => void save("payu", ["payu.key", "payu.salt", "payu.mode"], e)} className="mt-4 grid gap-3 sm:grid-cols-2">
          {field("payu.key", "Merchant key")}{field("payu.salt", "Merchant salt", { type: "password" })}
          <label className="block text-xs font-semibold text-slate-700">Mode <span className="ml-1 font-normal text-slate-400">({badge("payu.mode")}; test until you choose live)</span><select value={shown("payu.mode") || "test"} onChange={e => set("payu.mode", e.target.value)} className={input}><option value="test">test (no real money)</option><option value="live">live (real money)</option></select></label>
          <div className="flex items-end"><button disabled={busy === "payu"} className="rounded-xl bg-[#0A78CC] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy === "payu" ? "Saving…" : "Save payment settings"}</button></div>
        </form>
        <p className="mt-3 text-xs text-slate-500">In the PayU dashboard, if it asks for a success / failure URL, use: <code className="rounded bg-slate-100 px-1.5 py-0.5">{data.urls.payuReturn}</code> <button type="button" onClick={() => copy(data.urls.payuReturn)} className="ml-1 inline-flex items-center gap-1 align-middle text-emerald-800"><Copy size={12}/> copy</button></p>
      </section>
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"><div className="flex items-center gap-2"><Waves size={18} className="text-emerald-700"/><h2 className="font-semibold">Official WhatsApp (Meta Cloud API)</h2></div>
        <p className="mt-1 text-sm text-slate-500">For very large lists. Create a Meta app, then put its app secret here, choose any secret word as the verify token, and give Meta the webhook address below. Each client&apos;s own number is added from <b>Add sender</b> (official API) with its phone number ID and access token.</p>
        <form onSubmit={e => void save("meta", ["meta.appSecret", "meta.verifyToken"], e)} className="mt-4 grid gap-3 sm:grid-cols-2">
          {field("meta.appSecret", "App secret", { type: "password" })}{field("meta.verifyToken", "Verify token (any secret word)", { type: "password" })}
          <div className="sm:col-span-2"><button disabled={busy === "meta"} className="rounded-xl bg-[#0A78CC] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy === "meta" ? "Saving…" : "Save official WhatsApp settings"}</button></div>
        </form>
        <p className="mt-3 text-xs text-slate-500">Webhook address for Meta: <code className="rounded bg-slate-100 px-1.5 py-0.5">{data.urls.metaWebhook}</code> <button type="button" onClick={() => copy(data.urls.metaWebhook)} className="ml-1 inline-flex items-center gap-1 align-middle text-emerald-800"><Copy size={12}/> copy</button> · subscribe to <b>messages</b>.</p>
      </section>
      <p className="mt-6 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={14}/> Secrets are encrypted before they are saved and are never sent back to this screen. Only platform admins can open it. <Check size={12} className="hidden"/></p>
    </>}
  </div></main>;
}
