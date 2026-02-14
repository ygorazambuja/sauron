import type { z } from "zod";
import type { SwaggerOrOpenAPISchema } from "../schemas/swagger";
import type {
	OpenApiOperation,
	OpenApiPath,
	OperationTypeInfo,
	OperationTypeMap,
} from "../utils";

/**
 * Missing Swagger definition issue.
 */
export type MissingSwaggerDefinitionIssue = {
	path: string;
	method: string;
	location: "path.parameter" | "query.parameter" | "request.body" | "response.body";
	field?: string;
	reason: string;
	recommendedDefinition: string;
};

/**
 * Missing Swagger definitions report.
 */
export type MissingSwaggerDefinitionsReport = {
	generatedAt: string;
	totalIssues: number;
	summary: {
		pathParameters: number;
		queryParameters: number;
		requestBodies: number;
		responseBodies: number;
	};
	issues: MissingSwaggerDefinitionIssue[];
};

/**
 * Create missing Swagger definitions report.
 * @param data Input parameter `data`.
 * @param operationTypes Input parameter `operationTypes`.
 * @returns Create missing Swagger definitions report output as `MissingSwaggerDefinitionsReport`.
 * @example
 * ```ts
 * const result = createMissingSwaggerDefinitionsReport({ paths: {} } as never, {});
 * // result: MissingSwaggerDefinitionsReport
 * ```
 */
export function createMissingSwaggerDefinitionsReport(
	data: z.infer<typeof SwaggerOrOpenAPISchema>,
	operationTypes?: OperationTypeMap,
): MissingSwaggerDefinitionsReport {
	const issues = collectMissingSwaggerDefinitionIssues(data, operationTypes);
	return {
		generatedAt: new Date().toISOString(),
		totalIssues: issues.length,
		summary: buildSummary(issues),
		issues,
	};
}

/**
 * Generate missing Swagger definitions file content.
 * @param report Input parameter `report`.
 * @returns Generate missing Swagger definitions file content output as `string`.
 * @example
 * ```ts
 * const result = generateMissingSwaggerDefinitionsFile({ generatedAt: "", totalIssues: 0, summary: { pathParameters: 0, queryParameters: 0, requestBodies: 0, responseBodies: 0 }, issues: [] });
 * // result: string
 * ```
 */
export function generateMissingSwaggerDefinitionsFile(
	report: MissingSwaggerDefinitionsReport,
): string {
	return `${JSON.stringify(report, null, 2)}\n`;
}

/**
 * Collect missing Swagger definition issues.
 * @param data Input parameter `data`.
 * @param operationTypes Input parameter `operationTypes`.
 * @returns Collect missing Swagger definition issues output as `MissingSwaggerDefinitionIssue[]`.
 * @example
 * ```ts
 * const result = collectMissingSwaggerDefinitionIssues({ paths: {} } as never, {});
 * // result: MissingSwaggerDefinitionIssue[]
 * ```
 */
function collectMissingSwaggerDefinitionIssues(
	data: z.infer<typeof SwaggerOrOpenAPISchema>,
	operationTypes?: OperationTypeMap,
): MissingSwaggerDefinitionIssue[] {
	if (!data.paths) {
		return [];
	}

	const issues: MissingSwaggerDefinitionIssue[] = [];
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
			const operationIssues = collectOperationIssues(
				path,
				httpMethod,
				operation,
				typeInfo,
			);
			issues.push(...operationIssues);
		}
	}

	return issues;
}

/**
 * Collect operation issues.
 * @param path Input parameter `path`.
 * @param httpMethod Input parameter `httpMethod`.
 * @param operation Input parameter `operation`.
 * @param typeInfo Input parameter `typeInfo`.
 * @returns Collect operation issues output as `MissingSwaggerDefinitionIssue[]`.
 * @example
 * ```ts
 * const result = collectOperationIssues("/users", "get", {}, undefined);
 * // result: MissingSwaggerDefinitionIssue[]
 * ```
 */
