import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs as parseCliArgs } from "util";
import * as prettier from "prettier";
import {
	createAngularHttpClientMethods,
	createModelsWithOperationTypes,
	fetchJsonFromUrl,
	type OpenApiOperation,
	type OpenApiPath,
	type OpenApiSchema,
	type OperationTypeMap,
	type OperationTypeInfo,
	readJsonFile,
	verifySwaggerComposition,
} from "./utils";

interface CliOptions {
	input: string;
	url?: string;
	angular: boolean;
	http: boolean;
	output?: string;
	config?: string;
	help: boolean;
}

export interface SauronConfig {
	input?: string;
	url?: string;
	angular?: boolean;
	http?: boolean;
	output?: string;
}

const DEFAULT_CONFIG_FILE = "sauron.config.ts";

import type { z } from "zod";
import type { SwaggerOrOpenAPISchema } from "./schemas/swagger";

async function formatGeneratedFile(content: string, filePath: string): Promise<string> {
	try {
		return await prettier.format(content, { filepath: filePath });
	} catch (error) {
		console.warn(
			`⚠️  Could not format ${filePath} with Prettier. Writing unformatted output.`,
			error,
		);
		return content;
	}
}

function parseCommand(): "generate" | "init" {
	const { positionals } = parseCliArgs({
		args: Bun.argv,
		options: {},
		strict: false,
		allowPositionals: true,
	});

	const command = positionals.slice(2)[0];
	return command === "init" ? "init" : "generate";
}

function parseArgs(): CliOptions {
	const { values, positionals } = parseCliArgs({
		args: Bun.argv,
		options: {
			input: {
				type: "string",
				short: "i",
			},
			url: {
				type: "string",
				short: "u",
			},
			angular: {
				type: "boolean",
				short: "a",
			},
			http: {
				type: "boolean",
				short: "t",
			},
			output: {
				type: "string",
				short: "o",
			},
			config: {
				type: "string",
				short: "c",
			},
			help: {
				type: "boolean",
				short: "h",
			},
		},
		strict: true,
		allowPositionals: true,
	});

	// Initialize with defaults
	const options: CliOptions = {
		input: "swagger.json",
		angular: false,
		http: false,
		help: false,
	};

	// Map parsed values to CliOptions
	if (values.input) {
		options.input = values.input;
	}
	if (values.url) {
		options.url = values.url;
	}
	if (values.angular) {
		options.angular = values.angular;
	}
	if (values.http) {
		options.http = values.http;
	}
	if (values.output) {
		options.output = values.output;
	}
	if (values.config) {
		options.config = values.config;
	}
	if (values.help) {
		options.help = values.help;
	}

	// Handle positional arguments (JSON files)
	// Last JSON file in positionals takes precedence
	for (const positional of positionals.slice(2)) {
		if (positional === "init") {
			continue;
		}
		// Skip first two elements (bun and script path)
		if (positional.endsWith(".json")) {
			options.input = positional;
		}
	}

	return options;
}

function showHelp(): void {
	console.log(`
Sauron - OpenAPI to TypeScript/Angular Converter

USAGE:
  sauron [COMMAND] [OPTIONS] [INPUT_FILE]

OPTIONS:
  -i, --input <file>     Input OpenAPI/Swagger JSON file (default: swagger.json)
  -u, --url <url>        Download OpenAPI/Swagger JSON from URL
  -a, --angular          Generate Angular service in src/app/sauron (requires Angular project)
  -t, --http             Generate HTTP client/service methods
  -o, --output <dir>     Output directory (default: outputs or src/app/sauron)
  -c, --config <file>    Config file path (default: sauron.config.ts)
  -h, --help            Show this help message

COMMANDS:
  init                   Create sauron.config.ts with default settings

EXAMPLES:
  sauron init
  sauron --config ./sauron.config.ts
  sauron swagger.json
  sauron --input swaggerAfEstoque.json --angular --http
  sauron --url https://api.example.com/swagger.json --http
  sauron --http -i api.json -o ./generated

When --angular flag is used, the tool will:
1. Detect if current directory is an Angular project
2. Generate models in src/app/sauron/models/
3. Generate Angular service in src/app/sauron/sauron-api.service.ts

When --http flag is used without --angular:
1. Generate fetch-based HTTP methods in outputs/http-client/
2. Generate models in outputs/models/

Without flags, generates only TypeScript models.
`);
}

