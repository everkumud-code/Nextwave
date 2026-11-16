import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { assertAuthConfigured, createSession } from "@/lib/auth";

export const runtime = "nodejs";

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36);
}

export async function POST(request: Request) {
  try {
    assertAuthConfigured();
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const organizationName = typeof body.organizationName === "string" ? body.organizationName.trim().slice(0, 100) : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!name || !organizationName || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || password.length < 10 || password.length > 128) {
      return NextResponse.json({ error: "Enter your name, workspace, a valid email and a password of at least 10 characters." }, { status: 400 });
    }

    const passwordHash = await hash(password, 12);
    const baseSlug = slugify(organizationName) || "workspace";
    const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { name, email, passwordHash },
        select: { id: true, email: true, name: true },
      });
      const organization = await tx.organization.create({
        data: { name: organizationName, slug },
      });
      await tx.creditAccount.create({ data: { organizationId: organization.id } });
      await tx.membership.create({
        data: {
          userId: createdUser.id,
          organizationId: organization.id,
          role: "OWNER",
          joinedAt: new Date(),
        },
      });
      return createdUser;
    });

    await createSession(user.id);
    return NextResponse.json({ user, organization: { name: organizationName, slug } }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    console.error("Registration failed", error);
    return NextResponse.json({ error: "Unable to create your workspace right now." }, { status: 500 });
  }
}
