import type { z } from "zod";
import type { SwaggerOrOpenAPISchema } from "../schemas/swagger";
import type {
	OpenApiOperation,
	OpenApiPath,
	OperationTypeInfo,
	OperationTypeMap,
} from "../utils";

/**
 * Type coverage location.
 */
export type TypeCoverageLocation =
	| "path.parameter"
	| "query.parameter"
	| "request.body"
	| "response.body";

/**
 * Type coverage issue.
 */
export type TypeCoverageIssue = {
	path: string;
	method: string;
	location: TypeCoverageLocation;
	field?: string;
	reason: string;
};

/**
 * Type coverage metrics.
 */
export type TypeCoverageMetrics = {
	total: number;
	typed: number;
	untyped: number;
	coveragePercentage: number;
};

/**
 * Type coverage operation summary.
 */
export type TypeCoverageOperationSummary = {
	path: string;
	method: string;
	total: number;
	typed: number;
	untyped: number;
	coveragePercentage: number;
	untypedLocations: TypeCoverageLocation[];
};

/**
 * Type coverage report.
 */
export type TypeCoverageReport = {
	generatedAt: string;
	totalOperations: number;
	totals: TypeCoverageMetrics;
	summary: {
		pathParameters: TypeCoverageMetrics;
		queryParameters: TypeCoverageMetrics;
		requestBodies: TypeCoverageMetrics;
		responseBodies: TypeCoverageMetrics;
	};
	operations: TypeCoverageOperationSummary[];
	issues: TypeCoverageIssue[];
};

type CoverageEntry = {
	path: string;
	method: string;
	location: TypeCoverageLocation;
	field?: string;
	isTyped: boolean;
	reason?: string;
};

/**
 * Create type coverage report.
 * @param data Input parameter `data`.
 * @param operationTypes Input parameter `operationTypes`.
 * @returns Create type coverage report output as `TypeCoverageReport`.
 * @example
 * ```ts
 * const result = createTypeCoverageReport({ paths: {} } as never, {});
 * // result: TypeCoverageReport
 * ```
 */
export function createTypeCoverageReport(
	data: z.infer<typeof SwaggerOrOpenAPISchema>,
	operationTypes?: OperationTypeMap,
): TypeCoverageReport {
	const entries = collectCoverageEntries(data, operationTypes);
	const operations = buildOperationSummary(entries);
	const issues = buildTypeCoverageIssues(entries);
	return {
		generatedAt: new Date().toISOString(),
		totalOperations: operations.length,
		totals: buildMetrics(entries),
		summary: {
			pathParameters: buildMetricsByLocation(entries, "path.parameter"),
			queryParameters: buildMetricsByLocation(entries, "query.parameter"),
			requestBodies: buildMetricsByLocation(entries, "request.body"),
			responseBodies: buildMetricsByLocation(entries, "response.body"),
		},
		operations,
		issues,
	};
}

/**
 * Generate type coverage report file.
 * @param report Input parameter `report`.
 * @returns Generate type coverage report file output as `string`.
 * @example
 * ```ts
 * const result = generateTypeCoverageReportFile({
 *  generatedAt: "",
 *  totalOperations: 0,
 *  totals: { total: 0, typed: 0, untyped: 0, coveragePercentage: 100 },
 *  summary: {
 *   pathParameters: { total: 0, typed: 0, untyped: 0, coveragePercentage: 100 },
 *   queryParameters: { total: 0, typed: 0, untyped: 0, coveragePercentage: 100 },
 *   requestBodies: { total: 0, typed: 0, untyped: 0, coveragePercentage: 100 },
 *   responseBodies: { total: 0, typed: 0, untyped: 0, coveragePercentage: 100 },
 *  },
 *  operations: [],
 *  issues: [],
 * });
 * // result: string
 * ```
 */
export function generateTypeCoverageReportFile(
	report: TypeCoverageReport,
): string {
	return `${JSON.stringify(report, null, 2)}\n`;
}

/**
 * Collect coverage entries.
 * @param data Input parameter `data`.
 * @param operationTypes Input parameter `operationTypes`.
 * @returns Collect coverage entries output as `CoverageEntry[]`.
 * @example
 * ```ts
 * const result = collectCoverageEntries({ paths: {} } as never, {});
 * // result: CoverageEntry[]
 * ```
 */
