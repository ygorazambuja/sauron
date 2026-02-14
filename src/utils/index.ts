/**
 * OpenAPI to TypeScript Converter Utilities
 *
 * This module provides utilities to convert OpenAPI/Swagger JSON schemas
 * into TypeScript interface and type definitions. It handles:
 *
 * - Object schemas → TypeScript interfaces
 * - Enum schemas → TypeScript union types
 * - Primitive types (string, number, boolean)
 * - Arrays with proper typing
 * - Nullable properties
 * - Schema references ($ref)
 * - Date-time format conversion
 *
 * @example
 * ```typescript
 * import { readJsonFile, verifySwaggerComposition, createModels } from './utils';
 *
 * const swaggerData = await readJsonFile('swagger.json');
 * const validatedSchema = verifySwaggerComposition(swaggerData);
 * const typeDefinitions = createModels(validatedSchema);
 *
 * // typeDefinitions contains strings like:
 * // "export interface User { id: number; name: string; }"
 * // "export type Status = 'active' | 'inactive';"
 * ```
 *
 * @since 1.0.0
 */

import type { z } from "zod";
import { SwaggerOrOpenAPISchema } from "../schemas/swagger";

/**
 * Represents an OpenAPI path operation (GET, POST, PUT, DELETE)
 */
export type OpenApiOperation = {
	tags?: string[];
	operationId?: string;
	parameters?: Array<{
		name: string;
		in: "query" | "path" | "header" | "cookie";
		required?: boolean;
		schema: OpenApiSchema;
	}>;
	requestBody?: {
		content: Record<string, { schema: OpenApiSchema }>;
	};
	responses?: Record<
		string,
		{
			description?: string;
			content?: Record<string, { schema: OpenApiSchema }>;
		}
	>;
};

/**
 * Represents an OpenAPI path with its operations
 */
export type OpenApiPath = Record<string, OpenApiOperation>;

/**
 * Represents an OpenAPI schema definition object
 */
export type OpenApiSchema = Record<string, unknown> & {
	type?: string;
	properties?: Record<string, OpenApiSchema>;
	required?: string[];
	enum?: unknown[];
	items?: OpenApiSchema;
	anyOf?: OpenApiSchema[];
	oneOf?: OpenApiSchema[];
	allOf?: OpenApiSchema[];
	$ref?: string;
	nullable?: boolean;
	format?: string;
};

export type OperationTypeInfo = {
	requestType?: string;
	responseType?: string;
};

export type OperationTypeMap = Record<
	string,
	Record<string, OperationTypeInfo>
>;

export type TypeNameMap = Map<string, string>;

/**
 * Read json file.
 * @param filePath Input parameter `filePath`.
 * @returns Read json file output as `Promise<unknown>`.
 * @example
 * ```ts
 * const result = await readJsonFile("value");
 * // result: unknown
 * ```
 */
export async function readJsonFile(filePath: string): Promise<unknown> {
	if (!filePath || typeof filePath !== "string") {
		throw new Error("File path must be a non-empty string");
	}

	try {
		const file = Bun.file(filePath);
		const content = await file.text();
		return JSON.parse(content);
	} catch (error) {
		throw new Error(
			`Failed to read or parse JSON file "${filePath}": ${error}`,
		);
	}
}

/**
 * Fetch json from url.
 * @param url Input parameter `url`.
 * @returns Fetch json from url output as `Promise<unknown>`.
 * @example
 * ```ts
 * const result = await fetchJsonFromUrl("value");
 * // result: unknown
 * ```
 */
export async function fetchJsonFromUrl(url: string): Promise<unknown> {
	if (!url || typeof url !== "string") {
		throw new Error("URL must be a non-empty string");
	}

	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const content = await response.text();
		return JSON.parse(content);
	} catch (error) {
		throw new Error(`Failed to fetch or parse JSON from "${url}": ${error}`);
	}
}

/**
 * Verify swagger composition.
 * @param swaggerData Input parameter `swaggerData`.
 * @returns Verify swagger composition output as `z.infer<typeof SwaggerOrOpenAPISchema>`.
 * @example
 * ```ts
 * const result = verifySwaggerComposition({});
 * // result: z.infer<typeof SwaggerOrOpenAPISchema>
 * ```
 */
export function verifySwaggerComposition(
	swaggerData: Record<string, unknown>,
): z.infer<typeof SwaggerOrOpenAPISchema> {
	if (!swaggerData || typeof swaggerData !== "object") {
		throw new Error("Swagger data must be a valid object");
	}

	const { data, error } = SwaggerOrOpenAPISchema.safeParse(swaggerData);

	if (error) {
		throw new Error(`Invalid Swagger/OpenAPI schema: ${error.message}`);
	}

	return data;
}

/**
 * Create models.
 * @param data Input parameter `data`.
 * @returns Create models output as `string[]`.
 * @example
 * ```ts
 * const result = createModels({});
 * // result: string[]
 * ```
 */
export function createModels(
	data: z.infer<typeof SwaggerOrOpenAPISchema>,
): string[] {
	const { models } = createModelsWithOperationTypes(data);
	return models;
}

/**
 * Create models with operation types.
 * @param data Input parameter `data`.
 * @returns Create models with operation types output as `unknown`.
 * @example
 * ```ts
 * const result = createModelsWithOperationTypes({});
 * // result: unknown
 * ```
 */
