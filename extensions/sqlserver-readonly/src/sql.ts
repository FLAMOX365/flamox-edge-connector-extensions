import process from "node:process";
import type { JsonValue } from "../../../shared/json.ts";

export type SqlParameterType = "Bit" | "Float" | "Int" | "NVarChar";

export type SqlConnectionSettings = {
  readonly server: string;
  readonly port: number;
  readonly database: string;
  readonly username: string;
  readonly password: string;
  readonly encrypt: boolean;
  readonly trustServerCertificate: boolean;
  readonly timeoutMilliseconds: number;
  readonly maximumRows: number;
};

export type SqlParameter = {
  readonly type: SqlParameterType;
  readonly value: JsonValue;
};

export type SqlExecutor = (
  settings: SqlConnectionSettings,
  statement: string,
  parameters: Readonly<Record<string, SqlParameter>>,
) => Promise<
  {
    readonly rows: readonly Record<string, JsonValue>[];
    readonly rowCount: number;
  }
>;

export const executeSql: SqlExecutor = async (
  settings,
  statement,
  parameters,
) => {
  const { Connection, Request, TYPES } = await loadDriver();
  const connection = new Connection({
    server: settings.server,
    authentication: {
      type: "default",
      options: { userName: settings.username, password: settings.password },
    },
    options: {
      port: settings.port,
      database: settings.database,
      encrypt: settings.encrypt,
      trustServerCertificate: settings.trustServerCertificate,
      readOnlyIntent: true,
      connectTimeout: settings.timeoutMilliseconds,
      requestTimeout: settings.timeoutMilliseconds,
    },
  });
  await new Promise<void>((resolve, reject) => {
    connection.connect((error) => error ? reject(error) : resolve());
  });
  try {
    return await new Promise((resolve, reject) => {
      const rows: Record<string, JsonValue>[] = [];
      const request = new Request(statement, (error, rowCount) => {
        if (error) reject(error);
        else resolve({ rows, rowCount: rowCount ?? rows.length });
      });
      request.on("row", (columns) => {
        if (rows.length >= settings.maximumRows) {
          request.cancel();
          reject(
            new Error(
              `SQL query exceeded the configured ${settings.maximumRows} row limit.`,
            ),
          );
          return;
        }
        const row: Record<string, JsonValue> = {};
        for (const column of columns) {
          row[column.metadata.colName] = jsonValue(column.value);
        }
        rows.push(row);
      });
      for (const [name, parameter] of Object.entries(parameters)) {
        const type = parameter.type === "Bit"
          ? TYPES.Bit
          : parameter.type === "Float"
          ? TYPES.Float
          : parameter.type === "Int"
          ? TYPES.Int
          : TYPES.NVarChar;
        request.addParameter(name, type, parameter.value);
      }
      connection.execSql(request);
    });
  } finally {
    connection.close();
  }
};

async function loadDriver(): Promise<typeof import("tedious")> {
  Object.defineProperty(process, "env", {
    value: Object.freeze(Object.create(null)),
    configurable: true,
  });
  return await import("tedious");
}

function jsonValue(value: unknown): JsonValue {
  if (
    value === null || typeof value === "string" || typeof value === "boolean" ||
    typeof value === "number"
  ) return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) {
    let binary = "";
    for (const byte of value) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  return String(value);
}
