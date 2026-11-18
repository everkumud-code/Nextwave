"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, FlaskConical, X, XCircle } from "lucide-react";

type Row = { id: string; label: string };
type Live = { id: string; status: string; errorCode: string | null; errorMessage: string | null };
type Reply = { id: string; fromE164: string; body: string; receivedAt: string };

const stateText: Record<string, string> = { QUEUED: "Waiting for the sending worker", SUBMITTED: "Sent to WhatsApp", SENT: "Sent", DELIVERED: "Delivered", READ: "Read", FAILED: "Failed", CANCELLED: "Cancelled" };

/** A delivery self-test for a connected number: text, picture, PDF and a map pin go to the number's own chat; then a reply is waited for. */
export function SenderSelfTest({ senderId, senderName }: { senderId: string; senderName: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [live, setLive] = useState<Record<string, Live>>({});
  const [replies, setReplies] = useState<Reply[]>([]);
  const [startedAt, setStartedAt] = useState("");
  const [to, setTo] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!open || !rows.length) return;
    const poll = async () => {
      try {
        const response = await fetch(`/api/senders/${senderId}/selftest?ids=${rows.map(row => row.id).join(",")}&since=${encodeURIComponent(startedAt)}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        setLive(Object.fromEntries((data.messages as Live[]).map(item => [item.id, item])));
        setReplies(data.replies ?? []);
      } catch { /* try again on the next tick */ }
    };
    void poll();
    timer.current = window.setInterval(() => { void poll(); }, 4000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [open, rows, senderId, startedAt]);

  async function start() {
    setBusy(true); setError(""); setLive({}); setReplies([]);
    try {
      const response = await fetch(`/api/senders/${senderId}/selftest`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The test could not be started.");
      setRows(data.messages); setStartedAt(data.startedAt); setTo(data.to);
    } catch (e) { setError(e instanceof Error ? e.message : "The test could not be started."); }
    finally { setBusy(false); }
  }

  return <>
    <button onClick={() => setOpen(true)} title="Send a test pack to this number's own chat" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><FlaskConical size={15}/></button>
    {open && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 text-left shadow-2xl">
      <div className="flex items-start justify-between"><div><h3 className="text-lg font-semibold text-slate-900">Delivery test: {senderName}</h3><p className="mt-1 text-xs text-slate-500">Sends a text, a picture, a PDF and a map pin to this number&apos;s own chat (&quot;Message yourself&quot;). Free, and never to anyone else.</p></div><button onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div>
      {error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      {!rows.length ? <button disabled={busy} onClick={() => void start()} className="mt-5 rounded-xl bg-[#0A78CC] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Starting…" : "Send the 4 test messages"}</button> : <>
        <p className="mt-4 text-xs text-slate-600">Open the chat with yourself on <b>{to}</b> in WhatsApp and watch them arrive (about 30 seconds).</p>
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100">{rows.map(row => { const item = live[row.id]; const status = item?.status ?? "QUEUED"; const ok = ["SUBMITTED", "SENT", "DELIVERED", "READ"].includes(status); return <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"><span className="font-medium text-slate-800">{row.label}</span><span className={`flex items-center gap-1.5 text-xs ${status === "FAILED" ? "text-rose-700" : ok ? "text-emerald-700" : "text-slate-500"}`}>{status === "FAILED" ? <XCircle size={14}/> : ok ? <CheckCircle2 size={14}/> : <Loader2 size={14} className="animate-spin"/>}{stateText[status] ?? status}{item?.errorMessage ? ` · ${item.errorMessage}` : ""}</span></li>; })}</ul>
        <div className="mt-5 rounded-xl border border-slate-200 p-3"><p className="text-sm font-semibold text-slate-800">Replies test</p><p className="mt-1 text-xs text-slate-600">From <b>another phone</b>, send any message (for example &quot;hello&quot;) to <b>{to}</b>. It should appear below within a few seconds and in the Replies inbox.</p>
          {replies.length ? <ul className="mt-2 space-y-1">{replies.map(reply => <li key={reply.id} className="flex items-center gap-2 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900"><CheckCircle2 size={14}/> {reply.fromE164}: {reply.body}</li>)}</ul> : <p className="mt-2 flex items-center gap-2 text-xs text-slate-500"><Loader2 size={13} className="animate-spin"/> Waiting for a reply…</p>}</div>
        <button onClick={() => { setRows([]); setLive({}); setReplies([]); }} className="mt-4 text-xs font-semibold text-slate-600 underline">Run it again</button></>}
    </div></div>}
  </>;
}
