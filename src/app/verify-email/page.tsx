"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";

function Verify() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"working" | "ok" | "bad">("working");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!token) { setState("bad"); setMessage("This link is not complete."); return; }
    void (async () => {
      try {
        const response = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "The link could not be used.");
        setState("ok");
      } catch (e) { setState("bad"); setMessage(e instanceof Error ? e.message : "The link could not be used."); }
    })();
  }, [token]);
  return state === "working" ? <p className="mt-5 text-sm text-slate-500">Confirming your e-mail…</p>
    : state === "ok" ? <div className="mt-5 space-y-3"><p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">Thank you. Your e-mail address is confirmed.</p><Link href="/" className="inline-block rounded-xl bg-[#0A78CC] px-5 py-2.5 text-sm font-semibold text-white">Open NextWave</Link></div>
    : <div className="mt-5 space-y-3"><p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{message}</p><Link href="/" className="inline-block font-semibold text-[#0A78CC]">Go to NextWave</Link></div>;
}

export default function VerifyEmailPage() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><BrandLogo className="mb-6 h-10 w-auto" /><h1 className="text-2xl font-semibold tracking-tight text-slate-900">Confirm your e-mail</h1><Suspense fallback={null}><Verify /></Suspense></div></main>;
}
