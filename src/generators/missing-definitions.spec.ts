import { describe, expect, test } from "bun:test";
import {
	createMissingSwaggerDefinitionsReport,
	generateMissingSwaggerDefinitionsFile,
} from "./missing-definitions";

describe("Missing definitions generator", () => {
	test("should report any-typed query, request, and response definitions", () => {
		const schema = {
			openapi: "3.0.3",
			info: { title: "Missing types API", version: "1.0.0" },
			paths: {
				"/api/users/{id}": {
					get: {
						parameters: [
							{ in: "query", name: "search", required: false },
						] as any,
						responses: {
							"200": {
								description: "Success",
								content: {
									"application/json": {
										schema: { type: "object" },
									},
								},
							},
						},
					},
				},
			},
		};

		const report = createMissingSwaggerDefinitionsReport(schema as any);

		expect(report.totalIssues).toBe(3);
		expect(report.summary.pathParameters).toBe(1);
		expect(report.summary.queryParameters).toBe(1);
		expect(report.summary.requestBodies).toBe(0);
		expect(report.summary.responseBodies).toBe(1);
		expect(
			report.issues.some(
				(issue) => issue.location === "path.parameter" && issue.field === "id",
			),
		).toBe(true);
		expect(
			report.issues.some(
				(issue) =>
					issue.location === "query.parameter" && issue.field === "search",
			),
		).toBe(true);
	});

	test("should not report missing definitions when operation types provide concrete types", () => {
		const schema = {
			openapi: "3.0.3",
			info: { title: "Inline typed API", version: "1.0.0" },
			paths: {
				"/api/users": {
					post: {
						requestBody: {
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: { name: { type: "string" } },
									},
								},
							},
						},
						responses: {
							"201": {
								description: "Created",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: { id: { type: "integer" } },
										},
									},
								},
							},
						},
					},
				},
			},
		};

		const report = createMissingSwaggerDefinitionsReport(schema as any, {
			"/api/users": {
				post: {
					requestType: "PostUsersRequest",
					responseType: "PostUsersResponse",
				},
			},
		});

		expect(report.totalIssues).toBe(0);
		expect(report.issues).toHaveLength(0);
	});

	test("should serialize report to json file content", () => {
		const report = {
			generatedAt: "2026-01-01T00:00:00.000Z",
			totalIssues: 1,
			summary: {
				pathParameters: 1,
				queryParameters: 0,
				requestBodies: 0,
				responseBodies: 0,
			},
			issues: [
				{
					path: "/api/users/{id}",
					method: "GET",
					location: "path.parameter",
					field: "id",
					reason: "Path parameter schema is missing or unresolved.",
					recommendedDefinition:
						"Define parameter.schema with a primitive type, enum, object, array, or valid $ref.",
				},
			],
		};

		const content = generateMissingSwaggerDefinitionsFile(report);

		expect(content).toContain("\"totalIssues\": 1");
		expect(content.endsWith("\n")).toBe(true);
	});
});
