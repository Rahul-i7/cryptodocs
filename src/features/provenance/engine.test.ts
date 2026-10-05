// @vitest-environment node
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it } from "vitest";

import { canonicalize, decryptPackage, parsePackage, RECIPIENTS, sealPackage, serializePackage, verifyLeak } from "./engine";
import { clearLedger, readLedger, verifyChain } from "./ledger";
import { resetKeystore } from "./keystore";

const rec = (id: string) => RECIPIENTS.find((r) => r.id === id)!;

async function makePdf(): Promise<File> {
  const doc = await PDFDocument.create();
  doc.addPage().drawText("TOP SECRET: launch codes", { x: 50, y: 700 });
  return new File([(await doc.save()) as BlobPart], "brief.pdf", { type: "application/pdf" });
}
const asFile = (bytes: Uint8Array) => new File([bytes as BlobPart], "leak.pdf");

beforeEach(() => { resetKeystore(); clearLedger(); });

describe("canonical serialization", () => {
  it("sorts keys recursively and keeps array order", () => {
    expect(canonicalize({ z: 1, a: { y: true, b: "x" }, v: [3, 1] })).toBe('{"a":{"b":"x","y":true},"v":[3,1],"z":1}');
  });
});

describe("end-to-end attribution", () => {
  it("encrypts once, gives each recipient a distinct watermark, and attributes a leak to the right one", async () => {
    const pkg = await parsePackage(serializePackage(await sealPackage(await makePdf(), [rec("REC-017"), rec("REC-031")])));
    expect(pkg.envelopes).toHaveLength(2);

    const a = await decryptPackage(pkg, "REC-017");
    const b = await decryptPackage(pkg, "REC-031");
    expect(a.record.signed_event.event.watermark_id).not.toBe(b.record.signed_event.event.watermark_id);
    expect(a.pdf).not.toEqual(b.pdf);
    expect(readLedger()).toHaveLength(2);
    expect((await verifyChain()).ok).toBe(true);

    const reportA = await verifyLeak(asFile(a.pdf));
    expect(reportA.overall_status).toBe("VALID");
    expect(reportA.recipient_id).toBe("REC-017");
    const reportB = await verifyLeak(asFile(b.pdf));
    expect(reportB.overall_status).toBe("VALID");
    expect(reportB.recipient_id).toBe("REC-031");
  });

  it("keeps rendered page text identical between copies", async () => {
    const pkg = await sealPackage(await makePdf(), [rec("REC-017"), rec("REC-031")]);
    const a = await decryptPackage(pkg, "REC-017");
    const b = await decryptPackage(pkg, "REC-031");
    const pa = await PDFDocument.load(a.pdf);
    const pb = await PDFDocument.load(b.pdf);
    expect(pa.getPageCount()).toBe(pb.getPageCount());
    expect(pa.getPage(0).getSize()).toEqual(pb.getPage(0).getSize());
  });
});

describe("authorization and tamper evidence", () => {
  it("refuses a recipient who was not sealed in, and revoked recipients", async () => {
    const pkg = await sealPackage(await makePdf(), [rec("REC-017")]);
    await expect(decryptPackage(pkg, "REC-024")).rejects.toThrow(/not sealed/);
    await expect(sealPackage(await makePdf(), [rec("REC-040")])).rejects.toThrow(/revoked/);
  });

  it("fails closed when ciphertext or recipient list is altered", async () => {
    const pkg = await sealPackage(await makePdf(), [rec("REC-017")]);
    const flipped = { ...pkg, ciphertext: pkg.ciphertext.slice(0, -6) + (pkg.ciphertext.endsWith("AAAAAA") ? "BBBBBB" : "AAAAAA") };
    await expect(decryptPackage(flipped, "REC-017")).rejects.toThrow(/Authentication failed/);
    const swapped = { ...pkg, original_name: "other.pdf" };
    await expect(decryptPackage(swapped, "REC-017")).rejects.toThrow(/Authentication failed/);
  });

  it("blocks the commit when fewer than 3 ledger nodes are online", async () => {
    const pkg = await sealPackage(await makePdf(), [rec("REC-017")]);
    await expect(decryptPackage(pkg, "REC-017", ["NODE-A", "NODE-B"])).rejects.toThrow(/Quorum not reached/);
    expect(readLedger()).toHaveLength(0);
  });

  it("detects retroactive ledger edits", async () => {
    const pkg = await sealPackage(await makePdf(), [rec("REC-017"), rec("REC-031")]);
    const leak = await decryptPackage(pkg, "REC-017");
    readLedger()[0]!.signed_event.event.recipient_id = "REC-031"; // admin rewrites history
    expect((await verifyChain()).ok).toBe(false);
    expect((await verifyLeak(asFile(leak.pdf))).overall_status).toBe("INVALID");
  });

  it("returns INVALID for a PDF with no watermark", async () => {
    const report = await verifyLeak(await makePdf());
    expect(report.overall_status).toBe("INVALID");
    expect(report.recipient_id).toBeNull();
  });
});
