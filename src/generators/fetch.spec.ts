import { describe, expect, test } from "bun:test";
import {
	createAngularHttpClientMethods,
	createModels,
	createModelsWithOperationTypes,
	verifySwaggerComposition,
} from "../utils";
import {
	createFetchHttpMethods,
	extractMethodParameters,
	extractResponseType,
	generateFetchService,
	generateMethodName,
} from "./fetch";

describe("Fetch generator", () => {
	describe("generateMethodName", () => {
		test("should generate method name from simple path", () => {
			expect(generateMethodName("/api/users", "get", { tags: ["User"] })).toBe(
				"GetUser",
			);
		});

		test("should generate method name with path parameters", () => {
			expect(
				generateMethodName("/api/users/{userId}", "get", { tags: ["User"] }),
			).toBe("GetUsersByUserId");
		});

		test("should add suffixes and fallbacks", () => {
			expect(
				generateMethodName("/api/products", "post", {
					tags: ["Product"],
					requestBody: {},
				}),
			).toBe("PostProductCreate");
			expect(
				generateMethodName("/api/search", "get", {
					tags: ["Search"],
					parameters: [{ in: "query", name: "q" } as any],
				}),
			).toBe("GetSearchWithParams");
			expect(generateMethodName("/", "get", { tags: [] })).toBe("GetApi");
		});

		test("should handle complex and special-character paths", () => {
			expect(
				generateMethodName(
					"/api/user-management/profiles/{profileId}/settings",
					"put",
					{ tags: [] },
				),
			).toBe("PutUsermanagementProfilesByProfileIdSettings");
			expect(
				generateMethodName("/api/user_data/{user-id}", "get", { tags: [] }),
			).toBe("GetUserdataByUserid");
		});
	});

	describe("extractMethodParameters", () => {
		test("should extract path/query/body parameters", () => {
			expect(
				extractMethodParameters("/api/users/{userId}/posts/{postId}", {}),
			).toBe("userId: any, postId: any");
			expect(
				extractMethodParameters("/api/search", {
					parameters: [
						{ in: "query", name: "q", required: true },
						{ in: "query", name: "limit", required: true },
					] as any,
				}),
			).toBe("q: any, limit: any");
			expect(
				extractMethodParameters("/api/users", {
					requestBody: {
						content: { "application/json": { schema: { type: "object" } } },
					},
				} as any),
			).toBe("body: any");
		});

		test("should support optional query params and empty parameters", () => {
			expect(
				extractMethodParameters("/api/search", {
					parameters: [
						{ in: "query", name: "q", required: false },
						{ in: "query", name: "sort", required: true },
					] as any,
				}),
			).toBe("sort: any, q?: any");
			expect(extractMethodParameters("/api/health", {})).toBe("");
			expect(
				extractMethodParameters("/api/users", {
					parameters: [
						{ in: "header", name: "Authorization" },
						{ in: "query", name: "filter", required: true },
					] as any,
				}),
			).toBe("filter: any");
		});
	});

	describe("extractResponseType", () => {
		test("should extract response type or fallback to any", () => {
			expect(
				extractResponseType({
					responses: {
						"200": {
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/User" },
								},
							},
						},
					},
				} as any),
			).toBe("User");
			expect(extractResponseType({} as any)).toBe("any");
		});

		test("should handle arrays and non-json responses", () => {
			expect(
				extractResponseType({
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
				} as any),
			).toBe("Product[]");
			expect(
				extractResponseType({
					responses: {
						"200": {
							content: { "text/plain": { schema: { type: "string" } } },
						},
					},
				} as any),
			).toBe("any");
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
									description: "Success",
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
			const { methods } = createFetchHttpMethods(
				openApiSchema as any,
				usedTypes,
			);

			expect(methods).toHaveLength(2);
			expect(methods[0]).toContain("async GetUser(");
			expect(methods[1]).toContain("async PostUserCreate(");
			expect(methods[0]).toContain("fetch(this.buildUrl(");
			expect(usedTypes.has("User")).toBe(true);
		});

		test("should handle paths with parameters and query string interface", () => {
			const openApiSchema = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {
					"/api/users/{userId}": {
						get: {
							tags: ["User"],
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
					"/api/search": {
						get: {
							tags: ["Search"],
							parameters: [
								{ in: "query", name: "q", required: true },
								{ in: "query", name: "limit", required: false },
							],
							responses: {
								"200": {
									description: "Success",
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
						Result: {
							type: "object",
							properties: { title: { type: "string" } },
						},
					},
				},
			};

			const { methods, paramsInterfaces } = createFetchHttpMethods(
				openApiSchema as any,
			);
			expect(methods.find((m) => m.includes("GetUsersByUserId"))).toContain(
				"/api/users/${userId}",
			);
			expect(methods.find((m) => m.includes("GetSearchWithParams"))).toContain(
				"params: GetSearchWithParamsParams",
			);
			expect(
				paramsInterfaces.find((i) => i.includes("GetSearchWithParamsParams")),
			).toContain("limit?: any;");
		});

		test("should support sanitized names and inline types", () => {
			const openApiSchema = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {
					"/v1/users": {
						post: {
							requestBody: {
								content: {
									"application/json": {
										schema: { $ref: "#/components/schemas/Base.Library.Dto" },
									},
								},
							},
							responses: {
								"200": {
									description: "ok",
									content: {
										"application/json": {
											schema: { $ref: "#/components/schemas/Base.Library.Dto" },
										},
									},
								},
							},
						},
					},
				},
				components: {
					schemas: {
						"Base.Library.Dto": {
							type: "object",
							properties: { id: { type: "integer" } },
						},
					},
				},
			};

			const { operationTypes, typeNameMap } = createModelsWithOperationTypes(
				openApiSchema as any,
			);
			const { methods } = createFetchHttpMethods(
				openApiSchema as any,
				undefined,
				operationTypes,
				typeNameMap,
			);
			expect(methods[0]).toContain("body: BaseLibraryDto");
			expect(methods[0]).toContain("Promise<BaseLibraryDto>");
		});

		test("should handle no paths and multiple HTTP methods", () => {
			expect(
				createFetchHttpMethods({
					openapi: "3.0.4",
					info: { title: "Test API", version: "1.0.0" },
					paths: {},
				} as any).methods,
			).toHaveLength(0);

			const schema = {
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

			const { methods } = createFetchHttpMethods(schema as any);
			expect(methods).toHaveLength(3);
			expect(methods.some((m) => m.includes("GetProductsByProductId"))).toBe(
				true,
			);
			expect(methods.some((m) => m.includes("PutProductsByProductId"))).toBe(
				true,
			);
			expect(methods.some((m) => m.includes("DeleteProductsByProductId"))).toBe(
				true,
			);
		});
	});

	describe("Parameter typing", () => {
		test("should type query/path params", () => {
			const openApiSchema = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {
					"/v1/banners/{bannerId}": {
						get: {
							parameters: [
								{
									name: "bannerId",
									in: "path",
									required: true,
									schema: { type: "integer" },
								},
								{
									name: "limit",
									in: "query",
									required: false,
									schema: { type: "string", format: "numeric" },
								},
							],
							responses: { "200": { description: "ok" } },
						},
					},
				},
			};

			const { methods: fetchMethods, paramsInterfaces: fetchParams } =
				createFetchHttpMethods(openApiSchema as any);
			expect(fetchMethods[0]).toContain("(bannerId: number, params:");
			expect(fetchParams[0]).toContain("limit?: number;");

			const { methods: angularMethods, paramsInterfaces: angularParams } =
				createAngularHttpClientMethods(openApiSchema as any);
			expect(angularMethods[0]).toContain(
				"(bannerId: number, params: GetV1BannersByBannerIdParams)",
			);
			expect(angularParams[0]).toContain("limit?: number;");
		});

		test("should support anyOf, oneOf and allOf on query params", () => {
			const anyOfSchema = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {
					"/v1/search": {
						get: {
							parameters: [
								{
									name: "q",
									in: "query",
									required: true,
									schema: { anyOf: [{ type: "string" }, { type: "number" }] },
								},
							],
							responses: { "200": { description: "ok" } },
						},
					},
				},
			};
			const oneOfSchema = {
				...anyOfSchema,
				paths: {
					"/v1/search": {
						get: {
							parameters: [
								{
									name: "q",
									in: "query",
									required: true,
									schema: { oneOf: [{ type: "string" }, { type: "number" }] },
								},
							],
							responses: { "200": { description: "ok" } },
						},
					},
				},
			};
			const allOfSchema = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {
					"/v1/search": {
						get: {
							parameters: [
								{
									name: "filter",
									in: "query",
									required: true,
									schema: {
										allOf: [
											{
												type: "object",
												properties: { a: { type: "string" } },
												required: ["a"],
											},
											{
												type: "object",
												properties: { b: { type: "number" } },
												required: ["b"],
											},
										],
									},
								},
							],
							responses: { "200": { description: "ok" } },
						},
					},
				},
			};

			expect(
				createFetchHttpMethods(anyOfSchema as any).paramsInterfaces[0],
			).toContain("q: string | number;");
			expect(
				createFetchHttpMethods(oneOfSchema as any).paramsInterfaces[0],
			).toContain("q: string | number;");
			expect(
				createFetchHttpMethods(allOfSchema as any).paramsInterfaces[0],
			).toContain("filter: { a: string; } & { b: number; };");
		});
	});

	describe("generateFetchService", () => {
		test("should generate fetch service with methods and imports", () => {
			const methods = [
				"  async getUsers(): Promise<User[]> {\\n    const response = await fetch(`/api/users`);\\n    return await response.json();\\n  }",
				"  async createUser(body: CreateUserDto): Promise<User> {\\n    const response = await fetch(`/api/users`, {\\n      method: 'POST',\\n      body: JSON.stringify(body)\\n    });\\n    return await response.json();\\n  }",
			];
			const result = generateFetchService(
				methods,
				"/some/path/models/index.ts",
				new Set(["User", "CreateUserDto"]),
			);

			expect(result).toContain("// Generated fetch-based HTTP client");
			expect(result).toContain('import qs from "query-string";');
			expect(result).toContain(
				'import { User, CreateUserDto } from "../models"',
			);
			expect(result).toContain("export class SauronApiClient");
			expect(result).toContain("setBaseUrl(baseUrl: string): void");
			expect(result).toContain("private buildUrl(path: string): string");
			expect(result).toContain(
				"export const sauronApi = new SauronApiClient();",
			);
		});

		test("should generate service without imports when no types used", () => {
			const result = generateFetchService(
				[],
				"/some/path/models/index.ts",
				new Set(),
			);
			expect(result).not.toContain('import { } from "../models"');
			expect(result).toContain("constructor(baseUrl?: string)");
		});

		test("should include body serialization for post operations", () => {
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

			const { methods } = createFetchHttpMethods(openApiSchema as any);
			expect(methods[0]).toContain("body: any");
			expect(methods[0]).toContain("JSON.stringify(body)");
			expect(methods[0]).toContain("method: 'POST'");
		});
	});

	describe("Integration flow", () => {
		test("should handle end-to-end flow with valid OpenAPI spec", () => {
			const validOpenApiSpec = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {
					"/api/users/{userId}": {
						get: {
							tags: ["User"],
							parameters: [
								{
									name: "userId",
									in: "path",
									required: true,
									schema: { type: "string" },
								},
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
							properties: { id: { type: "integer" }, name: { type: "string" } },
						},
					},
				},
			};

			const validatedSchema = verifySwaggerComposition(validOpenApiSpec as any);
			expect(validatedSchema).toEqual(validOpenApiSpec);

			const models = createModels(validatedSchema);
			expect(models[0]).toContain("export interface User");

			const { methods, imports } =
				createAngularHttpClientMethods(validatedSchema);
			expect(methods.length).toBeGreaterThan(0);
			expect(imports).toContain("User");

			const usedTypes = new Set<string>();
			const { methods: fetchMethods, paramsInterfaces } =
				createFetchHttpMethods(validatedSchema, usedTypes);
			expect(fetchMethods.length).toBeGreaterThan(0);
			expect(usedTypes.has("User")).toBe(true);

			const fetchService = generateFetchService(
				fetchMethods,
				"/some/path",
				usedTypes,
				paramsInterfaces,
			);
			expect(fetchService).toContain("export class SauronApiClient");
		});
	});
});
