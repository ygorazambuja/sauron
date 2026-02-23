import { describe, expect, mock, spyOn, test } from "bun:test";
import { runPlugins } from "./runner";
import { createPluginRegistry } from "./registry";

describe("plugin runner", () => {
	test("should run the requested plugin", async () => {
		const writeFormattedFile = mock(async () => {});
		const context = {
			schema: {
				openapi: "3.0.3",
				info: { title: "Runner Test", version: "1.0.0" },
				paths: {},
			},
			options: { input: "swagger.json", angular: false, http: true, help: false },
			baseOutputPath: "outputs",
			modelsPath: "outputs/models/index.ts",
			fileHeader: "",
			operationTypes: {},
			typeNameMap: new Map<string, string>(),
			isAngularProject: false,
			writeFormattedFile,
		};

		const registry = createPluginRegistry([
			{
				id: "fetch",
				kind: "http-client",
				canRun: () => ({ ok: true }),
				resolveOutputs: () => ({
					artifacts: [
						{
							kind: "service",
							path: "outputs/http-client/sauron-api.client.ts",
						},
						{
							kind: "report",
							path: "outputs/http-client/missing-swagger-definitions.json",
						},
					],
					servicePath: "outputs/http-client/sauron-api.client.ts",
					reportPath: "outputs/http-client/missing-swagger-definitions.json",
				}),
				generate: async () => ({
					files: [
						{
							path: "outputs/http-client/sauron-api.client.ts",
							content: "export class SauronApiClient {}",
						},
						{
							path: "outputs/http-client/missing-swagger-definitions.json",
							content: "{}",
						},
					],
					methodCount: 1,
				}),
			},
		]);

		const results = await runPlugins(["fetch"], context as any, registry);

		expect(results).toEqual([
			{
				requestedPluginId: "fetch",
				executedPluginId: "fetch",
				kind: "http-client",
				methodCount: 1,
				artifacts: [
					{
						kind: "service",
						path: "outputs/http-client/sauron-api.client.ts",
					},
					{
						kind: "report",
						path: "outputs/http-client/missing-swagger-definitions.json",
					},
				],
				servicePath: "outputs/http-client/sauron-api.client.ts",
				reportPath: "outputs/http-client/missing-swagger-definitions.json",
			},
		]);
		expect(writeFormattedFile).toHaveBeenCalledTimes(2);
	});

	test("should fallback to fetch plugin when requested plugin cannot run", async () => {
		const warnSpy = spyOn(console, "warn").mockImplementation(mock(() => {}));
		const context = {
			schema: {
				openapi: "3.0.3",
				info: { title: "Runner Test", version: "1.0.0" },
				paths: {},
			},
			options: { input: "swagger.json", angular: false, http: true, help: false },
			baseOutputPath: "outputs",
			modelsPath: "outputs/models/index.ts",
			fileHeader: "",
			operationTypes: {},
			typeNameMap: new Map<string, string>(),
			isAngularProject: false,
			writeFormattedFile: async () => {},
		};

		const registry = createPluginRegistry([
			{
				id: "angular",
				kind: "http-client",
				canRun: () => ({
					ok: false,
					reason: "angular not available",
					fallbackPluginId: "fetch",
				}),
				resolveOutputs: () => ({ artifacts: [], servicePath: "", reportPath: "" }),
				generate: async () => ({ files: [], methodCount: 0 }),
			},
			{
				id: "fetch",
				kind: "http-client",
				canRun: () => ({ ok: true }),
				resolveOutputs: () => ({
					artifacts: [
						{
							kind: "service",
							path: "outputs/http-client/sauron-api.client.ts",
						},
					],
					servicePath: "outputs/http-client/sauron-api.client.ts",
					reportPath: "outputs/http-client/missing-swagger-definitions.json",
				}),
				generate: async () => ({
					files: [
						{
							path: "outputs/http-client/sauron-api.client.ts",
							content: "content",
						},
					],
					methodCount: 2,
				}),
			},
		]);

		try {
			const results = await runPlugins(["angular"], context as any, registry);
			expect(results[0]?.executedPluginId).toBe("fetch");
			expect(warnSpy).toHaveBeenCalledWith("angular not available");
		} finally {
			warnSpy.mockRestore();
		}
	});

	test("should throw for unknown plugin", async () => {
		const context = {
			schema: {
				openapi: "3.0.3",
				info: { title: "Runner Test", version: "1.0.0" },
				paths: {},
			},
			options: { input: "swagger.json", angular: false, http: true, help: false },
			baseOutputPath: "outputs",
			modelsPath: "outputs/models/index.ts",
			fileHeader: "",
			operationTypes: {},
			typeNameMap: new Map<string, string>(),
			isAngularProject: false,
			writeFormattedFile: async () => {},
		};

		const registry = createPluginRegistry([]);
		await expect(runPlugins(["missing"], context as any, registry)).rejects.toThrow(
			'Unknown plugin "missing".',
		);
	});
});
