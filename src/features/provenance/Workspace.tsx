import { Activity, Check, Download, FileCheck2, Fingerprint, KeyRound, LockKeyhole, Network, PackageOpen, ShieldCheck, Trash2, TriangleAlert, Upload } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { decryptPackage, downloadBlob, NODES, parsePackage, pdfBlob, RECIPIENTS, sealPackage, serializePackage, verifyLeak, type DecryptResult } from "./engine";
import { FileDrop } from "./FileDrop";
import { clearLedger, exportLedger, importLedger, ledgerHead, readLedger, verifyChain, type ChainStatus } from "./ledger";
import { StatusMark } from "./StatusMark";
import type { EvidenceReport } from "./types";

const flow = [
  { icon: LockKeyhole, label: "Authorized decrypt", note: "ML-KEM-768 + AES-256-GCM" },
  { icon: Fingerprint, label: "Session watermark", note: "unique per decryption" },
  { icon: KeyRound, label: "Recipient signature", note: "ML-DSA-65, recipient key" },
  { icon: Network, label: "Ledger commit", note: "3-of-4 node attestation" },
];

const msg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function Workspace() {
  const [tab, setTab] = useState("seal");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // seal
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<string[]>([RECIPIENTS[0].id, RECIPIENTS[2].id]);
  const [sealedInfo, setSealedInfo] = useState<string | null>(null);

  // decrypt
  const [pkgFile, setPkgFile] = useState<File | null>(null);
  const [operator, setOperator] = useState<string>(RECIPIENTS[0].id);
  const [offline, setOffline] = useState<string[]>([]);
  const [result, setResult] = useState<DecryptResult | null>(null);

  // verify
  const [leakFile, setLeakFile] = useState<File | null>(null);
  const [report, setReport] = useState<EvidenceReport | null>(null);

  // ledger
  const [, bump] = useState(0);
  const [chain, setChain] = useState<ChainStatus | null>(null);
  const refresh = useCallback(() => { bump((n) => n + 1); void verifyChain().then(setChain); }, []);

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(msg(e, fallback)); } finally { setBusy(false); }
  };

  const seal = () => run(async () => {
    if (!pdfFile) return;
    const pkg = await sealPackage(pdfFile, RECIPIENTS.filter((r) => selected.includes(r.id)));
    downloadBlob(serializePackage(pkg), pdfFile.name.replace(/\.pdf$/i, "") + ".aegispkg.json");
    setSealedInfo(`Sealed once for ${pkg.envelopes.length} recipient(s): ${pkg.envelopes.map((x) => x.recipient_id).join(", ")}.`);
  }, "Sealing failed.");

  const decrypt = () => run(async () => {
    if (!pkgFile) return;
    setResult(await decryptPackage(await parsePackage(pkgFile), operator, offline));
    refresh();
  }, "Decryption failed.");

  const verify = () => run(async () => {
    if (!leakFile) return;
    setReport(null);
    setReport(await verifyLeak(leakFile));
  }, "Verification failed closed.");

  const event = result?.record.signed_event.event;
  const records = readLedger();
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center border border-foreground bg-foreground text-primary-foreground"><ShieldCheck className="size-4" aria-hidden="true" /></span>
            <div>
              <p className="font-display text-sm font-semibold">Aegis Provenance</p>
              <p className="font-mono text-[10px] uppercase text-muted-foreground">offline evidence workstation</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" />
            <span className="hidden sm:inline">Air-gapped · no network calls</span>
            <span className="font-mono">· {NODES.length} nodes</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
        <div className="mb-8 border-b border-border pb-7">
          <p className="mb-3 font-mono text-[11px] uppercase text-muted-foreground">Post-quantum attribution · ML-KEM-768 · ML-DSA-65</p>
          <h1 className="max-w-3xl font-display text-3xl font-semibold leading-tight sm:text-4xl">Every decrypted copy looks identical. Every leak points to one recipient.</h1>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section>
            <Tabs value={tab} onValueChange={(v) => { setTab(v); setError(null); if (v === "ledger") refresh(); }}>
              <TabsList className="mb-6 grid h-11 w-full grid-cols-4 rounded-none bg-secondary p-1 sm:w-[32rem]">
                <TabsTrigger className="rounded-none" value="seal">1 · Seal</TabsTrigger>
                <TabsTrigger className="rounded-none" value="decrypt">2 · Decrypt</TabsTrigger>
                <TabsTrigger className="rounded-none" value="verify">3 · Verify leak</TabsTrigger>
                <TabsTrigger className="rounded-none" value="ledger">Ledger</TabsTrigger>
              </TabsList>

              {error && (
                <div role="alert" className="mb-5 flex items-start gap-3 border border-danger-border bg-danger-soft p-4 text-sm text-danger">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <div><p className="font-semibold">Operation stopped</p><p className="mt-0.5 text-xs">{error}</p></div>
                </div>
              )}

              <TabsContent value="seal" className="mt-0">
                <Panel title="Sender: encrypt once, distribute to many" sub="One AES-256-GCM ciphertext; the key is wrapped separately for each recipient with ML-KEM-768.">
                  <FileDrop accept=".pdf" file={pdfFile} onFile={(f) => { setPdfFile(f); setSealedInfo(null); }} label="Drop the PDF to protect" hint="Processed locally in this browser" />
                  <fieldset>
                    <legend className="mb-2 text-xs font-semibold">Authorized recipients</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {RECIPIENTS.map((r) => (
                        <label key={r.id} className={`flex items-start gap-3 border border-border p-3 text-xs ${r.status === "revoked" ? "opacity-50" : "cursor-pointer"}`}>
                          <input type="checkbox" className="mt-0.5" disabled={r.status === "revoked"} checked={selected.includes(r.id)} onChange={() => toggle(selected, setSelected, r.id)} />
                          <span><span className="font-medium">{r.name}</span> · {r.id}<br /><span className="font-mono text-[10px] uppercase text-muted-foreground">{r.keyId} · {r.status}</span></span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <Button className="h-11 w-full rounded-none" disabled={!pdfFile || selected.length === 0 || busy} onClick={seal}><PackageOpen aria-hidden="true" />{busy ? "Sealing…" : "Seal and download package"}</Button>
                  {sealedInfo && <p className="flex items-center gap-2 text-xs text-success"><Check className="size-4" />{sealedInfo}</p>}
                </Panel>
              </TabsContent>

              <TabsContent value="decrypt" className="mt-0">
                <Panel title="Recipient: authorized decryption" sub="Decrypts, stamps a session-unique invisible watermark, signs the event with the recipient's ML-DSA key, commits to the ledger.">
                  <FileDrop accept=".json,.aegispkg" file={pkgFile} onFile={(f) => { setPkgFile(f); setResult(null); }} label="Drop a sealed package" hint="*.aegispkg.json produced in step 1" />
                  <div>
                    <label className="mb-2 block text-xs font-semibold" htmlFor="operator">Decrypting as</label>
                    <Select value={operator} onValueChange={(v) => { setOperator(v); setResult(null); }}>
                      <SelectTrigger id="operator" className="h-11 rounded-none"><SelectValue /></SelectTrigger>
                      <SelectContent>{RECIPIENTS.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} · {r.clearance}{r.status === "revoked" ? " (revoked)" : ""}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <details className="text-xs">
                    <summary className="cursor-pointer font-semibold">Simulate ledger node outage</summary>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {NODES.map((n) => <label key={n} className="flex items-center gap-1.5 font-mono text-[11px]"><input type="checkbox" checked={offline.includes(n)} onChange={() => toggle(offline, setOffline, n)} />{n} offline</label>)}
                    </div>
                    <p className="mt-1 text-muted-foreground">Quorum is 3 of 4; taking two nodes down must block the commit.</p>
                  </details>
                  <Button className="h-11 w-full rounded-none" disabled={!pkgFile || busy} onClick={decrypt}><LockKeyhole aria-hidden="true" />{busy ? "Creating evidence…" : "Authorize and decrypt"}</Button>
                </Panel>
                {result && event && (
                  <div className="mt-5 border border-success-border bg-success-soft p-5 sm:p-6" aria-live="polite">
                    <div className="flex items-start gap-3"><span className="mt-0.5 flex size-7 items-center justify-center rounded-full bg-success text-success-foreground"><Check className="size-4" /></span><div><p className="font-semibold text-success">Decrypted and committed to ledger #{result.record.index}</p><p className="mt-1 text-xs text-success/80">This copy looks identical to every other recipient's copy but carries a unique session watermark.</p></div></div>
                    <dl className="mt-5 grid gap-3 border-y border-success-border py-4 text-xs sm:grid-cols-2">
                      <Field k="Event" v={event.event_id} /><Field k="Session" v={event.session_id} /><Field k="Watermark ID" v={event.watermark_id} /><Field k="Attested by" v={result.record.attestations.map((a) => a.node_id).join(" · ")} />
                    </dl>
                    <Button className="mt-5 rounded-none" onClick={() => downloadBlob(pdfBlob(result.pdf), result.filename)}><Download />Download watermarked PDF</Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="verify" className="mt-0">
                <Panel title="Investigator: forensic verification" sub="Extracts the watermark from a suspected leaked PDF and proves who decrypted it. Fails closed.">
                  <FileDrop accept=".pdf" file={leakFile} onFile={(f) => { setLeakFile(f); setReport(null); }} label="Drop the leaked PDF" hint="The PDF itself is the evidence; no envelope needed" />
                  <Button className="h-11 w-full rounded-none" disabled={!leakFile || busy} onClick={verify}><FileCheck2 aria-hidden="true" />{busy ? "Verifying…" : "Extract and verify"}</Button>
                </Panel>
                {report && (
                  <div className={`mt-5 border p-5 sm:p-6 ${report.overall_status === "VALID" ? "border-success-border bg-success-soft" : "border-danger-border bg-danger-soft"}`} aria-live="polite">
                    <div className="flex items-center justify-between gap-4"><div><p className="font-mono text-[10px] uppercase opacity-70">Verification result</p><p className="mt-1 font-display text-2xl font-semibold">{report.overall_status}</p></div><StatusMark status={report.overall_status === "VALID" ? "valid" : "invalid"} /></div>
                    <div className="mt-5 divide-y divide-current/10 border-y border-current/10">
                      {report.checks.map((c) => <div key={c.id} className="flex items-start gap-3 py-3"><StatusMark status={c.status} /><div><p className="text-sm font-medium">{c.label}</p><p className="mt-0.5 text-xs opacity-70">{c.detail}</p></div></div>)}
                    </div>
                    <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-2">
                      <Field k="Recipient" v={report.recipient_name ? `${report.recipient_name} · ${report.recipient_id}` : "Not identified"} />
                      <Field k="Decryption time" v={report.decryption_time ? new Date(report.decryption_time).toLocaleString() : "-"} />
                    </dl>
                    <p className="mt-4 text-[11px] opacity-70">{report.limitation}</p>
                    <Button className="mt-5 rounded-none" onClick={() => downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), `evidence-${report.event_id ?? "none"}.json`)}><Download />Export JSON report</Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="ledger" className="mt-0">
                <Panel title="Ledger explorer" sub="Hash-chained records, each attested by ML-DSA signatures from 3 of 4 nodes.">
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="flex items-center gap-2"><StatusMark status={chain ? (chain.ok ? "valid" : "invalid") : "unavailable"} />{chain ? (chain.ok ? `Chain intact · ${records.length} records` : `Broken at record #${chain.brokenAt}`) : "Not checked"}</span>
                    <Button size="sm" variant="outline" className="rounded-none" onClick={refresh}><Activity />Re-verify</Button>
                    <Button size="sm" variant="outline" className="rounded-none" onClick={() => downloadBlob(exportLedger(), "aegis-ledger.json")}><Download />Export</Button>
                    <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 border border-input px-3 text-xs font-medium hover:bg-accent"><Upload className="size-3.5" />Import replica<input type="file" accept=".json" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(async () => { await importLedger(f); refresh(); }, "Import rejected."); e.target.value = ""; }} /></label>
                    <Button size="sm" variant="outline" className="rounded-none text-danger" onClick={() => { if (confirm("Erase the local demo ledger? Real deployments must not offer this.")) { clearLedger(); setResult(null); refresh(); } }}><Trash2 />Reset demo</Button>
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground break-all">HEAD {ledgerHead()}</p>
                  <div className="max-h-96 divide-y divide-border overflow-auto border border-border text-xs">
                    {records.length === 0 && <p className="p-4 text-muted-foreground">No records yet. Seal and decrypt a document first.</p>}
                    {[...records].reverse().map((r) => (
                      <div key={r.index} className="p-3"><p className="font-medium">#{r.index} · {r.signed_event.event.recipient_id} · {r.signed_event.event.watermark_id}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground break-all">{new Date(r.signed_event.event.timestamp).toLocaleString()} · {r.record_hash.slice(0, 32)}… · {r.attestations.length}/4 attested</p></div>
                    ))}
                  </div>
                </Panel>
              </TabsContent>
            </Tabs>
          </section>

          <aside className="space-y-5">
            <div className="border border-border bg-surface p-5">
              <p className="mb-5 text-xs font-semibold uppercase">Evidence chain</p>
              <ol>{flow.map((item, i) => <li key={item.label} className="relative flex gap-3 pb-6 last:pb-0">{i < flow.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-border" />}<span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background"><item.icon className="size-3.5" /></span><div className="pt-1"><p className="text-xs font-medium">{item.label}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{item.note}</p></div></li>)}</ol>
            </div>
            <div className="border border-border bg-surface p-5">
              <p className="text-xs font-semibold uppercase">Implementation status</p>
              <div className="mt-4 space-y-3 text-xs">
                <Row k="ML-KEM-768 key wrap" v="Real" /><Row k="ML-DSA-65 signatures" v="Real" /><Row k="Encrypt-once multi-recipient" v="Real" /><Row k="Hash-chained ledger" v="Real" /><Row k="4-node quorum" v="Simulated" /><Row k="Watermark robustness" v="Basic" />
              </div>
            </div>
            <div className="border-l-2 border-warning bg-warning-soft p-4 text-xs leading-5 text-warning">
              Demo profile: all four ledger nodes and every recipient key live in one browser profile. A deployment needs separate hardware per node and per-recipient key custody (HSM / smart card).
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Panel({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-surface">
      <div className="border-b border-border px-5 py-4 sm:px-6"><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{sub}</p></div>
      <div className="space-y-6 p-5 sm:p-6">{children}</div>
    </div>
  );
}
const Field = ({ k, v }: { k: string; v: string }) => <div><dt className="opacity-60">{k}</dt><dd className="mt-1 break-all font-mono">{v}</dd></div>;
const Row = ({ k, v }: { k: string; v: string }) => <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="font-mono text-[10px] uppercase">{v}</span></div>;
