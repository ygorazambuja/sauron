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
	parameters?: Array<{
		name: string;
		in: "query" | "path" | "header" | "cookie";
		required?: boolean;
		schema: OpenApiSchema;
	}>;
	requestBody?: {
		content: Record<string, { schema: OpenApiSchema }>;
	};
	responses: Record<string, { description: string }>;
};

/**
 * Represents an OpenAPI path with its operations
 */
export type OpenApiPath = Record<string, OpenApiOperation>;

/**
 * Represents an OpenAPI schema definition object
 */
type OpenApiSchema = Record<string, unknown> & {
	type?: string;
	properties?: Record<string, OpenApiSchema>;
	required?: string[];
	enum?: unknown[];
	items?: OpenApiSchema;
	$ref?: string;
	nullable?: boolean;
	format?: string;
};

/**
 * Reads and parses a JSON file from the filesystem
 * @param filePath - Path to the JSON file to read
 * @returns Parsed JSON content as unknown object (caller should cast appropriately)
 * @throws Error if file cannot be read or JSON is invalid
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
 * Fetches and parses JSON from a URL
 * @param url - URL to fetch JSON from
 * @returns Parsed JSON content as unknown object (caller should cast appropriately)
 * @throws Error if URL cannot be fetched or JSON is invalid
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
 * Validates and parses OpenAPI/Swagger JSON against the expected schema structure
 * @param swaggerData - Raw OpenAPI JSON data to validate
 * @returns Validated and typed OpenAPI schema object
 * @throws Error if validation fails with detailed error message
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
 * Generates TypeScript interface/type definitions from OpenAPI schema components
 * @param openApiSchema - Validated OpenAPI schema object containing components.schemas
 * @returns Array of TypeScript type definition strings (interfaces and type unions)
 * @throws Error if no schemas are found in the OpenAPI specification
 */
export function createModels(
	data: z.infer<typeof SwaggerOrOpenAPISchema>,
): string[] {
	// Handle both OpenAPI 3.0+ (components.schemas) and Swagger 2.0 (definitions)
	const schemas = (data as any).components?.schemas || (data as any).definitions;

	if (!schemas) {
		throw new Error(
			"No schemas found in OpenAPI components or Swagger definitions. Ensure your Swagger file has components.schemas (OpenAPI 3.0+) or definitions (Swagger 2.0) defined.",
		);
	}

	const typeDefinitions: string[] = [];
	const schemaEntries = Object.entries(schemas);

	if (schemaEntries.length === 0) {
		console.warn("Warning: No schema definitions found in OpenAPI components");
		return typeDefinitions;
	}

	for (const [modelName, schemaDefinition] of schemaEntries) {
		if (modelName && schemaDefinition) {
			const typeScriptCode = generateTypeScriptDefinition(
				modelName,
				schemaDefinition,
			);
			typeDefinitions.push(typeScriptCode);
		}
	}

	return typeDefinitions;
}

/**
 * Generates Angular HTTP Client service methods from OpenAPI paths
 * @param openApiSchema - Validated OpenAPI schema object containing paths
 * @returns Array of Angular service method definitions as strings
 * @throws Error if no paths are found in the OpenAPI specification
 */
export function createAngularHttpClientMethods(
	data: z.infer<typeof SwaggerOrOpenAPISchema>,
): { methods: string[]; imports: string[] } {
	if (!data.paths) {
		throw new Error(
			"No paths found in OpenAPI specification. Ensure your Swagger file has paths defined.",
		);
	}

	const methods: string[] = [];
	const pathEntries = Object.entries(data.paths);
	const usedMethodNames = new Set<string>();
	const usedTypes = new Set<string>();

	if (pathEntries.length === 0) {
		console.warn("Warning: No path definitions found in OpenAPI specification");
		return { methods, imports: [] };
	}

	for (const [path, pathItem] of pathEntries) {
		const pathMethods = generateMethodsForPath(
			path,
			pathItem as OpenApiPath,
			usedMethodNames,
			data.components,
			usedTypes,
		);
		methods.push(...pathMethods);
	}

	// Generate imports for used types
	const imports = Array.from(usedTypes).sort();

	return { methods, imports };
}

