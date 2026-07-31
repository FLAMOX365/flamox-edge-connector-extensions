import { parse, type XmlNode } from "@std/xml";

export type XmlElement = Extract<XmlNode, { readonly type: "element" }>;
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
  const root = typeof source === "string"
    ? parse(source, {
      disallowDoctype: true,
      trackPosition: false,
    }).root
    : source;
  const matches: XmlElement[] = [];
  visit(root, (element) => {
    if (element.name.local === name) matches.push(element);
  });
  return matches;
}

export function soapFault(source: XmlSource): {
  readonly code: string;
  readonly description: string;
} | undefined {
  const code = elementText(source, "errorCode") ??
    elementText(source, "faultcode");
  const description = elementText(source, "errorDescription") ??
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
