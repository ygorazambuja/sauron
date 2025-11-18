/**
 * Test suite for OpenAPI to TypeScript converter utilities
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	createAngularHttpClientMethods,
	createModels,
	readJsonFile,
	verifySwaggerComposition,
} from "./index";

describe("OpenAPI to TypeScript Converter Utilities", () => {
	let tempDir: string;

	// Setup temporary directory for file tests
	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "openapi-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	describe("readJsonFile", () => {
		test("should read and parse valid JSON file", async () => {
			const testData = { name: "test", value: 42 };
			const filePath = join(tempDir, "test.json");
			writeFileSync(filePath, JSON.stringify(testData));

			const result = await readJsonFile(filePath);
			expect(result).toEqual(testData);
		});

		test("should throw error for non-existent file", async () => {
			const nonExistentPath = join(tempDir, "non-existent.json");

			await expect(readJsonFile(nonExistentPath)).rejects.toThrow(
				"Failed to read or parse JSON file",
			);
		});

		test("should throw error for invalid JSON", async () => {
			const filePath = join(tempDir, "invalid.json");
			writeFileSync(filePath, "{ invalid json }");

			await expect(readJsonFile(filePath)).rejects.toThrow(
				"Failed to read or parse JSON file",
			);
		});

		test("should throw error for empty file path", async () => {
			await expect(readJsonFile("")).rejects.toThrow(
				"File path must be a non-empty string",
			);
		});

		test("should throw error for non-string file path", async () => {
			// @ts-expect-error Testing invalid input
			await expect(readJsonFile(123)).rejects.toThrow(
				"File path must be a non-empty string",
			);
		});
	});

	describe("verifySwaggerComposition", () => {
		test("should validate correct OpenAPI schema", () => {
			const validOpenApiSchema = {
				openapi: "3.0.4",
				info: {
					title: "Test API",
					version: "1.0.0",
				},
				paths: {
					"/users": {
						get: {
							responses: {
								"200": {
									description: "Success",
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

			const result = verifySwaggerComposition(validOpenApiSchema);
			expect(result).toEqual(validOpenApiSchema);
			expect(result.openapi).toBe("3.0.4");
		});

		test("should throw error for missing required fields", () => {
			const invalidSchema = {
				// Missing openapi, info, paths
				components: {},
			};

			expect(() => verifySwaggerComposition(invalidSchema)).toThrow(
				"Invalid Swagger/OpenAPI schema",
			);
		});

		test("should throw error for invalid OpenAPI version", () => {
			const invalidVersionSchema = {
				openapi: "2.0.0", // Invalid version
				info: {
					title: "Test API",
					version: "1.0.0",
				},
				paths: {},
			};

			expect(() => verifySwaggerComposition(invalidVersionSchema)).toThrow(
				"Invalid Swagger/OpenAPI schema",
			);
		});

		test("should throw error for non-object input", () => {
			expect(() => verifySwaggerComposition(null as any)).toThrow(
				"Swagger data must be a valid object",
			);

			expect(() => verifySwaggerComposition("string" as any)).toThrow(
				"Swagger data must be a valid object",
			);
		});
	});

	describe("createModels", () => {
		test("should generate TypeScript definitions from valid schemas", () => {
			const openApiSchema = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {},
				components: {
					schemas: {
						User: {
							type: "object",
							properties: {
								id: { type: "integer" },
								name: { type: "string", nullable: true },
								email: { type: "string" },
							},
						},
						Status: {
							enum: ["active", "inactive"],
							type: "string",
						},
					},
				},
			};

			const result = createModels(openApiSchema);

			expect(result).toHaveLength(2);
			expect(result[0]).toContain("export interface User");
			expect(result[0]).toContain("id: number;");
			expect(result[0]).toContain("name: string | null;");
			expect(result[0]).toContain("email: string;");
			expect(result[1]).toContain(
				'export type Status = "active" | "inactive";',
			);
		});

		test("should handle schemas with arrays and references", () => {
			const openApiSchema = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {},
				components: {
					schemas: {
						User: {
							type: "object",
							properties: {
								id: { type: "integer" },
								posts: {
									type: "array",
									items: { $ref: "#/components/schemas/Post" },
								},
							},
						},
						Post: {
							type: "object",
							properties: {
								title: { type: "string" },
								content: { type: "string" },
							},
						},
					},
				},
			};

			const result = createModels(openApiSchema);

			expect(result).toHaveLength(2);
			const userInterface = result.find((r) => r.includes("interface User"));
			const postInterface = result.find((r) => r.includes("interface Post"));

			expect(userInterface).toContain("posts: Post[];");
			expect(postInterface).toContain("title: string;");
			expect(postInterface).toContain("content: string;");
		});

		test("should handle schemas with required fields", () => {
			const openApiSchema = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {},
				components: {
					schemas: {
						Product: {
							type: "object",
							properties: {
								id: { type: "integer" },
								name: { type: "string" },
								price: { type: "number" },
								description: { type: "string", nullable: true },
							},
							required: ["id", "name", "price"], // Only these are required
						},
					},
				},
			};

			const result = createModels(openApiSchema);

			expect(result[0]).toContain("id: number;");
			expect(result[0]).toContain("name: string;");
			expect(result[0]).toContain("price: number;");
			expect(result[0]).toContain("description?: string | null;");
		});

		test("should handle date-time format conversion", () => {
			const openApiSchema = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {},
				components: {
					schemas: {
						Event: {
							type: "object",
							properties: {
								createdAt: { type: "string", format: "date-time" },
								updatedAt: { type: "string" },
							},
						},
					},
				},
			};

			const result = createModels(openApiSchema);

			expect(result[0]).toContain("createdAt: Date;");
			expect(result[0]).toContain("updatedAt: string;");
		});

		test("should handle numeric enums", () => {
			const openApiSchema = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {},
				components: {
					schemas: {
						Priority: {
							enum: [1, 2, 3],
							type: "integer",
						},
					},
				},
			};

			const result = createModels(openApiSchema);

			expect(result[0]).toBe("export type Priority = 1 | 2 | 3;");
		});

		test("should throw error when no components.schemas found", () => {
			const openApiSchema = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {},
				// No components
			};

			expect(() => createModels(openApiSchema)).toThrow(
				"No schemas found in OpenAPI components",
			);
		});

		test("should handle empty schemas gracefully", () => {
			const openApiSchema = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {},
				components: {
					schemas: {}, // Empty schemas
				},
			};

			const result = createModels(openApiSchema);
			expect(result).toHaveLength(0);
		});

		test("should handle unsupported schema types with fallback", () => {
			const openApiSchema = {
				openapi: "3.0.4",
				info: { title: "Test API", version: "1.0.0" },
				paths: {},
				components: {
					schemas: {
						UnsupportedType: {
							// Schema sem type nem properties nem enum
							someCustomField: "value",
						},
					},
				},
			};

			const result = createModels(openApiSchema);
			expect(result[0]).toBe("export type UnsupportedType = any;");
		});
	});

	describe("Complex integration tests", () => {
		test("should generate methods with response types when schemas are available", () => {
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
											schema: {
												$ref: "#/components/schemas/UserDto",
											},
										},
									},
								},
							},
						},
					},
					"/api/users-array": {
						get: {
							tags: ["User"],
							responses: {
								"200": {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "array",
												items: {
													$ref: "#/components/schemas/UserDto",
												},
											},
										},
									},
								},
							},
						},
					},
					"/api/no-schema": {
						get: {
							tags: ["Test"],
							responses: {
								"200": {
									description: "Success",
								},
							},
						},
					},
				},
				components: {
					schemas: {
						UserDto: {
							type: "object",
							properties: {
								id: { type: "integer" },
								name: { type: "string" },
							},
						},
					},
				},
			};

			const { methods, imports } =
				createAngularHttpClientMethods(openApiSchema);

			expect(methods).toHaveLength(3);

			// Check that methods have correct return types
			const userMethod = methods.find((m) => m.includes("GetUser"));
			const userArrayMethod = methods.find(
				(m) => m.includes("GetUser") && m.includes("users-array"),
			);
			const noSchemaMethod = methods.find((m) => m.includes("GetTest"));

			expect(userMethod).toContain("Observable<UserDto>");
			expect(userArrayMethod).toContain("Observable<UserDto[]>");
			expect(noSchemaMethod).toContain("Observable<any>");

			// Check that UserDto is in imports
			expect(imports).toContain("UserDto");
		});

		test("should handle full OpenAPI spec with all features", () => {
			const complexSchema = {
				openapi: "3.0.4",
				info: { title: "Complex API", version: "2.0.0" },
				paths: {},
				components: {
					schemas: {
						User: {
							type: "object",
							properties: {
								id: { type: "integer" },
								username: { type: "string" },
								email: { type: "string", nullable: true },
								profile: { $ref: "#/components/schemas/Profile" },
								posts: {
									type: "array",
									items: { $ref: "#/components/schemas/Post" },
								},
								status: { $ref: "#/components/schemas/UserStatus" },
								createdAt: { type: "string", format: "date-time" },
							},
							required: [
								"id",
								"username",
								"profile",
								"posts",
								"status",
								"createdAt",
							],
						},
						Profile: {
							type: "object",
							properties: {
								bio: { type: "string", nullable: true },
								avatar: { type: "string", nullable: true },
							},
						},
						Post: {
							type: "object",
							properties: {
								id: { type: "integer" },
								title: { type: "string" },
								content: { type: "string" },
								published: { type: "boolean" },
							},
						},
						UserStatus: {
							enum: ["active", "inactive", "banned"],
							type: "string",
						},
					},
				},
			};

			const result = createModels(complexSchema);

			expect(result).toHaveLength(4);

			// Check User interface
			const userInterface = result.find((r) => r.includes("interface User"));
			expect(userInterface).toContain("id: number;");
			expect(userInterface).toContain("username: string;");
			expect(userInterface).toContain("email?: string | null;");
			expect(userInterface).toContain("profile: Profile;");
			expect(userInterface).toContain("posts: Post[];");
			expect(userInterface).toContain("status: UserStatus;");
			expect(userInterface).toContain("createdAt: Date;");

			// Check other interfaces and types
			expect(result.some((r) => r.includes("interface Profile"))).toBe(true);
			expect(result.some((r) => r.includes("interface Post"))).toBe(true);
			expect(result.some((r) => r.includes("type UserStatus"))).toBe(true);
		});
	});
});
