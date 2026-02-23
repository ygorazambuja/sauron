import { join } from "node:path";
import type { OpenApiOperation } from "../../utils";
import type {
	PluginCanRunResult,
	PluginContext,
	PluginGenerateResult,
	PluginOutputPaths,
	SauronPlugin,
} from "../types";

type HttpMethod =
	| "get"
	| "post"
	| "put"
	| "patch"
	| "delete"
	| "head"
	| "options";

type ResourceAction = {
	actionName: string;
	httpMethod: HttpMethod;
	path: string;
	summary?: string;
	description?: string;
	operationId?: string;
	hasBody: boolean;
	hasPathId: boolean;
	pathParams: string[];
};

type ResourceGroup = {
	resourceName: string;
	toolName: string;
	registerFunctionName: string;
	typesFileName: string;
	schemaFileName: string;
	toolFileName: string;
	actions: ResourceAction[];
};

type ResourceCollection = {
	groups: ResourceGroup[];
	actionCount: number;
};

/**
 * Create MCP plugin.
 * @returns Create MCP plugin output as `SauronPlugin`.
 * @example
 * ```ts
 * const result = createMcpPlugin();
 * // result: SauronPlugin
 * ```
 */
export function createMcpPlugin(): SauronPlugin {
	return {
		id: "mcp",
		aliases: ["modelcontext", "model-context-protocol"],
		kind: "mcp-server",
		canRun,
		resolveOutputs,
		generate,
	};
}

/**
 * Can run MCP plugin.
 * @param _context Input parameter `_context`.
 * @returns Can run MCP plugin output as `PluginCanRunResult`.
 * @example
 * ```ts
 * const result = canRun({} as PluginContext);
 * // result: PluginCanRunResult
 * ```
 */
function canRun(_context: PluginContext): PluginCanRunResult {
	return { ok: true };
}

/**
 * Resolve MCP plugin outputs.
 * @param context Input parameter `context`.
 * @returns Resolve MCP plugin outputs output as `PluginOutputPaths`.
 * @example
 * ```ts
 * const result = resolveOutputs({ baseOutputPath: "outputs" } as PluginContext);
 * // result: PluginOutputPaths
 * ```
 */
function resolveOutputs(context: PluginContext): PluginOutputPaths {
	const outputDirectory = join(context.baseOutputPath, "mcp");
	const servicePath = join(outputDirectory, "index.ts");
	const reportPath = join(outputDirectory, "mcp-tools-report.json");
	return {
		artifacts: [
			{ kind: "service", path: servicePath, label: "MCP server entrypoint" },
			{ kind: "service", path: join(outputDirectory, "server.ts"), label: "MCP server factory" },
			{ kind: "service", path: join(outputDirectory, "client", "api.client.ts"), label: "Generated API client" },
			{ kind: "manifest", path: reportPath, label: "MCP tools inventory report" },
			{ kind: "other", path: join(outputDirectory, "README.md"), label: "Generated MCP README" },
		],
		servicePath,
		reportPath,
	};
}

/**
 * Generate MCP plugin files.
 * @param context Input parameter `context`.
 * @returns Generate MCP plugin files output as `Promise<PluginGenerateResult>`.
 * @example
 * ```ts
 * const result = await generate({} as PluginContext);
 * // result: PluginGenerateResult
 * ```
 */
async function generate(
	context: PluginContext,
): Promise<PluginGenerateResult> {
	const outputPaths = resolveOutputs(context);
	const outputDirectory = join(context.baseOutputPath, "mcp");
	const { groups, actionCount } = collectResourceGroups(
		context.schema as Record<string, unknown>,
	);
	const files = [
		{
			path: join(outputDirectory, "index.ts"),
			content: `${context.fileHeader}\n${buildIndexSource()}`,
		},
		{
			path: join(outputDirectory, "server.ts"),
			content: `${context.fileHeader}\n${buildServerSource(groups, context)}`,
		},
		{
			path: join(outputDirectory, "client", "api.client.ts"),
			content: `${context.fileHeader}\n${buildApiClientSource()}`,
		},
		{
			path: join(outputDirectory, "README.md"),
			content: buildGeneratedReadme(),
		},
		{
			path: outputPaths.reportPath ?? "",
			content: buildToolsReport(groups, context, actionCount),
		},
	];

	for (const group of groups) {
		files.push({
			path: join(outputDirectory, "tools", `${group.toolFileName}.tool.ts`),
			content: `${context.fileHeader}\n${buildToolSource(group)}`,
		});
		files.push({
			path: join(outputDirectory, "types", `${group.typesFileName}.types.ts`),
			content: `${context.fileHeader}\n${buildTypesSource(group)}`,
		});
		files.push({
			path: join(outputDirectory, "schemas", `${group.schemaFileName}.schema.ts`),
			content: `${context.fileHeader}\n${buildSchemaSource(group)}`,
		});
	}

	return {
		files,
		methodCount: groups.length,
	};
}