function collectOperationIssues(
	path: string,
	httpMethod: string,
	operation: OpenApiOperation,
	typeInfo?: OperationTypeInfo,
): MissingSwaggerDefinitionIssue[] {
	const issues: MissingSwaggerDefinitionIssue[] = [];

	const parameterIssues = collectParameterIssues(path, httpMethod, operation);
	issues.push(...parameterIssues);

	const requestIssue = collectRequestBodyIssue(path, httpMethod, operation, typeInfo);
	if (requestIssue) {
		issues.push(requestIssue);
	}

	const responseIssue = collectResponseBodyIssue(path, httpMethod, operation, typeInfo);
	if (responseIssue) {
		issues.push(responseIssue);
	}

	return issues;
}

/**
 * Collect parameter issues.
 * @param path Input parameter `path`.
 * @param httpMethod Input parameter `httpMethod`.
 * @param operation Input parameter `operation`.
 * @returns Collect parameter issues output as `MissingSwaggerDefinitionIssue[]`.
 * @example
 * ```ts
 * const result = collectParameterIssues("/users/{id}", "get", {});
 * // result: MissingSwaggerDefinitionIssue[]
 * ```
 */
function collectParameterIssues(
	path: string,
	httpMethod: string,
	operation: OpenApiOperation,
): MissingSwaggerDefinitionIssue[] {
	const issues: MissingSwaggerDefinitionIssue[] = [];
	const parameters = Array.isArray(operation.parameters)
		? operation.parameters
		: [];

	const pathPlaceholders = getPathPlaceholders(path);
	for (const placeholder of pathPlaceholders) {
		const pathParameter = parameters.find(
			(parameter) => parameter.in === "path" && parameter.name === placeholder,
		);

		if (!pathParameter) {
			issues.push({
				path,
				method: httpMethod.toUpperCase(),
				location: "path.parameter",
				field: placeholder,
				reason: "Path parameter is missing from operation.parameters.",
				recommendedDefinition:
					"Add a path parameter definition with schema.type or schema.$ref.",
			});
			continue;
		}

		if (!isSchemaAny(pathParameter.schema)) {
			continue;
		}

		issues.push({
			path,
			method: httpMethod.toUpperCase(),
			location: "path.parameter",
			field: placeholder,
			reason: "Path parameter schema is missing or unresolved.",
			recommendedDefinition:
				"Define parameter.schema with a primitive type, enum, object, array, or valid $ref.",
		});
	}

	for (const parameter of parameters) {
		if (parameter.in !== "query") {
			continue;
		}

		if (!isSchemaAny(parameter.schema)) {
			continue;
		}

		issues.push({
			path,
			method: httpMethod.toUpperCase(),
			location: "query.parameter",
			field: parameter.name,
			reason: "Query parameter schema is missing or unresolved.",
			recommendedDefinition:
				"Define query parameter schema.type, schema.enum, schema.items, anyOf/oneOf/allOf, or schema.$ref.",
		});
	}

	return issues;
}

/**
 * Collect request body issue.
 * @param path Input parameter `path`.
 * @param httpMethod Input parameter `httpMethod`.
 * @param operation Input parameter `operation`.
 * @param typeInfo Input parameter `typeInfo`.
 * @returns Collect request body issue output as `MissingSwaggerDefinitionIssue | undefined`.
 * @example
 * ```ts
 * const result = collectRequestBodyIssue("/users", "post", {}, undefined);
 * // result: MissingSwaggerDefinitionIssue | undefined
 * ```
 */
