import { assertEquals, assertRejects } from "@std/assert";
import { createExtension } from "./main.ts";
import type { SqlExecutor } from "./sql.ts";

const context = {
  requestId: "test",
  configuration: {
    serverAddress: "sqlserver.internal.example:1433",
    database: "ERP",
    queriesJson: JSON.stringify({
      products: {
        sql: "SELECT sku, title FROM products WHERE sku = @sku",
        parameters: { sku: "NVarChar" },
      },
    }),
    maximumRows: 100,
  },
  secrets: { SQL_USERNAME: "reader", SQL_PASSWORD: "secret" },
  host: {
    ui: { showMessage: () => Promise.resolve({ displayed: true as const }) },
  },
};

Deno.test("query executes only a named configured SELECT", async () => {
  const calls: unknown[] = [];
  const executor: SqlExecutor = (settings, sql, parameters) => {
    calls.push({ settings, sql, parameters });
    return Promise.resolve({
      rows: [{ sku: "A-1", title: "Pump" }],
      rowCount: 1,
    });
  };
  const result = await createExtension(executor).actions.query(context, {
    queryName: "products",
    parameters: { sku: "A-1" },
  });
  assertEquals(result, {
    queryName: "products",
    rowCount: 1,
    rows: [{ sku: "A-1", title: "Pump" }],
  });
  assertEquals(calls.length, 1);
});

Deno.test("query rejects a configured modifying statement before connecting", async () => {
  const executor: SqlExecutor = () =>
    Promise.reject(new Error("must not connect"));
  const invalid = {
    ...context,
    configuration: {
      ...context.configuration,
      queriesJson: JSON.stringify({
        unsafe: { sql: "DELETE FROM products", parameters: {} },
      }),
    },
  };
  await assertRejects(
    () =>
      createExtension(executor).actions.query(invalid, {
        queryName: "unsafe",
        parameters: {},
      }),
    Error,
    "read-only",
  );
});

Deno.test("query rejects SELECT INTO and sequence side effects", async () => {
  const executor: SqlExecutor = () =>
    Promise.reject(new Error("must not connect"));
  for (
    const sql of [
      "SELECT * INTO copied_products FROM products",
      "SELECT NEXT VALUE FOR order_sequence",
    ]
  ) {
    const invalid = {
      ...context,
      configuration: {
        ...context.configuration,
        queriesJson: JSON.stringify({
          unsafe: { sql, parameters: {} },
        }),
      },
    };
    await assertRejects(
      () =>
        createExtension(executor).actions.query(invalid, {
          queryName: "unsafe",
          parameters: {},
        }),
      Error,
      "read-only",
    );
  }
});
