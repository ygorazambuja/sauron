/**
 * Test suite for OpenAPI to TypeScript converter CLI
 */

import { afterEach, beforeEach, describe, expect, test, mock, spyOn } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Import functions from index.ts
import {
	parseArgs,
	isAngularProject,
	getOutputPaths,
	generateAngularService,
	generateMethodName,
	extractMethodParameters,
	extractResponseType,
	createFetchHttpMethods,
	generateFetchService,
} from "./index";

import {
	createAngularHttpClientMethods,
	createModels,
	verifySwaggerComposition,
} from "./utils";

describe("OpenAPI to TypeScript Converter CLI", () => {
	let tempDir: string;
	let originalCwd: string;
	let originalArgv: string[];

	// Setup temporary directory and mock environment
	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "sauron-cli-test-"));
		originalCwd = process.cwd();
		originalArgv = Bun.argv;

		// Change to temp directory for testing
		process.chdir(tempDir);
	});

	afterEach(() => {
		// Restore original environment
		process.chdir(originalCwd);
		Bun.argv = originalArgv;

		// Clean up temp directory
		rmSync(tempDir, { recursive: true, force: true });
	});

	describe("parseArgs", () => {
		test("should parse default arguments when no args provided", () => {
			Bun.argv = ["bun", "index.js"];

			const result = parseArgs();

			expect(result).toEqual({
				input: "swagger.json",
				angular: false,
				http: false,
				help: false,
			});
		});

		test("should parse input file from arguments", () => {
			Bun.argv = ["bun", "index.js", "api.json"];

			const result = parseArgs();

			expect(result.input).toBe("api.json");
		});

		test("should parse short input flag", () => {
			Bun.argv = ["bun", "index.js", "-i", "custom.json"];

			const result = parseArgs();

			expect(result.input).toBe("custom.json");
		});

		test("should parse long input flag", () => {
			Bun.argv = ["bun", "index.js", "--input", "swagger.yaml"];

			const result = parseArgs();

			expect(result.input).toBe("swagger.yaml");
		});

		test("should parse angular flag (short)", () => {
			Bun.argv = ["bun", "index.js", "-a"];

			const result = parseArgs();

			expect(result.angular).toBe(true);
		});

		test("should parse angular flag (long)", () => {
			Bun.argv = ["bun", "index.js", "--angular"];

			const result = parseArgs();

			expect(result.angular).toBe(true);
		});

		test("should parse http flag (short)", () => {
			Bun.argv = ["bun", "index.js", "-t"];

			const result = parseArgs();

			expect(result.http).toBe(true);
		});

		test("should parse http flag (long)", () => {
			Bun.argv = ["bun", "index.js", "--http"];

			const result = parseArgs();

			expect(result.http).toBe(true);
		});

		test("should parse output flag (short)", () => {
			Bun.argv = ["bun", "index.js", "-o", "./generated"];

			const result = parseArgs();

			expect(result.output).toBe("./generated");
		});

		test("should parse output flag (long)", () => {
			Bun.argv = ["bun", "index.js", "--output", "/tmp/output"];

			const result = parseArgs();

			expect(result.output).toBe("/tmp/output");
		});

		test("should parse help flag (short)", () => {
			Bun.argv = ["bun", "index.js", "-h"];

			const result = parseArgs();

			expect(result.help).toBe(true);
		});

		test("should parse help flag (long)", () => {
			Bun.argv = ["bun", "index.js", "--help"];

			const result = parseArgs();

			expect(result.help).toBe(true);
		});

		test("should parse multiple flags together", () => {
			Bun.argv = ["bun", "index.js", "--input", "api.json", "--angular", "--http", "--output", "./dist"];

			const result = parseArgs();

			expect(result).toEqual({
				input: "api.json",
				angular: true,
				http: true,
				output: "./dist",
				help: false,
			});
		});

		test("should handle JSON file extension as input", () => {
			Bun.argv = ["bun", "index.js", "test.json"];

			const result = parseArgs();

			expect(result.input).toBe("test.json");
		});

		test("should handle multiple arguments with mixed formats", () => {
			Bun.argv = ["bun", "index.js", "-i", "api.json", "extra.json", "--angular"];

			const result = parseArgs();

			expect(result.input).toBe("extra.json"); // Last JSON file takes precedence
			expect(result.angular).toBe(true);
		});
	});

	describe("isAngularProject", () => {
		test("should return true when angular.json exists", () => {
			writeFileSync("angular.json", "{}");

			const result = isAngularProject();

			expect(result).toBe(true);
		});

		test("should return true when package.json contains @angular/core", () => {
			const packageJson = {
				dependencies: {
					"@angular/core": "^15.0.0",
				},
			};
			writeFileSync("package.json", JSON.stringify(packageJson));

			const result = isAngularProject();

			expect(result).toBe(true);
		});

		test("should return true when @angular/core is in devDependencies", () => {
			const packageJson = {
				devDependencies: {
					"@angular/core": "^16.0.0",
				},
			};
			writeFileSync("package.json", JSON.stringify(packageJson));

			const result = isAngularProject();

			expect(result).toBe(true);
		});

		test("should return false when no angular.json and no angular dependencies", () => {
			const packageJson = {
				dependencies: {
					"react": "^18.0.0",
				},
			};
			writeFileSync("package.json", JSON.stringify(packageJson));

			const result = isAngularProject();

			expect(result).toBe(false);
		});

		test("should return false when package.json parsing fails", () => {
			writeFileSync("package.json", "{ invalid json }");

			const result = isAngularProject();

			expect(result).toBe(false);
		});

		test("should return false when no angular.json and no package.json", () => {
			const result = isAngularProject();

			expect(result).toBe(false);
		});
	});

	describe("getOutputPaths", () => {
		beforeEach(() => {
			// Reset temp directory for each test
			process.chdir(tempDir);
		});

		test("should return default output paths when no options specified", () => {
			const options = { input: "swagger.json", angular: false, http: false, help: false };

			const result = getOutputPaths(options);

			expect(result.modelsPath).toBe(join("outputs", "models", "index.ts"));
			expect(result.servicePath).toBe(join("outputs", "http-client", "sauron-api.client.ts"));
		});

		test("should return Angular paths when angular option is true and project detected", () => {
			writeFileSync("angular.json", "{}");
			const options = { input: "swagger.json", angular: true, http: false, help: false };

			const result = getOutputPaths(options);

			expect(result.modelsPath).toBe(join("src", "app", "sauron", "models", "index.ts"));
			expect(result.servicePath).toBe(join("src", "app", "sauron", "angular-http-client", "sauron-api.service.ts"));
		});

		test("should return outputs paths when angular option is true but project not detected", () => {
			const options = { input: "swagger.json", angular: true, http: false, help: false };

			const result = getOutputPaths(options);

			expect(result.modelsPath).toBe(join("outputs", "models", "index.ts"));
			expect(result.servicePath).toBe(join("outputs", "http-client", "sauron-api.client.ts"));
		});

		test("should use custom output directory when specified", () => {
			// Change to a writable temp directory for this test
			const originalCwd = process.cwd();
			try {
				process.chdir(tempDir);

				const customOutput = join(tempDir, "custom-output");
				const options = {
					input: "swagger.json",
					angular: false,
					http: false,
					help: false,
					output: customOutput
				};

				const result = getOutputPaths(options);

				expect(result.modelsPath).toBe(join(customOutput, "models", "index.ts"));
				expect(result.servicePath).toBe(join(customOutput, "http-client", "sauron-api.client.ts"));
			} finally {
				process.chdir(originalCwd);
			}
		});

		test("should create necessary directories", () => {
			const options = { input: "swagger.json", angular: false, http: false, help: false };

			getOutputPaths(options);

			expect(existsSync(join("outputs", "models"))).toBe(true);
			expect(existsSync(join("outputs", "http-client"))).toBe(true);
		});
	});

	describe("generateAngularService", () => {
		test("should generate Angular service with methods and imports", () => {
			const methods = [
				"  getUsers(): Observable<User[]> {\n    return this.httpClient.get<User[]>('/api/users');\n  }",
				"  createUser(body: CreateUserDto): Observable<User> {\n    return this.httpClient.post<User>('/api/users', body);\n  }"
			];
			const imports = ["User", "CreateUserDto"];

			const result = generateAngularService(methods, imports, true);

			expect(result).toContain("import { Injectable, inject } from \"@angular/core\"");
			expect(result).toContain("import { HttpClient } from \"@angular/common/http\"");
			expect(result).toContain("import { Observable } from \"rxjs\"");
			expect(result).toContain("import { User, CreateUserDto } from \"./models\"");
			expect(result).toContain("@Injectable({");
			expect(result).toContain("providedIn: \"root\"");
			expect(result).toContain("export class SauronApiService");
			expect(result).toContain("private readonly httpClient = inject(HttpClient)");
			expect(result).toContain("getUsers(): Observable<User[]>");
			expect(result).toContain("createUser(body: CreateUserDto): Observable<User>");
		});

		test("should generate service without imports when none provided", () => {
			const methods = [
				"  getHealth(): Observable<any> {\n    return this.httpClient.get<any>('/health');\n  }"
			];
			const imports: string[] = [];

			const result = generateAngularService(methods, imports, true);

			expect(result).toContain("import { Injectable, inject } from \"@angular/core\"");
			expect(result).not.toContain("import { } from \"./models\"");
			expect(result).toContain("getHealth(): Observable<any>");
		});

		test("should use correct import path for non-Angular projects", () => {
			const methods = [
				"  getData(): Observable<Data> {\n    return this.httpClient.get<Data>('/data');\n  }"
			];
			const imports = ["Data"];

			const result = generateAngularService(methods, imports, false);

			expect(result).toContain("import { Data } from \"../models\"");
		});

		test("should handle empty methods array", () => {
			const methods: string[] = [];
			const imports: string[] = [];

			const result = generateAngularService(methods, imports, true);

			expect(result).toContain("export class SauronApiService");
			expect(result).toContain("}\n");
		});
	});

	describe("generateMethodName", () => {
		test("should generate method name from simple path", () => {
			const path = "/api/users";
			const httpMethod = "get";
			const operation = { tags: ["User"] };

			const result = generateMethodName(path, httpMethod, operation);

			expect(result).toBe("GetUser");
		});

		test("should generate method name with path parameters", () => {
			const path = "/api/users/{userId}";
			const httpMethod = "get";
			const operation = { tags: ["User"] };

			const result = generateMethodName(path, httpMethod, operation);

			expect(result).toBe("GetUsersByUserIdById");
		});

		test("should generate method name from tags when no descriptive path", () => {
			const path = "/v1/data";
			const httpMethod = "post";
			const operation = { tags: ["Data", "Management"] };

			const result = generateMethodName(path, httpMethod, operation);

			expect(result).toBe("PostV1Data");
		});

		test("should add Create suffix for POST with body", () => {
			const path = "/api/products";
			const httpMethod = "post";
			const operation = { tags: ["Product"], requestBody: {} };

			const result = generateMethodName(path, httpMethod, operation);

			expect(result).toBe("PostProductCreate");
		});

		test("should add WithParams suffix for GET with query parameters", () => {
			const path = "/api/search";
			const httpMethod = "get";
			const operation = {
				tags: ["Search"],
				parameters: [{ in: "query", name: "q" }]
			};

			const result = generateMethodName(path, httpMethod, operation);

			expect(result).toBe("GetSearchWithParams");
		});

		test("should handle complex path segments", () => {
			const path = "/api/user-management/profiles/{profileId}/settings";
			const httpMethod = "put";
			const operation = { tags: [] };

			const result = generateMethodName(path, httpMethod, operation);

			expect(result).toBe("PutUsermanagementProfilesByProfileIdSettings");
		});

		test("should clean special characters from path", () => {
			const path = "/api/user_data/{user-id}";
			const httpMethod = "get";
			const operation = { tags: [] };

			const result = generateMethodName(path, httpMethod, operation);

			expect(result).toBe("GetUserdataByUseridById");
		});

		test("should fallback to Api when no tags or path info", () => {
			const path = "/";
			const httpMethod = "get";
			const operation = { tags: [] };

			const result = generateMethodName(path, httpMethod, operation);

			expect(result).toBe("GetApi");
		});
	});

	describe("extractMethodParameters", () => {
		test("should extract path parameters", () => {
			const path = "/api/users/{userId}/posts/{postId}";
			const operation = {};

			const result = extractMethodParameters(path, operation);

			expect(result).toBe("userId: any, postId: any");
		});

		test("should extract required query parameters", () => {
			const path = "/api/search";
			const operation = {
				parameters: [
					{ in: "query", name: "q", required: true },
					{ in: "query", name: "limit", required: true },
				],
			};

			const result = extractMethodParameters(path, operation);

			expect(result).toBe("q: any, limit: any");
		});

		test("should extract optional query parameters with question mark", () => {
			const path = "/api/search";
			const operation = {
				parameters: [
					{ in: "query", name: "q", required: false },
					{ in: "query", name: "sort", required: true },
				],
			};

			const result = extractMethodParameters(path, operation);

			expect(result).toBe("q?: any, sort: any");
		});

		test("should extract request body parameter for operations with body", () => {
			const path = "/api/users";
			const operation = {
				requestBody: {
					content: {
						"application/json": {
							schema: { type: "object" },
						},
					},
				},
			};

			const result = extractMethodParameters(path, operation);

			expect(result).toBe("body: any");
		});

		test("should combine path, query, and body parameters", () => {
			const path = "/api/users/{userId}/posts";
			const operation = {
				parameters: [
					{ in: "query", name: "limit", required: false },
					{ in: "query", name: "offset", required: true },
				],
				requestBody: {},
			};

			const result = extractMethodParameters(path, operation);

			expect(result).toBe("userId: any, limit?: any, offset: any, body: any");
		});

		test("should return empty string when no parameters", () => {
			const path = "/api/health";
			const operation = {};

			const result = extractMethodParameters(path, operation);

			expect(result).toBe("");
		});

		test("should ignore non-query parameters", () => {
			const path = "/api/users";
			const operation = {
				parameters: [
					{ in: "header", name: "Authorization" },
					{ in: "query", name: "filter", required: true },
					{ in: "path", name: "userId" }, // This should be handled by path parsing
				],
			};

			const result = extractMethodParameters(path, operation);

			expect(result).toBe("filter: any");
		});
	});

	describe("extractResponseType", () => {
		test("should extract type from 200 response with $ref", () => {
			const operation = {
				responses: {
					"200": {
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/User" },
							},
						},
					},
				},
			};

			const result = extractResponseType(operation);

			expect(result).toBe("User");
		});

		test("should extract array type from response", () => {
			const operation = {
				responses: {
					"200": {
						content: {
							"application/json": {
								schema: {
									type: "array",
									items: { $ref: "#/components/schemas/Product" },
								},
							},
						},
					},
				},
			};

			const result = extractResponseType(operation);

			expect(result).toBe("Product[]");
		});

		test("should prefer 200 response over other success responses", () => {
			const operation = {
				responses: {
					"201": {
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/User" },
							},
						},
					},
					"200": {
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/Post" },
							},
						},
					},
				},
			};

			const result = extractResponseType(operation);

			expect(result).toBe("Post");
		});

		test("should fallback to any 2xx response when 200 not found", () => {
			const operation = {
				responses: {
					"201": {
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/Created" },
							},
						},
					},
				},
			};

			const result = extractResponseType(operation);

			expect(result).toBe("Created");
		});

		test("should return any when no valid response schema found", () => {
			const operation = {
				responses: {
					"200": {
						description: "Success",
					},
				},
			};

			const result = extractResponseType(operation);

			expect(result).toBe("any");
		});

		test("should return any when response is not an object", () => {
			const operation = {
				responses: {
					"200": "string response",
				},
			};

			const result = extractResponseType(operation);

			expect(result).toBe("any");
		});

		test("should return any when no responses defined", () => {
			const operation = {};

			const result = extractResponseType(operation);

			expect(result).toBe("any");
		});

		test("should handle non-JSON content types gracefully", () => {
			const operation = {
				responses: {
					"200": {
						content: {
							"text/plain": {
								schema: { type: "string" },
							},
						},
					},
				},
			};

			const result = extractResponseType(operation);

			expect(result).toBe("any");
		});
	});

	describe("createFetchHttpMethods", () => {
		test("should generate fetch methods from OpenAPI paths", () => {
			const openApiSchema = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {
					"/api/users": {
						get: {
							tags: ["User"],
							responses: {
								"200": {
									content: {
										"application/json": {
											schema: { $ref: "#/components/schemas/User" },
										},
									},
								},
							},
						},
						post: {
							tags: ["User"],
							requestBody: {},
							responses: {
								"201": {
									content: {
										"application/json": {
											schema: { $ref: "#/components/schemas/User" },
										},
									},
								},
							},
						},
					},
				},
				components: {
					schemas: {
						User: { type: "object", properties: { id: { type: "integer" } } },
					},
				},
			};

			const usedTypes = new Set<string>();
			const result = createFetchHttpMethods(openApiSchema, usedTypes);

			expect(result).toHaveLength(2);
			expect(result[0]).toContain("async GetUser(");
			expect(result[0]).toContain("Promise<User>");
			expect(result[0]).toContain("fetch(");
			expect(result[1]).toContain("async PostUserCreate(");
			expect(result[1]).toContain("Promise<User>");
			expect(usedTypes.has("User")).toBe(true);
		});

		test("should handle paths with parameters", () => {
			const openApiSchema = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {
					"/api/users/{userId}": {
						get: {
							tags: ["User"],
							responses: {
								"200": {
									content: {
										"application/json": {
											schema: { $ref: "#/components/schemas/User" },
										},
									},
								},
							},
						},
					},
					"/api/search": {
						get: {
							tags: ["Search"],
							parameters: [
								{ in: "query", name: "q", required: true },
								{ in: "query", name: "limit", required: false },
							],
							responses: {
								"200": {
									content: {
										"application/json": {
											schema: {
												type: "array",
												items: { $ref: "#/components/schemas/Result" },
											},
										},
									},
								},
							},
						},
					},
				},
				components: {
					schemas: {
						User: { type: "object", properties: { id: { type: "integer" } } },
						Result: { type: "object", properties: { title: { type: "string" } } },
					},
				},
			};

			const usedTypes = new Set<string>();
			const result = createFetchHttpMethods(openApiSchema, usedTypes);

			expect(result).toHaveLength(2);

			const userMethod = result.find((m) => m.includes("GetUsersByUserIdById"));
			const searchMethod = result.find((m) => m.includes("GetSearchWithParams"));

			expect(userMethod).toContain("userId: any");
			expect(userMethod).toContain("/api/users/${userId}");
			expect(userMethod).toContain("Promise<User>");

			expect(searchMethod).toContain("q: any, limit?: any");
			expect(searchMethod).toContain("/api/search?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(limit)}");
			expect(searchMethod).toContain("Promise<Result[]>");

			expect(usedTypes.has("User")).toBe(true);
			expect(usedTypes.has("Result")).toBe(true);
		});

		test("should return empty array when no paths defined", () => {
			const openApiSchema = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {},
			};

			const result = createFetchHttpMethods(openApiSchema);

			expect(result).toHaveLength(0);
		});

		test("should handle multiple HTTP methods per path", () => {
			const openApiSchema = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {
					"/api/products/{productId}": {
						get: {
							tags: ["Product"],
							responses: { "200": { description: "Success" } },
						},
						put: {
							tags: ["Product"],
							requestBody: {},
							responses: { "200": { description: "Updated" } },
						},
						delete: {
							tags: ["Product"],
							responses: { "204": { description: "Deleted" } },
						},
					},
				},
			};

			const result = createFetchHttpMethods(openApiSchema);

			expect(result).toHaveLength(3);
			expect(result.some((m) => m.includes("GetProductsByProductIdById"))).toBe(true);
			expect(result.some((m) => m.includes("PutProductsByProductId"))).toBe(true);
			expect(result.some((m) => m.includes("DeleteProductsByProductId"))).toBe(true);
		});

		test("should handle request bodies in POST/PUT/PATCH methods", () => {
			const openApiSchema = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {
					"/api/users": {
						post: {
							tags: ["User"],
							requestBody: {},
							responses: { "201": { description: "Created" } },
						},
					},
				},
			};

			const result = createFetchHttpMethods(openApiSchema);

			expect(result[0]).toContain("body: any");
			expect(result[0]).toContain("JSON.stringify(body)");
			expect(result[0]).toContain("method: 'POST'");
		});
	});

	describe("generateFetchService", () => {
		test("should generate fetch service with methods and imports", () => {
			const methods = [
				"  async getUsers(): Promise<User[]> {\n    const response = await fetch(`/api/users`);\n    return await response.json();\n  }",
				"  async createUser(body: CreateUserDto): Promise<User> {\n    const response = await fetch(`/api/users`, {\n      method: 'POST',\n      body: JSON.stringify(body)\n    });\n    return await response.json();\n  }"
			];
			const modelsPath = "/some/path/models/index.ts";
			const usedTypes = new Set(["User", "CreateUserDto"]);

			const result = generateFetchService(methods, modelsPath, usedTypes);

			expect(result).toContain("// Generated fetch-based HTTP client");
			expect(result).toContain("import { User, CreateUserDto } from \"../models\"");
			expect(result).toContain("export class SauronApiClient");
			expect(result).toContain("private baseUrl = ''");
			expect(result).toContain("constructor(baseUrl?: string)");
			expect(result).toContain("async getUsers(): Promise<User[]>");
			expect(result).toContain("async createUser(body: CreateUserDto): Promise<User>");
			expect(result).toContain("// Export a default instance");
			expect(result).toContain("export const sauronApi = new SauronApiClient();");
		});

		test("should generate service without imports when no types used", () => {
			const methods = [
				"  async getHealth(): Promise<any> {\n    const response = await fetch(`/health`);\n    return await response.json();\n  }"
			];
			const modelsPath = "/some/path/models/index.ts";
			const usedTypes = new Set<string>();

			const result = generateFetchService(methods, modelsPath, usedTypes);

			expect(result).toContain("// Generated fetch-based HTTP client");
			expect(result).not.toContain("import {");
			expect(result).toContain("export class SauronApiClient");
			expect(result).toContain("async getHealth(): Promise<any>");
		});

		test("should handle empty methods array", () => {
			const methods: string[] = [];
			const modelsPath = "/some/path/models/index.ts";
			const usedTypes = new Set<string>();

			const result = generateFetchService(methods, modelsPath, usedTypes);

			expect(result).toContain("export class SauronApiClient");
			expect(result).toContain("}\n\n// Export a default instance");
		});

		test("should set baseUrl when provided in constructor", () => {
			const methods: string[] = [];
			const modelsPath = "/some/path/models/index.ts";
			const usedTypes = new Set<string>();

			const result = generateFetchService(methods, modelsPath, usedTypes);

			expect(result).toContain("constructor(baseUrl?: string) {");
			expect(result).toContain("if (baseUrl) {");
			expect(result).toContain("this.baseUrl = baseUrl;");
		});
	});

	describe("Integration tests", () => {
		test("should handle end-to-end flow with valid OpenAPI spec", () => {
			// Test that all the exported functions work together
			const validOpenApiSpec = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {
					"/api/users/{userId}": {
						get: {
							tags: ["User"],
							parameters: [
								{ name: "userId", in: "path", required: true, schema: { type: "string" } },
								{ name: "limit", in: "query", required: false, schema: { type: "integer" } },
							],
							responses: {
								"200": {
									description: "Success",
									content: {
										"application/json": {
											schema: { $ref: "#/components/schemas/User" },
										},
									},
								},
							},
						},
					},
				},
				components: {
					schemas: {
						User: {
							type: "object",
							properties: {
								id: { type: "integer" },
								name: { type: "string" },
							},
						},
					},
				},
			};

			// Test that schema validation works
			const validatedSchema = verifySwaggerComposition(validOpenApiSpec);
			expect(validatedSchema).toEqual(validOpenApiSpec);

			// Test that models are generated
			const models = createModels(validatedSchema);
			expect(models.length).toBeGreaterThan(0);
			expect(models[0]).toContain("export interface User");

			// Test that Angular methods are generated
			const { methods, imports } = createAngularHttpClientMethods(validatedSchema);
			expect(methods.length).toBeGreaterThan(0);
			expect(imports).toContain("User");

			// Test that fetch methods are generated
			const usedTypes = new Set<string>();
			const fetchMethods = createFetchHttpMethods(validatedSchema, usedTypes);
			expect(fetchMethods.length).toBeGreaterThan(0);
			expect(usedTypes.has("User")).toBe(true);

			// Test that fetch service is generated
			const fetchService = generateFetchService(fetchMethods, "/some/path", usedTypes);
			expect(fetchService).toContain("export class SauronApiClient");
			expect(fetchService).toContain("async GetUsersByUserIdById");
		});
	});
});
