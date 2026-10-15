import { defineExtension, type JsonValue } from "@edge-connector/sdk";

export function parseMessage(
  input: JsonValue,
  defaultTitle?: JsonValue,
): {
  title: string;
  message: string;
  kind: "info" | "warning" | "error";
} {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    (input.title !== undefined && typeof input.title !== "string") ||
    typeof input.message !== "string" ||
    (input.kind !== undefined &&
      input.kind !== "info" &&
      input.kind !== "warning" &&
      input.kind !== "error")
  ) {
    throw new Error("Input must contain message and optional title and kind.");
  }
  return {
    title:
      input.title ??
      (typeof defaultTitle === "string"
        ? defaultTitle
        : "Hello from the Edge Connector"),
    message: input.message,
    kind: input.kind ?? "info",
  };
}

export default defineExtension({
  actions: {
    "show-message": async ({ host, configuration }, input) => {
      const result = await host.ui.showMessage(
        parseMessage(input, configuration.defaultTitle),
      );
      return { displayed: result.displayed };
    },
  },
});
