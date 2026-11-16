"use client";

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Loader2, QrCode, RefreshCw, ShieldAlert, Unplug, X } from "lucide-react";

type Session = {
  id: string;
  status: "CREATED" | "QR_PENDING" | "PAIRING" | "CONNECTED" | "RECONNECTING" | "DISCONNECTED" | "REVOKED" | "ERROR";
  pairingPayload?: string;
  pairingExpiresAt?: string;
  connectedAt?: string;
  lastSeenAt?: string;
  lastErrorMessage?: string;
};
type Props = { senderId: string; senderName: string; disabled?: boolean };

const labels: Record<Session["status"], string> = {
  CREATED: "Preparing session",
  QR_PENDING: "Scan QR code",
  PAIRING: "Pairing in progress",
  CONNECTED: "Connected",
  RECONNECTING: "Reconnecting",
  DISCONNECTED: "Disconnected",
  REVOKED: "Session revoked",
  ERROR: "Connection error",
};

export function SenderConnection({ senderId, senderName, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  const request = useCallback(async (method: "GET" | "POST" | "DELETE") => {
    const response = await fetch(`/api/senders/${senderId}/session`, { method, cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to update sender connection.");
    return data.session as Session | null;
  }, [senderId]);

  const refresh = useCallback(async () => {
    try {
      const next = await request("GET");
      setSession(next);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh session.");
    }
  }, [request]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const poll = window.setInterval(() => void refresh(), 3500);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(poll); window.clearInterval(clock); };
  }, [open, refresh]);

  async function start() {
    setBusy(true); setError("");
    try { setSession(await request("POST")); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to start QR session."); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect this sender session?")) return;
    setBusy(true); setError("");
    try { setSession(await request("DELETE")); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to disconnect sender."); }
    finally { setBusy(false); }
  }

  const expired = session?.pairingExpiresAt ? new Date(session.pairingExpiresAt).getTime() <= now : false;
  const active = session && ["CREATED", "QR_PENDING", "PAIRING", "CONNECTED", "RECONNECTING"].includes(session.status) && !(expired && ["QR_PENDING", "PAIRING"].includes(session.status));

  return <>
    <button disabled={disabled} onClick={() => setOpen(true)} title="Connect sender" className="rounded-lg p-2 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40"><QrCode size={15}/></button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <section className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div><h3 className="font-semibold text-slate-900">Connect sender</h3><p className="mt-1 text-xs text-slate-500">{senderName}</p></div>
          <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={17}/></button>
        </header>
        <div className="p-5">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
            <span className="text-xs text-slate-500">Connection status</span>
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${session?.status === "CONNECTED" ? "text-emerald-700" : "text-slate-600"}`}>{session?.status === "CONNECTED" ? <CheckCircle2 size={14}/> : <span className="h-1.5 w-1.5 rounded-full bg-amber-500"/>}{session ? labels[session.status] : "No active session"}</span>
          </div>
          {session?.status === "CONNECTED" ? <div className="py-10 text-center"><CheckCircle2 size={42} className="mx-auto text-emerald-600"/><h4 className="mt-4 font-semibold text-slate-900">Sender connected</h4><p className="mt-1 text-xs text-slate-500">The session service has confirmed the connection.</p>{session.connectedAt && <p className="mt-2 text-[11px] text-slate-400">Connected {new Date(session.connectedAt).toLocaleString()}</p>}</div>
          : session && ["QR_PENDING", "PAIRING"].includes(session.status) && session.pairingPayload && !expired ? <div className="py-5 text-center"><div className="mx-auto inline-flex rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><QRCodeSVG value={session.pairingPayload} size={220} level="M" includeMargin/></div><h4 className="mt-4 font-semibold text-slate-900">Scan to connect</h4><p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-slate-500">Open the companion app on your phone, go to Linked Devices and scan this QR code.</p>{session.pairingExpiresAt && <p className="mt-3 text-[11px] text-amber-700">QR expires at {new Date(session.pairingExpiresAt).toLocaleTimeString()}</p>}</div>
          : <div className="py-9 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800">{session?.status === "RECONNECTING" ? <Loader2 className="animate-spin" size={25}/> : session?.status === "ERROR" ? <ShieldAlert size={25}/> : <QrCode size={25}/>}</div><h4 className="mt-4 font-semibold text-slate-900">{expired ? "QR code expired" : session?.status === "RECONNECTING" ? "Reconnecting…" : session?.status === "ERROR" ? "Could not connect" : "Ready to connect"}</h4><p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-slate-500">{session?.lastErrorMessage || (expired ? "Generate a fresh QR code to continue." : "Start a session to request a fresh QR code from the connected session service.")}</p></div>}
          {error && <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2.5 text-xs text-rose-700">{error}</p>}
          <div className="flex gap-2">
            {active ? <button disabled={busy} onClick={disconnect} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin"/> : <Unplug size={14}/>} Disconnect</button> : <button disabled={busy} onClick={start} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1c4b35] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#153b29] disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin"/> : <QrCode size={14}/>} {session ? "Refresh QR" : "Start connection"}</button>}
            <button onClick={()=>void refresh()} className="rounded-xl border border-slate-200 px-3 text-slate-500 hover:bg-slate-50" title="Refresh status"><RefreshCw size={15}/></button>
          </div>
          <p className="mt-3 text-center text-[10px] leading-4 text-slate-400">This panel displays the live response from your configured QR session service. It does not simulate a successful connection.</p>
        </div>
      </section>
    </div>}
  </>;
}