function collectCoverageEntries(
	data: z.infer<typeof SwaggerOrOpenAPISchema>,
	operationTypes?: OperationTypeMap,
): CoverageEntry[] {
	if (!data.paths) {
		return [];
	}

	const entries: CoverageEntry[] = [];
	const httpMethods = [
		"get",
		"post",
		"put",
		"delete",
		"patch",
		"head",
		"options",
	] as const;

	for (const [path, pathItem] of Object.entries(data.paths)) {
		for (const httpMethod of httpMethods) {
			const operation = (pathItem as OpenApiPath)[httpMethod];
			if (!operation) {
				continue;
			}

			const typeInfo = operationTypes?.[path]?.[httpMethod];
			const operationEntries = collectOperationEntries(
				path,
				httpMethod,
				operation,
				typeInfo,
			);
			entries.push(...operationEntries);
		}
	}

	return entries;
}

/**
 * Collect operation coverage entries.
 * @param path Input parameter `path`.
 * @param httpMethod Input parameter `httpMethod`.
 * @param operation Input parameter `operation`.
 * @param typeInfo Input parameter `typeInfo`.
 * @returns Collect operation coverage entries output as `CoverageEntry[]`.
 * @example
 * ```ts
 * const result = collectOperationEntries("/users", "get", {}, undefined);
 * // result: CoverageEntry[]
 * ```
 */
function collectOperationEntries(
	path: string,
	httpMethod: string,
	operation: OpenApiOperation,
	typeInfo?: OperationTypeInfo,
): CoverageEntry[] {
	const entries: CoverageEntry[] = [];
	const parameterEntries = collectParameterEntries(path, httpMethod, operation);
	entries.push(...parameterEntries);

	const requestEntry = collectRequestBodyEntry(path, httpMethod, operation, typeInfo);
	if (requestEntry) {
		entries.push(requestEntry);
	}

	const responseEntry = collectResponseBodyEntry(path, httpMethod, operation, typeInfo);
	entries.push(responseEntry);

	return entries;
}

/**
 * Collect parameter coverage entries.
 * @param path Input parameter `path`.
 * @param httpMethod Input parameter `httpMethod`.
 * @param operation Input parameter `operation`.
 * @returns Collect parameter coverage entries output as `CoverageEntry[]`.
 * @example
 * ```ts
 * const result = collectParameterEntries("/users/{id}", "get", {});
 * // result: CoverageEntry[]
 * ```
 */
function collectParameterEntries(
	path: string,
	httpMethod: string,
	operation: OpenApiOperation,
): CoverageEntry[] {
	const entries: CoverageEntry[] = [];
	const method = httpMethod.toUpperCase();
	const parameters = Array.isArray(operation.parameters)
		? operation.parameters
		: [];

	const pathPlaceholders = getPathPlaceholders(path);
	for (const placeholder of pathPlaceholders) {
		const pathParameter = parameters.find(
			(parameter) => parameter.in === "path" && parameter.name === placeholder,
		);

		if (!pathParameter) {
			entries.push({
				path,
				method,
				location: "path.parameter",
				field: placeholder,
				isTyped: false,
				reason: "Path parameter is missing from operation.parameters.",
			});
			continue;
		}

		const isTyped = !isSchemaAny(pathParameter.schema);
		entries.push({
			path,
			method,
			location: "path.parameter",
			field: placeholder,
			isTyped,
			reason: isTyped
				? undefined
				: "Path parameter schema is missing or unresolved.",
		});
	}

	for (const parameter of parameters) {
		if (parameter.in !== "query") {
			continue;
		}

		const isTyped = !isSchemaAny(parameter.schema);
		entries.push({
			path,
			method,
			location: "query.parameter",
			field: parameter.name,
			isTyped,
			reason: isTyped
				? undefined
				: "Query parameter schema is missing or unresolved.",
		});
	}

	return entries;
}