/**
 * Collect resource groups.
 * @param schema Input parameter `schema`.
 * @returns Collect resource groups output as `ResourceCollection`.
 * @example
 * ```ts
 * const result = collectResourceGroups({ paths: {} });
 * // result: ResourceCollection
 * ```
 */
function collectResourceGroups(schema: Record<string, unknown>): ResourceCollection {
	const paths = schema.paths;
	if (!paths || typeof paths !== "object") {
		return { groups: [], actionCount: 0 };
	}

	const grouped = new Map<string, ResourceAction[]>();
	const pathEntries = Object.entries(paths);
	let actionCount = 0;
	for (const [path, pathItem] of pathEntries) {
		const operations = collectOperationsForPath(path, pathItem);
		for (const operation of operations) {
			actionCount += 1;
			const resourceKey = operation.resourceName;
			const existing = grouped.get(resourceKey) ?? [];
			existing.push(operation.action);
			grouped.set(resourceKey, existing);
		}
	}

	const groups = Array.from(grouped.entries())
		.sort((left, right) => left[0].localeCompare(right[0]))
		.map(([resourceName, actions]) => {
			const toolBase = toSnakeCase(resourceName);
			const safeResource = ensurePlural(toolBase || "default");
			const toolName = `manage_${safeResource}`;
			const uniqueActions = resolveResourceActions(actions);
			const pascalName = toPascalCase(safeResource);
			return {
				resourceName: safeResource,
				toolName,
				registerFunctionName: `register${pascalName}Tool`,
				typesFileName: safeResource,
				schemaFileName: safeResource,
				toolFileName: safeResource,
				actions: uniqueActions,
			} satisfies ResourceGroup;
		});

	return { groups, actionCount };
}

/**
 * Collect operations for a path.
 * @param path Input parameter `path`.
 * @param pathItem Input parameter `pathItem`.
 * @returns Collect operations for a path output as `Array<{ resourceName: string; action: ResourceAction }>`.
 * @example
 * ```ts
 * const result = collectOperationsForPath("/users", {});
 * // result: Array<{ resourceName: string; action: ResourceAction }>
 * ```
 */
function collectOperationsForPath(
	path: string,
	pathItem: unknown,
): Array<{ resourceName: string; action: ResourceAction }> {
	if (!pathItem || typeof pathItem !== "object") {
		return [];
	}

	const operations: Array<{ resourceName: string; action: ResourceAction }> = [];
	const methodEntries: HttpMethod[] = [
		"get",
		"post",
		"put",
		"patch",
		"delete",
		"head",
		"options",
	];
	for (const method of methodEntries) {
		const rawOperation = (pathItem as Record<string, unknown>)[method];
		if (!rawOperation || typeof rawOperation !== "object") {
			continue;
		}
		const operation = rawOperation as OpenApiOperation;
		const resourceName = resolveResourceName(operation, path);
		const pathParams = extractPathParams(path);
		operations.push({
			resourceName,
			action: {
				actionName: resolveActionName(method, path, operation),
				httpMethod: method,
				path,
				summary: getText(operation.summary),
				description: getText((operation as Record<string, unknown>).description),
				operationId: getText(operation.operationId),
				hasBody: hasJsonBody(operation),
				hasPathId: pathParams.includes("id"),
				pathParams,
			},
		});
	}

	return operations;
}

/**
 * Resolve resource name.
 * @param operation Input parameter `operation`.
 * @param path Input parameter `path`.
 * @returns Resolve resource name output as `string`.
 * @example
 * ```ts
 * const result = resolveResourceName({ tags: ["Users"] }, "/users");
 * // result: string
 * ```
 */
