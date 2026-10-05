# Requirements traceability (updated)

| Requirement | Implementation | Status |
|---|---|---|
| Encrypt once, many recipients | One AES-256-GCM ciphertext; DEK wrapped per recipient via ML-KEM-768 + HKDF-SHA256 | Implemented |
| PQ key exchange (NIST FIPS 203) | `@noble/post-quantum` ML-KEM-768 | Implemented |
| PQ signatures (NIST FIPS 204) | ML-DSA-65 with the recipient's own secret key | Implemented |
| Unique invisible watermark per decryption | Session marker: 1pt micro-text per page + PDF Info keys; pages visually unchanged | Implemented (basic) |
| Visually identical copies | No visible footer, filename carries no marker | Implemented |
| Event bound to recipient identity | Canonical JSON event signed by recipient; verified against registry key | Implemented |
| Tamper-evident ledger | SHA-256 hash chain + 3-of-4 ML-DSA node attestations | Implemented |
| Admin cannot silently edit history | Chain + attestation verification, export/import with divergence rejection, head hash for out-of-band comparison | Partial: demo nodes share one browser |
| Leak extraction -> lookup -> verifiable record | Verify tab on the leaked PDF; JSON evidence report | Implemented |
| Offline / air-gapped | No network calls at runtime; system font stack | Implemented |
| No cloud KMS / public chain | None used | Implemented |
| Watermark robust to print-scan / screenshot | Needs raster/spread-spectrum pipeline | Not implemented |
| Separate processes/hardware per ledger node | Needs multi-node deployment | Not implemented |
| Hardware-backed recipient keys | Seeds in browser storage | Not implemented |