export function createModelsWithOperationTypes(
	data: z.infer<typeof SwaggerOrOpenAPISchema>,
): {
	models: string[];
	operationTypes: OperationTypeMap;
	typeNameMap: TypeNameMap;
} {
	// Handle both OpenAPI 3.0+ (components.schemas) and Swagger 2.0 (definitions)
	const schemas =
		(data as any).components?.schemas || (data as any).definitions;
	const schemaEntries = schemas ? Object.entries(schemas) : [];
	const typeDefinitions: string[] = [];
	const { typeNameMap, usedTypeNames } = createTypeNameMap(schemas);

	if (!schemas) {
		console.warn("Warning: No schema definitions found in OpenAPI components");
	}

	for (const [modelName, schemaDefinition] of schemaEntries) {
		if (modelName && schemaDefinition) {
			const typedSchemaDefinition = schemaDefinition as OpenApiSchema;
			const resolvedName = resolveTypeName(modelName, typeNameMap);
			const typeScriptCode = generateTypeScriptDefinition(
				resolvedName,
				typedSchemaDefinition,
				typeNameMap,
			);
			typeDefinitions.push(typeScriptCode);
		}
	}

	const { typeDefinitions: inlineDefinitions, operationTypes } =
		collectInlineOperationTypes(data, usedTypeNames, typeNameMap);

	if (typeDefinitions.length === 0 && inlineDefinitions.length === 0) {
		console.warn("Warning: No schema definitions found in OpenAPI components");
		return { models: [], operationTypes, typeNameMap };
	}

	return {
		models: [...typeDefinitions, ...inlineDefinitions],
		operationTypes,
		typeNameMap,
	};
}

/**
 * Create angular http client methods.
 * @param data Input parameter `data`.
 * @param operationTypes Input parameter `operationTypes`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @returns Create angular http client methods output as `unknown`.
 * @example
 * ```ts
 * const result = createAngularHttpClientMethods({}, {}, {});
 * // result: unknown
 * ```
 */
export function createAngularHttpClientMethods(
	data: z.infer<typeof SwaggerOrOpenAPISchema>,
	operationTypes?: OperationTypeMap,
	typeNameMap?: TypeNameMap,
): { methods: string[]; imports: string[]; paramsInterfaces: string[] } {
	if (!data.paths) {
		throw new Error(
			"No paths found in OpenAPI specification. Ensure your Swagger file has paths defined.",
		);
	}

	const methods: string[] = [];
	const paramsInterfaces: string[] = [];
	const pathEntries = Object.entries(data.paths);
	const usedMethodNames = new Set<string>();
	const usedTypes = new Set<string>();
	const resolvedTypeNameMap =
		typeNameMap ??
		createTypeNameMap(
			((data as any).components?.schemas || (data as any).definitions) as
				| Record<string, OpenApiSchema>
				| undefined,
		).typeNameMap;

	if (pathEntries.length === 0) {
		console.warn("Warning: No path definitions found in OpenAPI specification");
		return { methods, imports: [], paramsInterfaces: [] };
	}

	for (const [path, pathItem] of pathEntries) {
		const result = generateMethodsForPath(
			path,
			pathItem as OpenApiPath,
			usedMethodNames,
			data.components,
			usedTypes,
			operationTypes,
			resolvedTypeNameMap,
		);
		methods.push(...result.methods);
		paramsInterfaces.push(...result.paramsInterfaces);
	}

	// Generate imports for used types
	const imports = Array.from(usedTypes).sort();

	return { methods, imports, paramsInterfaces };
}

/**
 * To pascal case.
 * @param value Input parameter `value`.
 * @returns To pascal case output as `string`.
 * @example
 * ```ts
 * const result = toPascalCase("value");
 * // result: string
 * ```
 */
function toPascalCase(value: string): string {
	const sanitized = value
		.replace(/[^a-zA-Z0-9]+/g, " ")
		.split(" ")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");

	if (!sanitized) {
		return "";
	}

	if (/^[0-9]/.test(sanitized)) {
		return `Type${sanitized}`;
	}

	return sanitized;
}

/**
 * Sanitize type name.
 * @param value Input parameter `value`.
 * @returns Sanitize type name output as `string`.
 * @example
 * ```ts
 * const result = sanitizeTypeName("value");
 * // result: string
 * ```
 */
function sanitizeTypeName(value: string): string {
	const sanitized = toPascalCase(value);
	return sanitized || "Type";
}

/**
 * Resolve type name.
 * @param value Input parameter `value`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @returns Resolve type name output as `string`.
 * @example
 * ```ts
 * const result = resolveTypeName("value", {});
 * // result: string
 * ```
 */
function resolveTypeName(value: string, typeNameMap?: TypeNameMap): string {
	return typeNameMap?.get(value) ?? sanitizeTypeName(value);
}

/**
 * Create type name map.
 * @param schemas Input parameter `schemas`.
 * @returns Create type name map output as `unknown`.
 * @example
 * ```ts
 * const result = createTypeNameMap({});
 * // result: unknown
 * ```
 */
function createTypeNameMap(schemas?: Record<string, OpenApiSchema>): {
	typeNameMap: TypeNameMap;
	usedTypeNames: Set<string>;
} {
	const typeNameMap: TypeNameMap = new Map();
	const usedTypeNames = new Set<string>();

	if (!schemas) {
		return { typeNameMap, usedTypeNames };
	}

	for (const modelName of Object.keys(schemas)) {
		const sanitizedName = sanitizeTypeName(modelName);
		const uniqueName = makeUniqueTypeName(sanitizedName, usedTypeNames);
		typeNameMap.set(modelName, uniqueName);
	}

	return { typeNameMap, usedTypeNames };
}

