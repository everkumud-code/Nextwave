"use client";

import { useState } from "react";
import { FileUp, Loader2, X } from "lucide-react";

type Preview = { line: number; phoneNumber: string; phoneNumberE164: string | null; firstName: string | null; lastName: string | null; email: string | null; company: string | null; whatsappConsent: boolean; errors: string[] };
type Summary = { totalRows: number; validCount: number; invalidCount: number; duplicateCount: number; preview: Preview[] };

export function ContactCsvImport({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filename, setFilename] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attest, setAttest] = useState(false);

  async function previewFile(file?: File) {
    if (!file) return;
    setError(""); setNotice(""); setSummary(null);
    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "csv" && extension !== "xlsx") { setError("Please select a .csv or .xlsx file."); return; }
    if (file.size > (extension === "xlsx" ? 5 : 2) * 1024 * 1024) { setError(extension === "xlsx" ? "XLSX file must be 5 MB or smaller." : "CSV file must be 2 MB or smaller."); return; }
    setFilename(file.name);
    setFile(file);
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("preview", "true");
      const response = await fetch("/api/contacts/import", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to preview CSV.");
      setSummary(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to preview CSV."); }
    finally { setBusy(false); }
  }

  async function importContacts() {
    setBusy(true); setError("");
    try {
      if (!file) throw new Error("Select a file to import.");
      const form = new FormData();
      form.set("file", file);
      form.set("preview", "false");
      form.set("attestConsent", attest ? "true" : "false");
      const response = await fetch("/api/contacts/import", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Import failed.");
      setNotice(data.message); setSummary(null); setFile(null); setFilename(""); onImported();
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed."); }
    finally { setBusy(false); }
  }

  return <>
    <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FileUp size={16}/> Import contacts</button>
    {notice && <span className="ml-3 text-xs font-medium text-emerald-700">{notice}</span>}
    {open && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between"><div><h3 className="text-lg font-semibold text-slate-900">Import contacts from CSV or Excel</h3><p className="mt-1 text-xs text-slate-500">Up to 5,000 rows · CSV 2 MB / XLSX 5 MB · duplicate detection</p></div><button onClick={() => { setOpen(false); setSummary(null); setError(""); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div>
        <div className="mt-5 rounded-xl border-2 border-dashed border-slate-200 p-6 text-center"><FileUp className="mx-auto text-slate-400" size={25}/><p className="mt-2 text-sm font-medium text-slate-700">{filename || "Choose a CSV or XLSX file"}</p><p className="mt-1 text-xs text-slate-400">Required column: phone, phone_number or mobile (first worksheet for XLSX)</p><input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => void previewFile(e.target.files?.[0])} className="mx-auto mt-3 block max-w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:font-semibold file:text-emerald-800"/></div>
        {error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
        {busy && <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><Loader2 className="animate-spin" size={14}/> Processing spreadsheet…</p>}
        {summary && <><div className="mt-5 grid grid-cols-3 gap-3"><div className="rounded-xl bg-emerald-50 p-3"><p className="text-[10px] uppercase text-emerald-700">Ready</p><p className="text-xl font-semibold text-emerald-900">{summary.validCount}</p></div><div className="rounded-xl bg-rose-50 p-3"><p className="text-[10px] uppercase text-rose-700">Invalid / duplicate</p><p className="text-xl font-semibold text-rose-900">{summary.invalidCount}</p></div><div className="rounded-xl bg-slate-100 p-3"><p className="text-[10px] uppercase text-slate-500">Total rows</p><p className="text-xl font-semibold text-slate-900">{summary.totalRows}</p></div></div>
          <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-slate-100"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="p-2">Line</th><th className="p-2">Name</th><th className="p-2">Phone</th><th className="p-2">Result</th></tr></thead><tbody>{summary.preview.map(row => <tr key={row.line} className="border-t border-slate-100"><td className="p-2 text-slate-400">{row.line}</td><td className="p-2">{[row.firstName,row.lastName].filter(Boolean).join(" ") || "—"}</td><td className="p-2">{row.phoneNumber}</td><td className="p-2">{row.errors.length ? <span className="text-rose-600">{row.errors.join(", ")}</span> : <span className="text-emerald-700">Ready</span>}</td></tr>)}</tbody></table></div>
          {summary.totalRows > summary.preview.length && <p className="mt-2 text-[11px] text-slate-500">Showing first 100 rows in preview; all rows are validated before import.</p>}
          <label className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900"><input type="checkbox" checked={attest} onChange={(event) => setAttest(event.target.checked)} className="mt-1" /><span><b>These people agreed to receive my WhatsApp messages.</b> Tick this and every imported contact can be messaged straight away; your confirmation is recorded for each one. Leave it empty to import without permission (only rows with a yes / true / 1 / granted consent value can be messaged).</span></label>
        </>}
        <div className="mt-5 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600">Close</button>{summary && <button disabled={busy || summary.validCount===0} onClick={() => void importContacts()} className="rounded-xl bg-[#0A78CC] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy?"Importing…":`Import ${summary.validCount} contacts`}</button>}</div>
      </div>
    </div>}
  </>;
}
