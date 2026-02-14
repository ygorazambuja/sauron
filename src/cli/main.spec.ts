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

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "sauron-cli-main-test-"));
		originalCwd = process.cwd();
		originalArgv = Bun.argv;
		process.chdir(tempDir);
		logSpy = spyOn(console, "log").mockImplementation(mock(() => {}));
		errorSpy = spyOn(console, "error").mockImplementation(mock(() => {}));
	});

	afterEach(() => {
		logSpy.mockRestore();
		errorSpy.mockRestore();
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