/**
 * Build inline base name.
 * @param path Input parameter `path`.
 * @param httpMethod Input parameter `httpMethod`.
 * @param operation Input parameter `operation`.
 * @returns Build inline base name output as `string`.
 * @example
 * ```ts
 * const result = buildInlineBaseName("value", "value", {});
 * // result: string
 * ```
 */
function buildInlineBaseName(
	path: string,
	httpMethod: string,
	operation: OpenApiOperation,
): string {
	if (operation.operationId) {
		const opName = toPascalCase(operation.operationId);
		if (opName) {
			return opName;
		}
	}

	const pathParts = path.split("/").filter((part) => part && part !== "api");
	const pathName =
		pathParts.length > 0
			? pathParts
					.map((part) => {
						if (part.startsWith("{")) {
							const param = part.slice(1, -1);
							return `By${param.charAt(0).toUpperCase()}${param.slice(1)}`;
						}
						return part.charAt(0).toUpperCase() + part.slice(1);
					})
					.join("")
			: "Api";

	const methodPrefix = httpMethod.charAt(0).toUpperCase() + httpMethod.slice(1);
	return `${methodPrefix}${pathName}`;
}

/**
 * Make unique type name.
 * @param name Input parameter `name`.
 * @param usedNames Input parameter `usedNames`.
 * @returns Make unique type name output as `string`.
 * @example
 * ```ts
 * const result = makeUniqueTypeName("value", new Set());
 * // result: string
 * ```
 */
function makeUniqueTypeName(name: string, usedNames: Set<string>): string {
	if (!usedNames.has(name)) {
		usedNames.add(name);
		return name;
	}

	let counter = 2;
	while (usedNames.has(`${name}${counter}`)) {
		counter++;
	}

	const uniqueName = `${name}${counter}`;
	usedNames.add(uniqueName);
	return uniqueName;
}

/**
 * Get preferred content schema.
 * @example
 * ```ts
 * getPreferredContentSchema();
 * ```
 */
function getPreferredContentSchema(
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
 * Get success response.
 * @param operation Input parameter `operation`.
 * @returns Get success response output as `unknown`.
 * @example
 * ```ts
 * const result = getSuccessResponse({});
 * // result: unknown
 * ```
 */
function getSuccessResponse(
	operation: OpenApiOperation,
): { content?: Record<string, { schema: OpenApiSchema }> } | undefined {
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
 * Generate inline type definition.
 * @param typeName Input parameter `typeName`.
 * @param schema Input parameter `schema`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @returns Generate inline type definition output as `string`.
 * @example
 * ```ts
 * const result = generateInlineTypeDefinition("value", {}, {});
 * // result: string
 * ```
 */
function generateInlineTypeDefinition(
	typeName: string,
	schema: OpenApiSchema,
	typeNameMap?: TypeNameMap,
): string {
	if (schema.type === "object" && schema.properties) {
		return generateTypeScriptDefinition(typeName, schema, typeNameMap);
	}

	return `export type ${typeName} = ${convertSchemaToTypeScript(schema, typeNameMap)};`;
}

/**
 * Resolve schema type name.
 * @param schema Input parameter `schema`.
 * @param typeName Input parameter `typeName`.
 * @param usedTypeNames Input parameter `usedTypeNames`.
 * @param typeDefinitions Input parameter `typeDefinitions`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @returns Resolve schema type name output as `string | undefined`.
 * @example
 * ```ts
 * const result = resolveSchemaTypeName({}, "value", new Set(), [], {});
 * // result: string | undefined
 * ```
 */
function resolveSchemaTypeName(
	schema: OpenApiSchema | undefined,
	typeName: string,
	usedTypeNames: Set<string>,
	typeDefinitions: string[],
	typeNameMap?: TypeNameMap,
): string | undefined {
	if (!schema) {
		return undefined;
	}

	if (schema.$ref && typeof schema.$ref === "string") {
		const refParts = schema.$ref.split("/");
		const rawName = refParts[refParts.length - 1];
		return rawName ? resolveTypeName(rawName, typeNameMap) : undefined;
	}

	const safeTypeName = sanitizeTypeName(typeName);
	const uniqueName = makeUniqueTypeName(safeTypeName, usedTypeNames);
	const typeDefinition = generateInlineTypeDefinition(
		uniqueName,
		schema,
		typeNameMap,
	);
	typeDefinitions.push(typeDefinition);
	return uniqueName;
}

/**
 * Collect inline operation types.
 * @param data Input parameter `data`.
 * @param usedTypeNames Input parameter `usedTypeNames`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @returns Collect inline operation types output as `unknown`.
 * @example
 * ```ts
 * const result = collectInlineOperationTypes({}, new Set(), {});
 * // result: unknown
 * ```
 */
function collectInlineOperationTypes(
	data: z.infer<typeof SwaggerOrOpenAPISchema>,
	usedTypeNames: Set<string>,
	typeNameMap?: TypeNameMap,
): { typeDefinitions: string[]; operationTypes: OperationTypeMap } {
	const typeDefinitions: string[] = [];
	const operationTypes: OperationTypeMap = {};

	if (!data.paths) {
		return { typeDefinitions, operationTypes };
	}

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

			const baseName = buildInlineBaseName(path, httpMethod, operation);
			const requestSchema = getPreferredContentSchema(
				operation.requestBody?.content,
			);
			const responseSchema = getPreferredContentSchema(
				getSuccessResponse(operation)?.content,
			);

			const requestType = resolveSchemaTypeName(
				requestSchema,
				`${baseName}Request`,
				usedTypeNames,
				typeDefinitions,
				typeNameMap,
			);
			const responseType = resolveSchemaTypeName(
				responseSchema,
				`${baseName}Response`,
				usedTypeNames,
				typeDefinitions,
				typeNameMap,
			);

			if (requestType || responseType) {
				if (!operationTypes[path]) {
					operationTypes[path] = {};
				}
				operationTypes[path][httpMethod] = {
					requestType,
					responseType,
				};
			}
		}
	}

	return { typeDefinitions, operationTypes };
}

