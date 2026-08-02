import { basename, fromFileUrl, join } from "@std/path";

export type ExtensionEntry = {
  readonly directory: string;
  readonly id: string;
  readonly path: string;
  readonly version: string;
};

type ExtensionManifest = {
  readonly id?: unknown;
  readonly version?: unknown;
};

const repositoryRoot = fromFileUrl(new URL("../", import.meta.url));
const extensionsRoot = join(repositoryRoot, "extensions");
const operations = ["build", "check", "test", "validate"] as const;

type Operation = (typeof operations)[number];

export async function discoverExtensions(
  root = extensionsRoot,
): Promise<readonly ExtensionEntry[]> {
  const entries: ExtensionEntry[] = [];

  for await (const directory of Deno.readDir(root)) {
    if (!directory.isDirectory || directory.isSymlink) continue;

    const path = join(root, directory.name);
    const manifestPath = join(path, "extension-manifest.json");
    const configurationPath = join(path, "deno.json");
    const hasManifest = await isFile(manifestPath);
    const hasConfiguration = await isFile(configurationPath);

    if (!hasManifest && !hasConfiguration) continue;
    if (!hasManifest || !hasConfiguration) {
      throw new Error(
        `Extension directory '${directory.name}' must contain both extension-manifest.json and deno.json.`,
      );
    }

    const manifest = JSON.parse(
      await Deno.readTextFile(manifestPath),
    ) as ExtensionManifest;
    if (typeof manifest.id !== "string" || manifest.id.trim().length === 0) {
      throw new Error(`Extension '${directory.name}' has no valid id.`);
    }
    if (
      typeof manifest.version !== "string" ||
      manifest.version.trim().length === 0
    ) {
      throw new Error(`Extension '${directory.name}' has no valid version.`);
    }

    entries.push({
      directory: directory.name,
      id: manifest.id,
      path: `extensions/${directory.name}`,
      version: manifest.version,
    });
  }

  entries.sort((left, right) => left.directory.localeCompare(right.directory));
  assertUnique(entries, "id");
  return entries;
}

async function runOperation(
  operation: Operation,
  entries: readonly ExtensionEntry[],
): Promise<void> {
  for (const entry of entries) {
    console.log(`${operation}: ${entry.id}@${entry.version}`);
    const args = operation === "check" || operation === "test"
      ? ["task", "--cwd", entry.path, operation]
      : ["task", "extension", "--", operation, entry.path];
    const status = await new Deno.Command("deno", {
      args,
      cwd: repositoryRoot,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }).spawn().status;
    if (!status.success) {
      throw new Error(
        `${operation} failed for '${entry.id}' with exit code ${status.code}.`,
      );
    }
  }
}

function assertUnique(
  entries: readonly ExtensionEntry[],
  field: "id",
): void {
  const values = new Set<string>();
  for (const entry of entries) {
    if (values.has(entry[field])) {
      throw new Error(`Duplicate extension ${field} '${entry[field]}'.`);
    }
    values.add(entry[field]);
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await Deno.stat(path)).isFile;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

function usage(): never {
  const script = basename(fromFileUrl(import.meta.url));
  throw new Error(
    `Usage: ${script} <build|check|inventory|test|validate>`,
  );
}

if (import.meta.main) {
  const args = Deno.args[0] === "--" ? Deno.args.slice(1) : Deno.args;
  const command = args[0];
  if (args.length !== 1) usage();

  const entries = await discoverExtensions();
  if (command === "inventory") {
    console.log(`${JSON.stringify(entries, null, 2)}\n`);
  } else if ((operations as readonly string[]).includes(command)) {
    await runOperation(command as Operation, entries);
  } else {
    usage();
  }
}
