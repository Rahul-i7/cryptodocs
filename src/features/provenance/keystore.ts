import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

import { fromHex, toHex } from "./bytes";
import type { Recipient } from "./types";

/**
 * Local key custody adapter. Seeds live in browser storage for this offline workstation;
 * a production deployment replaces this module with an HSM / smart-card adapter exposing
 * the same functions.
 */
export const RECIPIENTS = [
  { id: "REC-017", name: "Mira Chen", clearance: "Research / Tier 3", keyId: "KEY-ML-017-V2", keyVersion: 2, status: "active" },
  { id: "REC-024", name: "Jon Bell", clearance: "Legal / Tier 2", keyId: "KEY-ML-024-V1", keyVersion: 1, status: "active" },
  { id: "REC-031", name: "Asha Rao", clearance: "Audit / Tier 3", keyId: "KEY-ML-031-V4", keyVersion: 4, status: "active" },
  { id: "REC-040", name: "Owen Park", clearance: "Former / revoked", keyId: "KEY-ML-040-V1", keyVersion: 1, status: "revoked" },
] as const satisfies readonly Recipient[];

export const NODES = ["NODE-A", "NODE-B", "NODE-C", "NODE-D"] as const;
export const QUORUM = 3;

const STORE_KEY = "aegis.keystore.v2";
type Seeds = Record<string, string>;
interface KeyPair { publicKey: Uint8Array; secretKey: Uint8Array }

const memory = new Map<string, KeyPair>();
let memorySeeds: Seeds | null = null;

function storage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

function loadSeeds(): Seeds {
  if (memorySeeds) return memorySeeds;
  const raw = storage()?.getItem(STORE_KEY);
  memorySeeds = raw ? (JSON.parse(raw) as Seeds) : {};
  return memorySeeds;
}

function seedFor(name: string, length: number): Uint8Array {
  const seeds = loadSeeds();
  if (!seeds[name]) {
    seeds[name] = toHex(crypto.getRandomValues(new Uint8Array(length)));
    storage()?.setItem(STORE_KEY, JSON.stringify(seeds));
  }
  return fromHex(seeds[name]);
}

function cached(name: string, make: () => KeyPair): KeyPair {
  let pair = memory.get(name);
  if (!pair) { pair = make(); memory.set(name, pair); }
  return pair;
}

export const recipientKem = (r: Recipient) => cached(`kem:${r.keyId}`, () => ml_kem768.keygen(seedFor(`kem:${r.keyId}`, 64)));
export const recipientSig = (r: Recipient) => cached(`sig:${r.keyId}`, () => ml_dsa65.keygen(seedFor(`sig:${r.keyId}`, 32)));
export const nodeSig = (node: string) => cached(`node:${node}`, () => ml_dsa65.keygen(seedFor(`node:${node}`, 32)));

export function findRecipient(id: string): Recipient | undefined {
  return RECIPIENTS.find((r) => r.id === id);
}

export function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return ml_dsa65.sign(message, secretKey);
}

export function verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  try { return ml_dsa65.verify(signature, message, publicKey); } catch { return false; }
}

export { ml_kem768 };

/** Fingerprint shown in the UI so operators can compare keys across air-gapped stations. */
export async function fingerprint(publicKey: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", publicKey.slice().buffer));
  return toHex(digest.subarray(0, 6)).toUpperCase().replace(/(.{4})/g, "$1 ").trim();
}

export function resetKeystore(): void {
  memory.clear();
  memorySeeds = {};
  storage()?.removeItem(STORE_KEY);
}
