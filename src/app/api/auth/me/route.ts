import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ user: null }, { status: 200 });
  return NextResponse.json(context);
}