/**
 * Generate methods for path.
 * @param path Input parameter `path`.
 * @param operations Input parameter `operations`.
 * @param usedMethodNames Input parameter `usedMethodNames`.
 * @param components Input parameter `components`.
 * @param usedTypes Input parameter `usedTypes`.
 * @param operationTypes Input parameter `operationTypes`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @returns Generate methods for path output as `unknown`.
 * @example
 * ```ts
 * const result = generateMethodsForPath("value", {}, new Set(), {}, new Set(), {}, {});
 * // result: unknown
 * ```
 */
function generateMethodsForPath(
	path: string,
	operations: OpenApiPath,
	usedMethodNames: Set<string>,
	components: any,
	usedTypes: Set<string>,
	operationTypes?: OperationTypeMap,
	typeNameMap?: TypeNameMap,
): { methods: string[]; paramsInterfaces: string[] } {
	const methods: string[] = [];
	const paramsInterfaces: string[] = [];
	const httpMethods = [
		"get",
		"post",
		"put",
		"delete",
		"patch",
		"head",
		"options",
	] as const;

	for (const httpMethod of httpMethods) {
		if (operations[httpMethod]) {
			const result = generateHttpMethod(
				path,
				httpMethod,
				operations[httpMethod],
				usedMethodNames,
				components,
				usedTypes,
				operationTypes,
				typeNameMap,
			);
			if (result) {
				methods.push(result.method);
				if (result.paramsInterface) {
					paramsInterfaces.push(result.paramsInterface);
				}
			}
		}
	}

	return { methods, paramsInterfaces };
}

/**
 * Generate http method.
 * @param path Input parameter `path`.
 * @param httpMethod Input parameter `httpMethod`.
 * @param operation Input parameter `operation`.
 * @param usedMethodNames Input parameter `usedMethodNames`.
 * @param components Input parameter `components`.
 * @param usedTypes Input parameter `usedTypes`.
 * @param operationTypes Input parameter `operationTypes`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @returns Generate http method output as `unknown`.
 * @example
 * ```ts
 * const result = generateHttpMethod("value", "value", {}, new Set(), {}, new Set(), {}, {});
 * // result: unknown
 * ```
 */
function generateHttpMethod(
	path: string,
	httpMethod: string,
	operation: OpenApiOperation,
	usedMethodNames: Set<string>,
	components: any,
	usedTypes: Set<string>,
	operationTypes?: OperationTypeMap,
	typeNameMap?: TypeNameMap,
): { method: string; paramsInterface?: string } | null {
	try {
		const methodName = generateMethodName(path, httpMethod, operation);

		// Ensure unique method name
		let counter = 1;
		let uniqueMethodName = methodName;
		while (usedMethodNames.has(uniqueMethodName)) {
			uniqueMethodName = `${methodName}${counter}`;
			counter++;
		}

		usedMethodNames.add(uniqueMethodName);

		const typeInfo = operationTypes?.[path]?.[httpMethod];
		const parameters = extractMethodParameters(
			path,
			operation,
			typeInfo,
			components,
			typeNameMap,
			uniqueMethodName,
		);

		// Extract response type from operation
		const requestType =
			typeInfo?.requestType ??
			extractRequestType(operation, components, typeNameMap);
		let responseType =
			typeInfo?.responseType ??
			extractResponseType(operation, components, typeNameMap);
		if (
			responseType === "any" &&
			requestType &&
			["post", "put", "patch"].includes(httpMethod)
		) {
			responseType = requestType;
		}
		const returnType =
			responseType !== "any"
				? `Observable<${responseType}>`
				: "Observable<any>";

		// Track used types for imports
		if (requestType) {
			usedTypes.add(requestType);
		}
		if (responseType !== "any" && !responseType.includes("[]")) {
			// For single types (not arrays), add to imports
			usedTypes.add(responseType);
		} else if (responseType.includes("[]")) {
			// For array types like "Type[]", extract "Type" and add to imports
			const baseType = responseType.replace("[]", "");
			usedTypes.add(baseType);
		}

		const methodBody = generateMethodBody(
			path,
			httpMethod,
			operation,
			responseType,
		);

		const paramInfo = buildParameterInfo(
			path,
			operation,
			components,
			typeNameMap,
		);
		const paramTypes = [
			...paramInfo.pathParams.map((param) => param.type),
			...paramInfo.queryParams.map((param) => param.type),
		];
		addParamTypeImports(paramTypes, usedTypes);

		let paramsInterface: string | undefined;
		if (paramInfo.queryParams.length > 0) {
			paramsInterface = generateParamsInterface(
				uniqueMethodName,
				paramInfo.queryParams,
			);
		}

		return {
			method: `  ${uniqueMethodName}(${parameters}): ${returnType} {
${methodBody}
  }`,
			paramsInterface,
		};
	} catch (error) {
		console.warn(
			`Warning: Could not generate method for ${httpMethod.toUpperCase()} ${path}:`,
			error,
		);
		return null;
	}
}

