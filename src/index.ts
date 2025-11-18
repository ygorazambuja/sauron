import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs as parseCliArgs } from "util";
import {
	createAngularHttpClientMethods,
	createModels,
	fetchJsonFromUrl,
	type OpenApiOperation,
	type OpenApiPath,
	readJsonFile,
	verifySwaggerComposition,
} from "./utils";

interface CliOptions {
	input: string;
	url?: string;
	angular: boolean;
	http: boolean;
	output?: string;
	help: boolean;
}

import type { z } from "zod";
import type { SwaggerOrOpenAPISchema } from "./schemas/swagger";

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
	if (values.help) {
		options.help = values.help;
	}

	// Handle positional arguments (JSON files)
	// Last JSON file in positionals takes precedence
	for (const positional of positionals.slice(2)) {
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
  sauron [OPTIONS] [INPUT_FILE]

OPTIONS:
  -i, --input <file>     Input OpenAPI/Swagger JSON file (default: swagger.json)
  -u, --url <url>        Download OpenAPI/Swagger JSON from URL
  -a, --angular          Generate Angular service in src/app/sauron (requires Angular project)
  -t, --http             Generate HTTP client/service methods
  -o, --output <dir>     Output directory (default: outputs or src/app/sauron)
  -h, --help            Show this help message

EXAMPLES:
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
	const options = parseArgs();

	if (options.help) {
		showHelp();
		return;
	}

	try {
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
		const models = createModels(schema);
		writeFileSync(modelsPath, models.join("\n"));

		let httpMethodsCount = 0;

		// Generate HTTP client/service methods only if --http flag is used
		if (options.http && servicePath) {
			if (options.angular && isAngularProject()) {
				// Generate Angular HTTP Client service
				console.log("🔧 Generating Angular HTTP Client service...");
				const { methods: angularMethods, imports: angularImports } =
					createAngularHttpClientMethods(schema);
				const angularService = generateAngularService(
					angularMethods,
					angularImports,
					true,
				);
				writeFileSync(servicePath, angularService);
				httpMethodsCount = angularMethods.length;
			} else {
				// Generate fetch-based HTTP methods
				console.log("🔧 Generating fetch-based HTTP methods...");
				const usedTypes = new Set<string>();
				const fetchMethods = createFetchHttpMethods(schema, usedTypes);
				const fetchService = generateFetchService(
					fetchMethods,
					modelsPath,
					usedTypes,
				);
				writeFileSync(servicePath, fetchService);
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
	const requiredParams: string[] = [];
	const optionalParams: string[] = [];

	// Extract path parameters (always required)
	const pathParamMatches = path.match(/\{([^}]+)\}/g);
	if (pathParamMatches) {
		for (const match of pathParamMatches) {
			const paramName = match.slice(1, -1); // Remove { }
			requiredParams.push(`${paramName}: any`);
		}
	}

	// Extract query parameters (may be required or optional)
	if (operation.parameters) {
		for (const param of operation.parameters) {
			if (param.in === "query") {
				if (param.required) {
					requiredParams.push(`${param.name}: any`);
				} else {
					optionalParams.push(`${param.name}?: any`);
				}
			}
		}
	}

	// Extract request body parameter for POST/PUT/PATCH (always required)
	if (operation.requestBody) {
		requiredParams.push("body: any");
	}

	// Combine required params first, then optional params
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
 * Generates fetch-based HTTP methods from OpenAPI paths
 * @param openApiSchema - Validated OpenAPI schema object containing paths
 * @returns Array of fetch method definitions as strings
 */
function createFetchHttpMethods(
	data: z.infer<typeof SwaggerOrOpenAPISchema>,
	usedTypes?: Set<string>,
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
): string | null {
	try {
		const methodName = generateMethodName(path, httpMethod, operation);
		const parameters = extractMethodParameters(path, operation);

		// Extract response type from operation
		const responseType = extractResponseType(operation, components);
		const returnType =
			responseType !== "any" ? `Promise<${responseType}>` : "Promise<any>";

		// Track used types for imports
		if (usedTypes && responseType !== "any" && !responseType.includes("[]")) {
			// For single types (not arrays), add to imports
			usedTypes.add(responseType);
		} else if (usedTypes && responseType.includes("[]")) {
			// For array types like "Type[]", extract "Type" and add to imports
			const baseType = responseType.replace("[]", "");
			usedTypes.add(baseType);
		}

		// Handle query parameters first
		const queryParams =
			operation.parameters?.filter((p) => p.in === "query") || [];
		const hasQueryParams = queryParams.length > 0;
		const hasPathParams = path.includes("{");

		let url: string;
		let queryString = "";

		if (hasQueryParams) {
			queryString = queryParams
				.map((param) => `${param.name}=\${encodeURIComponent(${param.name})}`)
				.join("&");
		}

		// Build URL based on parameters
		if (hasPathParams && hasQueryParams) {
			// Both path and query parameters - use template literal
			const pathWithParams = path.replace(/\{([^}]+)\}/g, "${$1}");
			url = `\`${pathWithParams}?${queryString}\``;
		} else if (hasPathParams) {
			// Only path parameters
			const pathWithParams = path.replace(/\{([^}]+)\}/g, "${$1}");
			url = `\`${pathWithParams}\``;
		} else if (hasQueryParams) {
			// Only query parameters - use template literal for variable interpolation
			url = `\`${path}?${queryString}\``;
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
			fetchOptions.push(`body: JSON.stringify(body)`);
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
	isAngularProject,
	main,
	parseArgs,
};

// Only run main when this file is executed directly (not when imported for testing)
if (import.meta.main) {
	main();
}
