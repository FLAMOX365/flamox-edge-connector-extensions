import { defineExtension, type JsonValue } from "@edge-connector/sdk";
import {
  booleanValue,
  integerValue,
  objectValue,
  stringValue,
} from "../../../shared/json.ts";
import {
  executeSql,
  type SqlConnectionSettings,
  type SqlExecutor,
  type SqlParameterType,
} from "./sql.ts";

type QueryDefinition = {
  readonly sql: string;
  readonly parameters: Readonly<Record<string, SqlParameterType>>;
};

export function createExtension(executor: SqlExecutor = executeSql) {
  return defineExtension({
    actions: {
      health: async (context) => {
        try {
          const configuration = parseConfiguration(
            context.configuration,
            context.secrets,
          );
          await executor(configuration.connection, "SELECT 1 AS value", {});
          return { healthy: true, message: null };
        } catch (error) {
          return {
            healthy: false,
            message:
              error instanceof Error
                ? error.message
                : "SQL Server is unavailable.",
          };
        }
      },
      query: async (context, input) => {
        const configuration = parseConfiguration(
          context.configuration,
          context.secrets,
        );
        const value = objectValue(input, "Query input");
        const queryName = stringValue(value.queryName, "Query input queryName");
        const definition = configuration.queries[queryName];
        if (!definition) {
          throw new Error(`Query '${queryName}' is not configured.`);
        }
        const supplied = objectValue(
          value.parameters ?? null,
          "Query input parameters",
        );
        const expectedNames = Object.keys(definition.parameters).sort();
        if (
          JSON.stringify(Object.keys(supplied).sort()) !==
          JSON.stringify(expectedNames)
        ) {
          throw new Error(
            `Query '${queryName}' parameters do not match its configured contract.`,
          );
        }
        const parameters = Object.fromEntries(
          expectedNames.map((name) => [
            name,
            {
              type: definition.parameters[name]!,
              value: supplied[name] ?? null,
            },
          ]),
        );
        const result = await executor(
          configuration.connection,
          definition.sql,
          parameters,
        );
        return { queryName, rowCount: result.rowCount, rows: [...result.rows] };
      },
    },
  });
}

export default createExtension();

function parseConfiguration(
  configuration: Readonly<Record<string, JsonValue>>,
  secrets: Readonly<Record<string, string>>,
) {
  const serverAddress = stringValue(
    configuration.serverAddress,
    "Configuration serverAddress",
  );
  const match = serverAddress.match(
    /^(?:\[([0-9A-Fa-f:]+)\]|([A-Za-z0-9.-]+)):(1433|14330)$/u,
  );
  if (!match) {
    throw new Error(
      "Configuration serverAddress must contain a host and an allowed port.",
    );
  }
  const queryDocument = stringValue(
    configuration.queriesJson,
    "Configuration queriesJson",
  );
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(queryDocument) as JsonValue;
  } catch (error) {
    throw new Error("Configuration queriesJson must be valid JSON.", {
      cause: error,
    });
  }
  return {
    connection: {
      server: match[1] ?? match[2]!,
      port: Number.parseInt(match[3]!, 10),
      database: stringValue(configuration.database, "Configuration database"),
      username: secrets.SQL_USERNAME ?? "",
      password: secrets.SQL_PASSWORD ?? "",
      encrypt: booleanValue(
        configuration.encrypt,
        "Configuration encrypt",
        true,
      ),
      trustServerCertificate: booleanValue(
        configuration.trustServerCertificate,
        "Configuration trustServerCertificate",
        false,
      ),
      timeoutMilliseconds:
        integerValue(
          configuration.requestTimeoutSeconds,
          "Configuration requestTimeoutSeconds",
          30,
          1,
          90,
        ) * 1_000,
      maximumRows: integerValue(
        configuration.maximumRows,
        "Configuration maximumRows",
        500,
        1,
        5_000,
      ),
    } satisfies SqlConnectionSettings,
    queries: parseQueries(parsed),
  };
}

function parseQueries(
  value: JsonValue,
): Readonly<Record<string, QueryDefinition>> {
  const root = objectValue(value, "Configured queries");
  const result: Record<string, QueryDefinition> = {};
  for (const [name, nested] of Object.entries(root)) {
    if (!/^[a-z][a-z0-9-]*$/u.test(name)) {
      throw new Error(`Configured query name '${name}' is invalid.`);
    }
    const definition = objectValue(nested, `Configured query '${name}'`);
    const sql = stringValue(definition.sql, `Configured query '${name}' SQL`);
    assertReadOnly(sql, name);
    const parameters = objectValue(
      definition.parameters ?? {},
      `Configured query '${name}' parameters`,
    );
    const parsedParameters: Record<string, SqlParameterType> = {};
    for (const [parameterName, type] of Object.entries(parameters)) {
      if (
        !/^[A-Za-z][A-Za-z0-9_]*$/u.test(parameterName) ||
        !["Bit", "Float", "Int", "NVarChar"].includes(String(type))
      ) {
        throw new Error(
          `Configured query '${name}' has an invalid parameter contract.`,
        );
      }
      parsedParameters[parameterName] = type as SqlParameterType;
    }
    result[name] = { sql, parameters: parsedParameters };
  }
  if (Object.keys(result).length === 0) {
    throw new Error("At least one named query must be configured.");
  }
  return result;
}

function assertReadOnly(sql: string, name: string): void {
  const normalized = sql.replace(/\s+/gu, " ").trim();
  if (
    normalized.length > 20_000 ||
    normalized.includes(";") ||
    normalized.includes("--") ||
    normalized.includes("/*") ||
    !/^(?:SELECT|WITH)\b/iu.test(normalized) ||
    /\b(?:ALTER|BACKUP|CREATE|DELETE|DROP|EXEC(?:UTE)?|GRANT|INSERT|INTO|MERGE|NEXT\s+VALUE\s+FOR|RESTORE|REVOKE|TRUNCATE|UPDATE)\b/iu.test(
      normalized,
    )
  ) {
    throw new Error(
      `Configured query '${name}' is not a single read-only statement.`,
    );
  }
}