/**
 * Collect request body coverage entry.
 * @param path Input parameter `path`.
 * @param httpMethod Input parameter `httpMethod`.
 * @param operation Input parameter `operation`.
 * @param typeInfo Input parameter `typeInfo`.
 * @returns Collect request body coverage entry output as `CoverageEntry | undefined`.
 * @example
 * ```ts
 * const result = collectRequestBodyEntry("/users", "post", {}, undefined);
 * // result: CoverageEntry | undefined
 * ```
 */
function collectRequestBodyEntry(
	path: string,
	httpMethod: string,
	operation: OpenApiOperation,
	typeInfo?: OperationTypeInfo,
): CoverageEntry | undefined {
	if (!operation.requestBody) {
		return undefined;
	}

	const requestType = typeInfo?.requestType ?? extractRequestType(operation) ?? "any";
	const isTyped = !containsAnyType(requestType);
	const schema = getPreferredContentSchema(operation.requestBody.content);

	return {
		path,
		method: httpMethod.toUpperCase(),
		location: "request.body",
		isTyped,
		reason: resolveRequestBodyReason(schema, isTyped),
	};
}

/**
 * Resolve request body reason.
 * @param schema Input parameter `schema`.
 * @param isTyped Input parameter `isTyped`.
 * @returns Resolve request body reason output as `string | undefined`.
 * @example
 * ```ts
 * const result = resolveRequestBodyReason(undefined, false);
 * // result: string | undefined
 * ```
 */
function resolveRequestBodyReason(
	schema: Record<string, unknown> | undefined,
	isTyped: boolean,
): string | undefined {
	if (isTyped) {
		return undefined;
	}
	if (!schema) {
		return "Request body exists but no schema was documented in content.";
	}
	return "Request body schema could not be resolved to a concrete model type.";
}

/**
 * Collect response body coverage entry.
 * @param path Input parameter `path`.
 * @param httpMethod Input parameter `httpMethod`.
 * @param operation Input parameter `operation`.
 * @param typeInfo Input parameter `typeInfo`.
 * @returns Collect response body coverage entry output as `CoverageEntry`.
 * @example
 * ```ts
 * const result = collectResponseBodyEntry("/users", "get", {}, undefined);
 * // result: CoverageEntry
 * ```
 */
function collectResponseBodyEntry(
	path: string,
	httpMethod: string,
	operation: OpenApiOperation,
	typeInfo?: OperationTypeInfo,
): CoverageEntry {
	const requestType = typeInfo?.requestType ?? extractRequestType(operation) ?? "any";
	let responseType = typeInfo?.responseType ?? extractResponseType(operation);
	if (!responseType) {
		responseType = "any";
	}

	const isMutatingMethod = ["post", "put", "patch"].includes(httpMethod);
	if (containsAnyType(responseType) && isMutatingMethod && !containsAnyType(requestType)) {
		responseType = requestType;
	}

	const isTyped = !containsAnyType(responseType);
	const successResponse = getSuccessResponse(operation);
	const schema = getPreferredContentSchema(successResponse?.content);

	return {
		path,
		method: httpMethod.toUpperCase(),
		location: "response.body",
		isTyped,
		reason: resolveResponseBodyReason(successResponse, schema, isTyped),
	};
}

/**
 * Resolve response body reason.
 * @param successResponse Input parameter `successResponse`.
 * @param schema Input parameter `schema`.
 * @param isTyped Input parameter `isTyped`.
 * @returns Resolve response body reason output as `string | undefined`.
 * @example
 * ```ts
 * const result = resolveResponseBodyReason(undefined, undefined, false);
 * // result: string | undefined
 * ```
 */
function resolveResponseBodyReason(
	successResponse:
		| { content?: Record<string, { schema: Record<string, unknown> }> }
		| undefined,
	schema: Record<string, unknown> | undefined,
	isTyped: boolean,
): string | undefined {
	if (isTyped) {
		return undefined;
	}
	if (!successResponse) {
		return "No 2xx success response is documented for this operation.";
	}
	if (!schema) {
		return "Success response exists but no response schema was documented in content.";
	}
	return "Response schema could not be resolved to a concrete model type.";
}

/**
 * Build type coverage issues.
 * @param entries Input parameter `entries`.
 * @returns Build type coverage issues output as `TypeCoverageIssue[]`.
 * @example
 * ```ts
 * const result = buildTypeCoverageIssues([]);
 * // result: TypeCoverageIssue[]
 * ```
 */
