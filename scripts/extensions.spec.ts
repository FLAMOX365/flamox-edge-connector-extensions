import { assertEquals, assertRejects } from "@std/assert";
import { discoverExtensions } from "./extensions.ts";

Deno.test("discovers extension projects generically and sorts them", async () => {
  const root = await Deno.makeTempDir();
  try {
    await writeExtension(root, "z-last", "integration.z-last", "1.2.3");
    await writeExtension(root, "a-first", "integration.a-first", "0.1.0");
    await Deno.mkdir(`${root}/notes`);

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
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("rejects incomplete extension projects", async () => {
  const root = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${root}/incomplete`);
    await Deno.writeTextFile(`${root}/incomplete/deno.json`, "{}\n");

    await assertRejects(
      () => discoverExtensions(root),
      Error,
      "must contain both extension-manifest.json and deno.json",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("rejects duplicate extension ids", async () => {
  const root = await Deno.makeTempDir();
  try {
    await writeExtension(root, "first", "integration.duplicate", "0.1.0");
    await writeExtension(root, "second", "integration.duplicate", "0.2.0");

    await assertRejects(
      () => discoverExtensions(root),
      Error,
      "Duplicate extension id 'integration.duplicate'",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

async function writeExtension(
  root: string,
  directory: string,
  id: string,
  version: string,
): Promise<void> {
  const path = `${root}/${directory}`;
  await Deno.mkdir(path);
  await Deno.writeTextFile(`${path}/deno.json`, "{}\n");
  await Deno.writeTextFile(
    `${path}/extension-manifest.json`,
    `${JSON.stringify({ id, version })}\n`,
  );
}
