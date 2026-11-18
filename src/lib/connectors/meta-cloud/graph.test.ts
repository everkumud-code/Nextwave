import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

let server: http.Server;
const seen: { method: string; url: string; auth: string | undefined; body: string }[] = [];

before(async () => {
  server = http.createServer((request, response) => {
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      seen.push({ method: request.method ?? "", url: request.url ?? "", auth: request.headers.authorization, body });
      const send = (status: number, json: unknown) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(json)); };
      const url = request.url ?? "";
      if (request.headers.authorization !== "Bearer good-token") return send(401, { error: { message: "Invalid OAuth access token.", code: 190 } });
      if (url.startsWith("/v21.0/111?")) return send(200, { id: "111", display_phone_number: "+91 98765 43210", verified_name: "Acme", quality_rating: "GREEN" });
      if (url.startsWith("/v21.0/222/message_templates") && !url.includes("after=")) {
        return send(200, { data: [
          { name: "offer", language: "en", status: "APPROVED", category: "MARKETING", components: [{ type: "BODY", text: "Hi {{1}}, {{2}} is on sale" }] },
          { name: "draft", language: "en", status: "PENDING", components: [{ type: "BODY", text: "x" }] },
        ], paging: { next: `http://x/v21.0/222/message_templates?after=abc&limit=100` } });
      }
      if (url.startsWith("/v21.0/222/message_templates")) {
        return send(200, { data: [{ name: "photo", language: "hi", status: "APPROVED", components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Namaste" }] }] });
      }
      if (url === "/v21.0/111/messages" && request.method === "POST") {
        const parsed = JSON.parse(body);
        if (parsed.to === "919999999999") return send(400, { error: { message: "Message undeliverable", code: 131026 } });
        if (parsed.to === "918888888888") return send(500, { error: { message: "Server hiccup", code: 2 } });
        return send(200, { messages: [{ id: "wamid.TEST" }] });
      }
      send(404, { error: { message: "no such path", code: 100 } });
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  process.env.META_GRAPH_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server.close(); });

test("the phone number is read with the token, and a bad token is refused", async () => {
  const { getPhoneInfo, GraphRequestError, mapGraphError } = await import("./graph");
  const info = await getPhoneInfo("good-token", "111");
  assert.deepEqual(info, { id: "111", displayPhoneNumber: "+91 98765 43210", verifiedName: "Acme", qualityRating: "GREEN" });
  await assert.rejects(() => getPhoneInfo("bad", "111"), (error: unknown) => error instanceof GraphRequestError && mapGraphError(error.detail).errorCode === "AUTHENTICATION_FAILED");
});

test("only approved templates are listed, over every page, with their variable counts", async () => {
  const { listApprovedTemplates } = await import("./graph");
  const list = await listApprovedTemplates("good-token", "222");
  assert.deepEqual(list.map(t => [t.name, t.language, t.bodyVariableCount, t.hasHeaderMedia]), [["offer", "en", 2, false], ["photo", "hi", 0, true]]);
});

test("a template is sent with its body variables and Meta's message id comes back", async () => {
  const { sendTemplateMessage } = await import("./graph");
  seen.length = 0;
  const id = await sendTemplateMessage("good-token", "111", "919876543210", { name: "offer", language: "en", params: ["Asha", "Atta"] });
  assert.equal(id, "wamid.TEST");
  const sent = JSON.parse(seen[0].body);
  assert.equal(sent.messaging_product, "whatsapp");
  assert.equal(sent.to, "919876543210");
  assert.equal(sent.type, "template");
  assert.deepEqual(sent.template, { name: "offer", language: { code: "en" }, components: [{ type: "body", parameters: [{ type: "text", text: "Asha" }, { type: "text", text: "Atta" }] }] });
});

test("Meta's errors become our codes, which decide if a message is tried again", async () => {
  const { sendTemplateMessage, GraphRequestError, mapGraphError } = await import("./graph");
  const failure = async (to: string) => { try { await sendTemplateMessage("good-token", "111", to, { name: "offer", language: "en", params: [] }); } catch (error) { if (error instanceof GraphRequestError) return mapGraphError(error.detail); } return null; };
  assert.equal((await failure("919999999999"))?.errorCode, "INVALID_RECIPIENT");
  assert.equal((await failure("918888888888"))?.errorCode, "TEMPORARY_PROVIDER_ERROR");
  assert.equal(mapGraphError({ httpStatus: 400, code: 130429, subcode: null, message: "rate" }).errorCode, "RATE_LIMITED");
  assert.equal(mapGraphError({ httpStatus: 400, code: 132000, subcode: null, message: "param mismatch" }).errorCode, "INVALID_MESSAGE");
  assert.equal(mapGraphError({ httpStatus: 0, code: null, subcode: null, message: "ECONNRESET" }).errorCode, "TEMPORARY_PROVIDER_ERROR");
});