function buildTypeCoverageIssues(entries: CoverageEntry[]): TypeCoverageIssue[] {
	return entries
		.filter((entry) => !entry.isTyped)
		.map((entry) => ({
			path: entry.path,
			method: entry.method,
			location: entry.location,
			field: entry.field,
			reason: entry.reason ?? "Type could not be resolved.",
		}));
}

/**
 * Build operation summary.
 * @param entries Input parameter `entries`.
 * @returns Build operation summary output as `TypeCoverageOperationSummary[]`.
 * @example
 * ```ts
 * const result = buildOperationSummary([]);
 * // result: TypeCoverageOperationSummary[]
 * ```
 */
function buildOperationSummary(
	entries: CoverageEntry[],
): TypeCoverageOperationSummary[] {
	const byOperation = new Map<string, CoverageEntry[]>();
	for (const entry of entries) {
		const key = `${entry.method} ${entry.path}`;
		const list = byOperation.get(key);
		if (list) {
			list.push(entry);
			continue;
		}
		byOperation.set(key, [entry]);
	}

	const operations: TypeCoverageOperationSummary[] = [];
	for (const [key, operationEntries] of byOperation) {
		const [method, ...pathParts] = key.split(" ");
		const path = pathParts.join(" ");
		const total = operationEntries.length;
		const typed = operationEntries.filter((entry) => entry.isTyped).length;
		const untyped = total - typed;
		const untypedLocations = operationEntries
			.filter((entry) => !entry.isTyped)
			.map((entry) => entry.location);

		operations.push({
			path,
			method,
			total,
			typed,
			untyped,
			coveragePercentage: calculateCoveragePercentage(typed, total),
			untypedLocations,
		});
	}

	return operations;
}

/**
 * Build metrics by location.
 * @param entries Input parameter `entries`.
 * @param location Input parameter `location`.
 * @returns Build metrics by location output as `TypeCoverageMetrics`.
 * @example
 * ```ts
 * const result = buildMetricsByLocation([], "query.parameter");
 * // result: TypeCoverageMetrics
 * ```
 */
function buildMetricsByLocation(
	entries: CoverageEntry[],
	location: TypeCoverageLocation,
): TypeCoverageMetrics {
	const filtered = entries.filter((entry) => entry.location === location);
	return buildMetrics(filtered);
}

/**
 * Build metrics.
 * @param entries Input parameter `entries`.
 * @returns Build metrics output as `TypeCoverageMetrics`.
 * @example
 * ```ts
 * const result = buildMetrics([]);
 * // result: TypeCoverageMetrics
 * ```
 */
function buildMetrics(entries: CoverageEntry[]): TypeCoverageMetrics {
	const total = entries.length;
	const typed = entries.filter((entry) => entry.isTyped).length;
	const untyped = total - typed;
	return {
		total,
		typed,
		untyped,
		coveragePercentage: calculateCoveragePercentage(typed, total),
	};
}

/**
 * Calculate coverage percentage.
 * @param typed Input parameter `typed`.
 * @param total Input parameter `total`.
 * @returns Calculate coverage percentage output as `number`.
 * @example
 * ```ts
 * const result = calculateCoveragePercentage(1, 2);
 * // result: number
 * ```
 */
function calculateCoveragePercentage(typed: number, total: number): number {
	if (total === 0) {
		return 100;
	}

	const percentage = (typed / total) * 100;
	return Number(percentage.toFixed(2));
}

/**
 * Get path placeholders.
 * @param path Input parameter `path`.
 * @returns Get path placeholders output as `string[]`.
 * @example
 * ```ts
 * const result = getPathPlaceholders("/users/{id}");
 * // result: string[]
 * ```
 */
function getPathPlaceholders(path: string): string[] {
	const matches = path.match(/\{([^}]+)\}/g);
	if (!matches) {
		return [];
	}

	return matches.map((match) => match.slice(1, -1));
}

/**
 * Get preferred content schema.
 * @param content Input parameter `content`.
 * @returns Get preferred content schema output as `Record<string, unknown> | undefined`.
 * @example
 * ```ts
 * const result = getPreferredContentSchema(undefined);
 * // result: Record<string, unknown> | undefined
 * ```
 */
