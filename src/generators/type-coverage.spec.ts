import { describe, expect, test } from "bun:test";
import {
	createTypeCoverageReport,
	generateTypeCoverageReportFile,
} from "./type-coverage";

describe("Type coverage generator", () => {
	test("should report typed and untyped slots by location", () => {
		const schema = {
			openapi: "3.0.3",
			info: { title: "Coverage API", version: "1.0.0" },
			paths: {
				"/api/users/{id}": {
					get: {
						parameters: [
							{
								in: "path",
								name: "id",
								required: true,
								schema: { type: "integer" },
							},
							{
								in: "query",
								name: "search",
								required: false,
							},
						] as any,
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
						responses: {},
					},
				},
			},
			components: {
				schemas: {
					User: { type: "object", properties: { id: { type: "integer" } } },
				},
			},
		};

		const report = createTypeCoverageReport(schema as any);

		expect(report.totalOperations).toBe(2);
		expect(report.totals.total).toBe(5);
		expect(report.totals.typed).toBe(2);
		expect(report.totals.untyped).toBe(3);
		expect(report.summary.pathParameters.untyped).toBe(0);
		expect(report.summary.queryParameters.untyped).toBe(1);
		expect(report.summary.requestBodies.untyped).toBe(1);
		expect(report.summary.responseBodies.untyped).toBe(1);
		expect(report.issues).toHaveLength(3);
	});

	test("should resolve typed request and response from operation type map", () => {
		const schema = {
			openapi: "3.0.3",
			info: { title: "Coverage API", version: "1.0.0" },
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
							},
						},
					},
				},
			},
		};

		const report = createTypeCoverageReport(schema as any, {
			"/api/users": {
				post: {
					requestType: "CreateUserRequest",
					responseType: "CreateUserResponse",
				},
			},
		});

		expect(report.totals.total).toBe(2);
		expect(report.totals.untyped).toBe(0);
		expect(report.issues).toHaveLength(0);
	});

	test("should not report issues for DELETE endpoints", () => {
		const schema = {
			openapi: "3.0.3",
			info: { title: "Coverage API", version: "1.0.0" },
			paths: {
				"/api/users/delete": {
					delete: {
						responses: {
							"200": {
								description: "Deleted",
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

		const report = createTypeCoverageReport(schema as any);

		expect(report.summary.responseBodies.untyped).toBe(0);
		expect(report.issues).toHaveLength(0);
	});

	test("should not report issues for no-content responses (e.g. 204)", () => {
		const schema = {
			openapi: "3.0.3",
			info: { title: "Coverage API", version: "1.0.0" },
			paths: {
				"/api/jobs/run": {
					post: {
						responses: {
							"204": {
								description: "No Content",
							},
						},
					},
				},
			},
		};

		const report = createTypeCoverageReport(schema as any);

		expect(report.summary.responseBodies.untyped).toBe(0);
		expect(report.issues).toHaveLength(0);
	});

	test("should still report issues for non-DELETE endpoints with missing response schema", () => {
		const schema = {
			openapi: "3.0.3",
			info: { title: "Coverage API", version: "1.0.0" },
			paths: {
				"/api/users": {
					get: {
						responses: {
							"200": {
								description: "Success",
							},
						},
					},
				},
			},
		};

		const report = createTypeCoverageReport(schema as any);

		expect(report.summary.responseBodies.untyped).toBe(1);
		expect(report.issues).toHaveLength(1);
		expect(report.issues[0]?.reason).toBe(
			"Success response exists but no response schema was documented in content.",
		);
	});

	test("should serialize report to json file content", () => {
		const report = {
			generatedAt: "2026-01-01T00:00:00.000Z",
			totalOperations: 1,
			totals: {
				total: 2,
				typed: 1,
				untyped: 1,
				coveragePercentage: 50,
			},
			summary: {
				pathParameters: {
					total: 0,
					typed: 0,
					untyped: 0,
					coveragePercentage: 100,
				},
				queryParameters: {
					total: 0,
					typed: 0,
					untyped: 0,
					coveragePercentage: 100,
				},
				requestBodies: {
					total: 1,
					typed: 1,
					untyped: 0,
					coveragePercentage: 100,
				},
				responseBodies: {
					total: 1,
					typed: 0,
					untyped: 1,
					coveragePercentage: 0,
				},
			},
			operations: [
				{
					path: "/api/users",
					method: "POST",
					total: 2,
					typed: 1,
					untyped: 1,
					coveragePercentage: 50,
					untypedLocations: ["response.body" as const],
				},
			],
			issues: [
				{
					path: "/api/users",
					method: "POST",
					location: "response.body" as const,
					reason: "No 2xx success response is documented for this operation.",
				},
			],
		};

		const content = generateTypeCoverageReportFile(report);

		expect(content).toContain('"totalOperations": 1');
		expect(content.endsWith("\n")).toBe(true);
	});
});