/**
 * Generates Angular HTTP Client methods for a single path
 * @param path - The API path (e.g., "/api/users/{id}")
 * @param operations - The operations for this path (get, post, etc.)
 * @param usedMethodNames - Set of already used method names to avoid conflicts
 * @param components - OpenAPI components for resolving response types
 * @param usedTypes - Set to track used response types for imports
 * @returns Array of method strings for this path
 * @private
 */
function generateMethodsForPath(
	path: string,
	operations: OpenApiPath,
	usedMethodNames: Set<string>,
	components: any,
	usedTypes: Set<string>,
): string[] {
	const methods: string[] = [];
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
			const method = generateHttpMethod(
				path,
				httpMethod,
				operations[httpMethod],
				usedMethodNames,
				components,
				usedTypes,
			);
			if (method) {
				methods.push(method);
			}
		}
	}

	return methods;
}

/**
 * Generates a single Angular HTTP Client method
 * @param path - The API path
 * @param httpMethod - The HTTP method (get, post, etc.)
 * @param operation - The OpenAPI operation definition
 * @param usedMethodNames - Set of already used method names to avoid conflicts
 * @param components - OpenAPI components for resolving response types
 * @param usedTypes - Set to track used response types for imports
 * @returns Angular method string or null if cannot generate
 * @private
 */
function generateHttpMethod(
	path: string,
	httpMethod: string,
	operation: OpenApiOperation,
	usedMethodNames: Set<string>,
	components: any,
	usedTypes: Set<string>,
): string | null {
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

		const parameters = extractMethodParameters(path, operation);

		// Extract response type from operation
		const responseType = extractResponseType(operation, components);
		const returnType =
			responseType !== "any"
				? `Observable<${responseType}>`
				: "Observable<any>";

		// Track used types for imports
		if (responseType !== "any" && !responseType.includes("[]")) {
			// For single types (not arrays), add to imports
			usedTypes.add(responseType);
		} else if (responseType.includes("[]")) {
			// For array types like "Type[]", extract "Type" and add to imports
			const baseType = responseType.replace("[]", "");
			usedTypes.add(baseType);
		}

		const methodBody = generateMethodBody(path, httpMethod, operation);

		return `  ${uniqueMethodName}(${parameters}): ${returnType} {
${methodBody}
  }`;
	} catch (error) {
		console.warn(
			`Warning: Could not generate method for ${httpMethod.toUpperCase()} ${path}:`,
			error,
		);
		return null;
	}
}

/**
 * Generates a descriptive method name from path and operation
 * @param path - The API path
 * @param httpMethod - The HTTP method
 * @param operation - The operation definition
 * @returns CamelCase method name
 * @private
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
		additionalSuffix = "ById";
	} else if (hasQueryParams && httpMethod === "get") {
		additionalSuffix = "WithParams";
	} else if (hasBody && ["post", "put", "patch"].includes(httpMethod)) {
		additionalSuffix = "Create";
	}

	return methodPrefix + baseName + additionalSuffix;
}

/**
 * Extracts method parameters from path and operation
 * @param path - The API path
 * @param operation - The operation definition
 * @returns Parameter string for the method signature
 * @private
 */
function extractMethodParameters(
	path: string,
	operation: OpenApiOperation,
): string {
	const params: string[] = [];

	// Extract path parameters
	const pathParamMatches = path.match(/\{([^}]+)\}/g);
	if (pathParamMatches) {
		for (const match of pathParamMatches) {
			const paramName = match.slice(1, -1); // Remove { }
			params.push(`${paramName}: any`);
		}
	}

	// Extract query parameters
	if (operation.parameters) {
		for (const param of operation.parameters) {
			if (param.in === "query") {
				const optional = param.required ? "" : "?";
				params.push(`${param.name}${optional}: any`);
			}
		}
	}

	// Extract request body parameter for POST/PUT/PATCH
	if (operation.requestBody) {
		params.push("body: any");
	}

	return params.join(", ");
}

