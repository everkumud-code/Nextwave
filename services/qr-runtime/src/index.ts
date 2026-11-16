import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, randomUUID, createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";
import makeWASocket, {
  Browsers,
  BufferJSON,
  DisconnectReason,
  initAuthCreds,
  makeCacheableSignalKeyStore,
  type AuthenticationCreds,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { PrismaClient } from "@prisma/client";
import { highestReceiptStatus, receiptCanAdvance, type QrDeliveryStatus } from "./receipt-status.js";

const prisma = new PrismaClient();
const logger = pino({ level: process.env.QR_LOG_LEVEL || "silent" });
const PORT = Number(process.env.QR_SESSION_PORT || 4100);
const SERVICE_TOKEN = process.env.QR_SESSION_SERVICE_TOKEN || "";
const ENCRYPTION_KEY_HEX = process.env.QR_CREDENTIAL_ENCRYPTION_KEY || "";
const ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_HEX, "hex");
const QR_TTL_MS = 55_000;
const MAX_RECONNECT_ATTEMPTS = 7;
const sessions = new Map<string, RuntimeSession>();

type RuntimeSession = {
  id: string;
  organizationId: string;
  senderId: string;
  status: "CREATED" | "QR_PENDING" | "PAIRING" | "CONNECTED" | "RECONNECTING" | "DISCONNECTED" | "REVOKED" | "ERROR";
  qrPayload?: string;
  expiresAt?: string;
  connectedAt?: string;
  lastSeenAt?: string;
  credentialRef: string;
  errorCode?: string;
  errorMessage?: string;
  socket?: ReturnType<typeof makeWASocket>;
  generation: number;
  reconnectAttempts: number;
  reconnectTimer?: NodeJS.Timeout;
  stopping: boolean;
  qrWaiters: Array<(value: string) => void>;
};

function assertConfiguration() {
  if (!SERVICE_TOKEN) throw new Error("QR_SESSION_SERVICE_TOKEN is required.");
  if (ENCRYPTION_KEY.length !== 32) throw new Error("QR_CREDENTIAL_ENCRYPTION_KEY must be 64 hexadecimal characters.");
}

function encrypt(value: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

function decrypt(value: string, context: string) {
  const [ivPart, tagPart, cipherPart] = value.split(".");
  if (!ivPart || !tagPart || !cipherPart) throw new Error("Encrypted credential record is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, Buffer.from(ivPart, "base64url"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function serialize(value: unknown) {
  return JSON.stringify(value, BufferJSON.replacer);
}

function deserialize<T>(value: string): T {
  return JSON.parse(value, BufferJSON.reviver) as T;
}

async function readBody(request: IncomingMessage) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk.toString();
    if (raw.length > 64 * 1024) throw new Error("Request body is too large.");
  }
  return raw ? JSON.parse(raw) as Record<string, unknown> : {};
}

function send(response: ServerResponse, status: number, body?: unknown) {
  response.statusCode = status;
  if (status === 204) return response.end();
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body ?? {}));
}

