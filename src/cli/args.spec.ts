import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { parseArgs, parseCommand, showHelp } from "./args";

describe("CLI args", () => {
	let originalArgv: string[];

	beforeEach(() => {
		originalArgv = process.argv;
	});

	afterEach(() => {
		process.argv = originalArgv;
	});

	describe("parseArgs", () => {
		test("should parse default arguments when no args provided", () => {
			process.argv = ["node", "index.js"];

			const result = parseArgs();

			expect(result).toEqual({
				input: "swagger.json",
				angular: false,
				http: false,
				shortNames: true,
				help: false,
			});
		});

		test("should parse input file from arguments", () => {
			process.argv = ["node", "index.js", "api.json"];
			expect(parseArgs().input).toBe("api.json");
		});

		test("should parse short input flag", () => {
			process.argv = ["node", "index.js", "-i", "custom.json"];
			expect(parseArgs().input).toBe("custom.json");
		});

		test("should parse long input flag", () => {
			process.argv = ["node", "index.js", "--input", "swagger.yaml"];
			expect(parseArgs().input).toBe("swagger.yaml");
		});

		test("should parse angular flag", () => {
			process.argv = ["node", "index.js", "--angular"];
			expect(parseArgs().angular).toBe(true);
		});

		test("should parse http flag", () => {
			process.argv = ["node", "index.js", "--http"];
			expect(parseArgs().http).toBe(true);
		});

		test("should parse output flag", () => {
			process.argv = ["node", "index.js", "--output", "/tmp/output"];
			expect(parseArgs().output).toBe("/tmp/output");
		});

		test("should parse help flag", () => {
			process.argv = ["node", "index.js", "--help"];
			expect(parseArgs().help).toBe(true);
		});

		test("should parse multiple flags together", () => {
			process.argv = [
				"node",
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
				shortNames: true,
				help: false,
			});
		});

		test("should handle multiple arguments with mixed formats", () => {
			process.argv = [
				"node",
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
			process.argv = ["node", "index.js", "--config", "./custom.config.ts"];
			expect(parseArgs().config).toBe("./custom.config.ts");
		});

		test("should parse url flag", () => {
			process.argv = [
				"node",
				"index.js",
				"--url",
				"https://example.com/openapi.json",
			];
			expect(parseArgs().url).toBe("https://example.com/openapi.json");
		});

		test("should parse a single plugin flag", () => {
			process.argv = ["node", "index.js", "--plugin", "fetch"];
			expect(parseArgs().plugin).toEqual(["fetch"]);
		});

		test("should parse repeated plugin flags", () => {
			process.argv = [
				"node",
				"index.js",
				"--plugin",
				"fetch",
				"--plugin",
				"angular",
			];
			expect(parseArgs().plugin).toEqual(["fetch", "angular"]);
		});

		test("should parse mcp plugin flag", () => {
			process.argv = ["node", "index.js", "--plugin", "mcp"];
			expect(parseArgs().plugin).toEqual(["mcp"]);
		});

		test("should ignore init command when resolving positional input", () => {
			process.argv = ["node", "index.js", "init", "api.json"];
			expect(parseArgs().input).toBe("api.json");
		});
	});

	describe("parseCommand", () => {
		test("should return init when first positional argument is init", () => {
			process.argv = ["node", "index.js", "init"];
			expect(parseCommand()).toBe("init");
		});

		test("should return generate when no command is provided", () => {
			process.argv = ["node", "index.js", "--http"];
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
				expect(output).toContain("mcp");
			} finally {
				console.log = originalLog;
			}
		});
	});
});