async function initConfigFile(configFilePath = DEFAULT_CONFIG_FILE): Promise<void> {
	const resolvedConfigPath = resolve(configFilePath);
	if (existsSync(resolvedConfigPath)) {
		console.warn(`⚠️  Config file already exists: ${configFilePath}`);
		return;
	}
	const angularProjectDetected = isAngularProject();
	const defaultOutput = angularProjectDetected ? "src/app/sauron" : "outputs";

	const template = `import type { SauronConfig } from "sauron";

export default {
  // Use either "input" or "url". If both are set, "url" takes precedence.
  input: "swagger.json",
  // url: "https://example.com/openapi.json",
  output: "${defaultOutput}",
  angular: ${angularProjectDetected},
  http: true,
} satisfies SauronConfig;
`;

	const formattedTemplate = await formatGeneratedFile(template, resolvedConfigPath);
	writeFileSync(resolvedConfigPath, formattedTemplate);
	console.log(`✅ Created config file: ${configFilePath}`);
}

async function loadSauronConfig(
	configFilePath = DEFAULT_CONFIG_FILE,
): Promise<SauronConfig | null> {
	const resolvedConfigPath = resolve(configFilePath);
	if (!existsSync(resolvedConfigPath)) {
		return null;
	}

	const configModule = await import(
		`${pathToFileURL(resolvedConfigPath).href}?t=${Date.now()}`
	);
	const loadedConfig = configModule.default;

	if (!loadedConfig || typeof loadedConfig !== "object") {
		throw new Error(
			`Invalid config file format in ${configFilePath}. Expected a default exported object.`,
		);
	}

	return loadedConfig as SauronConfig;
}

function mergeOptionsWithConfig(
	options: CliOptions,
	config: SauronConfig,
): CliOptions {
	return {
		input:
			options.input !== "swagger.json"
				? options.input
				: (config.input ?? "swagger.json"),
		url: options.url ?? config.url,
		angular: options.angular || !!config.angular,
		http: options.http || !!config.http,
		output: options.output ?? config.output,
		config: options.config,
		help: options.help,
	};
}

function isAngularProject(): boolean {
	// Check for angular.json
	if (existsSync("angular.json")) {
		return true;
	}

	// Check for package.json with Angular dependencies
	try {
		const packageJsonPath = join(process.cwd(), "package.json");
		if (existsSync(packageJsonPath)) {
			const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
			const deps = {
				...packageJson.dependencies,
				...packageJson.devDependencies,
			};
			return "@angular/core" in deps;
		}
	} catch (_error) {
		// Ignore errors when checking package.json
	}

	return false;
}

function getOutputPaths(options: CliOptions): {
	modelsPath: string;
	servicePath: string | undefined;
} {
	let basePath: string;

	if (options.output) {
		basePath = resolve(options.output);
	} else if (options.angular && isAngularProject()) {
		basePath = "src/app/sauron";
		console.log("✅ Angular project detected! Generating in src/app/sauron/");
	} else {
		basePath = "outputs";
		if (options.angular) {
			console.warn(
				"⚠️  --angular flag used but Angular project not detected. Generating in outputs/ instead.",
			);
		}
	}

	// Ensure directory exists
	mkdirSync(join(basePath, "models"), { recursive: true });

	let servicePath: string;
	if (options.http) {
		// Create appropriate service directory based on options only when --http flag is used
		const serviceDir =
			options.angular && isAngularProject()
				? "angular-http-client"
				: "http-client";
		mkdirSync(join(basePath, serviceDir), { recursive: true });

		const serviceFileName =
			options.angular && isAngularProject()
				? "sauron-api.service.ts"
				: "sauron-api.client.ts";

		servicePath = join(basePath, serviceDir, serviceFileName);
	} else {
		// When --http flag is not used, don't create service file
		servicePath = "";
	}

	return {
		modelsPath: join(basePath, "models", "index.ts"),
		servicePath,
	};
}