function resolveResourceName(operation: OpenApiOperation, path: string): string {
	const tags = Array.isArray(operation.tags)
		? operation.tags.filter((tag): tag is string => typeof tag === "string")
		: [];
	if (tags.length > 0) {
		return ensurePlural(toSnakeCase(tags[0]));
	}

	const firstPathSegment = path
		.split("/")
		.filter((segment) => segment && !segment.startsWith("{"))[0];
	if (firstPathSegment) {
		return ensurePlural(toSnakeCase(firstPathSegment));
	}

	return "default";
}

/**
 * Resolve action name.
 * @param method Input parameter `method`.
 * @param path Input parameter `path`.
 * @param operation Input parameter `operation`.
 * @returns Resolve action name output as `string`.
 * @example
 * ```ts
 * const result = resolveActionName("get", "/users/{id}", {} as OpenApiOperation);
 * // result: string
 * ```
 */
function resolveActionName(
	method: HttpMethod,
	path: string,
	operation: OpenApiOperation,
): string {
	const hasPathParams = path.includes("{");
	if (method === "get") {
		return hasPathParams ? "get" : "list";
	}
	if (method === "post") {
		return "create";
	}
	if (method === "put" || method === "patch") {
		return "update";
	}
	if (method === "delete") {
		return "delete";
	}

	const operationId = getText(operation.operationId);
	if (operationId) {
		return toSnakeCase(operationId);
	}

	return toSnakeCase(`${method}_${path}`);
}

/**
 * Resolve resource actions.
 * @param actions Input parameter `actions`.
 * @returns Resolve resource actions output as `ResourceAction[]`.
 * @example
 * ```ts
 * const result = resolveResourceActions([]);
 * // result: ResourceAction[]
 * ```
 */
function resolveResourceActions(actions: ResourceAction[]): ResourceAction[] {
	const usedActionNames = new Set<string>();
	return actions.map((action) => {
		const baseName = toSnakeCase(action.actionName) || "action";
		if (!usedActionNames.has(baseName)) {
			usedActionNames.add(baseName);
			return { ...action, actionName: baseName };
		}

		const operationFallback = action.operationId
			? toSnakeCase(action.operationId)
			: "";
		if (operationFallback && !usedActionNames.has(operationFallback)) {
			usedActionNames.add(operationFallback);
			return { ...action, actionName: operationFallback };
		}

		let index = 2;
		while (usedActionNames.has(`${baseName}_${index}`)) {
			index += 1;
		}
		const unique = `${baseName}_${index}`;
		usedActionNames.add(unique);
		return { ...action, actionName: unique };
	});
}

/**
 * Build index source.
 * @returns Build index source output as `string`.
 * @example
 * ```ts
 * const result = buildIndexSource();
 * // result: string
 * ```
 */
function buildIndexSource(): string {
	return `import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server";

const server = createServer({
  baseUrl: process.env.API_BASE_URL ?? "https://api.example.com",
  bearerToken: process.env.API_TOKEN,
  apiKey: process.env.API_KEY,
  apiKeyHeader: process.env.API_KEY_HEADER,
});

const transport = new StdioServerTransport();
await server.connect(transport);
`;
}

/**
 * Build server source.
 * @param groups Input parameter `groups`.
 * @param context Input parameter `context`.
 * @returns Build server source output as `string`.
 * @example
 * ```ts
 * const result = buildServerSource([], {} as PluginContext);
 * // result: string
 * ```
 */
function buildServerSource(groups: ResourceGroup[], context: PluginContext): string {
	const importLines = groups.map(
		(group) =>
			`import { ${group.registerFunctionName} } from "./tools/${group.toolFileName}.tool";`,
	);
	const registerLines = groups.map(
		(group) => `\t${group.registerFunctionName}(server, client);`,
	);
	const serverName = normalizeServerName(context.schema.info.title);
	const serverVersion = getText(context.schema.info.version) || "1.0.0";

	return `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ApiClient, type ApiClientConfig } from "./client/api.client";
${importLines.join("\n")}

export function createServer(config: ApiClientConfig): McpServer {
\tconst server = new McpServer({
\t\tname: ${JSON.stringify(serverName)},
\t\tversion: ${JSON.stringify(serverVersion)},
\t});
\tconst client = new ApiClient(config);

${registerLines.join("\n")}

\treturn server;
}
`;
}

/**
 * Build API client source.
 * @returns Build API client source output as `string`.
 * @example
 * ```ts
 * const result = buildApiClientSource();
 * // result: string
 * ```
 */
