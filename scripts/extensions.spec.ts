import { test } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fs from "node:fs/promises";
import { assertEquals, assertRejects } from "./assert.ts";
import { discoverExtensions } from "./extensions.ts";

test("discovers extension projects generically and sorts them", async () => {
  const root = await fs.mkdtemp(join(tmpdir(), "edge-extensions-"));
  try {
    await writeExtension(root, "z-last", "integration.z-last", "1.2.3");
    await writeExtension(root, "a-first", "integration.a-first", "0.1.0");
    await fs.mkdir(`${root}/notes`);

    assertEquals(await discoverExtensions(root), [
      {
        directory: "a-first",
        id: "integration.a-first",
        path: "extensions/a-first",
        version: "0.1.0",
      },
      {
        directory: "z-last",
        id: "integration.z-last",
        path: "extensions/z-last",
        version: "1.2.3",
      },
    ]);
  } finally {
    await fs.rm(root, { recursive: true });
  }
});

test("rejects incomplete extension projects", async () => {
  const root = await fs.mkdtemp(join(tmpdir(), "edge-extensions-"));
  try {
    await fs.mkdir(`${root}/incomplete`);
    await fs.writeFile(`${root}/incomplete/package.json`, "{}\n");

    await assertRejects(
      () => discoverExtensions(root),
      Error,
      "must contain both extension-manifest.json and package.json",
    );
  } finally {
    await fs.rm(root, { recursive: true });
  }
});

test("rejects duplicate extension ids", async () => {
  const root = await fs.mkdtemp(join(tmpdir(), "edge-extensions-"));
  try {
    await writeExtension(root, "first", "integration.duplicate", "0.1.0");
    await writeExtension(root, "second", "integration.duplicate", "0.2.0");

    await assertRejects(
      () => discoverExtensions(root),
      Error,
      "Duplicate extension id 'integration.duplicate'",
    );
  } finally {
    await fs.rm(root, { recursive: true });
  }
});

async function writeExtension(
  root: string,
  directory: string,
  id: string,
  version: string,
): Promise<void> {
  const path = `${root}/${directory}`;
  await fs.mkdir(path);
  await fs.writeFile(`${path}/package.json`, "{}\n");
  await fs.writeFile(
    `${path}/extension-manifest.json`,
    `${JSON.stringify({ id, version })}\n`,
  );
}