async function main() {
	const command = parseCommand();
	const cliOptions = parseArgs();

	if (cliOptions.help) {
		showHelp();
		return;
	}

	if (command === "init") {
		await initConfigFile(cliOptions.config || DEFAULT_CONFIG_FILE);
		return;
	}

	let options = cliOptions;

	try {
		const loadedConfig = await loadSauronConfig(
			options.config || DEFAULT_CONFIG_FILE,
		);
		if (loadedConfig) {
			options = mergeOptionsWithConfig(cliOptions, loadedConfig);
			console.log(`⚙️  Using config file: ${options.config || DEFAULT_CONFIG_FILE}`);
		}

		let config: unknown;
		if (options.url) {
			console.log(`📖 Downloading OpenAPI spec from: ${options.url}`);
			config = await fetchJsonFromUrl(options.url);
		} else {
			console.log(`📖 Reading OpenAPI spec from: ${options.input}`);
			config = await readJsonFile(options.input);
		}

		if (typeof config !== "object") {
			throw new Error("Config is not an object");
		}

		console.log("✅ Validating OpenAPI schema...");
		const schema = verifySwaggerComposition(config as Record<string, unknown>);

		// Determine output paths
		const { modelsPath, servicePath } = getOutputPaths(options);

		// Generate TypeScript models
		console.log("🔧 Generating TypeScript models...");
		const { models, operationTypes, typeNameMap } =
			createModelsWithOperationTypes(schema);
		const formattedModels = await formatGeneratedFile(models.join("\n"), modelsPath);
		writeFileSync(modelsPath, formattedModels);

		let httpMethodsCount = 0;

		// Generate HTTP client/service methods only if --http flag is used
		if (options.http && servicePath) {
			if (options.angular && isAngularProject()) {
				// Generate Angular HTTP Client service
				console.log("🔧 Generating Angular HTTP Client service...");
				const { methods: angularMethods, imports: angularImports } =
					createAngularHttpClientMethods(
						schema,
						operationTypes,
						typeNameMap,
					);
				const angularService = generateAngularService(
					angularMethods,
					angularImports,
					true,
				);
				const formattedAngularService = await formatGeneratedFile(
					angularService,
					servicePath,
				);
				writeFileSync(servicePath, formattedAngularService);
				httpMethodsCount = angularMethods.length;
			} else {
				// Generate fetch-based HTTP methods
				console.log("🔧 Generating fetch-based HTTP methods...");
				const usedTypes = new Set<string>();
				const fetchMethods = createFetchHttpMethods(
					schema,
					usedTypes,
					operationTypes,
					typeNameMap,
				);
				const fetchService = generateFetchService(
					fetchMethods,
					modelsPath,
					usedTypes,
				);
				const formattedFetchService = await formatGeneratedFile(
					fetchService,
					servicePath,
				);
				writeFileSync(servicePath, formattedFetchService);
				httpMethodsCount = fetchMethods.length;
			}
		}

		console.log(`\n✅ Generation complete!`);
		console.log(`📄 Models: ${models.length} TypeScript interfaces/types`);
		if (options.http) {
			console.log(
				`🔗 HTTP Methods: ${httpMethodsCount} ${
					options.angular && isAngularProject() ? "Angular" : "fetch"
				} methods`,
			);
		}
		console.log(
			`📁 Output: ${
				options.output ||
				(options.angular && isAngularProject() ? "src/app/sauron" : "outputs")
			}`,
		);
	} catch (error) {
		console.error("❌ Error:", error);
		process.exit(1);
	}
}

/**
 * Generates a complete Angular service with HTTP Client methods
 * @param methods - Array of method strings
 * @param imports - Array of type names to import
 * @param isAngularProject - Whether generating for Angular project (affects import paths)
 * @returns Complete Angular service as string
 */
function generateAngularService(
	methods: string[],
	imports: string[],
	isAngularProject: boolean,
): string {
	// Generate import statement for types
	let importStatement = "";
	if (imports.length > 0) {
		const importList = imports.join(", ");
		// Models are always in the parent directory level
		const importPath = "../models";
		importStatement = `import { ${importList} } from "${importPath}";\n`;
	}

	const serviceTemplate = `import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

${importStatement}@Injectable({
  providedIn: "root"
})
export class SauronApiService {
  private readonly httpClient = inject(HttpClient);

${methods.join("\n\n")}
}
`;

	return serviceTemplate;
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
		additionalSuffix = "";
	} else if (hasQueryParams && httpMethod === "get") {
		additionalSuffix = "WithParams";
	} else if (hasBody && ["post", "put", "patch"].includes(httpMethod)) {
		additionalSuffix = "Create";
	}

	return methodPrefix + baseName + additionalSuffix;
}

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

function sanitizeTypeName(value: string): string {
	const sanitized = toPascalCase(value);
	return sanitized || "Type";
}

function resolveTypeName(
	value: string,
	typeNameMap?: Map<string, string>,
): string {
	return typeNameMap?.get(value) ?? sanitizeTypeName(value);
}