function buildApiClientSource(): string {
	return `export interface ApiClientConfig {
  baseUrl: string;
  bearerToken?: string;
  apiKey?: string;
  apiKeyHeader?: string;
}

export type ApiClientErrorPayload = {
  status: number;
  message: string;
  body: unknown;
};

export class ApiClientError extends Error {
  constructor(public readonly details: ApiClientErrorPayload) {
    super(\`HTTP \${details.status}: \${details.message}\`);
  }
}

export class ApiClient {
  constructor(private readonly config: ApiClientConfig) {}

  async get(path: string, query?: Record<string, unknown>): Promise<unknown> {
    return this.request("GET", path, undefined, query);
  }

  async post(path: string, body?: unknown): Promise<unknown> {
    return this.request("POST", path, body);
  }

  async put(path: string, body?: unknown): Promise<unknown> {
    return this.request("PUT", path, body);
  }

  async patch(path: string, body?: unknown): Promise<unknown> {
    return this.request("PATCH", path, body);
  }

  async delete(path: string, query?: Record<string, unknown>): Promise<unknown> {
    return this.request("DELETE", path, undefined, query);
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, unknown>,
  ): Promise<unknown> {
    const url = this.buildUrl(path, query);
    const response = await fetch(url, {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = await this.readPayload(response);
    if (!response.ok) {
      const details: ApiClientErrorPayload = {
        status: response.status,
        message: response.statusText || "Request failed",
        body: payload,
      };
      throw new ApiClientError(details);
    }

    return payload;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.bearerToken) {
      headers.Authorization = \`Bearer \${this.config.bearerToken}\`;
    }
    if (this.config.apiKey) {
      headers[this.config.apiKeyHeader ?? "x-api-key"] = this.config.apiKey;
    }
    return headers;
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const normalizedBase = this.config.baseUrl.replace(/\\/+$/, "");
    const normalizedPath = path.startsWith("/") ? path : \`/\${path}\`;
    if (!query || Object.keys(query).length === 0) {
      return \`\${normalizedBase}\${normalizedPath}\`;
    }

    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          search.append(key, String(item));
        }
        continue;
      }
      search.append(key, String(value));
    }

    const queryString = search.toString();
    if (!queryString) {
      return \`\${normalizedBase}\${normalizedPath}\`;
    }

    return \`\${normalizedBase}\${normalizedPath}?\${queryString}\`;
  }

  private async readPayload(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}
`;
}

/**
 * Build tool source.
 * @param group Input parameter `group`.
 * @returns Build tool source output as `string`.
 * @example
 * ```ts
 * const result = buildToolSource({} as ResourceGroup);
 * // result: string
 * ```
 */