/**
 * Generate method name.
 * @param path Input parameter `path`.
 * @param httpMethod Input parameter `httpMethod`.
 * @param operation Input parameter `operation`.
 * @returns Generate method name output as `string`.
 * @example
 * ```ts
 * const result = generateMethodName("value", "value", {});
 * // result: string
 * ```
 */
function generateMethodName(
	path: string,
	httpMethod: string,
	operation: OpenApiOperation,
): string {
	// Extract meaningful parts from path
	const pathParts = path.split("/").filter((part) => part && part !== "api");
	const tags = operation.tags || [];

	// Create base name from tags or path parts
	let baseName: string;
	if (pathParts.length > 1) {
		// Use path parts when there are multiple segments (more descriptive)
		baseName = pathParts
			.map((part) => {
				if (part.startsWith("{")) {
					return `By${part.slice(1, -1).charAt(0).toUpperCase()}${part.slice(2, -1)}`;
				}
				return part.charAt(0).toUpperCase() + part.slice(1);
			})
			.join("");
	} else if (tags.length > 0) {
		// Use tags as fallback
		baseName = tags
			.map((tag) => tag.charAt(0).toUpperCase() + tag.slice(1))
			.join("");
	} else {
		baseName = "Api";
	}

	// Clean up base name (remove special chars)
	baseName = baseName.replace(/[^a-zA-Z0-9]/g, "");

	// Create HTTP method prefix
	const methodPrefix = httpMethod.charAt(0).toUpperCase() + httpMethod.slice(1);

	// For paths with parameters, add descriptive suffixes
	const hasPathParams = path.includes("{");
	const hasQueryParams =
		operation.parameters?.some((p) => p.in === "query") || false;
	const hasBody = !!operation.requestBody;

	let additionalSuffix = "";
	if (hasPathParams && httpMethod === "get") {
		additionalSuffix = "";
	} else if (hasQueryParams && httpMethod === "get") {
		additionalSuffix = "WithParams";
	} else if (hasBody && ["post", "put", "patch"].includes(httpMethod)) {
		additionalSuffix = "Create";
	}

	return methodPrefix + baseName + additionalSuffix;
}

/**
 * Build parameter info.
 * @param path Input parameter `path`.
 * @param operation Input parameter `operation`.
 * @param components Input parameter `components`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @example
 * ```ts
 * buildParameterInfo("value", {}, {}, {});
 * ```
 */
function buildParameterInfo(
	path: string,
	operation: OpenApiOperation,
	components?: any,
	typeNameMap?: TypeNameMap,
) {
	const usedNames = new Set<string>();

	const makeUniqueName = (base: string, suffix: string) => {
		if (!usedNames.has(base)) {
			usedNames.add(base);
			return base;
		}
		const candidate = `${base}${suffix}`;
		if (!usedNames.has(candidate)) {
			usedNames.add(candidate);
			return candidate;
		}
		let counter = 2;
		while (usedNames.has(`${candidate}${counter}`)) {
			counter++;
		}
		const unique = `${candidate}${counter}`;
		usedNames.add(unique);
		return unique;
	};

	const pathParams: Array<{ name: string; varName: string; type: string }> = [];
	const queryParams: Array<{
		name: string;
		varName: string;
		required: boolean;
		type: string;
	}> = [];
	let bodyParam: { name: string; varName: string } | null = null;

	// Extract path parameters (always required)
	const pathParamMatches = path.match(/\{([^}]+)\}/g);
	if (pathParamMatches) {
		const pathParamSchemas =
			operation.parameters?.filter((param) => param.in === "path") || [];
		for (const match of pathParamMatches) {
			const paramName = match.slice(1, -1); // Remove { }
			usedNames.add(paramName);
			const schema = pathParamSchemas.find(
				(param) => param.name === paramName,
			)?.schema;
			const type = schema
				? convertParamSchemaToTypeScript(schema, components, typeNameMap)
				: "any";
			pathParams.push({ name: paramName, varName: paramName, type });
		}
	}

	// Extract query parameters (may be required or optional)
	if (operation.parameters) {
		for (const param of operation.parameters) {
			if (param.in === "query") {
				const varName = makeUniqueName(param.name, "Query");
				queryParams.push({
					name: param.name,
					varName,
					required: !!param.required,
					type: convertParamSchemaToTypeScript(
						param.schema,
						components,
						typeNameMap,
					),
				});
			}
		}
	}

	// Extract request body parameter for POST/PUT/PATCH (always required)
	if (operation.requestBody) {
		const varName = makeUniqueName("body", "Payload");
		bodyParam = { name: "body", varName };
	}

	return { pathParams, queryParams, bodyParam };
}

/**
 * Generate params interface.
 * @example
 * ```ts
 * generateParamsInterface();
 * ```
 */
function generateParamsInterface(
	methodName: string,
	queryParams: Array<{ name: string; required: boolean; type: string }>,
): string {
	const props = queryParams.map((param) => {
		const optional = param.required ? "" : "?";
		return `  ${param.name}${optional}: ${param.type};`;
	});
	return `export interface ${methodName}Params {\n${props.join("\n")}\n}`;
}

