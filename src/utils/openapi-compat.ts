import type { OpenApiOperation, OpenApiSchema } from "./index";

type OpenApiParameter = NonNullable<OpenApiOperation["parameters"]>[number];
type OpenApiResponse = NonNullable<OpenApiOperation["responses"]>[string];

/**
 * Get preferred content schema from an OpenAPI 3 content map.
 * @param content Content map from requestBody or response.
 * @returns Preferred schema when documented.
 * @example
 * ```ts
 * const schema = getPreferredContentSchema({ "application/json": { schema: { type: "string" } } });
 * // schema: { type: "string" }
 * ```
 */
export function getPreferredContentSchema(
	content?: Record<string, { schema: OpenApiSchema }>,
): OpenApiSchema | undefined {
	if (!content) {
		return undefined;
	}

	if (content["application/json"]?.schema) {
		return content["application/json"].schema;
	}

	const firstKey = Object.keys(content)[0];
	return firstKey ? content[firstKey]?.schema : undefined;
}

/**
 * Get schema from an OpenAPI 3 parameter or Swagger 2 parameter.
 * @param parameter Operation parameter.
 * @returns Parameter schema when documented.
 * @example
 * ```ts
 * const schema = getParameterSchema({ name: "id", in: "query", type: "integer" });
 * // schema: { type: "integer" }
 * ```
 */
export function getParameterSchema(
	parameter: OpenApiParameter,
): OpenApiSchema | undefined {
	if (parameter.schema && typeof parameter.schema === "object") {
		return parameter.schema;
	}

	const swaggerSchema = buildSwaggerParameterSchema(parameter);
	if (Object.keys(swaggerSchema).length === 0) {
		return undefined;
	}

	return swaggerSchema;
}

/**
 * Get the Swagger 2 body parameter from an operation.
 * @param operation Operation object.
 * @returns Body parameter when present.
 * @example
 * ```ts
 * const parameter = getSwaggerBodyParameter({ parameters: [{ name: "dto", in: "body", schema: { type: "object" } }] });
 * // parameter: { name: "dto", in: "body", schema: { type: "object" } }
 * ```
 */
export function getSwaggerBodyParameter(
	operation: OpenApiOperation,
): OpenApiParameter | undefined {
	return operation.parameters?.find((parameter) => parameter.in === "body");
}

/**
 * Get request schema from OpenAPI 3 requestBody or Swagger 2 body parameter.
 * @param operation Operation object.
 * @returns Request schema when documented.
 * @example
 * ```ts
 * const schema = getOperationRequestSchema({ requestBody: { content: { "application/json": { schema: { type: "object" } } } } });
 * // schema: { type: "object" }
 * ```
 */
export function getOperationRequestSchema(
	operation: OpenApiOperation,
): OpenApiSchema | undefined {
	const contentSchema = getPreferredContentSchema(
		operation.requestBody?.content,
	);
	if (contentSchema) {
		return contentSchema;
	}

	const bodyParameter = getSwaggerBodyParameter(operation);
	return bodyParameter ? getParameterSchema(bodyParameter) : undefined;
}

/**
 * Check whether an operation has an OpenAPI 3 or Swagger 2 request body.
 * @param operation Operation object.
 * @returns True when a request body is documented.
 * @example
 * ```ts
 * const hasBody = hasOperationRequestBody({ parameters: [{ name: "dto", in: "body", schema: { type: "object" } }] });
 * // hasBody: true
 * ```
 */
export function hasOperationRequestBody(operation: OpenApiOperation): boolean {
	return Boolean(operation.requestBody || getSwaggerBodyParameter(operation));
}

/**
 * Get the best success response for an operation.
 * @param operation Operation object.
 * @returns Preferred 2xx response when documented.
 * @example
 * ```ts
 * const response = getSuccessResponse({ responses: { "200": { schema: { type: "string" } } } });
 * // response: { schema: { type: "string" } }
 * ```
 */
export function getSuccessResponse(
	operation: OpenApiOperation,
): OpenApiResponse | undefined {
	const responses = operation.responses || {};
	if (responses["200"]) {
		return responses["200"];
	}
	if (responses["201"]) {
		return responses["201"];
	}

	const successKey = Object.keys(responses).find(
		(key) => key.startsWith("2") && responses[key],
	);
	return successKey ? responses[successKey] : undefined;
}

/**
 * Get schema from an OpenAPI 3 response or Swagger 2 response.
 * @param response Operation response.
 * @returns Response schema when documented.
 * @example
 * ```ts
 * const schema = getResponseSchema({ schema: { type: "string" } });
 * // schema: { type: "string" }
 * ```
 */
export function getResponseSchema(
	response: OpenApiResponse | undefined,
): OpenApiSchema | undefined {
	if (!response || typeof response !== "object") {
		return undefined;
	}

	const jsonSchema = response.content?.["application/json"]?.schema;
	if (jsonSchema) {
		return jsonSchema;
	}

	return response.schema;
}

/**
 * Get response schema from the preferred success response.
 * @param operation Operation object.
 * @returns Success response schema when documented.
 * @example
 * ```ts
 * const schema = getSuccessResponseSchema({ responses: { "200": { schema: { type: "string" } } } });
 * // schema: { type: "string" }
 * ```
 */
export function getSuccessResponseSchema(
	operation: OpenApiOperation,
): OpenApiSchema | undefined {
	return getResponseSchema(getSuccessResponse(operation));
}

/**
 * Build a schema object from Swagger 2 parameter fields.
 * @param parameter Swagger 2 parameter.
 * @returns Schema composed from parameter-level fields.
 * @example
 * ```ts
 * const schema = buildSwaggerParameterSchema({ name: "limit", in: "query", type: "integer", format: "int32" });
 * // schema: { type: "integer", format: "int32" }
 * ```
 */
function buildSwaggerParameterSchema(
	parameter: OpenApiParameter,
): OpenApiSchema {
	const schema: OpenApiSchema = {};
	const source = parameter as Record<string, unknown>;
	const schemaFields = [
		"type",
		"format",
		"enum",
		"items",
		"default",
		"nullable",
	] as const;

	for (const field of schemaFields) {
		const value = source[field];
		if (value !== undefined) {
			schema[field] = value;
		}
	}

	return schema;
}
