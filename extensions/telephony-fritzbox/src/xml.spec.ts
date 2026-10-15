import { test } from "node:test";
import assert from "node:assert/strict";
import { elements, elementText, escapeXml, soapFault } from "./xml.ts";

test("XML migration preserves local names, mixed content, entities, CDATA and empty values", () => {
  const xml =
    '<s:Envelope xmlns:s="urn:soap"><s:Body><u:Call xmlns:u="urn:device"><u:Name> Müller &amp; <![CDATA[<Söhne>]]><b> GmbH</b> </u:Name><u:Empty/><u:Item>one</u:Item><u:Item>two</u:Item></u:Call></s:Body></s:Envelope>';
  assert.equal(elementText(xml, "Name"), "Müller & <Söhne> GmbH");
  assert.equal(elementText(xml, "Empty"), "");
  assert.equal(elementText(xml, "Missing"), undefined);
  assert.equal(elements(xml, "Item").length, 2);
  assert.equal(elementText(elements(xml, "Call")[0]!, "Item"), "one");
  assert.equal(
    elementText(`<root><value>${escapeXml("&<>\"'")}</value></root>`, "value"),
    "&<>\"'",
  );
});
for (const xml of [
  '<!DOCTYPE root SYSTEM "file:///etc/passwd"><root/>',
  '<!DOCTYPE root [<!ENTITY leak "secret">]><root>&leak;</root>',
  "<root><broken></root>",
  "<root>&unknown;</root>",
  "<root/><second/>",
  "<p:root/>",
]) {
  test(`XML rejects unsafe or malformed documents: ${xml}`, () => {
    assert.throws(() => elements(xml, "root"));
  });
}
test("SOAP faults survive both device and standard namespace forms", () => {
  assert.deepEqual(
    soapFault(
      '<s:Fault xmlns:s="urn:soap"><faultcode>s:Client</faultcode><faultstring>Denied &amp; blocked</faultstring></s:Fault>',
    ),
    { code: "s:Client", description: "Denied & blocked" },
  );
  assert.deepEqual(
    soapFault(
      "<root><errorCode>401</errorCode><errorDescription>Invalid credentials</errorDescription></root>",
    ),
    { code: "401", description: "Invalid credentials" },
  );
  assert.equal(soapFault("<root><result>ok</result></root>"), undefined);
});
