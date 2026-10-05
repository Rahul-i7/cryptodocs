# Aegis Provenance prototype architecture

## Scope
This browser prototype demonstrates the complete orchestration and evidence contracts for authorized decryption, a unique per-session evidence marker, event signing, quorum acceptance, offline verification, and JSON evidence reporting.

## Module boundaries
- `types.ts`: frozen version-1 data contracts.
- `engine.ts`: canonical serialization, Web Crypto hashing/signing, envelope generation, record chaining, and fail-closed verification.
- `Workspace.tsx`: local operator workflows only.

All file operations occur after a user action. No normal workflow performs a network request or sends document content to a server.

## Security boundary
Implemented: versioned contracts, random session/event/marker IDs, SHA-256 content identity, deterministic serialization, Web Crypto ECDSA demonstration signatures, internal ledger-record chaining, quorum evidence, tamper detection, and human/machine-readable results.

Prototype adapters: ECDSA P-256 stands in for ML-DSA; envelope evidence stands in for robust invisible PDF watermarking; the four-node quorum record stands in for a deployed permissioned DLT; the uploaded bytes stand in for hybrid AES-256-GCM plus ML-KEM package decryption.

A production implementation must replace these adapters with reviewed native libraries and independently administered offline nodes. It must protect private keys in hardware or an equivalent local boundary, authenticate operators, preserve chain of custody, and complete watermark robustness testing.

## Attribution claim
The defensible claim is that recovered evidence is linked to a recorded decryption event signed by a key associated with a recipient identity. The prototype does not prove which human physically operated an endpoint.
