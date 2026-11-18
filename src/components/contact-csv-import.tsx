"use client";

import { useState } from "react";
import { FileUp, Loader2, X } from "lucide-react";

type Preview = { line: number; phoneNumber: string; phoneNumberE164: string | null; firstName: string | null; lastName: string | null; email: string | null; company: string | null; whatsappConsent: boolean; tags: string[]; custom: Record<string, string>; action: "new" | "update" | "skip"; errors: string[] };
type Summary = {
  totalRows: number; validCount: number; invalidCount: number; duplicateCount: number; newCount: number; updateCount: number;
  preview: Preview[]; headers: string[]; mapping: string[]; sheets: { name: string; rowCount: number }[]; sheet: string; extraFields: string[];
};
type NeedsMapping = { needsMapping: true; headers: string[]; sample: string[][]; mapping: string[]; sheets: { name: string; rowCount: number }[]; sheet: string; totalRows: number };

const FIXED_CHOICES: [string, string][] = [
  ["phone", "Phone number"], ["firstName", "Name / first name"], ["lastName", "Last name"], ["email", "Email"],
  ["company", "Company"], ["consent", "Permission (yes / no)"], ["tags", "Tags (labels)"], ["ignore", "Do not import"],
];

export function ContactCsvImport({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filename, setFilename] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [needs, setNeeds] = useState<NeedsMapping | null>(null);
  const [mapping, setMapping] = useState<string[]>([]);
  const [sheet, setSheet] = useState("");
  const [existing, setExisting] = useState<"skip" | "update">("skip");
  const [showMapping, setShowMapping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attest, setAttest] = useState(false);

  async function call(target: File, options: { preview: boolean; mapping?: string[]; sheet?: string; existing?: "skip" | "update" }) {
    const form = new FormData();
    form.set("file", target);
    form.set("preview", options.preview ? "true" : "false");
    if (options.mapping?.length) form.set("mapping", JSON.stringify(options.mapping));
    if (options.sheet) form.set("sheet", options.sheet);
    form.set("existing", options.existing ?? "skip");
    if (!options.preview) form.set("attestConsent", attest ? "true" : "false");
    const response = await fetch("/api/contacts/import", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to read the file.");
    return data;
  }

  async function run(target: File, options: { mapping?: string[]; sheet?: string; existing?: "skip" | "update" }) {
    setBusy(true); setError("");
    try {
      const data = await call(target, { preview: true, ...options });
      if (data.needsMapping) { setNeeds(data); setSummary(null); setMapping(data.mapping); setSheet(data.sheet || ""); setShowMapping(true); }
      else { setNeeds(null); setSummary(data); setMapping(data.mapping ?? []); setSheet(data.sheet || ""); }
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to read the file."); setSummary(null); }
    finally { setBusy(false); }
  }

  async function previewFile(selected?: File) {
    if (!selected) return;
    setError(""); setNotice(""); setSummary(null); setNeeds(null); setShowMapping(false); setExisting("skip");
    const extension = selected.name.toLowerCase().split(".").pop();
    if (extension !== "csv" && extension !== "xlsx") { setError("Please select a .csv or .xlsx file."); return; }
    if (selected.size > (extension === "xlsx" ? 10 : 8) * 1024 * 1024) { setError(extension === "xlsx" ? "XLSX file must be 10 MB or smaller." : "CSV file must be 8 MB or smaller."); return; }
    setFilename(selected.name);
    setFile(selected);
    await run(selected, {});
  }

  async function importContacts() {
    setBusy(true); setError("");
    try {
      if (!file) throw new Error("Select a file to import.");
      const data = await call(file, { preview: false, mapping: sheet === "__all__" ? undefined : mapping, sheet, existing });
      setNotice(data.message); setSummary(null); setNeeds(null); setFile(null); setFilename(""); onImported();
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed."); }
    finally { setBusy(false); }
  }

  const headers = summary?.headers ?? needs?.headers ?? [];
  const sheets = summary?.sheets ?? needs?.sheets ?? [];
  const allSheets = sheet === "__all__";

  function setColumn(index: number, value: string) {
    const next = mapping.map((item, i) => i === index ? value : item);
    if (value !== "ignore" && !value.startsWith("custom:")) next.forEach((item, i) => { if (i !== index && item === value) next[i] = "ignore"; });
    setMapping(next);
  }
  function customName(index: number) { return (mapping[index] ?? "").startsWith("custom:") ? mapping[index].slice(7) : ""; }

  return <>
    <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FileUp size={16}/> Import contacts</button>
    {notice && <span className="ml-3 text-xs font-medium text-emerald-700">{notice}</span>}
    {open && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between"><div><h3 className="text-lg font-semibold text-slate-900">Import contacts from CSV or Excel</h3><p className="mt-1 text-xs text-slate-500">Up to 20,000 rows · CSV 8 MB / XLSX 10 MB · every sheet of an Excel file · extra columns can be used in messages</p></div><button onClick={() => { setOpen(false); setSummary(null); setNeeds(null); setError(""); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div>
        <div className="mt-5 rounded-xl border-2 border-dashed border-slate-200 p-6 text-center"><FileUp className="mx-auto text-slate-400" size={25}/><p className="mt-2 text-sm font-medium text-slate-700">{filename || "Choose a CSV or XLSX file"}</p><p className="mt-1 text-xs text-slate-400">You choose which column is the phone number, the name and so on in the next step</p><input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => void previewFile(e.target.files?.[0])} className="mx-auto mt-3 block max-w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:font-semibold file:text-emerald-800"/></div>
        <p className="mt-3 text-xs text-slate-600">Not sure how the file should look? <a href="/api/contacts/import/template" className="font-semibold text-emerald-800 underline">Download a sample file</a> and fill it in.</p>
        {error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
        {busy && <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><Loader2 className="animate-spin" size={14}/> Processing the file…</p>}
        {needs && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">We could not find a phone column by its heading. Choose below which column is the phone number, then press <b>Check the file</b>.</p>}

        {(summary || needs) && sheets.length > 1 && <div className="mt-4 text-xs"><label className="font-semibold text-slate-700">This file has {sheets.length} sheets. Import from
          <select value={sheet} disabled={busy} onChange={e => { setSheet(e.target.value); if (file) void run(file, { sheet: e.target.value, existing }); }} className="ml-2 rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
            {sheets.map(item => <option key={item.name} value={item.name}>{item.name} ({item.rowCount} rows)</option>)}
            <option value="__all__">All sheets together</option>
          </select></label></div>}

        {(summary || needs) && headers.length > 0 && !allSheets && <div className="mt-4 rounded-xl border border-slate-100">
          <button type="button" onClick={() => setShowMapping(value => !value)} className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold text-slate-700">Match the columns of your file {showMapping ? "▲" : "▼"}</button>
          {showMapping && <div className="border-t border-slate-100 p-4">
            <div className="grid gap-2 sm:grid-cols-2">{headers.map((header, index) => <div key={index} className="flex items-center gap-2 text-xs"><span className="w-28 shrink-0 truncate font-medium text-slate-600" title={header}>{header || `Column ${index + 1}`}</span>
              <select value={mapping[index]?.startsWith("custom:") ? "custom" : (mapping[index] ?? "ignore")} onChange={e => setColumn(index, e.target.value === "custom" ? `custom:${(header || `field${index + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "f_$1").slice(0, 40) || `field${index + 1}`}` : e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                {FIXED_CHOICES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                <option value="custom">Extra field (use in message)</option>
              </select>
              {mapping[index]?.startsWith("custom:") && <span className="shrink-0 text-[10px] text-slate-500" title="Use this name inside a message">{`{{${customName(index)}}}`}</span>}
            </div>)}</div>
            <button type="button" disabled={busy || !file} onClick={() => file && void run(file, { mapping, sheet, existing })} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Check the file</button>
          </div>}
        </div>}
        {summary && <><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl bg-emerald-50 p-3"><p className="text-[10px] uppercase text-emerald-700">New</p><p className="text-xl font-semibold text-emerald-900">{summary.newCount}</p></div><div className="rounded-xl bg-sky-50 p-3"><p className="text-[10px] uppercase text-sky-700">Will be updated</p><p className="text-xl font-semibold text-sky-900">{summary.updateCount}</p></div><div className="rounded-xl bg-rose-50 p-3"><p className="text-[10px] uppercase text-rose-700">Skipped</p><p className="text-xl font-semibold text-rose-900">{summary.invalidCount}</p></div><div className="rounded-xl bg-slate-100 p-3"><p className="text-[10px] uppercase text-slate-500">Total rows</p><p className="text-xl font-semibold text-slate-900">{summary.totalRows}</p></div></div>
          {summary.extraFields.length > 0 && <p className="mt-3 text-xs text-slate-600">Extra fields found: {summary.extraFields.map(name => <code key={name} className="mr-1 rounded bg-slate-100 px-1.5 py-0.5">{`{{${name}}}`}</code>)} — use them in your message and each person gets their own value.</p>}
          <label className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-xs leading-5 text-slate-700"><input type="checkbox" checked={existing === "update"} onChange={event => { const next = event.target.checked ? "update" : "skip"; setExisting(next); if (file) void run(file, { mapping: allSheets ? undefined : mapping, sheet, existing: next }); }} className="mt-1"/><span><b>Update people who are already in my list</b> instead of skipping them (new details are added; a blank cell never erases what is saved; permission is never switched on for someone who said STOP).</span></label>
          <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-slate-100"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="p-2">Line</th><th className="p-2">Name</th><th className="p-2">Phone</th><th className="p-2">Other</th><th className="p-2">Result</th></tr></thead><tbody>{summary.preview.map(row => <tr key={row.line} className="border-t border-slate-100"><td className="p-2 text-slate-400">{row.line}</td><td className="p-2">{[row.firstName,row.lastName].filter(Boolean).join(" ") || "—"}</td><td className="p-2">{row.phoneNumber}</td><td className="p-2 text-slate-500">{[...row.tags.map(tag => `#${tag}`), ...Object.entries(row.custom).map(([key, value]) => `${key}: ${value}`)].join(" · ") || "—"}</td><td className="p-2">{row.errors.length ? <span className="text-rose-600">{row.errors.join(", ")}</span> : row.action === "update" ? <span className="text-sky-700">Update</span> : <span className="text-emerald-700">New</span>}</td></tr>)}</tbody></table></div>
          {summary.totalRows > summary.preview.length && <p className="mt-2 text-[11px] text-slate-500">Showing first 100 rows in preview; all rows are validated before import.</p>}
          <label className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900"><input type="checkbox" checked={attest} onChange={(event) => setAttest(event.target.checked)} className="mt-1" /><span><b>These people agreed to receive my WhatsApp messages.</b> Tick this and every imported contact can be messaged straight away; your confirmation is recorded for each one. Leave it empty to import without permission (only rows with a yes / true / 1 / granted consent value can be messaged).</span></label>
        </>}
        <div className="mt-5 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600">Close</button>{summary && <button disabled={busy || summary.validCount===0} onClick={() => void importContacts()} className="rounded-xl bg-[#0A78CC] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy?"Importing…":`Import ${summary.newCount}${summary.updateCount ? ` + update ${summary.updateCount}` : ""} contacts`}</button>}</div>
      </div>
    </div>}
  </>;
}