/**
 * Extract method parameters.
 * @param path Input parameter `path`.
 * @param operation Input parameter `operation`.
 * @param typeInfo Input parameter `typeInfo`.
 * @param components Input parameter `components`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @param methodName Input parameter `methodName`.
 * @returns Extract method parameters output as `string`.
 * @example
 * ```ts
 * const result = extractMethodParameters("value", {}, {}, {}, {}, "value");
 * // result: string
 * ```
 */
function extractMethodParameters(
	path: string,
	operation: OpenApiOperation,
	typeInfo?: OperationTypeInfo,
	components?: any,
	typeNameMap?: TypeNameMap,
	methodName?: string,
): string {
	const params: string[] = [];
	const optionalParams: string[] = [];
	const { pathParams, queryParams, bodyParam } = buildParameterInfo(
		path,
		operation,
		components,
		typeNameMap,
	);

	for (const param of pathParams) {
		params.push(`${param.varName}: ${param.type}`);
	}

	if (queryParams.length > 0 && methodName) {
		params.push(`params: ${methodName}Params`);
	} else {
		for (const param of queryParams) {
			if (param.required) {
				params.push(`${param.varName}: ${param.type}`);
			} else {
				optionalParams.push(`${param.varName}?: ${param.type}`);
			}
		}
	}

	if (bodyParam) {
		const bodyType =
			typeInfo?.requestType ??
			extractRequestType(operation, components, typeNameMap) ??
			"any";
		params.push(`${bodyParam.varName}: ${bodyType}`);
	}

	return [...params, ...optionalParams].join(", ");
}

/**
 * Extract request type.
 * @param operation Input parameter `operation`.
 * @param _components Input parameter `_components`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @returns Extract request type output as `string | undefined`.
 * @example
 * ```ts
 * const result = extractRequestType({}, {}, {});
 * // result: string | undefined
 * ```
 */
function extractRequestType(
	operation: OpenApiOperation,
	_components?: any,
	typeNameMap?: TypeNameMap,
): string | undefined {
	const schema = getPreferredContentSchema(operation.requestBody?.content);
	if (!schema) {
		return undefined;
	}

	if (schema.$ref && typeof schema.$ref === "string") {
		const refParts = schema.$ref.split("/");
		const rawName = refParts[refParts.length - 1];
		return rawName ? resolveTypeName(rawName, typeNameMap) : undefined;
	}

	if (schema.type === "array" && schema.items?.$ref) {
		const refParts = schema.items.$ref.split("/");
		const itemTypeName = refParts[refParts.length - 1];
		return itemTypeName
			? `${resolveTypeName(itemTypeName, typeNameMap)}[]`
			: undefined;
	}

	return undefined;
}

/**
 * Extract response type.
 * @param operation Input parameter `operation`.
 * @param _components Input parameter `_components`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @returns Extract response type output as `string`.
 * @example
 * ```ts
 * const result = extractResponseType({}, {}, {});
 * // result: string
 * ```
 */
function extractResponseType(
	operation: OpenApiOperation,
	_components?: any,
	typeNameMap?: TypeNameMap,
): string {
	// Look for 200 response first, then any 2xx response
	const response =
		operation.responses?.["200"] ||
		operation.responses?.["201"] ||
		(Object.keys(operation.responses || {}).find(
			(key) => key.startsWith("2") && operation.responses?.[key],
		) &&
			operation.responses?.[
				Object.keys(operation.responses).find((key) => key.startsWith("2"))!
			]);

	if (!response || typeof response !== "object") {
		return "any";
	}

	// Check for content with application/json
	const content = (response as any).content;
	if (content?.["application/json"]?.schema) {
		const schema = content["application/json"].schema;

		// Handle $ref
		if (schema.$ref && typeof schema.$ref === "string") {
			const refParts = schema.$ref.split("/");
			const typeName = refParts[refParts.length - 1];
			return typeName ? resolveTypeName(typeName, typeNameMap) : "any";
		}

		// Handle direct type
		if (schema.type === "array" && schema.items?.$ref) {
			const refParts = schema.items.$ref.split("/");
			const itemTypeName = refParts[refParts.length - 1];
			return itemTypeName
				? `${resolveTypeName(itemTypeName, typeNameMap)}[]`
				: "any[]";
		}

		// Fallback to any for complex schemas
		return "any";
	}

	return "any";
}

/**
 * Generate method body.
 * @param path Input parameter `path`.
 * @param httpMethod Input parameter `httpMethod`.
 * @param operation Input parameter `operation`.
 * @param responseType Input parameter `responseType`.
 * @returns Generate method body output as `string`.
 * @example
 * ```ts
 * const result = generateMethodBody("value", "value", {}, "value");
 * // result: string
 * ```
 */
