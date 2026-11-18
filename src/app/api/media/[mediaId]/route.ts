import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ mediaId: string }> };

/** Shows a file of the signed-in workspace (a preview of the picture, video, audio or PDF). Never another workspace's. */
export async function GET(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { mediaId } = await route.params;
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: mediaId, organizationId: context.organization.id },
    select: { mimeType: true, filename: true, data: true },
  });
  if (!asset) return NextResponse.json({ error: "File not found." }, { status: 404 });
  return new Response(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.mimeType.split(";")[0],
      "Content-Disposition": `inline; filename="${asset.filename.replace(/[^\x20-\x7e]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
      ...(asset.mimeType === "application/pdf" ? {} : { "Content-Security-Policy": "sandbox; default-src 'none'" }),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