function isAuthorized(request: IncomingMessage) {
  const actual = Buffer.from(request.headers.authorization || "");
  const expected = Buffer.from(`Bearer ${SERVICE_TOKEN}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function createAuthState(credentialId: string) {
  const credential = await prisma.qrCredential.findUnique({ where: { id: credentialId } });
  if (!credential) throw new Error("QR credential record is missing.");
  const credentialContext = `${credential.organizationId}:${credential.senderId}:${credentialId}`;
  const creds = deserialize<AuthenticationCreds>(decrypt(credential.encryptedCreds, credentialContext));

  const keyStore = {
    get: async (keyType: string, ids: string[]) => {
      if (ids.length === 0) return {};
      const rows = await prisma.qrSignalKey.findMany({
        where: { credentialId, keyType, keyId: { in: ids } },
      });
      return Object.fromEntries(rows.map((row) => [
        row.keyId,
        deserialize<unknown>(decrypt(row.encryptedValue, `${credentialContext}:${keyType}:${row.keyId}`)),
      ]));
    },
    set: async (data: Record<string, Record<string, unknown | null>>) => {
      for (const [keyType, entries] of Object.entries(data)) {
        for (const [keyId, value] of Object.entries(entries)) {
          if (value === null || value === undefined) {
            await prisma.qrSignalKey.deleteMany({ where: { credentialId, keyType, keyId } });
          } else {
            await prisma.qrSignalKey.upsert({
              where: { credentialId_keyType_keyId: { credentialId, keyType, keyId } },
              create: { credentialId, keyType, keyId, encryptedValue: encrypt(serialize(value), `${credentialContext}:${keyType}:${keyId}`) },
              update: { encryptedValue: encrypt(serialize(value), `${credentialContext}:${keyType}:${keyId}`) },
            });
          }
        }
      }
    },
  };

  const authKeys = makeCacheableSignalKeyStore(keyStore as never, logger);
  return {
    creds,
    keys: authKeys,
    saveCreds: async () => {
      await prisma.qrCredential.update({
        where: { id: credentialId },
        data: { encryptedCreds: encrypt(serialize(creds), credentialContext) },
      });
    },
  };
}

async function persistStatus(session: RuntimeSession) {
  const terminal = ["DISCONNECTED", "REVOKED", "ERROR"].includes(session.status);
  await prisma.qrSession.updateMany({
    where: { providerSessionId: session.id, organizationId: session.organizationId },
    data: {
      status: session.status,
      credentialRef: session.status === "REVOKED" || session.status === "DISCONNECTED" ? null : session.credentialRef,
      connectedAt: session.connectedAt ? new Date(session.connectedAt) : undefined,
      lastSeenAt: session.lastSeenAt ? new Date(session.lastSeenAt) : undefined,
      lastErrorCode: session.errorCode ?? null,
      lastErrorMessage: session.errorMessage ?? null,
      activeKey: terminal ? null : undefined,
      revokedAt: session.status === "REVOKED" ? new Date() : undefined,
    },
  });

  const senderStatus = session.status === "CONNECTED"
    ? "CONNECTED"
    : session.status === "RECONNECTING"
      ? "ATTENTION"
      : terminal
        ? "DISCONNECTED"
        : "PENDING";
  await prisma.sender.updateMany({
    where: { id: session.senderId, organizationId: session.organizationId },
    data: {
      status: senderStatus,
      lastConnectedAt: session.connectedAt ? new Date(session.connectedAt) : undefined,
      lastSeenAt: session.lastSeenAt ? new Date(session.lastSeenAt) : undefined,
    },
  });
}

function publishQr(session: RuntimeSession, qr: string) {
  session.qrPayload = qr;
  session.expiresAt = new Date(Date.now() + QR_TTL_MS).toISOString();
  session.status = "QR_PENDING";
  session.errorCode = undefined;
  session.errorMessage = undefined;
  for (const resolve of session.qrWaiters.splice(0)) resolve(qr);
  void persistStatus(session).catch((error) => logger.error({ error }, "Could not persist QR session state"));
}

function waitForQr(session: RuntimeSession, timeoutMs = 20_000): Promise<string> {
  if (session.qrPayload && session.expiresAt && new Date(session.expiresAt).getTime() > Date.now()) {
    return Promise.resolve(session.qrPayload);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.qrWaiters = session.qrWaiters.filter((waiter) => waiter !== onQr);
      reject(new Error("Timed out waiting for a QR challenge from the session runtime."));
    }, timeoutMs);
    const onQr = (value: string) => {
      clearTimeout(timer);
      resolve(value);
    };
    session.qrWaiters.push(onQr);
  });
}

async function startSocket(session: RuntimeSession) {
  const generation = ++session.generation;
  session.stopping = false;
  const auth = await createAuthState(session.id);
  const socket = makeWASocket({
    auth: { creds: auth.creds, keys: auth.keys },
    logger,
    browser: Browsers.ubuntu("NextWave"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  session.socket = socket;

  socket.ev.on("creds.update", (update) => {
    Object.assign(auth.creds, update);
    void auth.saveCreds().catch((error) => logger.error({ error }, "Could not persist encrypted QR credentials"));
  });

  socket.ev.on("connection.update", (update) => {
    if (generation !== session.generation || session.stopping) return;
    if (update.qr) publishQr(session, update.qr);
    if (update.connection === "connecting" && !session.qrPayload) {
      session.status = "PAIRING";
      void persistStatus(session).catch((error) => logger.error({ error }, "Could not persist pairing state"));
    }
    if (update.connection === "open") {
      session.status = "CONNECTED";
      session.connectedAt = session.connectedAt || new Date().toISOString();
      session.lastSeenAt = new Date().toISOString();
      session.qrPayload = undefined;
      session.expiresAt = undefined;
      session.reconnectAttempts = 0;
      session.errorCode = undefined;
      session.errorMessage = undefined;
      void persistStatus(session).catch((error) => logger.error({ error }, "Could not persist connected state"));
    }
    if (update.connection === "close") {
      session.socket = undefined;
      const statusCode = (update.lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        session.status = "DISCONNECTED";
        session.qrPayload = undefined;
        session.expiresAt = undefined;
        session.errorCode = "LOGGED_OUT";
        session.errorMessage = "The linked device was logged out.";
        void prisma.qrCredential.deleteMany({ where: { id: session.id } }).catch(() => undefined);
        void persistStatus(session).catch((error) => logger.error({ error }, "Could not persist logged-out state"));
      } else {
        session.status = "RECONNECTING";
        session.qrPayload = undefined;
        session.expiresAt = undefined;
        session.errorCode = statusCode ? String(statusCode) : "CONNECTION_CLOSED";
        session.errorMessage = "The session connection closed and is attempting to reconnect.";
        void persistStatus(session).catch((error) => logger.error({ error }, "Could not persist reconnecting state"));
        scheduleReconnect(session);
      }
    }
  });

  socket.ev.on("messages.update", (updates) => {
    if (generation !== session.generation || session.stopping) return;
    for (const update of updates) {
      const providerMessageId = update.key?.id;
      const status = update.update?.status;
      if (!providerMessageId || typeof status !== "number") continue;
      const mapped = mapBaileysReceiptStatus(status);
      if (mapped) void persistDeliveryUpdate(session.organizationId, session.senderId, providerMessageId, mapped).catch((error) => logger.error({ error }, "Could not persist message delivery update"));
    }
  });

  socket.ev.on("messages.upsert", () => {
    if (generation !== session.generation || session.stopping) return;
    session.lastSeenAt = new Date().toISOString();
    void persistStatus(session).catch(() => undefined);
  });
}

function scheduleReconnect(session: RuntimeSession) {
  if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
  if (session.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    session.status = "ERROR";
    session.errorCode = "RECONNECT_LIMIT";
    session.errorMessage = "Reconnect limit reached. Start a new QR session.";
    void persistStatus(session).catch(() => undefined);
    return;
  }
  const delay = Math.min(30_000, 1_000 * 2 ** session.reconnectAttempts);
  session.reconnectAttempts += 1;
  session.reconnectTimer = setTimeout(() => {
    void startSocket(session).catch((error) => {
      session.status = "ERROR";
      session.errorCode = "RECONNECT_FAILED";
      session.errorMessage = "The runtime could not restart the sender session.";
      logger.error({ error }, "QR session reconnect failed");
      void persistStatus(session).catch(() => undefined);
    });
  }, delay);
}

async function restartSocket(session: RuntimeSession) {
  if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
  session.generation += 1;
  session.stopping = true;
  const oldSocket = session.socket;
  session.socket = undefined;
  if (oldSocket) oldSocket.end(undefined);
  session.stopping = false;
  session.qrPayload = undefined;
  session.expiresAt = undefined;
  session.status = "PAIRING";
  await startSocket(session);
}

function createRuntimeSession(input: { id: string; organizationId: string; senderId: string; status?: RuntimeSession["status"] }): RuntimeSession {
  return {
    id: input.id,
    organizationId: input.organizationId,
    senderId: input.senderId,
    status: input.status || "CREATED",
    credentialRef: `qrcred:${input.id}`,
    generation: 0,
    reconnectAttempts: 0,
    stopping: false,
    qrWaiters: [],
  };
}

async function createSession(body: Record<string, unknown>) {
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const senderId = typeof body.senderId === "string" ? body.senderId : "";
  const ownership = body.ownership === "PLATFORM" ? "PLATFORM" : body.ownership === "CUSTOMER" ? "CUSTOMER" : null;
  if (!organizationId || !senderId || !ownership) throw Object.assign(new Error("organizationId, senderId and ownership are required."), { statusCode: 400 });

  const sender = await prisma.sender.findFirst({
    where: { id: senderId, organizationId, archivedAt: null, connector: "QR_SESSION", ownership, organization: { status: "ACTIVE" } },
    select: { id: true },
  });
  if (!sender) throw Object.assign(new Error("Sender was not found for this workspace or connector."), { statusCode: 404 });

  const existing = [...sessions.values()].find((item) => item.organizationId === organizationId && item.senderId === senderId && !["DISCONNECTED", "REVOKED", "ERROR"].includes(item.status));
  if (existing) throw Object.assign(new Error("An active session already exists for this sender."), { statusCode: 409 });

  const id = randomUUID();
  const creds = initAuthCreds();
  await prisma.qrCredential.create({
    data: { id, organizationId, senderId, encryptedCreds: encrypt(serialize(creds), `${organizationId}:${senderId}:${id}`) },
  });
  const session = createRuntimeSession({ id, organizationId, senderId });
  sessions.set(id, session);

  try {
    await startSocket(session);
    const qrPayload = await waitForQr(session);
    return { sessionId: id, qrPayload, expiresAt: session.expiresAt };
  } catch (error) {
    session.stopping = true;
    session.socket?.end(undefined);
    sessions.delete(id);
    await prisma.qrCredential.deleteMany({ where: { id } });
    throw Object.assign(error instanceof Error ? error : new Error("Unable to create QR session."), { statusCode: 504 });
  }
}

async function getSession(id: string, organizationId: string) {
  let session = sessions.get(id);
  if (session && session.organizationId !== organizationId) throw Object.assign(new Error("Session not found."), { statusCode: 404 });

  if (!session) {
    const record = await prisma.qrSession.findFirst({
      where: { providerSessionId: id, organizationId },
      select: { id: true, senderId: true, status: true },
    });
    if (!record) throw Object.assign(new Error("Session not found."), { statusCode: 404 });
    session = createRuntimeSession({
      id,
      organizationId,
      senderId: record.senderId,
      status: record.status === "CONNECTED" ? "RECONNECTING" : record.status,
    });
    sessions.set(id, session);
    await startSocket(session);
  }

  if (session.status === "QR_PENDING" && session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
    await restartSocket(session);
    await waitForQr(session, 12_000).catch(() => undefined);
  }

  const qrIsValid = session.qrPayload && session.expiresAt && new Date(session.expiresAt).getTime() > Date.now();
  return {
    status: session.status,
    qrPayload: qrIsValid ? session.qrPayload : undefined,
    expiresAt: qrIsValid ? session.expiresAt : undefined,
    connectedAt: session.connectedAt,
    lastSeenAt: session.lastSeenAt,
    credentialRef: ["DISCONNECTED", "REVOKED", "ERROR"].includes(session.status) ? undefined : session.credentialRef,
    errorCode: session.errorCode,
    errorMessage: session.errorMessage,
  };
}

async function revokeSession(id: string, organizationId: string) {
  const session = await getSessionForRevoke(id, organizationId);
  session.stopping = true;
  session.generation += 1;
  if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
  session.socket?.end(undefined);
  session.socket = undefined;
  session.status = "REVOKED";
  session.qrPayload = undefined;
  session.expiresAt = undefined;
  await prisma.qrCredential.deleteMany({ where: { id } });
  await persistStatus(session);
  sessions.delete(id);
}

async function getSessionForRevoke(id: string, organizationId: string) {
  const inMemory = sessions.get(id);
  if (inMemory) {
    if (inMemory.organizationId !== organizationId) throw Object.assign(new Error("Session not found."), { statusCode: 404 });
    return inMemory;
  }
  const record = await prisma.qrSession.findFirst({
    where: { providerSessionId: id, organizationId },
    select: { senderId: true },
  });
  if (!record) throw Object.assign(new Error("Session not found."), { statusCode: 404 });
  return createRuntimeSession({ id, organizationId, senderId: record.senderId });
}

async function restoreSessions() {
  const records = await prisma.qrSession.findMany({
    where: { activeKey: { not: null }, providerSessionId: { not: null } },
    select: { providerSessionId: true, organizationId: true, senderId: true, status: true },
  });
  for (const record of records) {
    if (!record.providerSessionId) continue;
    const session = createRuntimeSession({
      id: record.providerSessionId,
      organizationId: record.organizationId,
      senderId: record.senderId,
      status: record.status === "CONNECTED" ? "RECONNECTING" : record.status,
    });
    sessions.set(session.id, session);
    void startSocket(session).catch((error) => {
      session.status = "ERROR";
      session.errorCode = "RESTORE_FAILED";
      session.errorMessage = "The stored sender session could not be restored.";
      logger.error({ error }, "QR session restore failed");
      void persistStatus(session).catch(() => undefined);
    });
  }
}



async function persistDeliveryUpdate(
  organizationId: string,
  senderId: string,
  providerMessageId: string,
  incomingStatus: QrDeliveryStatus,
) {
  const receipt = await prisma.qrDeliveryReceipt.upsert({
    where: { organizationId_senderId_providerMessageId: { organizationId, senderId, providerMessageId } },
    create: { organizationId, senderId, providerMessageId, status: incomingStatus },
    update: { receivedAt: new Date() },
  });
  const effectiveStatus = highestReceiptStatus(receipt.status, incomingStatus);
  if (effectiveStatus !== receipt.status) {
    await prisma.qrDeliveryReceipt.update({
      where: { id: receipt.id },
      data: { status: effectiveStatus, receivedAt: new Date() },
    });
  }

  const message = await prisma.message.findFirst({
    where: { organizationId, senderId, providerMessageId },
    select: { id: true, campaignId: true, recipientE164: true, status: true },
  });
  if (!message) return;

  if (receiptCanAdvance(message.status, effectiveStatus)) {
    const priorStatuses = effectiveStatus === "SENT"
      ? ["QUEUED", "SUBMITTED", "FAILED"]
      : effectiveStatus === "DELIVERED"
        ? ["QUEUED", "SUBMITTED", "SENT", "FAILED"]
        : ["QUEUED", "SUBMITTED", "SENT", "DELIVERED", "FAILED"];
    await prisma.message.updateMany({
      where: { id: message.id, organizationId, senderId, status: { in: priorStatuses as never[] } },
      data: {
        status: effectiveStatus,
        deliveredAt: effectiveStatus === "DELIVERED" || effectiveStatus === "READ" ? new Date() : undefined,
        readAt: effectiveStatus === "READ" ? new Date() : undefined,
        lockedAt: null,
        lockToken: null,
      },
    });
  }

  await prisma.qrDeliveryReceipt.updateMany({
    where: { id: receipt.id, appliedAt: null },
    data: { appliedAt: new Date() },
  });

  if (!message.campaignId) return;
  const contact = await prisma.contact.findFirst({
    where: { organizationId, phoneNumberE164: message.recipientE164 },
    select: { id: true },
  });
  if (contact) {
    await prisma.campaignRecipient.updateMany({
      where: {
        campaignId: message.campaignId,
        contactId: contact.id,
        status: { in: ["QUEUED", "SUBMITTED", "SENT", "DELIVERED", "FAILED"] },
      },
      data: { status: effectiveStatus },
    });
  }

  const [remaining, successful, failed] = await Promise.all([
    prisma.message.count({
      where: { organizationId, campaignId: message.campaignId, status: { in: ["QUEUED", "SUBMITTED", "SENT"] } },
    }),
    prisma.message.count({
      where: { organizationId, campaignId: message.campaignId, status: { in: ["DELIVERED", "READ"] } },
    }),
    prisma.message.count({
      where: { organizationId, campaignId: message.campaignId, status: "FAILED" },
    }),
  ]);
  if (remaining === 0) {
    await prisma.campaign.updateMany({
      where: { id: message.campaignId, organizationId, status: { in: ["QUEUED", "RUNNING", "FAILED"] } },
      data: { status: successful === 0 && failed > 0 ? "FAILED" : "COMPLETED", completedAt: new Date() },
    });
  }
}

function mapBaileysReceiptStatus(status: number): "SENT" | "DELIVERED" | "READ" | null {
  if (status === 2) return "SENT";
  if (status === 3) return "DELIVERED";
  if (status === 4 || status === 5) return "READ";
  return null;
}

async function sendMessage(body: Record<string, unknown>) {
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const senderId = typeof body.senderId === "string" ? body.senderId : "";
  const recipient = typeof body.recipient === "string" ? body.recipient : "";
  const messageBody = typeof body.body === "string" ? body.body : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  const lockToken = typeof body.lockToken === "string" ? body.lockToken : "";
  const consentRecordId = typeof body.consentRecordId === "string" ? body.consentRecordId : "";

  if (!organizationId || !senderId || !idempotencyKey || !lockToken || !consentRecordId || !/^\+[1-9]\d{7,14}$/.test(recipient) || !messageBody.trim() || messageBody.length > 4096) {
    throw Object.assign(new Error("organizationId, senderId, E.164 recipient, message body, idempotencyKey and lockToken are required."), { statusCode: 400, errorCode: "INVALID_MESSAGE" });
  }

  const [sender, contact, message] = await Promise.all([
    prisma.sender.findFirst({
      where: { id: senderId, organizationId, connector: "QR_SESSION", status: "CONNECTED", archivedAt: null, organization: { status: "ACTIVE" } },
      select: { id: true },
    }),
    prisma.contact.findFirst({
      where: { organizationId, phoneNumberE164: recipient, status: "ACTIVE" },
      select: {
        consents: {
          where: { channel: "WHATSAPP", purpose: "MARKETING" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { id: true, status: true },
        },
      },
    }),
    prisma.message.findFirst({
      where: { organizationId, senderId, recipientE164: recipient, idempotencyKey },
      select: { id: true, status: true, lockToken: true, providerMessageId: true, body: true },
    }),
  ]);
  if (!message) throw Object.assign(new Error("Queued message was not found for this workspace and sender."), { statusCode: 404, errorCode: "MESSAGE_NOT_FOUND" });
  if (message.body !== messageBody) throw Object.assign(new Error("Message body does not match the persisted queue job."), { statusCode: 409, errorCode: "MESSAGE_PAYLOAD_MISMATCH" });
  if (message.providerMessageId) return { accepted: true, providerMessageId: message.providerMessageId, state: "SUBMITTED" };
  if (message.status !== "QUEUED" || message.lockToken !== lockToken) {
    throw Object.assign(new Error("Message queue lease is no longer valid."), { statusCode: 409, errorCode: "MESSAGE_LOCK_MISMATCH" });
  }
  if (!sender) throw Object.assign(new Error("Sender is not connected or does not belong to an active workspace."), { statusCode: 409, errorCode: "SENDER_NOT_CONNECTED" });
  const latestConsent = contact?.consents[0];
  if (!latestConsent || latestConsent.status !== "GRANTED" || latestConsent.id !== consentRecordId) {
    throw Object.assign(new Error("Recipient marketing consent is no longer current."), { statusCode: 409, errorCode: "CONSENT_REVOKED" });
  }

  const session = [...sessions.values()].find((item) =>
    item.organizationId === organizationId && item.senderId === senderId && item.status === "CONNECTED" && item.socket,
  );
  if (!session?.socket) throw Object.assign(new Error("Sender has no active connected QR session."), { statusCode: 409, errorCode: "SENDER_NOT_CONNECTED" });

  const jid = `${recipient.slice(1)}@s.whatsapp.net`;
  const sent = await session.socket.sendMessage(jid, { text: messageBody });
  const providerMessageId = sent?.key?.id;
  if (!providerMessageId) throw Object.assign(new Error("Messaging runtime did not return a provider message identifier."), { statusCode: 502, errorCode: "TEMPORARY_PROVIDER_ERROR" });

  const persisted = await prisma.message.updateMany({
    where: { id: message.id, status: "QUEUED", lockToken, providerMessageId: null },
    data: { providerMessageId },
  });
  if (persisted.count === 0) {
    const latest = await prisma.message.findUnique({ where: { id: message.id }, select: { providerMessageId: true } });
    if (!latest?.providerMessageId) throw Object.assign(new Error("Message was sent but its provider reference could not be persisted."), { statusCode: 503, errorCode: "TEMPORARY_PROVIDER_ERROR" });
    return { accepted: true, providerMessageId: latest.providerMessageId, state: "SUBMITTED" };
  }

  const pendingReceipt = await prisma.qrDeliveryReceipt.findUnique({
    where: { organizationId_senderId_providerMessageId: { organizationId, senderId, providerMessageId } },
    select: { status: true, appliedAt: true },
  });
  if (pendingReceipt && !pendingReceipt.appliedAt) {
    await persistDeliveryUpdate(organizationId, senderId, providerMessageId, pendingReceipt.status);
  }

  session.lastSeenAt = new Date().toISOString();
  void persistStatus(session).catch(() => undefined);
  return { accepted: true, providerMessageId, state: "SUBMITTED" };
}

async function handler(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url || "/", "http://localhost");
  if (url.pathname === "/healthz" && request.method === "GET") return send(response, 200, { ok: true, service: "nextwave-qr-runtime" });
  if (url.pathname === "/readyz" && request.method === "GET") {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return send(response, 200, { ready: true });
    } catch {
      return send(response, 503, { ready: false });
    }
  }
  if (!isAuthorized(request)) return send(response, 401, { error: "Unauthorized." });

  try {
    if (url.pathname === "/v1/messages" && request.method === "POST") {
      const result = await sendMessage(await readBody(request));
      return send(response, 200, result);
    }

    if (url.pathname === "/v1/sessions" && request.method === "POST") {
      const result = await createSession(await readBody(request));
      return send(response, 201, result);
    }

    const match = url.pathname.match(/^\/v1\/sessions\/([^/]+)$/);
    if (match && request.method === "GET") {
      const organizationId = url.searchParams.get("organizationId") || "";
      if (!organizationId) return send(response, 400, { error: "organizationId query parameter is required." });
      return send(response, 200, await getSession(decodeURIComponent(match[1]), organizationId));
    }
    if (match && request.method === "DELETE") {
      const body = await readBody(request);
      const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
      if (!organizationId) return send(response, 400, { error: "organizationId is required in the request body." });
      await revokeSession(decodeURIComponent(match[1]), organizationId);
      return send(response, 204);
    }
    return send(response, 404, { error: "Route not found." });
  } catch (error) {
    const status = error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;
    if (status >= 500) logger.error({ error }, "QR runtime request failed");
    const errorCode = error && typeof error === "object" && "errorCode" in error && typeof error.errorCode === "string" ? error.errorCode : undefined;
    return send(response, status, { error: status >= 500 ? "QR runtime request failed." : error instanceof Error ? error.message : "Invalid request.", errorCode });
  }
}

async function main() {
  assertConfiguration();
  await restoreSessions();
  const server = createServer((request, response) => { void handler(request, response); });
  server.listen(PORT, "0.0.0.0", () => logger.info({ port: PORT }, "NextWave QR runtime listening"));
  const shutdown = async () => {
    server.close();
    for (const session of sessions.values()) {
      session.stopping = true;
      if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
      session.socket?.end(undefined);
    }
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch(async (error) => {
  logger.error({ error }, "QR runtime failed to start");
  await prisma.$disconnect();
  process.exit(1);
});
