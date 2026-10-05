import { canonicalize, fromB64, sha256, toB64, utf8 } from "./bytes";
import { findRecipient, nodeSig, NODES, QUORUM, recipientSig, sign, verify } from "./keystore";
import type { LedgerRecord, SignedEvent } from "./types";

/**
 * Append-only, hash-chained ledger replicated across four logical nodes with a 3-of-4
 * ML-DSA attestation quorum. Persisted locally; export/import moves it between stations.
 */
const STORE_KEY = "aegis.ledger.v2";
export const GENESIS = "0".repeat(64);

let cache: LedgerRecord[] | null = null;

function storage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

export function readLedger(): LedgerRecord[] {
  if (cache) return cache;
  const raw = storage()?.getItem(STORE_KEY);
  cache = raw ? (JSON.parse(raw) as LedgerRecord[]) : [];
  return cache;
}

function persist(records: LedgerRecord[]): void {
  cache = records;
  storage()?.setItem(STORE_KEY, JSON.stringify(records));
}

const recordCore = (r: Pick<LedgerRecord, "index" | "previous_record_hash" | "signed_event">) =>
  canonicalize({ index: r.index, previous_record_hash: r.previous_record_hash, signed_event: r.signed_event });

export function eventSignatureValid(signed: SignedEvent): boolean {
  const recipient = findRecipient(signed.event.recipient_id);
  if (!recipient || recipient.keyId !== signed.event.recipient_key_id) return false;
  return verify(fromB64(signed.signature), utf8(canonicalize(signed.event)), recipientSig(recipient).publicKey);
}

export function validAttestations(record: LedgerRecord): string[] {
  const seen = new Set<string>();
  for (const a of record.attestations) {
    if (!(NODES as readonly string[]).includes(a.node_id) || seen.has(a.node_id)) continue;
    if (verify(fromB64(a.signature), utf8(record.record_hash), nodeSig(a.node_id).publicKey)) seen.add(a.node_id);
  }
  return [...seen];
}

/** Each node independently validates the event signature and chain link before attesting. */
export async function appendEvent(signed: SignedEvent, offline: readonly string[] = []): Promise<LedgerRecord> {
  const records = readLedger();
  const previous = records.at(-1)?.record_hash ?? GENESIS;
  const base = { index: records.length + 1, previous_record_hash: previous, signed_event: signed };
  const record_hash = await sha256(recordCore(base));
  if (!eventSignatureValid(signed)) throw new Error("Event signature invalid; ledger refuses to record it.");
  const attestations = NODES.filter((node) => !offline.includes(node)).map((node_id) => ({
    node_id,
    signature: toB64(sign(utf8(record_hash), nodeSig(node_id).secretKey)),
  }));
  if (attestations.length < QUORUM) throw new Error(`Quorum not reached: ${attestations.length} of ${QUORUM} required node attestations.`);
  const record: LedgerRecord = { ...base, record_hash, attestations, quorum: QUORUM };
  persist([...records, record]);
  return record;
}

export interface ChainStatus { ok: boolean; brokenAt: number | null }

export async function verifyChain(records = readLedger()): Promise<ChainStatus> {
  let previous = GENESIS;
  for (const [i, r] of records.entries()) {
    const ok = r.index === i + 1 && r.previous_record_hash === previous && (await sha256(recordCore(r))) === r.record_hash;
    if (!ok) return { ok: false, brokenAt: r.index };
    previous = r.record_hash;
  }
  return { ok: true, brokenAt: null };
}

export function findByWatermark(watermarkId: string): LedgerRecord | undefined {
  return readLedger().find((r) => r.signed_event.event.watermark_id === watermarkId);
}

/** Head hash: print or read it aloud to another station to detect divergence out-of-band. */
export function ledgerHead(): string {
  return readLedger().at(-1)?.record_hash ?? GENESIS;
}

export function exportLedger(): Blob {
  return new Blob([JSON.stringify({ format: "aegis-ledger", schema_version: 2, records: readLedger() }, null, 2)], { type: "application/json" });
}

/** Imports a replica only when its chain verifies and it extends (or equals) the local chain. */
export async function importLedger(file: File): Promise<number> {
  const parsed = JSON.parse(await file.text()) as { format?: string; records?: LedgerRecord[] };
  if (parsed.format !== "aegis-ledger" || !Array.isArray(parsed.records)) throw new Error("Not an Aegis ledger export.");
  if (!(await verifyChain(parsed.records)).ok) throw new Error("Imported ledger chain is broken; replica rejected.");
  const local = readLedger();
  const conflict = local.some((r, i) => parsed.records![i]?.record_hash !== r.record_hash);
  if (conflict) throw new Error("Imported ledger diverges from the local chain; replica rejected.");
  for (const r of parsed.records) {
    if (!eventSignatureValid(r.signed_event) || validAttestations(r).length < r.quorum) {
      throw new Error(`Record ${r.index} lacks a valid signature or quorum on this station's key registry.`);
    }
  }
  persist(parsed.records);
  return parsed.records.length - local.length;
}

export function clearLedger(): void {
  persist([]);
}
