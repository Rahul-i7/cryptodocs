export type CheckStatus = "valid" | "invalid" | "unavailable";

export interface Recipient {
  id: string;
  name: string;
  clearance: string;
  keyId: string;
  keyVersion: number;
  status: "active" | "revoked";
}

/** Per-recipient key envelope: the shared DEK wrapped under an ML-KEM-768 derived key. */
export interface RecipientEnvelope {
  recipient_id: string;
  recipient_key_id: string;
  kem_ciphertext: string;
  wrap_iv: string;
  wrapped_dek: string;
}

/**
 * Encrypt-once, decrypt-individually package. The document is encrypted a single time under a random
 * 256-bit DEK; the DEK is wrapped separately for every recipient with ML-KEM-768 + HKDF + AES-256-GCM.
 */
export interface SealedPackage {
  format: "aegis-sealed-package";
  schema_version: 3;
  kem_algorithm: "ML-KEM-768";
  aead_algorithm: "AES-256-GCM";
  kdf: "HKDF-SHA256";
  original_name: string;
  document_hash: string;
  iv: string;
  ciphertext: string;
  envelopes: RecipientEnvelope[];
  sealed_at: string;
}

export interface DecryptionEvent {
  schema_version: 2;
  event_id: string;
  document_id: string;
  recipient_id: string;
  recipient_key_id: string;
  session_id: string;
  watermark_id: string;
  watermark_version: 2;
  timestamp: string;
  event_type: "DOCUMENT_DECRYPTED";
  document_hash: string;
  output_hash: string;
  watermark_hash: string;
  signature_algorithm: "ML-DSA-65";
}

export interface SignedEvent {
  event: DecryptionEvent;
  signature: string;
}

export interface NodeAttestation {
  node_id: string;
  signature: string;
}

export interface LedgerRecord {
  index: number;
  previous_record_hash: string;
  signed_event: SignedEvent;
  record_hash: string;
  attestations: NodeAttestation[];
  quorum: number;
}

export interface VerificationCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  critical: boolean;
}

export interface EvidenceReport {
  schema_version: 2;
  generated_at: string;
  overall_status: "VALID" | "INVALID";
  document_id: string | null;
  watermark_id: string | null;
  event_id: string | null;
  recipient_id: string | null;
  recipient_name: string | null;
  decryption_time: string | null;
  ledger_index: number | null;
  checks: VerificationCheck[];
  limitation: string;
}