function collectRequestBodyIssue(
	path: string,
	httpMethod: string,
	operation: OpenApiOperation,
	typeInfo?: OperationTypeInfo,
): MissingSwaggerDefinitionIssue | undefined {
	if (!operation.requestBody) {
		return undefined;
	}

	const requestType = typeInfo?.requestType ?? extractRequestType(operation) ?? "any";
	if (!containsAnyType(requestType)) {
		return undefined;
	}

	const schema = getPreferredContentSchema(operation.requestBody.content);
	if (!schema) {
		return {
			path,
			method: httpMethod.toUpperCase(),
			location: "request.body",
			reason: "Request body exists but no schema was documented in content.",
			recommendedDefinition:
				"Add requestBody.content['application/json'].schema with type/object/array or $ref.",
		};
	}

	return {
		path,
		method: httpMethod.toUpperCase(),
		location: "request.body",
		reason: "Request body schema could not be resolved to a concrete model type.",
		recommendedDefinition:
			"Reference a schema with $ref or define a complete inline schema in requestBody.content.",
	};
}

/**
 * Collect response body issue.
 * @param path Input parameter `path`.
 * @param httpMethod Input parameter `httpMethod`.
 * @param operation Input parameter `operation`.
 * @param typeInfo Input parameter `typeInfo`.
 * @returns Collect response body issue output as `MissingSwaggerDefinitionIssue | undefined`.
 * @example
 * ```ts
 * const result = collectResponseBodyIssue("/users", "get", {}, undefined);
 * // result: MissingSwaggerDefinitionIssue | undefined
 * ```
 */
function collectResponseBodyIssue(
	path: string,
	httpMethod: string,
	operation: OpenApiOperation,
	typeInfo?: OperationTypeInfo,
): MissingSwaggerDefinitionIssue | undefined {
	const requestType = typeInfo?.requestType ?? extractRequestType(operation) ?? "any";
	let responseType = typeInfo?.responseType ?? extractResponseType(operation);
	if (!responseType) {
		responseType = "any";
	}

	const isMutatingMethod = ["post", "put", "patch"].includes(httpMethod);
	if (containsAnyType(responseType) && isMutatingMethod && !containsAnyType(requestType)) {
		responseType = requestType;
	}

	if (!containsAnyType(responseType)) {
		return undefined;
	}

	const successResponse = getSuccessResponse(operation);
	if (!successResponse) {
		return {
			path,
			method: httpMethod.toUpperCase(),
			location: "response.body",
			reason: "No 2xx success response is documented for this operation.",
			recommendedDefinition:
				"Add a 200/201 (or any 2xx) response with content schema for the HTTP client return type.",
		};
	}

	const schema = getPreferredContentSchema(successResponse.content);
	if (!schema) {
		return {
			path,
			method: httpMethod.toUpperCase(),
			location: "response.body",
			reason: "Success response exists but no response schema was documented in content.",
			recommendedDefinition:
				"Add response.content['application/json'].schema using $ref or a fully defined inline schema.",
		};
	}

	return {
		path,
		method: httpMethod.toUpperCase(),
		location: "response.body",
		reason: "Response schema could not be resolved to a concrete model type.",
		recommendedDefinition:
			"Use $ref to a schema in components.schemas/definitions or define response schema details explicitly.",
	};
}

/**
 * Build summary.
 * @param issues Input parameter `issues`.
 * @returns Build summary output as `MissingSwaggerDefinitionsReport["summary"]`.
 * @example
 * ```ts
 * const result = buildSummary([]);
 * // result: MissingSwaggerDefinitionsReport["summary"]
 * ```
 */
function buildSummary(
	issues: MissingSwaggerDefinitionIssue[],
): MissingSwaggerDefinitionsReport["summary"] {
	const summary = {
		pathParameters: 0,
		queryParameters: 0,
		requestBodies: 0,
		responseBodies: 0,
	};

	for (const issue of issues) {
		if (issue.location === "path.parameter") {
			summary.pathParameters += 1;
			continue;
		}

		if (issue.location === "query.parameter") {
			summary.queryParameters += 1;
			continue;
		}

		if (issue.location === "request.body") {
			summary.requestBodies += 1;
			continue;
		}

		summary.responseBodies += 1;
	}

	return summary;
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