function buildToolSource(group: ResourceGroup): string {
	const enumValues = group.actions.map((action) => JSON.stringify(action.actionName));
	const actionDescriptions = group.actions.map((action) => {
		const info = [action.summary, action.description]
			.filter((value) => !!value)
			.join(" - ");
		return `${action.actionName}: ${info || `${action.httpMethod.toUpperCase()} ${action.path}`}`;
	});
	const actionCases = group.actions.map((action) => buildActionCase(action));
	const hasIdAction = group.actions.some((action) => action.hasPathId);

	return `import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ApiClient, ApiClientError } from "../client/api.client";
import type { ${toPascalCase(group.resourceName)}ToolInput } from "../types/${group.typesFileName}.types";

const ACTIONS = [${enumValues.join(", ")}] as const;
const inputSchema = z
\t.object({
\t\taction: z
\t\t\t.enum(ACTIONS)
\t\t\t.describe(${JSON.stringify(actionDescriptions.join(" | "))}),
\t\tid: z.string().optional().describe("Resource ID (required for get/update/delete)"),
\t\tparams: z
\t\t\t.record(z.string(), z.unknown())
\t\t\t.optional()
\t\t\t.describe("Optional path params for nested routes."),
\t\tdata: z
\t\t\t.record(z.string(), z.unknown())
\t\t\t.optional()
\t\t\t.describe("Request body for create/update actions."),
\t\tquery: z
\t\t\t.record(z.string(), z.unknown())
\t\t\t.optional()
\t\t\t.describe("Query parameters sent to API endpoint."),
\t})
\t.passthrough();

export function ${group.registerFunctionName}(server: McpServer, client: ApiClient): void {
\tserver.registerTool(
\t\t${JSON.stringify(group.toolName)},
\t\t{
\t\t\tdescription:
\t\t\t\t${JSON.stringify(`Manages ${group.resourceName} resource. Actions: ${group.actions.map((action) => action.actionName).join(", ")}.`)},
\t\t\tinputSchema,
\t\t},
\t\tasync (input: ${toPascalCase(group.resourceName)}ToolInput) => {
\t\t\tconst { action, id, params, data, query } = input;
\t\t\ttry {
\t\t\t\tswitch (action) {
${actionCases.join("\n")}
\t\t\t\t\tdefault:
\t\t\t\t\t\treturn createErrorResult("Unsupported action: " + String(action));
\t\t\t\t}
\t\t\t} catch (error) {
\t\t\t\tif (error instanceof ApiClientError) {
\t\t\t\t\treturn createErrorResult(
\t\t\t\t\t\t"Error " + error.details.status + ": " + error.details.message,
\t\t\t\t\t\terror.details.body,
\t\t\t\t\t);
\t\t\t\t}

\t\t\t\treturn createErrorResult(error instanceof Error ? error.message : "Unknown error");
\t\t\t}
\t\t},
\t);
}

function resolvePath(
\ttemplate: string,
\tinput: { id?: string; params?: Record<string, unknown> },
): { ok: true; path: string } | { ok: false; message: string } {
\tconst providedValues: Record<string, unknown> = {
\t\t...(input.params ?? {}),
\t};
\tif (input.id) {
\t\tprovidedValues.id = input.id;
\t}

\tconst missing: string[] = [];
\tconst path = template.replace(/\\{([^}]+)\\}/g, (_match, key: string) => {
\t\tconst value = providedValues[key];
\t\tif (value === undefined || value === null || value === "") {
\t\t\tmissing.push(key);
\t\t\treturn "";
\t\t}
\t\treturn encodeURIComponent(String(value));
\t});

\tif (missing.length > 0) {
\t\treturn {
\t\t\tok: false,
\t\t\tmessage: "Missing required path parameter(s): " + missing.join(", "),
\t\t};
\t}

\treturn { ok: true, path };
}

function createSuccessResult(payload: unknown): { content: Array<{ type: "text"; text: string }> } {
\treturn {
\t\tcontent: [{ type: "text", text: JSON.stringify(payload) }],
\t};
}

function createErrorResult(
\tmessage: string,
\tpayload?: unknown,
): { content: Array<{ type: "text"; text: string }>; isError: boolean } {
\tconst text =
\t\tpayload === undefined
\t\t\t? message
\t\t\t: message + " | payload: " + JSON.stringify(payload);
\treturn {
\t\tcontent: [{ type: "text", text }],
\t\tisError: true,
\t};
}
${hasIdAction ? "\n" : ""}`;
}

/**
 * Build action case.
 * @param action Input parameter `action`.
 * @returns Build action case output as `string`.
 * @example
 * ```ts
 * const result = buildActionCase({} as ResourceAction);
 * // result: string
 * ```
 */
function buildActionCase(action: ResourceAction): string {
	const methodCall = resolveClientMethod(action.httpMethod);
	const pathResolution = `const resolvedPath = resolvePath(${JSON.stringify(action.path)}, { id, params });`;
	const pathValidation = `if (!resolvedPath.ok) { return createErrorResult(resolvedPath.message); }`;
	const queryArg = action.httpMethod === "get" || action.httpMethod === "delete" ? "query" : "undefined";
	if (action.httpMethod === "post" || action.httpMethod === "put" || action.httpMethod === "patch") {
		return `\t\t\t\t\tcase ${JSON.stringify(action.actionName)}: {\n\t\t\t\t\t\t${pathResolution}\n\t\t\t\t\t\t${pathValidation}\n\t\t\t\t\t\tconst result = await client.${methodCall}(resolvedPath.path, data);\n\t\t\t\t\t\treturn createSuccessResult(result);\n\t\t\t\t\t}`;
	}

	return `\t\t\t\t\tcase ${JSON.stringify(action.actionName)}: {\n\t\t\t\t\t\t${pathResolution}\n\t\t\t\t\t\t${pathValidation}\n\t\t\t\t\t\tconst result = await client.${methodCall}(resolvedPath.path, ${queryArg});\n\t\t\t\t\t\treturn createSuccessResult(result);\n\t\t\t\t\t}`;
}

