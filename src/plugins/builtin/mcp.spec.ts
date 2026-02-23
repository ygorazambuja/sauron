import { describe, expect, test } from "bun:test";
import { createMcpPlugin } from "./mcp";

describe("mcp plugin", () => {
	test("should generate grouped MCP files by resource tag", async () => {
		const plugin = createMcpPlugin();
		const result = await plugin.generate({
			schema: {
				openapi: "3.0.3",
				info: { title: "MCP Test", version: "1.0.0" },
				paths: {
					"/users": {
						get: {
							tags: ["Users"],
							summary: "List users",
						},
						post: {
							tags: ["Users"],
							summary: "Create user",
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
						},
					},
					"/users/{id}": {
						patch: {
							tags: ["Users"],
							summary: "Update user",
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
						},
					},
					"/orders": {
						get: {
							tags: ["Orders"],
							summary: "List orders",
						},
					},
				},
			},
			options: { input: "swagger.json", angular: false, http: false, help: false },
			baseOutputPath: "outputs",
			modelsPath: "outputs/models/index.ts",
			fileHeader: "",
			operationTypes: {},
			typeNameMap: new Map<string, string>(),
			isAngularProject: false,
			writeFormattedFile: async () => {},
		} as any);

		expect(result.methodCount).toBe(2);
		expect(result.files.map((file) => file.path)).toContain("outputs/mcp/index.ts");
		expect(result.files.map((file) => file.path)).toContain("outputs/mcp/server.ts");
		expect(result.files.map((file) => file.path)).toContain(
			"outputs/mcp/client/api.client.ts",
		);
		expect(result.files.map((file) => file.path)).toContain("outputs/mcp/tools/users.tool.ts");
		expect(result.files.map((file) => file.path)).toContain(
			"outputs/mcp/tools/orders.tool.ts",
		);
		expect(result.files.map((file) => file.path)).toContain("outputs/mcp/types/users.types.ts");
		expect(result.files.map((file) => file.path)).toContain(
			"outputs/mcp/schemas/users.schema.ts",
		);
		expect(result.files.map((file) => file.path)).toContain(
			"outputs/mcp/mcp-tools-report.json",
		);

		const usersTool = result.files.find((file) =>
			file.path.endsWith("tools/users.tool.ts"),
		);
		expect(usersTool?.content).toContain('"manage_users"');
		expect(usersTool?.content).toContain('ACTIONS = ["list", "create", "update"]');
		expect(usersTool?.content).toContain(
			"Error \" + error.details.status + \": \" + error.details.message",
		);
	});

	test("should group by path segment when tag is missing", async () => {
		const plugin = createMcpPlugin();
		const result = await plugin.generate({
			schema: {
				openapi: "3.0.3",
				info: { title: "MCP Test", version: "1.0.0" },
				paths: {
					"/payments": {
						get: {
							summary: "List payments",
						},
					},
					"/payments/{id}": {
						delete: {
							summary: "Delete payment",
						},
					},
				},
			},
			options: { input: "swagger.json", angular: false, http: false, help: false },
			baseOutputPath: "outputs",
			modelsPath: "outputs/models/index.ts",
			fileHeader: "",
			operationTypes: {},
			typeNameMap: new Map<string, string>(),
			isAngularProject: false,
			writeFormattedFile: async () => {},
		} as any);

		expect(result.methodCount).toBe(1);
		const paymentsTool = result.files.find((file) =>
			file.path.endsWith("tools/payments.tool.ts"),
		);
		expect(paymentsTool?.content).toContain('"manage_payments"');
		expect(paymentsTool?.content).toContain('ACTIONS = ["list", "delete"]');

		const reportFile = result.files.find((file) =>
			file.path.endsWith("mcp-tools-report.json"),
		);
		expect(reportFile?.content).toContain('"toolCount": 1');
		expect(reportFile?.content).toContain('"actionCount": 2');
	});
});
