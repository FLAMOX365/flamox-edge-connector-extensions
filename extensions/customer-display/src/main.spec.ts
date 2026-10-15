import { test } from "node:test";
import { assertEquals } from "../../../scripts/assert.ts";
import { createExtension } from "./main.ts";

const context = {
  requestId: "test",
  configuration: {
    displayUrl: "https://display.internal.example/api/presentation",
  },
  secrets: { DISPLAY_TOKEN: "token" },
  host: {
    ui: { showMessage: () => Promise.resolve({ displayed: true as const }) },
  },
};

test("show replaces the presentation on the fixed receiver", async () => {
  const requests: Request[] = [];
  const extension = createExtension((input, init) => {
    requests.push(new Request(input, init));
    return Promise.resolve(Response.json({ revision: 3 }));
  });
  const result = await extension.actions.show(context, {
    presentationId: "offer-42",
    headline: "Your offer",
    lines: ["Heat pump", "Installation included"],
  });
  assertEquals(result, {
    displayed: true,
    status: 200,
    response: { revision: 3 },
  });
  assertEquals(requests[0]?.method, "PUT");
  assertEquals(
    requests[0]?.url,
    "https://display.internal.example/api/presentation",
  );
  assertEquals(requests[0]?.headers.get("authorization"), "Bearer token");
});
