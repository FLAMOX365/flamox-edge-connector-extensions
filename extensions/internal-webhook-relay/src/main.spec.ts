import { assertEquals, assertRejects } from "@std/assert";
import { createExtension } from "./main.ts";

const context = {
  requestId: "test",
  configuration: {
    endpointUrl: "https://events.internal.example/webhooks",
    requestTimeoutSeconds: 5,
  },
  secrets: { WEBHOOK_TOKEN: "secret" },
  host: {
    ui: { showMessage: () => Promise.resolve({ displayed: true as const }) },
  },
};

Deno.test("deliver forwards one event with the configured credential", async () => {
  const requests: Request[] = [];
  const extension = createExtension((input, init) => {
    requests.push(new Request(input, init));
    return Promise.resolve(Response.json({ received: true }, { status: 202 }));
  });
  const result = await extension.actions.deliver(context, {
    event: "order.created",
    eventId: "evt-1",
    occurredAt: "2026-08-01T12:00:00.000Z",
    payload: { orderId: "42" },
  });
  assertEquals(result, {
    accepted: true,
    status: 202,
    response: { received: true },
  });
  assertEquals(requests[0]?.headers.get("authorization"), "Bearer secret");
  assertEquals(requests[0]?.headers.get("x-edge-event"), "order.created");
});

Deno.test("deliver rejects a receiver error", async () => {
  const extension = createExtension(() =>
    Promise.resolve(new Response(null, { status: 503 }))
  );
  await assertRejects(
    () =>
      extension.actions.deliver(context, {
        event: "order.created",
        eventId: "evt-1",
        occurredAt: "2026-08-01T12:00:00.000Z",
        payload: {},
      }),
    Error,
    "503",
  );
});
