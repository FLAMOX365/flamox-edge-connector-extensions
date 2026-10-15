import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Tr064Client, VOIP_SERVICE, type ClientOptions } from "./tr064.ts";

const description = `<root><device><modelName>Müller &amp; Söhne</modelName><service><serviceType>${VOIP_SERVICE}</serviceType><controlURL>/voip</controlURL></service></device></root>`;
const challenge =
  "<root><Challenge><Nonce>nonce-1</Nonce><Realm>fixture realm</Realm></Challenge></root>";
function client(fetcher: ClientOptions["fetch"]) {
  return new Tr064Client({
    baseUrl: new URL("http://fritz.box:49000"),
    username: "user",
    password: "fixture-password",
    timeoutMilliseconds: 1_000,
    fetch: fetcher,
  });
}
const xml = (body: string, status = 200) => new Response(body, { status });

test("TR-064 shares discovery between concurrent calls and preserves namespaced device data", async () => {
  let reads = 0;
  const device = client(async (_url, init) => {
    reads++;
    assert.equal(init?.redirect, "error");
    return xml(description);
  });
  const [one, two] = await Promise.all([device.describe(), device.describe()]);
  assert.equal(reads, 1);
  assert.equal(one, two);
  assert.equal(one.modelName, "Müller & Söhne");
  assert.equal(
    one.services.get(VOIP_SERVICE)!.controlUrl.href,
    "http://fritz.box:49000/voip",
  );
});
test("TR-064 refuses cross-origin control URLs before sending device credentials", async () => {
  const requests: string[] = [];
  const device = client(async (input) => {
    requests.push(String(input));
    return xml(
      description.replace("/voip", "http://untrusted.invalid:49000/voip"),
    );
  });
  await assert.rejects(
    () => device.invoke(VOIP_SERVICE, "Dial"),
    /outside the configured device/,
  );
  assert.deepEqual(requests, ["http://fritz.box:49000/tr64desc.xml"]);
});
test("TR-064 computes SOAP digest authentication, escapes arguments and consumes the next challenge", async () => {
  const bodies: string[] = [];
  const device = client(async (input, init) => {
    if (String(input).endsWith("tr64desc.xml")) return xml(description);
    const body = String(init?.body);
    bodies.push(body);
    assert.equal(init?.redirect, "error");
    if (bodies.length === 1) return xml(challenge, 500);
    return xml(
      "<root><NextChallenge><Nonce>nonce-2</Nonce><Realm>fixture realm</Realm></NextChallenge><result>ok</result></root>",
    );
  });
  await device.invoke(VOIP_SERVICE, "Dial", { Number: '<42>&"' });
  await device.invoke(VOIP_SERVICE, "Status");
  const md5 = (text: string) => createHash("md5").update(text).digest("hex");
  assert.ok(
    bodies[1]!.includes(
      `<Auth>${md5(`${md5("user:fixture realm:fixture-password")}:nonce-1`)}</Auth>`,
    ),
  );
  assert.ok(bodies[1]!.includes("<Number>&lt;42&gt;&amp;&quot;</Number>"));
  assert.ok(bodies[2]!.includes("<Nonce>nonce-2</Nonce>"));
  assert.equal(
    bodies.some((body) => body.includes("fixture-password")),
    false,
  );
  assert.equal(bodies.length, 3);
});
test("TR-064 bounds authentication retries and returns the SOAP fault without a private body", async () => {
  let posts = 0;
  const device = client(async (input) => {
    if (String(input).endsWith("tr64desc.xml")) return xml(description);
    posts++;
    return posts === 1
      ? xml(challenge, 500)
      : xml(
          "<root><errorCode>401</errorCode><errorDescription>Unauthorized</errorDescription><secret>fixture-password</secret></root>",
          500,
        );
  });
  await assert.rejects(
    () => device.invoke(VOIP_SERVICE, "Dial"),
    (error) =>
      error instanceof Error &&
      error.message === "TR-064 action 'Dial' failed (401: Unauthorized).",
  );
  assert.equal(posts, 2);
});
test("TR-064 reports a missing service without posting an action", async () => {
  let reads = 0;
  const device = client(async () => {
    reads++;
    return xml("<root/>");
  });
  await assert.rejects(
    () => device.invoke(VOIP_SERVICE, "Dial"),
    /does not expose required service/,
  );
  assert.equal(reads, 1);
});
for (const declared of [true, false]) {
  test(`TR-064 cancels an oversized ${declared ? "declared" : "streamed"} discovery response`, async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024 + 1));
      },
      cancel() {
        cancelled = true;
      },
    });
    const device = client(
      async () =>
        new Response(stream, {
          headers: declared
            ? { "content-length": String(1024 * 1024 + 1) }
            : {},
        }),
    );
    await assert.rejects(() => device.describe(), /exceeds the permitted size/);
    assert.equal(cancelled, true);
  });
}
test("TR-064 call-list URLs stay on the configured origin and preserve cursor parameters", async () => {
  const targets: string[] = [];
  const device = client(async (input, init) => {
    targets.push(String(input));
    assert.equal(init?.redirect, "error");
    return xml("<root/>");
  });
  await device.downloadCallList(
    "http://untrusted.invalid:49000/calls?sid=fixture",
    { days: 30, max: 25, id: 7, timestamp: 101 },
  );
  const target = new URL(targets[0]!);
  assert.equal(target.origin, "http://fritz.box:49000");
  assert.equal(target.searchParams.get("id"), "7");
  assert.equal(target.searchParams.get("timestamp"), "101");
  assert.equal(target.searchParams.get("sid"), "fixture");
  await assert.rejects(
    () => device.downloadCallList("file:///etc/passwd", { days: 1, max: 1 }),
    /unsupported/,
  );
  assert.equal(targets.length, 1);
});