function generateMethodBody(
	path: string,
	httpMethod: string,
	operation: OpenApiOperation,
	responseType: string,
): string {
	const paramInfo = buildParameterInfo(path, operation);
	// Replace path parameters with template literals
	let url = path.replace(/\{([^}]+)\}/g, "${$1}");

	// Add backticks for template literal if there are path parameters
	const hasPathParams = path.includes("{");
	if (hasPathParams) {
		url = `\`${url}\``;
	} else {
		url = `"${url}"`;
	}

	// Build HttpClient method call
	const httpClientMethod = `this.httpClient.${httpMethod}<${responseType}>`;
	const args = [url];

	const queryParams = paramInfo.queryParams || [];
	const hasQueryParams = queryParams.length > 0;
	const hasBody = !!operation.requestBody;
	const requiresBody = ["post", "put", "patch"].includes(httpMethod);

	if (hasBody) {
		args.push(paramInfo.bodyParam?.varName || "body");
	} else if (requiresBody) {
		args.push("null");
	}

	if (hasQueryParams) {
		args.push(`{ params: { ...params } }`);
	}

	return `    return ${httpClientMethod}(${args.join(", ")});`;
}

/**
 * Convert param schema to type script.
 * @param schema Input parameter `schema`.
 * @param components Input parameter `components`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @returns Convert param schema to type script output as `string`.
 * @example
 * ```ts
 * const result = convertParamSchemaToTypeScript({}, {}, {});
 * // result: string
 * ```
 */
function convertParamSchemaToTypeScript(
	schema: OpenApiSchema,
	components?: any,
	typeNameMap?: TypeNameMap,
): string {
	if (!schema || typeof schema !== "object") {
		return "any";
	}

	// Handle JSON Schema $ref references
	if (schema.$ref && typeof schema.$ref === "string") {
		const referencePathParts = schema.$ref.split("/");
		const referencedTypeName =
			referencePathParts[referencePathParts.length - 1];
		if (!referencedTypeName) {
			return "any";
		}

		const referencedSchema = components?.schemas?.[referencedTypeName] as
			| OpenApiSchema
			| undefined;
		if (
			referencedSchema?.type === "string" &&
			referencedSchema.format === "date-time"
		) {
			return "string";
		}

		return resolveTypeName(referencedTypeName, typeNameMap);
	}

	// Handle enum values - convert to TypeScript union types
	if (Array.isArray(schema.enum)) {
		const unionValues = schema.enum
			.map((enumValue: unknown) => {
				if (typeof enumValue === "string") {
					return `"${enumValue}"`;
				}
				return String(enumValue);
			})
			.join(" | ");

		return unionValues || "any";
	}

	// Handle anyOf/oneOf schemas - convert to union types
	if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
		const variants = (schema.anyOf || schema.oneOf || [])
			.map((variant) =>
				convertParamSchemaToTypeScript(variant, components, typeNameMap),
			)
			.filter(Boolean);
		const union = variants.join(" | ");
		return union || "any";
	}

	// Handle allOf schemas - convert to intersection types
	if (Array.isArray(schema.allOf)) {
		const variants = schema.allOf
			.map((variant) =>
				convertParamSchemaToTypeScript(variant, components, typeNameMap),
			)
			.filter(Boolean);
		const intersection = variants.join(" & ");
		return intersection || "any";
	}

	// Handle array types with item schema
	if (schema.type === "array" && schema.items) {
		const itemType = convertParamSchemaToTypeScript(
			schema.items,
			components,
			typeNameMap,
		);
		return `${itemType}[]`;
	}

	// For params, date-time should be string
	if (schema.type === "string" && schema.format === "date-time") {
		return "string";
	}

	return convertSchemaToTypeScript(schema, typeNameMap);
}

/**
 * Add param type imports.
 * @param paramTypes Input parameter `paramTypes`.
 * @param usedTypes Input parameter `usedTypes`.
 * @example
 * ```ts
 * addParamTypeImports([], new Set());
 * ```
 */
function addParamTypeImports(paramTypes: string[], usedTypes: Set<string>) {
	for (const type of paramTypes) {
		const parts = type.split(/[|&]/).map((part) => part.trim());
		for (let part of parts) {
			while (part.endsWith("[]")) {
				part = part.slice(0, -2);
			}
			if (!part) {
				continue;
			}
			if (
				part === "string" ||
				part === "number" ||
				part === "boolean" ||
				part === "any" ||
				part === "unknown" ||
				part === "object" ||
				part === "null" ||
				part === "undefined" ||
				part === "Date"
			) {
				continue;
			}
			if (
				part.startsWith('"') ||
				part.startsWith("'") ||
				part.startsWith("{") ||
				/^[0-9]/.test(part)
			) {
				continue;
			}
			usedTypes.add(part);
		}
	}
}

/**
 * Convert schema to type script.
 * @param schema Input parameter `schema`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @returns Convert schema to type script output as `string`.
 * @example
 * ```ts
 * const result = convertSchemaToTypeScript({}, {});
 * // result: string
 * ```
 */
