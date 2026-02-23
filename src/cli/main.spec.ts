import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./main";

describe("CLI main", () => {
	let tempDir: string;
	let originalCwd: string;
	let originalArgv: string[];
	let logSpy: ReturnType<typeof spyOn>;
	let errorSpy: ReturnType<typeof spyOn>;
	let warnSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "sauron-cli-main-test-"));
		originalCwd = process.cwd();
		originalArgv = Bun.argv;
		process.chdir(tempDir);
		logSpy = spyOn(console, "log").mockImplementation(mock(() => {}));
		errorSpy = spyOn(console, "error").mockImplementation(mock(() => {}));
		warnSpy = spyOn(console, "warn").mockImplementation(mock(() => {}));
	});

	afterEach(() => {
		logSpy.mockRestore();
		errorSpy.mockRestore();
		warnSpy.mockRestore();
		process.chdir(originalCwd);
		Bun.argv = originalArgv;
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("should run init command through main", async () => {
		Bun.argv = ["bun", "index.js", "init"];
		await main();
		expect(existsSync("sauron.config.ts")).toBe(true);
	});

	test("should show help through main when help flag is provided", async () => {
		Bun.argv = ["bun", "index.js", "--help"];
		await main();
		expect(logSpy).toHaveBeenCalled();
		expect(existsSync(join("outputs", "models", "index.ts"))).toBe(false);
	});

	test("should generate files through main command", async () => {
		const openApiSchema = {
			openapi: "3.0.4",
			info: { title: "Main Test API", version: "1.0.0" },
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
				},
			},
			components: {
				schemas: {
					User: { type: "object", properties: { id: { type: "integer" } } },
				},
			},
		};

		writeFileSync("swagger.json", JSON.stringify(openApiSchema));
		Bun.argv = ["bun", "index.js", "--http", "--input", "swagger.json"];

		await main();

		expect(existsSync(join("outputs", "models", "index.ts"))).toBe(true);
		expect(
			existsSync(join("outputs", "http-client", "sauron-api.client.ts")),
		).toBe(true);
		expect(
			existsSync(join("outputs", "http-client", "missing-swagger-definitions.json")),
		).toBe(true);
		expect(
			existsSync(join("outputs", "http-client", "type-coverage-report.json")),
		).toBe(true);
	});

	test("should generate fetch files when using explicit fetch plugin", async () => {
		const openApiSchema = {
			openapi: "3.0.4",
			info: { title: "Plugin Fetch API", version: "1.0.0" },
			paths: {
				"/api/status": {
					get: {
						responses: {
							"200": {
								description: "Success",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: { ok: { type: "boolean" } },
										},
									},
								},
							},
						},
					},
				},
			},
		};

		writeFileSync("swagger.json", JSON.stringify(openApiSchema));
		Bun.argv = [
			"bun",
			"index.js",
			"--plugin",
			"fetch",
			"--input",
			"swagger.json",
		];

		await main();

		expect(existsSync(join("outputs", "models", "index.ts"))).toBe(true);
		expect(
			existsSync(join("outputs", "http-client", "sauron-api.client.ts")),
		).toBe(true);
		expect(
			existsSync(join("outputs", "http-client", "missing-swagger-definitions.json")),
		).toBe(true);
		expect(
			existsSync(join("outputs", "http-client", "type-coverage-report.json")),
		).toBe(true);
	});

	test("should generate axios client when using explicit axios plugin", async () => {
		const openApiSchema = {
			openapi: "3.0.4",
			info: { title: "Plugin Axios API", version: "1.0.0" },
			paths: {
				"/api/status": {
					get: {
						responses: {
							"200": {
								description: "Success",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: { ok: { type: "boolean" } },
										},
									},
								},
							},
						},
					},
				},
			},
		};

		writeFileSync("swagger.json", JSON.stringify(openApiSchema));
		Bun.argv = [
			"bun",
			"index.js",
			"--plugin",
			"axios",
			"--input",
			"swagger.json",
		];

		await main();

		const axiosClientPath = join(
			"outputs",
			"http-client",
			"sauron-api.axios-client.ts",
		);
		const reportPath = join(
			"outputs",
			"http-client",
			"missing-swagger-definitions.axios.json",
		);
		const coverageReportPath = join(
			"outputs",
			"http-client",
			"type-coverage-report.axios.json",
		);
		expect(existsSync(join("outputs", "models", "index.ts"))).toBe(true);
		expect(existsSync(axiosClientPath)).toBe(true);
		expect(existsSync(reportPath)).toBe(true);
		expect(existsSync(coverageReportPath)).toBe(true);

		const axiosClientContent = readFileSync(axiosClientPath, "utf-8");
		expect(axiosClientContent).toContain('import axios');
		expect(axiosClientContent).toContain("fetchWithAxios");
	});

	test("should generate MCP server when using explicit mcp plugin", async () => {
		writeFileSync(
			"swagger.json",
			JSON.stringify({
				openapi: "3.0.4",
				info: { title: "Plugin MCP API", version: "1.0.0" },
				paths: {
					"/api/users/{id}": {
						get: {
							operationId: "GetUserById",
							parameters: [
								{
									name: "id",
									in: "path",
									required: true,
									schema: { type: "integer" },
								},
							],
						},
					},
				},
			}),
		);
		Bun.argv = ["bun", "index.js", "--plugin", "mcp", "--input", "swagger.json"];

		await main();

		const mcpServerPath = join("outputs", "mcp", "index.ts");
		const mcpReportPath = join("outputs", "mcp", "mcp-tools-report.json");
		expect(existsSync(join("outputs", "models", "index.ts"))).toBe(true);
		expect(existsSync(mcpServerPath)).toBe(true);
		expect(existsSync(mcpReportPath)).toBe(true);
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining("MCP Tools (mcp): 1 tools"),
		);
	});

	test("should generate MCP and fetch outputs when plugins are combined", async () => {
		writeFileSync(
			"swagger.json",
			JSON.stringify({
				openapi: "3.0.4",
				info: { title: "Plugin Combo API", version: "1.0.0" },
				paths: {
					"/api/status": {
						get: {
							responses: {
								"200": {
									description: "Success",
								},
							},
						},
					},
				},
			}),
		);
		Bun.argv = [
			"bun",
			"index.js",
			"--plugin",
			"mcp",
			"--plugin",
			"fetch",
			"--input",
			"swagger.json",
		];

		await main();

		expect(
			existsSync(join("outputs", "mcp", "index.ts")),
		).toBe(true);
		expect(
			existsSync(join("outputs", "http-client", "sauron-api.client.ts")),
		).toBe(true);
	});

	test("should prioritize explicit plugin over --http/--angular aliases", async () => {
		writeFileSync("angular.json", "{}");
		writeFileSync(
			"swagger.json",
			JSON.stringify({
				openapi: "3.0.4",
				info: { title: "Alias Priority API", version: "1.0.0" },
				paths: {
					"/api/status": {
						get: {
							responses: {
								"200": {
									description: "Success",
								},
							},
						},
					},
				},
			}),
		);
		Bun.argv = [
			"bun",
			"index.js",
			"--plugin",
			"fetch",
			"--http",
			"--angular",
			"--input",
			"swagger.json",
		];

		await main();

		expect(
			existsSync(join("outputs", "http-client", "sauron-api.client.ts")),
		).toBe(true);
		expect(
			existsSync(
				join(
					"src",
					"app",
					"sauron",
					"angular-http-client",
					"sauron-api.service.ts",
				),
			),
		).toBe(false);
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining("--plugin provided"),
		);
	});

	test("should generate files from URL and merge options from config", async () => {
		writeFileSync(
			"sauron.config.ts",
			`export default { url: "https://example.com/openapi.json", http: true, angular: false };`,
		);
		const openApiSchema = {
			openapi: "3.0.3",
			info: { title: "Remote API", version: "1.0.0" },
			paths: {
				"/status": {
					get: {
						responses: {
							"200": {
								description: "Success",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: { ok: { type: "boolean" } },
										},
									},
								},
							},
						},
					},
				},
			},
		};

		const originalFetch = globalThis.fetch;
		globalThis.fetch = mock(
			async () => new Response(JSON.stringify(openApiSchema), { status: 200 }),
		) as typeof fetch;
		Bun.argv = ["bun", "index.js", "--config", "sauron.config.ts"];

		try {
			await main();
		} finally {
			globalThis.fetch = originalFetch;
		}

		expect(existsSync(join("outputs", "models", "index.ts"))).toBe(true);
		expect(
			existsSync(join("outputs", "http-client", "sauron-api.client.ts")),
		).toBe(true);
		expect(
			existsSync(join("outputs", "http-client", "missing-swagger-definitions.json")),
		).toBe(true);
		expect(
			existsSync(join("outputs", "http-client", "type-coverage-report.json")),
		).toBe(true);
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining("⚙️  Using config file:"),
		);
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining("📖 Downloading OpenAPI spec from:"),
		);
	});

	test("should generate Angular service when angular option is enabled in Angular project", async () => {
		writeFileSync("angular.json", "{}");
		writeFileSync(
			"swagger.json",
			JSON.stringify({
				openapi: "3.0.3",
				info: { title: "Angular Main Test API", version: "1.0.0" },
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
					},
				},
				components: {
					schemas: {
						User: { type: "object", properties: { id: { type: "integer" } } },
					},
				},
			}),
		);

		Bun.argv = [
			"bun",
			"index.js",
			"--http",
			"--angular",
			"--input",
			"swagger.json",
		];
		await main();

		expect(existsSync(join("src", "app", "sauron", "models", "index.ts"))).toBe(
			true,
		);
		expect(
			existsSync(
				join(
					"src",
					"app",
					"sauron",
					"angular-http-client",
					"sauron-api.service.ts",
				),
			),
		).toBe(true);
		expect(
			existsSync(
				join(
					"src",
					"app",
					"sauron",
					"angular-http-client",
					"missing-swagger-definitions.json",
				),
			),
		).toBe(true);
		expect(
			existsSync(
				join(
					"src",
					"app",
					"sauron",
					"angular-http-client",
					"type-coverage-report.json",
				),
			),
		).toBe(true);
		const serviceContent = readFileSync(
			join(
				"src",
				"app",
				"sauron",
				"angular-http-client",
				"sauron-api.service.ts",
			),
			"utf-8",
		);
		expect(serviceContent).toContain("@Injectable");
	});

	test("should fallback to fetch output when --http --angular is used outside Angular project", async () => {
		writeFileSync(
			"swagger.json",
			JSON.stringify({
				openapi: "3.0.3",
				info: { title: "Legacy Fallback API", version: "1.0.0" },
				paths: {
					"/api/health": {
						get: {
							responses: {
								"200": {
									description: "Success",
								},
							},
						},
					},
				},
			}),
		);

		Bun.argv = [
			"bun",
			"index.js",
			"--http",
			"--angular",
			"--input",
			"swagger.json",
		];
		await main();

		expect(
			existsSync(join("outputs", "http-client", "sauron-api.client.ts")),
		).toBe(true);
		expect(
			existsSync(join("outputs", "http-client", "missing-swagger-definitions.json")),
		).toBe(true);
		expect(
			existsSync(join("outputs", "http-client", "type-coverage-report.json")),
		).toBe(true);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("--angular flag used but Angular project not detected"),
		);
	});

	test("should generate Angular service when using explicit angular plugin in Angular project", async () => {
		writeFileSync("angular.json", "{}");
		writeFileSync(
			"swagger.json",
			JSON.stringify({
				openapi: "3.0.3",
				info: { title: "Angular Plugin API", version: "1.0.0" },
				paths: {
					"/api/users": {
						get: {
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
						User: { type: "object", properties: { id: { type: "integer" } } },
					},
				},
			}),
		);

		Bun.argv = ["bun", "index.js", "--plugin", "angular", "--input", "swagger.json"];
		await main();

		expect(existsSync(join("src", "app", "sauron", "models", "index.ts"))).toBe(
			true,
		);
		expect(
			existsSync(
				join(
					"src",
					"app",
					"sauron",
					"angular-http-client",
					"sauron-api.service.ts",
				),
			),
		).toBe(true);
	});

	test("should warn and fallback to fetch when angular plugin runs outside Angular project", async () => {
		writeFileSync(
			"swagger.json",
			JSON.stringify({
				openapi: "3.0.3",
				info: { title: "Fallback API", version: "1.0.0" },
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
			}),
		);

		Bun.argv = ["bun", "index.js", "--plugin", "angular", "--input", "swagger.json"];
		await main();

		expect(
			existsSync(join("outputs", "http-client", "sauron-api.client.ts")),
		).toBe(true);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("Angular plugin requested"),
		);
	});

	test("should handle non-object configuration and exit with code 1", async () => {
		const originalExit = process.exit;
		process.exit = mock((() => {
			throw new Error("process_exit_called");
		}) as (code?: number) => never);
		writeFileSync("swagger.json", '"invalid"');
		Bun.argv = ["bun", "index.js", "--input", "swagger.json"];

		try {
			await expect(main()).rejects.toThrow("process_exit_called");
		} finally {
			process.exit = originalExit;
		}

		expect(errorSpy).toHaveBeenCalledWith("❌ Error:", expect.any(Error));
	});
});
