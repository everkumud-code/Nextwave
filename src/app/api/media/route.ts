import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { cleanFilename, detectMedia, MAX_MEDIA_BYTES, MAX_WORKSPACE_MEDIA_BYTES } from "@/lib/media";

export const runtime = "nodejs";

const assetSelect = { id: true, kind: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true } as const;

/** The files this workspace has uploaded (newest first), to pick one again for another campaign. */
export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const assets = await prisma.mediaAsset.findMany({
    where: { organizationId: context.organization.id },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: assetSelect,
  });
  return NextResponse.json({ assets });
}

/** Upload one picture, video, audio file or PDF (up to 16 MB). The same file uploaded twice is stored once. */
export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to upload files." }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
    if (file.size > MAX_MEDIA_BYTES) return NextResponse.json({ error: "The file is larger than 16 MB, the limit WhatsApp allows for pictures, video and audio." }, { status: 413 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const detected = detectMedia(bytes);
    if (!detected) return NextResponse.json({ error: "This file type is not supported. Use a JPG, PNG or WebP picture, an MP4 or 3GP video, an MP3, M4A, OGG or AMR audio file, or a PDF." }, { status: 400 });

    const organizationId = context.organization.id;
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const existing = await prisma.mediaAsset.findUnique({ where: { organizationId_sha256: { organizationId, sha256 } }, select: assetSelect });
    if (existing) return NextResponse.json({ asset: existing, reused: true });

    const used = await prisma.mediaAsset.aggregate({ where: { organizationId }, _sum: { sizeBytes: true } });
    if ((used._sum.sizeBytes ?? 0) + bytes.length > MAX_WORKSPACE_MEDIA_BYTES) {
      return NextResponse.json({ error: "This workspace has reached its 200 MB file limit. Ask your administrator to free space." }, { status: 409 });
    }
    const asset = await prisma.mediaAsset.create({
      data: {
        organizationId, kind: detected.kind, mimeType: detected.mimeType, sizeBytes: bytes.length, sha256,
        filename: cleanFilename(typeof file.name === "string" ? file.name : "", detected.extension),
        data: bytes, createdByUserId: context.user.id,
      },
      select: assetSelect,
    });
    await prisma.auditLog.create({
      data: { organizationId, actorUserId: context.user.id, action: "media.uploaded", resourceType: "MediaAsset", resourceId: asset.id, metadata: { kind: asset.kind, sizeBytes: asset.sizeBytes } },
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    console.error("Media upload failed", error);
    return NextResponse.json({ error: "Unable to upload the file." }, { status: 500 });
  }
}