function convertSchemaToTypeScript(
	schema: OpenApiSchema,
	typeNameMap?: TypeNameMap,
): string {
	if (!schema || typeof schema !== "object") {
		return "any";
	}

	// Handle JSON Schema $ref references (e.g., "#/components/schemas/ModelName")
	if (schema.$ref && typeof schema.$ref === "string") {
		// Extract the referenced type name from the $ref path
		const referencePathParts = schema.$ref.split("/");
		const referencedTypeName =
			referencePathParts[referencePathParts.length - 1];

		if (!referencedTypeName) {
			throw new Error(`Invalid $ref format: ${schema.$ref}`);
		}

		return resolveTypeName(referencedTypeName, typeNameMap);
	}

	// Handle enum values - convert to TypeScript union types
	if (Array.isArray(schema.enum)) {
		const unionValues = schema.enum
			.map((enumValue: unknown) => {
				// String enums need quotes, numbers stay as-is
				if (typeof enumValue === "string") {
					return `"${enumValue}"`;
				}
				return String(enumValue);
			})
			.join(" | ");

		return unionValues || "any";
	}

	// Handle anyOf/oneOf schemas - convert to union types
	if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
		const variants = (schema.anyOf || schema.oneOf || [])
			.map((variant) => convertSchemaToTypeScript(variant, typeNameMap))
			.filter(Boolean);
		const union = variants.join(" | ");
		return union || "any";
	}

	// Handle allOf schemas - convert to intersection types
	if (Array.isArray(schema.allOf)) {
		const variants = schema.allOf
			.map((variant) => convertSchemaToTypeScript(variant, typeNameMap))
			.filter(Boolean);
		const intersection = variants.join(" & ");
		return intersection || "any";
	}

	// Handle array types with item schema
	if (schema.type === "array" && schema.items) {
		const itemType = convertSchemaToTypeScript(schema.items, typeNameMap);
		return `${itemType}[]`;
	}

	// Handle inline object schemas
	if (schema.type === "object" && schema.properties) {
		const requiredProperties = Array.isArray(schema.required)
			? schema.required
			: [];
		const hasExplicitRequiredList = requiredProperties.length > 0;
		const entries = Object.entries(
			schema.properties as Record<string, OpenApiSchema>,
		);

		if (entries.length === 0) {
			return "{}";
		}

		const propertyDefinitions = entries.map(
			([propertyName, propertySchema]) => {
				const propertyType = convertSchemaToTypeScript(
					propertySchema,
					typeNameMap,
				);
				const isRequired = hasExplicitRequiredList
					? requiredProperties.includes(propertyName)
					: true;
				const optionalMarker = isRequired ? "" : "?";
				return `${propertyName}${optionalMarker}: ${propertyType};`;
			},
		);

		return `{ ${propertyDefinitions.join(" ")} }`;
	}

	// Handle primitive OpenAPI types
	let typeScriptType: string;
	switch (schema.type) {
		case "string":
			// Special handling for date-time and numeric formats
			if (schema.format === "date-time") {
				typeScriptType = "string";
			} else if (schema.format === "numeric") {
				typeScriptType = "number";
			} else {
				typeScriptType = "string";
			}
			break;
		case "number":
		case "integer":
			// Both number and integer map to TypeScript number
			typeScriptType = "number";
			break;
		case "boolean":
			typeScriptType = "boolean";
			break;
		default:
			// Unknown or complex types default to any
			typeScriptType = "any";
			break;
	}

	// Handle nullable properties (OpenAPI 3.0+)
	if (schema.nullable === true) {
		typeScriptType += " | null";
	}

	return typeScriptType;
}

/**
 * Generate type script definition.
 * @param modelName Input parameter `modelName`.
 * @param schema Input parameter `schema`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @returns Generate type script definition output as `string`.
 * @example
 * ```ts
 * const result = generateTypeScriptDefinition("value", {}, {});
 * // result: string
 * ```
 */
function generateTypeScriptDefinition(
	modelName: string,
	schema: OpenApiSchema,
	typeNameMap?: TypeNameMap,
): string {
	if (!modelName || typeof modelName !== "string") {
		throw new Error("Model name must be a non-empty string");
	}

	if (!schema || typeof schema !== "object") {
		throw new Error(`Invalid schema for model "${modelName}"`);
	}

	// Handle enum schemas - generate TypeScript union types
	if (Array.isArray(schema.enum)) {
		const unionValues = schema.enum
			.map((enumValue: unknown) => {
				// String enums need quotes for TypeScript literal types
				if (typeof enumValue === "string") {
					return `"${enumValue}"`;
				}
				return String(enumValue);
			})
			.join(" | ");

		return `export type ${modelName} = ${unionValues};`;
	}

	// Handle object schemas - generate TypeScript interfaces
	if (schema.type === "object" && schema.properties) {
		const propertyDefinitions: string[] = [];
		const requiredProperties = Array.isArray(schema.required)
			? schema.required
			: [];
		const hasExplicitRequiredList = requiredProperties.length > 0;

		for (const [propertyName, propertySchema] of Object.entries(
			schema.properties as Record<string, OpenApiSchema>,
		)) {
			const propertyType = convertSchemaToTypeScript(
				propertySchema,
				typeNameMap,
			);

			// Determine if property should be optional
			// OpenAPI Logic:
			// - If schema has NO required array: all defined properties are required
			// - If schema HAS required array: only properties in array are required
			// - Undefined properties are never included in generated interface
			const isRequired = hasExplicitRequiredList
				? requiredProperties.includes(propertyName)
				: true;

			const optionalMarker = isRequired ? "" : "?";
			if (
				propertySchema.type === "string" &&
				propertySchema.format === "date-time"
			) {
				propertyDefinitions.push("  // openapi Date -> String");
			}
			propertyDefinitions.push(`  ${propertyName}${optionalMarker}: ${propertyType};`);
		}

		const propertiesString = propertyDefinitions.join("\n");
		return `export interface ${modelName} {\n${propertiesString}\n}`;
	}

	const inlineType = convertSchemaToTypeScript(schema, typeNameMap);
	if (inlineType !== "any") {
		return `export type ${modelName} = ${inlineType};`;
	}

	// Fallback for unsupported schema types
	console.warn(
		`Warning: Unsupported schema type for "${modelName}". Using fallback type.`,
	);
	return `export type ${modelName} = any;`;
}
