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
import {
	createGeneratedFileHeader,
	formatGeneratedFile,
	initConfigFile,
	loadSauronConfig,
	mergeOptionsWithConfig,
} from "./config";

describe("CLI config", () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "sauron-cli-config-test-"));
		originalCwd = process.cwd();
		process.chdir(tempDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("should create sauron.config.ts with initConfigFile", async () => {
		await initConfigFile();

		expect(existsSync("sauron.config.ts")).toBe(true);
		const content = readFileSync("sauron.config.ts", "utf-8");
		expect(content).toContain("export default");
		expect(content).toContain("input");
		expect(content).toContain('import type { SauronConfig } from "sauron"');
		expect(content).toContain("satisfies SauronConfig");
	});

	test("should set angular true in config when Angular project is detected", async () => {
		writeFileSync("angular.json", "{}");
		await initConfigFile();

		const content = readFileSync("sauron.config.ts", "utf-8");
		expect(content).toContain("angular: true");
		expect(content).toContain('output: "src/app/sauron"');
	});

	test("should not overwrite existing config file", async () => {
		const warnSpy = spyOn(console, "warn").mockImplementation(mock(() => {}));
		writeFileSync(
			"sauron.config.ts",
			'export default { input: "custom.json" };',
		);

		try {
			await initConfigFile();
		} finally {
			warnSpy.mockRestore();
		}

		const content = readFileSync("sauron.config.ts", "utf-8");
		expect(content).toContain("custom.json");
	});

	test("should load config from file", async () => {
		writeFileSync(
			"sauron.config.ts",
			`export default { input: "api.json", http: true, output: "dist" };`,
		);

		const config = await loadSauronConfig();
		expect(config).toEqual({ input: "api.json", http: true, output: "dist" });
	});

	test("should return null when config file does not exist", async () => {
		expect(await loadSauronConfig()).toBeNull();
	});

	test("should throw for invalid config default export type", async () => {
		writeFileSync("sauron.config.ts", "export default 42;");
		await expect(loadSauronConfig()).rejects.toThrow(
			"Invalid config file format",
		);
	});

	test("should merge CLI options over config options", () => {
		const merged = mergeOptionsWithConfig(
			{
				input: "swagger.json",
				angular: true,
				http: false,
				help: false,
				output: "cli-output",
			},
			{
				input: "config.json",
				url: "https://example.com/openapi.json",
				angular: false,
				http: true,
				output: "config-output",
			},
		);

		expect(merged).toEqual({
			input: "config.json",
			url: "https://example.com/openapi.json",
			angular: true,
			http: true,
			output: "cli-output",
			help: false,
			config: undefined,
		});
	});

	test("should include timestamp and OpenAPI metadata in header", () => {
		const result = createGeneratedFileHeader(
			{
				openapi: "3.0.3",
				info: { title: "SIAFIC Divida WebApi", version: "v1" },
				paths: {},
			} as any,
			"2026-02-13T10:00:00.000Z",
		);

		expect(result).toContain("Gerado por Sauron v");
		expect(result).toContain("Timestamp: 2026-02-13T10:00:00.000Z");
		expect(result).toContain("Nao edite manualmente.");
		expect(result).toContain("SIAFIC Divida WebApi");
		expect(result).toContain("OpenAPI spec version: v1");
	});

	test("should fallback to unformatted content when formatter cannot infer parser", async () => {
		const warnSpy = spyOn(console, "warn").mockImplementation(mock(() => {}));

		try {
			const content = "const value = 1;";
			const result = await formatGeneratedFile(
				content,
				"generated.unknown-ext",
			);
			expect(result).toBe(content);
		} finally {
			warnSpy.mockRestore();
		}
	});
});