function getPreferredContentSchema(
	content?: Record<string, { schema: Record<string, unknown> }>,
): Record<string, unknown> | undefined {
	if (!content) {
		return undefined;
	}

	const jsonSchema = content["application/json"]?.schema;
	if (jsonSchema && typeof jsonSchema === "object") {
		return jsonSchema;
	}

	const firstKey = Object.keys(content)[0];
	if (!firstKey) {
		return undefined;
	}

	const firstSchema = content[firstKey]?.schema;
	if (!firstSchema || typeof firstSchema !== "object") {
		return undefined;
	}

	return firstSchema;
}

/**
 * Get success response.
 * @param operation Input parameter `operation`.
 * @returns Get success response output as `{ content?: Record<string, { schema: Record<string, unknown> }> } | undefined`.
 * @example
 * ```ts
 * const result = getSuccessResponse({});
 * // result: { content?: Record<string, { schema: Record<string, unknown> }> } | undefined
 * ```
 */
function getSuccessResponse(
	operation: OpenApiOperation,
): { content?: Record<string, { schema: Record<string, unknown> }> } | undefined {
	const responses = operation.responses ?? {};

	const response200 = responses["200"];
	if (response200) {
		return response200 as {
			content?: Record<string, { schema: Record<string, unknown> }>;
		};
	}

	const response201 = responses["201"];
	if (response201) {
		return response201 as {
			content?: Record<string, { schema: Record<string, unknown> }>;
		};
	}

	const successStatus = Object.keys(responses).find(
		(statusCode) => statusCode.startsWith("2") && responses[statusCode],
	);
	if (!successStatus) {
		return undefined;
	}

	return responses[successStatus] as {
		content?: Record<string, { schema: Record<string, unknown> }>;
	};
}

/**
 * Extract request type.
 * @param operation Input parameter `operation`.
 * @returns Extract request type output as `string | undefined`.
 * @example
 * ```ts
 * const result = extractRequestType({});
 * // result: string | undefined
 * ```
 */
function extractRequestType(operation: OpenApiOperation): string | undefined {
	const schema = getPreferredContentSchema(operation.requestBody?.content as never);
	if (!schema) {
		return undefined;
	}

	const schemaRef = getSchemaRef(schema);
	if (schemaRef) {
		return schemaRef;
	}

	const schemaType = schema.type;
	if (schemaType !== "array") {
		return undefined;
	}

	const items = schema.items;
	if (!items || typeof items !== "object") {
		return undefined;
	}

	const itemRef = getSchemaRef(items);
	if (!itemRef) {
		return undefined;
	}

	return `${itemRef}[]`;
}

/**
 * Extract response type.
 * @param operation Input parameter `operation`.
 * @returns Extract response type output as `string`.
 * @example
 * ```ts
 * const result = extractResponseType({});
 * // result: string
 * ```
 */
function extractResponseType(operation: OpenApiOperation): string {
	const response = getSuccessResponse(operation);
	if (!response) {
		return "any";
	}

	const schema = getPreferredContentSchema(response.content);
	if (!schema) {
		return "any";
	}

	const schemaRef = getSchemaRef(schema);
	if (schemaRef) {
		return schemaRef;
	}

	const schemaType = schema.type;
	if (schemaType !== "array") {
		return "any";
	}

	const items = schema.items;
	if (!items || typeof items !== "object") {
		return "any";
	}

	const itemRef = getSchemaRef(items);
	if (!itemRef) {
		return "any[]";
	}

	return `${itemRef}[]`;
}

/**
 * Get schema reference name.
 * @param schema Input parameter `schema`.
 * @returns Get schema reference name output as `string | undefined`.
 * @example
 * ```ts
 * const result = getSchemaRef({ $ref: "#/components/schemas/User" });
 * // result: string | undefined
 * ```
 */
function getSchemaRef(schema: Record<string, unknown>): string | undefined {
	const schemaReference = schema.$ref;
	if (typeof schemaReference !== "string") {
		return undefined;
	}

	const referencePathParts = schemaReference.split("/");
	const referenceName = referencePathParts[referencePathParts.length - 1];
	if (!referenceName) {
		return undefined;
	}

	return referenceName;
}