/**
 * Resolve client method.
 * @param method Input parameter `method`.
 * @returns Resolve client method output as `"get" | "post" | "put" | "patch" | "delete"`.
 * @example
 * ```ts
 * const result = resolveClientMethod("get");
 * // result: "get" | "post" | "put" | "patch" | "delete"
 * ```
 */
function resolveClientMethod(
	method: HttpMethod,
): "get" | "post" | "put" | "patch" | "delete" {
	if (method === "post") {
		return "post";
	}
	if (method === "put") {
		return "put";
	}
	if (method === "patch") {
		return "patch";
	}
	if (method === "delete") {
		return "delete";
	}
	return "get";
}

/**
 * Build types source.
 * @param group Input parameter `group`.
 * @returns Build types source output as `string`.
 * @example
 * ```ts
 * const result = buildTypesSource({} as ResourceGroup);
 * // result: string
 * ```
 */
function buildTypesSource(group: ResourceGroup): string {
	const toolTypeName = `${toPascalCase(group.resourceName)}ToolInput`;
	const actionLiterals = group.actions.map((action) => JSON.stringify(action.actionName));
	const actionInterfaces = group.actions
		.map((action) => {
			const interfaceName = `${toPascalCase(action.actionName)}${toPascalCase(group.resourceName)}Input`;
			const baseLines = [
				`export interface ${interfaceName} {`,
				`\taction: ${JSON.stringify(action.actionName)};`,
				"\tid?: string;",
				"\tparams?: Record<string, unknown>;",
				"\tquery?: Record<string, unknown>;",
				"\tdata?: Record<string, unknown>;",
				"}",
			];
			return baseLines.join("\n");
		})
		.join("\n\n");

	return `export type ${toPascalCase(group.resourceName)}Action = ${actionLiterals.join(" | ")};

export interface ${toolTypeName} {
\taction: ${toPascalCase(group.resourceName)}Action;
\tid?: string;
\tparams?: Record<string, unknown>;
\tquery?: Record<string, unknown>;
\tdata?: Record<string, unknown>;
}

${actionInterfaces}
`;
}

/**
 * Build schema source.
 * @param group Input parameter `group`.
 * @returns Build schema source output as `string`.
 * @example
 * ```ts
 * const result = buildSchemaSource({} as ResourceGroup);
 * // result: string
 * ```
 */
function buildSchemaSource(group: ResourceGroup): string {
	const schemaName = `${group.toolName}InputSchema`;
	const oneOfBlocks = group.actions.map((action) => ({
		title: action.actionName,
		required: action.hasPathId ? ["action", "id"] : ["action"],
		description: [action.summary, action.description]
			.filter((item) => !!item)
			.join(" - "),
	}));

	return `export const ${schemaName} = {
\t$schema: "https://json-schema.org/draft/2020-12/schema",
\ttitle: ${JSON.stringify(`${group.toolName} input`)},
\ttype: "object",
\tadditionalProperties: false,
\tproperties: {
\t\taction: { enum: ${JSON.stringify(group.actions.map((action) => action.actionName))} },
\t\tid: { type: "string", description: "Resource ID" },
\t\tparams: { type: "object", additionalProperties: true },
\t\tquery: { type: "object", additionalProperties: true },
\t\tdata: { type: "object", additionalProperties: true },
\t},
\toneOf: ${JSON.stringify(oneOfBlocks, null, 2)},
} as const;
`;
}

/**
 * Build generated readme.
 * @returns Build generated readme output as `string`.
 * @example
 * ```ts
 * const result = buildGeneratedReadme();
 * // result: string
 * ```
 */
function buildGeneratedReadme(): string {
	return `# Generated MCP Server

## Run

\`\`\`bash
bun run ./index.ts
\`\`\`

## Environment variables

- \`API_BASE_URL\` (required)
- \`API_TOKEN\` (optional Bearer token)
- \`API_KEY\` (optional API key)
- \`API_KEY_HEADER\` (optional; default: \`x-api-key\`)

## Generator options (MCP)

- \`transport\`: \`stdio\` | \`http\` (default: \`stdio\`)
- \`groupBy\`: \`tag\` | \`path\` (default: \`tag\`)
- \`httpClient\`: \`fetch\` | \`axios\` (default: \`fetch\`)
- \`authType\`: \`bearer\` | \`apiKey\` | \`none\` (default: \`none\`)
- \`serverName\`: custom MCP server name
- \`serverVersion\`: custom MCP server version

## Runtime dependencies

\`\`\`json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.22.0"
  }
}
\`\`\`

If axios client mode is enabled, include:

\`\`\`json
{
  "dependencies": {
    "axios": "^1.6.0"
  }
}
\`\`\`
`;
}

