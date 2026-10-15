import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs/promises";
import { basename, join } from "node:path";

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

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const extensionsRoot = join(repositoryRoot, "extensions");
const operations = ["build", "check", "test", "validate"] as const;

type Operation = (typeof operations)[number];

export async function discoverExtensions(
  root = extensionsRoot,
): Promise<readonly ExtensionEntry[]> {
  const entries: ExtensionEntry[] = [];

  for await (const directory of await fs.readdir(root, {
    withFileTypes: true,
  })) {
    if (!directory.isDirectory() || directory.isSymbolicLink()) continue;

    const path = join(root, directory.name);
    const manifestPath = join(path, "extension-manifest.json");
    const configurationPath = join(path, "package.json");
    const hasManifest = await isFile(manifestPath);
    const hasConfiguration = await isFile(configurationPath);

    if (!hasManifest && !hasConfiguration) continue;
    if (!hasManifest || !hasConfiguration) {
      throw new Error(
        `Extension directory '${directory.name}' must contain both extension-manifest.json and package.json.`,
      );
    }

    const manifest = JSON.parse(
      await fs.readFile(manifestPath, "utf8"),
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
    const isTask = operation === "check" || operation === "test";
    const executable = isTask ? "yarn" : process.execPath;
    const args = isTask
      ? ["--cwd", entry.path, "run", operation]
      : [
          "--import",
          fileURLToPath(import.meta.resolve("tsx")),
          join(repositoryRoot, "dependencies/edge-connector/cli/main.ts"),
          operation,
          entry.path,
        ];
    const status = await new Promise<{ success: boolean; code: number }>(
      (resolve, reject) => {
        const child = spawn(executable, args, {
          cwd: repositoryRoot,
          stdio: "inherit",
        });
        child.once("error", reject);
        child.once("exit", (code) =>
          resolve({ success: code === 0, code: code ?? 1 }),
        );
      },
    );
    if (!status.success) {
      throw new Error(
        `${operation} failed for '${entry.id}' with exit code ${status.code}.`,
      );
    }
  }
}

function assertUnique(entries: readonly ExtensionEntry[], field: "id"): void {
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
    return (await fs.stat(path)).isFile();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return false;
    throw error;
  }
}

function usage(): never {
  const script = basename(fileURLToPath(import.meta.url));
  throw new Error(`Usage: ${script} <build|check|inventory|test|validate>`);
}

if (import.meta.main) {
  const args =
    process.argv.slice(2)[0] === "--"
      ? process.argv.slice(2).slice(1)
      : process.argv.slice(2);
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