/**
 * Check if schema resolves to any.
 * @param schema Input parameter `schema`.
 * @returns Check if schema resolves to any output as `boolean`.
 * @example
 * ```ts
 * const result = isSchemaAny(undefined);
 * // result: boolean
 * ```
 */
function isSchemaAny(schema: unknown): boolean {
	const resolvedType = resolveSchemaType(schema);
	return containsAnyType(resolvedType);
}

/**
 * Resolve schema type.
 * @param schema Input parameter `schema`.
 * @returns Resolve schema type output as `string`.
 * @example
 * ```ts
 * const result = resolveSchemaType({ type: "string" });
 * // result: string
 * ```
 */
function resolveSchemaType(schema: unknown): string {
	if (!schema || typeof schema !== "object") {
		return "any";
	}

	const typedSchema = schema as Record<string, unknown>;
	const schemaRef = getSchemaRef(typedSchema);
	if (schemaRef) {
		return schemaRef;
	}

	const schemaEnum = typedSchema.enum;
	if (Array.isArray(schemaEnum)) {
		const union = schemaEnum
			.map((enumValue) =>
				typeof enumValue === "string" ? `\"${enumValue}\"` : String(enumValue),
			)
			.join(" | ");
		if (!union) {
			return "any";
		}
		return union;
	}

	const anyOfType = resolveUnionType(typedSchema.anyOf);
	if (anyOfType) {
		return anyOfType;
	}

	const oneOfType = resolveUnionType(typedSchema.oneOf);
	if (oneOfType) {
		return oneOfType;
	}

	const allOfType = resolveIntersectionType(typedSchema.allOf);
	if (allOfType) {
		return allOfType;
	}

	const schemaType = typedSchema.type;
	if (schemaType === "array") {
		const itemType = resolveSchemaType(typedSchema.items);
		return `${itemType}[]`;
	}

	if (schemaType === "object" && typedSchema.properties) {
		return "object";
	}

	if (schemaType === "string") {
		const format = typedSchema.format;
		if (format === "numeric") {
			return "number";
		}
		return "string";
	}

	if (schemaType === "number") {
		return "number";
	}

	if (schemaType === "integer") {
		return "number";
	}

	if (schemaType === "boolean") {
		return "boolean";
	}

	return "any";
}

/**
 * Resolve union type.
 * @param schemaVariants Input parameter `schemaVariants`.
 * @returns Resolve union type output as `string | undefined`.
 * @example
 * ```ts
 * const result = resolveUnionType([{ type: "string" }]);
 * // result: string | undefined
 * ```
 */
function resolveUnionType(schemaVariants: unknown): string | undefined {
	if (!Array.isArray(schemaVariants)) {
		return undefined;
	}

	const variants = schemaVariants
		.map((variant) => resolveSchemaType(variant))
		.filter(Boolean);
	if (variants.length === 0) {
		return undefined;
	}

	return variants.join(" | ");
}

/**
 * Resolve intersection type.
 * @param schemaVariants Input parameter `schemaVariants`.
 * @returns Resolve intersection type output as `string | undefined`.
 * @example
 * ```ts
 * const result = resolveIntersectionType([{ type: "string" }]);
 * // result: string | undefined
 * ```
 */
function resolveIntersectionType(schemaVariants: unknown): string | undefined {
	if (!Array.isArray(schemaVariants)) {
		return undefined;
	}

	const variants = schemaVariants
		.map((variant) => resolveSchemaType(variant))
		.filter(Boolean);
	if (variants.length === 0) {
		return undefined;
	}

	return variants.join(" & ");
}

/**
 * Check if type includes any.
 * @param typeName Input parameter `typeName`.
 * @returns Check if type includes any output as `boolean`.
 * @example
 * ```ts
 * const result = containsAnyType("any[]");
 * // result: boolean
 * ```
 */
function containsAnyType(typeName: string): boolean {
	const normalized = typeName.trim();
	if (normalized === "any") {
		return true;
	}

	if (normalized === "any[]") {
		return true;
	}

	const tokens = normalized.split(/[|&]/).map((token) => token.trim());
	return tokens.some((token) => token === "any" || token === "any[]");
}
