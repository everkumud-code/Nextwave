/**
 * Media for campaigns: picture, video, audio (voice note / music) and PDF.
 * The type of a file is decided from its first bytes, never from its name or from what the browser says, so an
 * executable renamed to .jpg is refused. Only the formats WhatsApp plays everywhere are accepted.
 */
export type MediaKind = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";

export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;              // WhatsApp's limit for picture, video and audio is 16 MB
export const MAX_WORKSPACE_MEDIA_BYTES = 200 * 1024 * 1024;   // all files of one workspace together

export type DetectedMedia = { kind: MediaKind; mimeType: string; extension: string };

const startsWith = (buf: Uint8Array, bytes: number[], offset = 0) => bytes.every((value, index) => buf[offset + index] === value);
const ascii = (buf: Uint8Array, start: number, end: number) => String.fromCharCode(...Array.from(buf.subarray(start, end)));

export function detectMedia(buf: Uint8Array): DetectedMedia | null {
  if (buf.length < 12) return null;
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { kind: "IMAGE", mimeType: "image/jpeg", extension: "jpg" };
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "IMAGE", mimeType: "image/png", extension: "png" };
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP") return { kind: "IMAGE", mimeType: "image/webp", extension: "webp" };
  if (ascii(buf, 0, 5) === "%PDF-") return { kind: "DOCUMENT", mimeType: "application/pdf", extension: "pdf" };
  if (ascii(buf, 4, 8) === "ftyp") {
    const brand = ascii(buf, 8, 12);
    if (brand === "M4A " || brand === "M4B ") return { kind: "AUDIO", mimeType: "audio/mp4", extension: "m4a" };
    if (["isom", "iso2", "mp41", "mp42", "avc1", "MSNV", "M4V ", "dash"].includes(brand)) return { kind: "VIDEO", mimeType: "video/mp4", extension: "mp4" };
    if (brand.startsWith("3gp")) return { kind: "VIDEO", mimeType: "video/3gpp", extension: "3gp" };
    return null;
  }
  if (ascii(buf, 0, 4) === "OggS") return { kind: "AUDIO", mimeType: "audio/ogg; codecs=opus", extension: "ogg" };
  if (ascii(buf, 0, 3) === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 && (buf[1] & 0x06) !== 0)) return { kind: "AUDIO", mimeType: "audio/mpeg", extension: "mp3" };
  if (ascii(buf, 0, 5) === "#!AMR") return { kind: "AUDIO", mimeType: "audio/amr", extension: "amr" };
  return null;
}

/** A safe file name for display and for the document that the recipient receives. */
export function cleanFilename(name: string, extension: string): string {
  const base = name.replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f"<>|:*?]+/g, "").trim().slice(0, 120);
  const stem = base.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "file";
  return `${stem}.${extension}`;
}

/** Rules about what a file may carry: audio has no text; a caption is at most 1,024 characters. */
export function mediaProblem(kind: MediaKind | null | undefined, body: string | null | undefined): string | null {
  if (!kind) return null;
  if (kind === "AUDIO" && body?.trim()) return "An audio file cannot carry text. Remove the text, or use a video, picture or PDF instead.";
  if (kind !== "AUDIO" && (body?.trim().length ?? 0) > 1024) return "The text sent with a picture, video or PDF (its caption) can have at most 1,024 characters.";
  return null;
}

export function kindLabel(kind: MediaKind): string {
  return kind === "IMAGE" ? "Picture" : kind === "VIDEO" ? "Video" : kind === "AUDIO" ? "Audio" : "PDF";
}
