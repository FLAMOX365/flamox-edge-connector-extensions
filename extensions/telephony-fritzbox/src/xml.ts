import { SaxesParser } from "saxes";

type XmlNode =
  | XmlElement
  | { readonly type: "text" | "cdata"; readonly text: string };
export type XmlElement = {
  readonly type: "element";
  readonly name: { readonly local: string };
  readonly children: XmlNode[];
};
type XmlSource = string | XmlElement;

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function elementText(
  source: XmlSource,
  name: string,
): string | undefined {
  const element = elements(source, name)[0];
  if (element === undefined) return undefined;
  const value = collectText(element).trim();
  return value.length > 0 ? value : "";
}

export function elements(
  source: XmlSource,
  name: string,
): readonly XmlElement[] {
  const root = typeof source === "string" ? parseRoot(source) : source;
  const matches: XmlElement[] = [];
  visit(root, (element) => {
    if (element.name.local === name) matches.push(element);
  });
  return matches;
}

export function soapFault(source: XmlSource):
  | {
      readonly code: string;
      readonly description: string;
    }
  | undefined {
  const code =
    elementText(source, "errorCode") ?? elementText(source, "faultcode");
  const description =
    elementText(source, "errorDescription") ??
    elementText(source, "faultstring");
  if (!code && !description) return undefined;
  return {
    code: code ?? "unknown",
    description: description ?? "Unknown SOAP fault",
  };
}

function visit(
  element: XmlElement,
  callback: (value: XmlElement) => void,
): void {
  callback(element);
  for (const child of element.children) {
    if (child.type === "element") visit(child, callback);
  }
}

function collectText(node: XmlNode): string {
  if (node.type === "text" || node.type === "cdata") return node.text;
  if (node.type !== "element") return "";
  return node.children.map(collectText).join("");
}

function parseRoot(source: string): XmlElement {
  const parser = new SaxesParser({ xmlns: true });
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  parser.on("doctype", () => {
    throw new Error("DOCTYPE is disallowed.");
  });
  parser.on("opentag", (tag) => {
    const element: XmlElement = {
      type: "element",
      name: { local: tag.local },
      children: [],
    };
    if (stack.length) stack[stack.length - 1]!.children.push(element);
    else root = element;
    stack.push(element);
  });
  parser.on("closetag", () => {
    stack.pop();
  });
  parser.on("text", (text) => {
    stack[stack.length - 1]?.children.push({ type: "text", text });
  });
  parser.on("cdata", (text) => {
    stack[stack.length - 1]?.children.push({ type: "cdata", text });
  });
  parser.write(source).close();
  if (!root) throw new Error("XML document has no root element.");
  return root;
}
