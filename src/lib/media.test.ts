import test from "node:test";
import assert from "node:assert/strict";
import { cleanFilename, detectMedia } from "./media";

const pad = (bytes: number[]) => Uint8Array.from([...bytes, ...Array(16).fill(0)]);
const text = (value: string) => Uint8Array.from([...Buffer.from(value, "latin1"), ...Array(8).fill(0)]);

test("the type comes from the first bytes of the file", () => {
  assert.equal(detectMedia(pad([0xff, 0xd8, 0xff, 0xe0]))?.mimeType, "image/jpeg");
  assert.equal(detectMedia(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.kind, "IMAGE");
  assert.equal(detectMedia(text("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))?.mimeType, "image/webp");
  assert.deepEqual(detectMedia(text("%PDF-1.7\n%âãÏÓ")), { kind: "DOCUMENT", mimeType: "application/pdf", extension: "pdf" });
  assert.equal(detectMedia(text("\u0000\u0000\u0000\u0018ftypmp42"))?.kind, "VIDEO");
  assert.equal(detectMedia(text("\u0000\u0000\u0000\u0018ftypM4A "))?.kind, "AUDIO");
  assert.equal(detectMedia(text("OggS\u0000\u0002\u0000\u0000\u0000\u0000\u0000\u0000"))?.kind, "AUDIO");
  assert.equal(detectMedia(text("ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000"))?.mimeType, "audio/mpeg");
  assert.equal(detectMedia(pad([0xff, 0xfb, 0x90, 0x00]))?.kind, "AUDIO");
});

test("anything else is refused, whatever its name says", () => {
  assert.equal(detectMedia(text("MZ\u0090\u0000\u0003\u0000\u0000\u0000\u0004\u0000\u0000\u0000")), null);        // a Windows program
  assert.equal(detectMedia(text("<script>alert(1)</script>")), null);
  assert.equal(detectMedia(text("#!/bin/sh\nrm -rf /\n")), null);
  assert.equal(detectMedia(text("\u0000\u0000\u0000\u0018ftypheic")), null);
  assert.equal(detectMedia(Uint8Array.from([1, 2, 3])), null);
});

test("file names are cleaned and carry the real extension", () => {
  assert.equal(cleanFilename("C:\\fakepath\\Diwali Offer.JPEG", "jpg"), "Diwali Offer.jpg");
  assert.equal(cleanFilename('a"b<c>.pdf', "pdf"), "abc.pdf");
  assert.equal(cleanFilename("", "png"), "file.png");
  assert.equal(cleanFilename("x".repeat(300) + ".mp4", "mp4").length <= 125, true);
});
