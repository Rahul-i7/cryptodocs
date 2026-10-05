import { buf, canonicalize, fromB64, randomId, sha256, toB64, utf8 } from "./bytes";
import { findRecipient, ml_kem768, recipientKem, recipientSig, sign } from "./keystore";
import { appendEvent, eventSignatureValid, findByWatermark, readLedger, validAttestations, verifyChain } from "./ledger";
import type { DecryptionEvent, EvidenceReport, LedgerRecord, Recipient, RecipientEnvelope, SealedPackage, VerificationCheck } from "./types";
import { embedWatermark, extractWatermark, isPdf } from "./watermark";

export { canonicalize } from "./bytes";
export { NODES, QUORUM, RECIPIENTS } from "./keystore";

async function aeadKey(shared: Uint8Array, info: string, usage: KeyUsage): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey("raw", buf(shared), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: buf(utf8(info)) },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

const docAad = (p: Pick<SealedPackage, "document_hash" | "original_name" | "envelopes">) =>
  utf8(canonicalize({ h: p.document_hash, n: p.original_name, r: p.envelopes.map((x) => x.recipient_key_id).sort() }));
const wrapAad = (documentHash: string, keyId: string) => utf8(canonicalize({ h: documentHash, k: keyId }));

/** Encrypt once, then wrap the DEK for every recipient: ML-KEM-768 → HKDF-SHA256 → AES-256-GCM. */
export async function sealPackage(file: Blob & { name?: string }, recipients: readonly Recipient[]): Promise<SealedPackage> {
  if (recipients.length === 0) throw new Error("Select at least one recipient.");
  if (new Set(recipients.map((r) => r.id)).size !== recipients.length) throw new Error("Duplicate recipient selected.");
  const revoked = recipients.find((r) => r.status !== "active");
  if (revoked) throw new Error(`Recipient ${revoked.id} key is revoked; sealing refused.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!(await isPdf(bytes))) throw new Error("Only PDF documents can be sealed.");

  const document_hash = await sha256(bytes);
  const original_name = file.name ?? "document.pdf";
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const envelopes: RecipientEnvelope[] = [];
  for (const r of recipients) {
    const { cipherText, sharedSecret } = ml_kem768.encapsulate(recipientKem(r).publicKey);
    const kek = await aeadKey(sharedSecret, `aegis/v3/wrap/${r.keyId}`, "encrypt");
    const wrap_iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: wrap_iv, additionalData: buf(wrapAad(document_hash, r.keyId)) }, kek, buf(dek)));
    envelopes.push({ recipient_id: r.id, recipient_key_id: r.keyId, kem_ciphertext: toB64(cipherText), wrap_iv: toB64(wrap_iv), wrapped_dek: toB64(wrapped) });
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = { document_hash, original_name, envelopes };
  const docKey = await crypto.subtle.importKey("raw", buf(dek), "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: buf(docAad(header)) }, docKey, buf(bytes)));
  dek.fill(0);
  return {
    format: "aegis-sealed-package",
    schema_version: 3,
    kem_algorithm: "ML-KEM-768",
    aead_algorithm: "AES-256-GCM",
    kdf: "HKDF-SHA256",
    ...header,
    iv: toB64(iv),
    ciphertext: toB64(ct),
    sealed_at: new Date().toISOString(),
  };
}

export async function parsePackage(file: Blob): Promise<SealedPackage> {
  let value: Partial<SealedPackage>;
  try { value = JSON.parse(await file.text()); } catch { throw new Error("File is not a sealed Aegis package."); }
  if (value.format !== "aegis-sealed-package" || value.schema_version !== 3 || !value.ciphertext || !Array.isArray(value.envelopes)) {
    throw new Error("Unsupported or malformed sealed package (expected schema v3).");
  }
  return value as SealedPackage;
}

export interface DecryptResult { pdf: Uint8Array; filename: string; record: LedgerRecord }

/** Authorized decryption: unwrap DEK, authenticate, watermark per session, sign with recipient key, commit to ledger. */
export async function decryptPackage(pkg: SealedPackage, operatorId: string, offlineNodes: readonly string[] = []): Promise<DecryptResult> {
  const recipient = findRecipient(operatorId);
  if (!recipient) throw new Error("Unknown operator.");
  const envelope = pkg.envelopes.find((x) => x.recipient_id === recipient.id);
  if (!envelope) throw new Error("This package was not sealed for the selected recipient; decryption refused.");
  if (recipient.keyId !== envelope.recipient_key_id) throw new Error("Envelope references a different key version than the recipient's active key.");
  if (recipient.status !== "active") throw new Error("Recipient key is revoked; decryption refused.");

  let plain: Uint8Array;
  try {
    const shared = ml_kem768.decapsulate(fromB64(envelope.kem_ciphertext), recipientKem(recipient).secretKey);
    const kek = await aeadKey(shared, `aegis/v3/wrap/${recipient.keyId}`, "decrypt");
    const dek = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(fromB64(envelope.wrap_iv)), additionalData: buf(wrapAad(pkg.document_hash, recipient.keyId)) }, kek, buf(fromB64(envelope.wrapped_dek))));
    const docKey = await crypto.subtle.importKey("raw", buf(dek), "AES-GCM", false, ["decrypt"]);
    dek.fill(0);
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(fromB64(pkg.iv)), additionalData: buf(docAad(pkg)) }, docKey, buf(fromB64(pkg.ciphertext))));
  } catch {
    throw new Error("Authentication failed: the package was altered or sealed for a different key.");
  }
  if ((await sha256(plain)) !== pkg.document_hash) throw new Error("Decrypted content does not match the sealed document hash.");

  const documentId = `DOC-${pkg.document_hash.slice(0, 12).toUpperCase()}`;
  const eventId = randomId("EVT");
  const sessionId = randomId("SES");
  const watermarkId = randomId("WM");
  const watermarkHash = await sha256(`${documentId}:${eventId}:${watermarkId}:${sessionId}`);
  const pdf = await embedWatermark(plain, { watermarkId, tag: watermarkHash.slice(0, 16) });

  const event: DecryptionEvent = {
    schema_version: 2,
    event_id: eventId,
    document_id: documentId,
    recipient_id: recipient.id,
    recipient_key_id: recipient.keyId,
    session_id: sessionId,
    watermark_id: watermarkId,
    watermark_version: 2,
    timestamp: new Date().toISOString(),
    event_type: "DOCUMENT_DECRYPTED",
    document_hash: pkg.document_hash,
    output_hash: await sha256(pdf),
    watermark_hash: watermarkHash,
    signature_algorithm: "ML-DSA-65",
  };
  const signature = toB64(sign(utf8(canonicalize(event)), recipientSig(recipient).secretKey));
  const record = await appendEvent({ event, signature }, offlineNodes);
  // The filename deliberately carries no marker: copies must be indistinguishable to the eye.
  return { pdf, filename: pkg.original_name, record };
}

const LIMITATION =
  "Evidence links a recovered marker to a recipient-signed decryption event committed by node quorum. It does not prove which human operated the endpoint.";

/** Fail-closed forensic verification of a suspected leaked PDF against the local ledger. */
export async function verifyLeak(file: File): Promise<EvidenceReport> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checks: VerificationCheck[] = [];
  const add = (id: string, label: string, ok: boolean | null, detail: string, critical = true) =>
    checks.push({ id, label, status: ok === null ? "unavailable" : ok ? "valid" : "invalid", detail, critical });

  const marker = await extractWatermark(bytes);
  add("watermark", "Watermark recovered", !!marker, marker ? `Marker ${marker.watermarkId} found in document.` : "No Aegis marker found in this file.");
  const record = marker ? findByWatermark(marker.watermarkId) : undefined;
  add("lookup", "Ledger event located", marker ? !!record : null, record ? `Ledger record #${record.index}.` : "No ledger record carries this marker.");

  const event = record?.signed_event.event;
  const recipient = event ? findRecipient(event.recipient_id) : undefined;
  if (record && event && marker) {
    const expected = await sha256(`${event.document_id}:${event.event_id}:${event.watermark_id}:${event.session_id}`);
    add("binding", "Watermark / event binding", expected === event.watermark_hash && expected.startsWith(marker.tag), "Marker tag matches the event-bound digest.");
    add("signature", "Recipient ML-DSA-65 signature", eventSignatureValid(record.signed_event), "Verified against the registry public key, not a key carried in the file.");
    add("association", "Recipient key association", recipient?.keyId === event.recipient_key_id, `${event.recipient_key_id} is registered to ${event.recipient_id}.`);
    const chain = await verifyChain();
    add("ledger", "Ledger chain integrity", chain.ok, chain.ok ? `${readLedger().length} records hash-link back to genesis.` : `Chain breaks at record #${chain.brokenAt}.`);
    const nodes = validAttestations(record);
    add("quorum", "Node quorum attestations", nodes.length >= record.quorum, `${nodes.length} of 4 nodes signed (${nodes.join(", ") || "none"}); ${record.quorum} required.`);
    const exact = (await sha256(bytes)) === event.output_hash;
    add("copy", "Byte-exact issued copy", exact, exact ? "File is identical to the copy issued in this session." : "File was re-saved or modified after issue; marker still attributes it.", false);
  }

  const critical = checks.filter((c) => c.critical);
  const valid = critical.length >= 7 && critical.every((c) => c.status === "valid");
  return {
    schema_version: 2,
    generated_at: new Date().toISOString(),
    overall_status: valid ? "VALID" : "INVALID",
    document_id: event?.document_id ?? null,
    watermark_id: marker?.watermarkId ?? null,
    event_id: event?.event_id ?? null,
    recipient_id: event?.recipient_id ?? null,
    recipient_name: recipient?.name ?? null,
    decryption_time: event?.timestamp ?? null,
    ledger_index: record?.index ?? null,
    checks,
    limitation: LIMITATION,
  };
}

export function serializePackage(pkg: SealedPackage): Blob {
  return new Blob([JSON.stringify(pkg)], { type: "application/vnd.aegis-package+json" });
}

export const pdfBlob = (bytes: Uint8Array): Blob => new Blob([buf(bytes)], { type: "application/pdf" });

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
