import { test } from "node:test";
import { assertEquals } from "../../../scripts/assert.ts";
import extension from "./main.ts";

test("show-message delegates to the authorized host", async () => {
  const shown: unknown[] = [];
  const result = await extension.actions["show-message"](
    {
      requestId: "test",
      configuration: {},
      secrets: {},
      host: {
        ui: {
          showMessage: (request) => {
            shown.push(request);
            return Promise.resolve({ displayed: true as const });
          },
        },
      },
    },
    {
      title: "Hello",
      message: "World",
      kind: "info",
    },
  );
  assertEquals(shown, [{ title: "Hello", message: "World", kind: "info" }]);
  assertEquals(result, { displayed: true });
});
