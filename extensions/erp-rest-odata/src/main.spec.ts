import { test } from "node:test";
import { assertEquals, assertRejects } from "../../../scripts/assert.ts";
import { createExtension } from "./main.ts";

const context = {
  requestId: "test",
  configuration: {
    baseUrl: "https://erp.internal.example",
    productsPath: "odata/Products",
    availabilityPath: "api/availability",
    ordersPath: "api/orders",
  },
  secrets: { ERP_API_TOKEN: "token" },
  host: {
    ui: { showMessage: () => Promise.resolve({ displayed: true as const }) },
  },
};

test("list-products calls only the configured product route", async () => {
  const requests: Request[] = [];
  const extension = createExtension((input, init) => {
    requests.push(new Request(input, init));
    return Promise.resolve(Response.json({ value: [{ sku: "A-1" }] }));
  });
  const result = await extension.actions["list-products"](context, {
    search: "pump",
    maximumRecords: 25,
  });
  assertEquals(result, { data: { value: [{ sku: "A-1" }] } });
  assertEquals(
    requests[0]?.url,
    "https://erp.internal.example/odata/Products?%24search=pump&%24top=25",
  );
  assertEquals(requests[0]?.headers.get("authorization"), "Bearer token");
});

test("submit-order surfaces an upstream rejection", async () => {
  const extension = createExtension(() =>
    Promise.resolve(Response.json({ error: "duplicate" }, { status: 409 })),
  );
  await assertRejects(
    () =>
      extension.actions["submit-order"](context, {
        idempotencyKey: "order-42",
        order: { number: "42" },
      }),
    Error,
    "409",
  );
});