/**
 * Build tools report.
 * @param groups Input parameter `groups`.
 * @param context Input parameter `context`.
 * @param actionCount Input parameter `actionCount`.
 * @returns Build tools report output as `string`.
 * @example
 * ```ts
 * const result = buildToolsReport([], {} as PluginContext, 0);
 * // result: string
 * ```
 */
function buildToolsReport(
	groups: ResourceGroup[],
	context: PluginContext,
	actionCount: number,
): string {
	const report = {
		generator: "sauron-mcp-plugin",
		plugin: "mcp",
		apiTitle: context.schema.info.title,
		apiVersion: context.schema.info.version,
		toolCount: groups.length,
		actionCount,
		tools: groups.map((group) => ({
			resource: group.resourceName,
			toolName: group.toolName,
			actions: group.actions.map((action) => ({
				action: action.actionName,
				method: action.httpMethod.toUpperCase(),
				path: action.path,
				summary: action.summary ?? null,
				description: action.description ?? null,
				operationId: action.operationId ?? null,
			})),
		})),
	};

	return `${JSON.stringify(report, null, 2)}\n`;
}

/**
 * Normalize server name.
 * @param value Input parameter `value`.
 * @returns Normalize server name output as `string`.
 * @example
 * ```ts
 * const result = normalizeServerName("My API");
 * // result: string
 * ```
 */
function normalizeServerName(value: unknown): string {
	const text = getText(value);
	if (!text) {
		return "generated-api-mcp";
	}
	return toSnakeCase(text).replace(/_/g, "-") || "generated-api-mcp";
}

/**
 * Extract path params.
 * @param path Input parameter `path`.
 * @returns Extract path params output as `string[]`.
 * @example
 * ```ts
 * const result = extractPathParams("/users/{id}");
 * // result: string[]
 * ```
 */
function extractPathParams(path: string): string[] {
	const matches = Array.from(path.matchAll(/\{([^}]+)\}/g));
	return matches
		.map((match) => match[1])
		.filter((paramName): paramName is string => !!paramName);
}

/**
 * Check if operation has JSON body.
 * @param operation Input parameter `operation`.
 * @returns Check if operation has JSON body output as `boolean`.
 * @example
 * ```ts
 * const result = hasJsonBody({} as OpenApiOperation);
 * // result: boolean
 * ```
 */
function hasJsonBody(operation: OpenApiOperation): boolean {
	const requestBody = operation.requestBody;
	if (!requestBody || typeof requestBody !== "object") {
		return false;
	}
	const content = requestBody.content;
	if (!content || typeof content !== "object") {
		return false;
	}
	return !!content["application/json"];
}

/**
 * Convert value to text.
 * @param value Input parameter `value`.
 * @returns Convert value to text output as `string | undefined`.
 * @example
 * ```ts
 * const result = getText("value");
 * // result: string | undefined
 * ```
 */
function getText(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}
	return trimmed;
}

/**
 * Convert text to snake case.
 * @param value Input parameter `value`.
 * @returns Convert text to snake case output as `string`.
 * @example
 * ```ts
 * const result = toSnakeCase("User Orders");
 * // result: string
 * ```
 */
function toSnakeCase(value: string): string {
	return value
		.trim()
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.replace(/[^a-zA-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.toLowerCase();
}

/**
 * Convert text to pascal case.
 * @param value Input parameter `value`.
 * @returns Convert text to pascal case output as `string`.
 * @example
 * ```ts
 * const result = toPascalCase("manage_users");
 * // result: string
 * ```
 */
function toPascalCase(value: string): string {
	const parts = value
		.replace(/[^a-zA-Z0-9]+/g, " ")
		.split(" ")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1));
	if (parts.length === 0) {
		return "Default";
	}
	return parts.join("");
}

/**
 * Ensure plural name.
 * @param value Input parameter `value`.
 * @returns Ensure plural name output as `string`.
 * @example
 * ```ts
 * const result = ensurePlural("user");
 * // result: string
 * ```
 */
function ensurePlural(value: string): string {
	if (!value) {
		return "default";
	}
	if (value.endsWith("s")) {
		return value;
	}
	return `${value}s`;
}
