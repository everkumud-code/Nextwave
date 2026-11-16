import { prisma } from "@/lib/db/prisma";
import { PrismaQrSessionRepository } from "./prisma-repository";
import { HttpQrSessionProvider } from "./http-provider";
import { QrSessionManager } from "./manager";

let manager: QrSessionManager | undefined;

/** Lazily constructs the server-side session manager. */
export function getQrSessionManager(): QrSessionManager {
  if (!manager) {
    manager = new QrSessionManager(
      new HttpQrSessionProvider(),
      new PrismaQrSessionRepository(prisma),
    );
  }
  return manager;
}