/**
 * Extracts the return type from an OpenAPI operation response
 * @param operation - The OpenAPI operation definition
 * @param components - The OpenAPI components object for resolving $ref
 * @returns TypeScript type string for the response, or 'any' if not found
 * @private
 */
function extractResponseType(
	operation: OpenApiOperation,
	_components?: any,
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
			return typeName || "any";
		}

		// Handle direct type
		if (schema.type === "array" && schema.items?.$ref) {
			const refParts = schema.items.$ref.split("/");
			const itemTypeName = refParts[refParts.length - 1];
			return itemTypeName ? `${itemTypeName}[]` : "any[]";
		}

		// Fallback to any for complex schemas
		return "any";
	}

	return "any";
}

/**
 * Generates the method body with HTTP call
 * @param path - The API path
 * @param httpMethod - The HTTP method
 * @param operation - The operation definition
 * @returns Method body as string
 * @private
 */
function generateMethodBody(
	path: string,
	httpMethod: string,
	operation: OpenApiOperation,
): string {
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
	const httpClientMethod = `this.httpClient.${httpMethod}`;
	const args = [url];

	// Add query parameters if present
	const queryParams =
		operation.parameters?.filter((p) => p.in === "query") || [];
	if (queryParams.length > 0) {
		const queryObj = queryParams.reduce(
			(acc, param) => {
				acc[param.name] = param.name;
				return acc;
			},
			{} as Record<string, string>,
		);

		const queryString = Object.keys(queryObj)
			.map((key) => `${key}: ${key}`)
			.join(", ");

		args.push(`{ params: { ${queryString} } }`);
	}

	// Add request body for POST/PUT/PATCH
	if (operation.requestBody) {
		args.push("body");
	}

	return `    return ${httpClientMethod}(${args.join(", ")});`;
}

/**
 * Converts an OpenAPI schema definition to a TypeScript type string
 * Handles primitives, arrays, enums, references, and nullable types
 * @param schema - OpenAPI schema object to convert
 * @returns TypeScript type string representation
 * @private
 */
function convertSchemaToTypeScript(schema: OpenApiSchema): string {
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

		return referencedTypeName;
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

	// Handle array types with item schema
	if (schema.type === "array" && schema.items) {
		const itemType = convertSchemaToTypeScript(schema.items);
		return `${itemType}[]`;
	}

	// Handle primitive OpenAPI types
	let typeScriptType: string;
	switch (schema.type) {
		case "string":
			// Special handling for date-time format
			typeScriptType = schema.format === "date-time" ? "Date" : "string";
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
 * Generates a complete TypeScript interface or type definition from an OpenAPI schema
 * Handles both object schemas (interfaces) and enum schemas (union types)
 * @param modelName - Name of the type/interface to generate
 * @param schema - OpenAPI schema definition object
 * @returns Complete TypeScript type definition as a string
 * @private
 */
function generateTypeScriptDefinition(
	modelName: string,
	schema: OpenApiSchema,
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
			const propertyType = convertSchemaToTypeScript(propertySchema);

			// Determine if property should be optional
			// OpenAPI Logic:
			// - If schema has NO required array: all defined properties are required
			// - If schema HAS required array: only properties in array are required
			// - Undefined properties are never included in generated interface
			const isRequired = hasExplicitRequiredList
				? requiredProperties.includes(propertyName)
				: true;

			const optionalMarker = isRequired ? "" : "?";
			propertyDefinitions.push(
				`  ${propertyName}${optionalMarker}: ${propertyType};`,
			);
		}

		const propertiesString = propertyDefinitions.join("\n");
		return `export interface ${modelName} {\n${propertiesString}\n}`;
	}

	// Fallback for unsupported schema types
	console.warn(
		`Warning: Unsupported schema type for "${modelName}". Using fallback type.`,
	);
	return `export type ${modelName} = any;`;
}
