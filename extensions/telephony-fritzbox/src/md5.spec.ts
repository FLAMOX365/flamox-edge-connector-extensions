import { test } from "node:test";
import { assertEquals } from "../../../scripts/assert.ts";
import { md5 } from "./md5.ts";

test("MD5 matches published test vectors", () => {
  assertEquals(md5(""), "d41d8cd98f00b204e9800998ecf8427e");
  assertEquals(md5("abc"), "900150983cd24fb0d6963f7d28e17f72");
  assertEquals(md5("message digest"), "f96b697d7cb7938d525a2f31aaf161d0");
});

test("MD5 hashes UTF-8 input", () => {
  assertEquals(md5("Grüße"), "49c5f675b49037b6044b803ac9d1a6d7");
});