/**
 * Extracts method parameters from path and operation
 * @param path - The API path
 * @param operation - The operation definition
 * @returns Parameter string for the method signature
 * @private
 */
function convertParamSchemaToType(
	schema: any,
	typeNameMap?: Map<string, string>,
): string {
	if (!schema || typeof schema !== "object") {
		return "any";
	}

	if (schema.$ref && typeof schema.$ref === "string") {
		const refParts = schema.$ref.split("/");
		const rawName = refParts[refParts.length - 1];
		return rawName ? resolveTypeName(rawName, typeNameMap) : "any";
	}

	if (Array.isArray(schema.enum)) {
		const unionValues = schema.enum
			.map((enumValue: unknown) =>
				typeof enumValue === "string" ? `"${enumValue}"` : String(enumValue),
			)
			.join(" | ");
		return unionValues || "any";
	}

	if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
		const variants = (schema.anyOf || schema.oneOf || [])
			.map((variant: any) => convertParamSchemaToType(variant, typeNameMap))
			.filter(Boolean);
		return variants.join(" | ") || "any";
	}

	if (Array.isArray(schema.allOf)) {
		const variants = schema.allOf
			.map((variant: any) => convertParamSchemaToType(variant, typeNameMap))
			.filter(Boolean);
		return variants.join(" & ") || "any";
	}

	if (schema.type === "array" && schema.items) {
		const itemType = convertParamSchemaToType(schema.items, typeNameMap);
		return `${itemType}[]`;
	}

	if (schema.type === "object" && schema.properties) {
		const requiredProperties = Array.isArray(schema.required)
			? schema.required
			: [];
		const hasExplicitRequiredList = requiredProperties.length > 0;
		const entries = Object.entries(schema.properties as Record<string, any>);

		if (entries.length === 0) {
			return "{}";
		}

		const propertyDefinitions = entries.map(([propertyName, propertySchema]) => {
			const propertyType = convertParamSchemaToType(
				propertySchema,
				typeNameMap,
			);
			const isRequired = hasExplicitRequiredList
				? requiredProperties.includes(propertyName)
				: true;
			const optionalMarker = isRequired ? "" : "?";
			return `${propertyName}${optionalMarker}: ${propertyType};`;
		});

		return `{ ${propertyDefinitions.join(" ")} }`;
	}

	let typeScriptType: string;
	switch (schema.type) {
		case "string":
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
			typeScriptType = "number";
			break;
		case "boolean":
			typeScriptType = "boolean";
			break;
		default:
			typeScriptType = "any";
			break;
	}

	if (schema.nullable === true) {
		typeScriptType += " | null";
	}

	return typeScriptType;
}

