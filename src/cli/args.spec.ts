import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { parseArgs, parseCommand, showHelp } from "./args";

describe("CLI args", () => {
	let originalArgv: string[];

	beforeEach(() => {
		originalArgv = Bun.argv;
	});

	afterEach(() => {
		Bun.argv = originalArgv;
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
			expect(parseArgs().input).toBe("api.json");
		});

		test("should parse short input flag", () => {
			Bun.argv = ["bun", "index.js", "-i", "custom.json"];
			expect(parseArgs().input).toBe("custom.json");
		});

		test("should parse long input flag", () => {
			Bun.argv = ["bun", "index.js", "--input", "swagger.yaml"];
			expect(parseArgs().input).toBe("swagger.yaml");
		});

		test("should parse angular flag", () => {
			Bun.argv = ["bun", "index.js", "--angular"];
			expect(parseArgs().angular).toBe(true);
		});

		test("should parse http flag", () => {
			Bun.argv = ["bun", "index.js", "--http"];
			expect(parseArgs().http).toBe(true);
		});

		test("should parse output flag", () => {
			Bun.argv = ["bun", "index.js", "--output", "/tmp/output"];
			expect(parseArgs().output).toBe("/tmp/output");
		});

		test("should parse help flag", () => {
			Bun.argv = ["bun", "index.js", "--help"];
			expect(parseArgs().help).toBe(true);
		});

		test("should parse multiple flags together", () => {
			Bun.argv = [
				"bun",
				"index.js",
				"--input",
				"api.json",
				"--angular",
				"--http",
				"--output",
				"./dist",
			];

			expect(parseArgs()).toEqual({
				input: "api.json",
				angular: true,
				http: true,
				output: "./dist",
				help: false,
			});
		});

		test("should handle multiple arguments with mixed formats", () => {
			Bun.argv = [
				"bun",
				"index.js",
				"-i",
				"api.json",
				"extra.json",
				"--angular",
			];

			const result = parseArgs();
			expect(result.input).toBe("extra.json");
			expect(result.angular).toBe(true);
		});

		test("should parse config flag", () => {
			Bun.argv = ["bun", "index.js", "--config", "./custom.config.ts"];
			expect(parseArgs().config).toBe("./custom.config.ts");
		});

		test("should parse url flag", () => {
			Bun.argv = [
				"bun",
				"index.js",
				"--url",
				"https://example.com/openapi.json",
			];
			expect(parseArgs().url).toBe("https://example.com/openapi.json");
		});

		test("should ignore init command when resolving positional input", () => {
			Bun.argv = ["bun", "index.js", "init", "api.json"];
			expect(parseArgs().input).toBe("api.json");
		});
	});

	describe("parseCommand", () => {
		test("should return init when first positional argument is init", () => {
			Bun.argv = ["bun", "index.js", "init"];
			expect(parseCommand()).toBe("init");
		});

		test("should return generate when no command is provided", () => {
			Bun.argv = ["bun", "index.js", "--http"];
			expect(parseCommand()).toBe("generate");
		});
	});

	describe("showHelp", () => {
		test("should print usage instructions", () => {
			const originalLog = console.log;
			let output = "";
			console.log = (message?: unknown) => {
				output += String(message ?? "");
			};

			try {
				showHelp();
				expect(output).toContain("USAGE:");
				expect(output).toContain("COMMANDS:");
				expect(output).toContain("EXAMPLES:");
			} finally {
				console.log = originalLog;
			}
		});
	});
});
