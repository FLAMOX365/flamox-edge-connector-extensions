import { test } from "node:test";
import { assertEquals } from "../../../scripts/assert.ts";
import { createExtension } from "./main.ts";

const context = {
  requestId: "test",
  configuration: {
    printerUrl: "http://printer.internal.example:631/ipp/print",
    requestingUserName: "sales",
  },
  secrets: { PRINTER_USERNAME: "printer", PRINTER_PASSWORD: "secret" },
  host: {
    ui: { showMessage: () => Promise.resolve({ displayed: true as const }) },
  },
};

test("print submits an IPP Print-Job and returns the printer job id", async () => {
  const requests: Request[] = [];
  const response = new Uint8Array([
    0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x21, 0x00, 0x06,
    0x6a, 0x6f, 0x62, 0x2d, 0x69, 0x64, 0x00, 0x04, 0x00, 0x00, 0x00, 0x2a,
    0x03,
  ]);
  const extension = createExtension((input, init) => {
    requests.push(new Request(input, init));
    return Promise.resolve(new Response(response, { status: 200 }));
  });
  const result = await extension.actions.print(context, {
    jobName: "Offer 42",
    documentFormat: "application/pdf",
    documentBase64: btoa("PDF"),
  });
  assertEquals(result, { accepted: true, ippStatus: 0, jobId: 42 });
  const body = new Uint8Array(await requests[0]!.arrayBuffer());
  assertEquals([...body.slice(0, 4)], [0x02, 0x00, 0x00, 0x02]);
  assertEquals(new TextDecoder().decode(body.slice(-3)), "PDF");
});