function addParamTypeImports(paramTypes: string[], usedTypes: Set<string>) {
	for (const type of paramTypes) {
		const parts = type.split(/[\|&]/).map((part) => part.trim());
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
				part.startsWith("\"") ||
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

function buildParameterInfo(
	path: string,
	operation: OpenApiOperation,
	typeNameMap?: Map<string, string>,
) {
	const usedNames = new Set<string>();

	const makeUniqueName = (base: string, suffix: string) => {
		if (!usedNames.has(base)) {
			usedNames.add(base);
			return base;
		}
		let candidate = `${base}${suffix}`;
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
				? convertParamSchemaToType(schema, typeNameMap)
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
					type: convertParamSchemaToType(param.schema, typeNameMap),
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

function extractMethodParameters(
	path: string,
	operation: OpenApiOperation,
	typeInfo?: OperationTypeInfo,
	components?: any,
	typeNameMap?: Map<string, string>,
): string {
	const requiredParams: string[] = [];
	const optionalParams: string[] = [];
	const { pathParams, queryParams, bodyParam } = buildParameterInfo(
		path,
		operation,
		typeNameMap,
	);

	for (const param of pathParams) {
		requiredParams.push(`${param.varName}: ${param.type}`);
	}

	for (const param of queryParams) {
		if (param.required) {
			requiredParams.push(`${param.varName}: ${param.type}`);
		} else {
			optionalParams.push(`${param.varName}?: ${param.type}`);
		}
	}

	if (bodyParam) {
		const bodyType =
			typeInfo?.requestType ??
			extractRequestType(operation, typeNameMap) ??
			"any";
		requiredParams.push(`${bodyParam.varName}: ${bodyType}`);
	}

	return [...requiredParams, ...optionalParams].join(", ");
}

/**
 * Extracts the response type from an OpenAPI operation
 * @param operation - The OpenAPI operation definition
 * @param components - The OpenAPI components object
 * @returns TypeScript type string for the response
 * @private
 */
function extractResponseType(
	operation: OpenApiOperation,
	_components?: any,
	typeNameMap?: Map<string, string>,
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

function extractRequestType(
	operation: OpenApiOperation,
	typeNameMap?: Map<string, string>,
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
 * Generates fetch-based HTTP methods from OpenAPI paths
 * @param openApiSchema - Validated OpenAPI schema object containing paths
 * @returns Array of fetch method definitions as strings
 */
function createFetchHttpMethods(
	data: z.infer<typeof SwaggerOrOpenAPISchema>,
	usedTypes?: Set<string>,
	operationTypes?: OperationTypeMap,
	typeNameMap?: Map<string, string>,
): string[] {
	if (!data.paths) {
		return [];
	}

	const methods: string[] = [];
	const pathEntries = Object.entries(data.paths);

	for (const [path, pathItem] of pathEntries) {
		const pathMethods = generateFetchMethodsForPath(
			path,
			pathItem as OpenApiPath,
			data.components,
			usedTypes,
			operationTypes,
			typeNameMap,
		);
		methods.push(...pathMethods);
	}

	return methods;
}

/**
 * Generates fetch methods for a single path
 * @param path - The API path
 * @param operations - The operations for this path
 * @returns Array of fetch method strings
 */
function generateFetchMethodsForPath(
	path: string,
	operations: OpenApiPath,
	components?: any,
	usedTypes?: Set<string>,
	operationTypes?: OperationTypeMap,
	typeNameMap?: Map<string, string>,
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
			const method = generateFetchMethod(
				path,
				httpMethod,
				operations[httpMethod],
				components,
				usedTypes,
				operationTypes,
				typeNameMap,
			);
			if (method) {
				methods.push(method);
			}
		}
	}

	return methods;
}

/**
 * Generates a single fetch method
 * @param path - The API path
 * @param httpMethod - The HTTP method
 * @param operation - The OpenAPI operation definition
 * @returns Fetch method string or null if cannot generate
 */
function generateFetchMethod(
	path: string,
	httpMethod: string,
	operation: OpenApiOperation,
	components?: any,
	usedTypes?: Set<string>,
	operationTypes?: OperationTypeMap,
	typeNameMap?: Map<string, string>,
): string | null {
	try {
		const methodName = generateMethodName(path, httpMethod, operation);
		const paramInfo = buildParameterInfo(path, operation, typeNameMap);
		const typeInfo = operationTypes?.[path]?.[httpMethod];
		const parameters = extractMethodParameters(
			path,
			operation,
			typeInfo,
			components,
			typeNameMap,
		);

		// Extract response type from operation
		const requestType =
			typeInfo?.requestType ?? extractRequestType(operation, typeNameMap);
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
			responseType !== "any" ? `Promise<${responseType}>` : "Promise<any>";

		// Track used types for imports
		if (requestType) {
			usedTypes?.add(requestType);
		}
		if (usedTypes && responseType !== "any" && !responseType.includes("[]")) {
			// For single types (not arrays), add to imports
			usedTypes.add(responseType);
		} else if (usedTypes && responseType.includes("[]")) {
			// For array types like "Type[]", extract "Type" and add to imports
			const baseType = responseType.replace("[]", "");
			usedTypes.add(baseType);
		}
		if (usedTypes) {
			const paramTypes = [
				...paramInfo.pathParams.map((param) => param.type),
				...paramInfo.queryParams.map((param) => param.type),
			];
			addParamTypeImports(paramTypes, usedTypes);
		}

		// Handle query parameters first
		const queryParams =
			paramInfo.queryParams || [];
		const hasQueryParams = queryParams.length > 0;
		const hasPathParams = path.includes("{");

		let url: string;

		if (hasQueryParams) {
			const queryObject = queryParams
				.map((param) => `${param.name}: ${param.varName}`)
				.join(", ");
			const queryStringLine = `const queryString = qs.stringify({ ${queryObject} }, { skipNull: true, skipEmptyString: true });`;

			if (hasPathParams) {
				const pathWithParams = path.replace(/\{([^}]+)\}/g, "${$1}");
				url = `\`${
					pathWithParams
				}\${queryString ? \`?\${queryString}\` : \"\"}\``;
				return buildFetchMethodWithQueryString(
					methodName,
					parameters,
					returnType,
					url,
					operation,
					paramInfo,
					queryStringLine,
					httpMethod,
				);
			}

			url = `\`${path}\${queryString ? \`?\${queryString}\` : \"\"}\``;
			return buildFetchMethodWithQueryString(
				methodName,
				parameters,
				returnType,
				url,
				operation,
				paramInfo,
				queryStringLine,
				httpMethod,
			);
		}

		// Build URL based on parameters
		if (hasPathParams) {
			// Only path parameters
			const pathWithParams = path.replace(/\{([^}]+)\}/g, "${$1}");
			url = `\`${pathWithParams}\``;
		} else {
			// No parameters
			url = `\`${path}\``;
		}

		// Build fetch call
		const fetchOptions: string[] = [];
		fetchOptions.push(`method: '${httpMethod.toUpperCase()}'`);

		// Add headers
		fetchOptions.push(`headers: {
    'Content-Type': 'application/json',
  }`);

		// Add body for POST/PUT/PATCH
		if (operation.requestBody) {
			const bodyVar = paramInfo.bodyParam?.varName || "body";
			fetchOptions.push(`body: JSON.stringify(${bodyVar})`);
		}

		const optionsString = fetchOptions.join(",\n    ");

		return `  async ${methodName}(${parameters}): ${returnType} {
    const response = await fetch(${url}, {
      ${optionsString}
    });

    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }

    return await response.json();
  }`;
	} catch (error) {
		console.warn(
			`Warning: Could not generate fetch method for ${httpMethod.toUpperCase()} ${path}:`,
			error,
		);
		return null;
	}
}

function buildFetchMethodWithQueryString(
	methodName: string,
	parameters: string,
	returnType: string,
	url: string,
	operation: OpenApiOperation,
	paramInfo: { bodyParam: { varName: string } | null },
	queryStringLine: string,
	httpMethod: string,
): string {
	const fetchOptions: string[] = [];
	fetchOptions.push(`method: '${httpMethod.toUpperCase()}'`);

	// Add headers
	fetchOptions.push(`headers: {
    'Content-Type': 'application/json',
  }`);

	// Add body for POST/PUT/PATCH
	if (operation.requestBody) {
		const bodyVar = paramInfo.bodyParam?.varName || "body";
		fetchOptions.push(`body: JSON.stringify(${bodyVar})`);
	}

	const optionsString = fetchOptions.join(",\n    ");

	return `  async ${methodName}(${parameters}): ${returnType} {
    ${queryStringLine}
    const response = await fetch(${url}, {
      ${optionsString}
    });

    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }

    return await response.json();
  }`;
}

/**
 * Generates a complete fetch-based service
 * @param methods - Array of fetch method strings
 * @param modelsPath - Path to the models file for relative imports
 * @param usedTypes - Set of types used in the methods
 * @returns Complete fetch service as string
 */
function generateFetchService(
	methods: string[],
	_modelsPath: string,
	usedTypes: Set<string>,
): string {
	// Calculate relative import path from service to models
	const _modelsRelativePath = "./models";

	// Generate import statement for types
	let importStatement = "";
	if (usedTypes.size > 0) {
		const importList = Array.from(usedTypes).join(", ");
		// In fetch client, models are in parent directory (../models)
		const importPath = "../models";
		importStatement = `import { ${importList} } from "${importPath}";\n`;
	}

	const serviceTemplate = `// Generated fetch-based HTTP client
import qs from "query-string";
${importStatement}export class SauronApiClient {
  private baseUrl = ''; // Configure your base URL

  constructor(baseUrl?: string) {
    if (baseUrl) {
      this.baseUrl = baseUrl;
    }
  }

${methods.join("\n\n")}
}

// Export a default instance
export const sauronApi = new SauronApiClient();
`;

	return serviceTemplate;
}

// Export functions for testing
export {
	createFetchHttpMethods,
	extractMethodParameters,
	extractResponseType,
	generateAngularService,
	generateFetchService,
	generateMethodName,
	getOutputPaths,
	initConfigFile,
	isAngularProject,
	loadSauronConfig,
	main,
	mergeOptionsWithConfig,
	parseArgs,
	parseCommand,
};

// Only run main when this file is executed directly (not when imported for testing)
if (import.meta.main) {
	main();
}
