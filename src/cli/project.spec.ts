import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getOutputPaths, isAngularProject } from "./project";

describe("CLI project", () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "sauron-cli-project-test-"));
		originalCwd = process.cwd();
		process.chdir(tempDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tempDir, { recursive: true, force: true });
	});

	describe("isAngularProject", () => {
		test("should return true when angular.json exists", () => {
			writeFileSync("angular.json", "{}");
			expect(isAngularProject()).toBe(true);
		});

		test("should return true when package.json contains @angular/core", () => {
			writeFileSync(
				"package.json",
				JSON.stringify({ dependencies: { "@angular/core": "^15.0.0" } }),
			);
			expect(isAngularProject()).toBe(true);
		});

		test("should return true when @angular/core is in devDependencies", () => {
			writeFileSync(
				"package.json",
				JSON.stringify({ devDependencies: { "@angular/core": "^16.0.0" } }),
			);
			expect(isAngularProject()).toBe(true);
		});

		test("should return false when package.json parsing fails", () => {
			writeFileSync("package.json", "{ invalid json }");
			expect(isAngularProject()).toBe(false);
		});

		test("should return false when no angular files/deps exist", () => {
			writeFileSync(
				"package.json",
				JSON.stringify({ dependencies: { react: "^18.0.0" } }),
			);
			expect(isAngularProject()).toBe(false);
		});
	});

	describe("getOutputPaths", () => {
		test("should return default output paths when no options specified", () => {
			const result = getOutputPaths({
				input: "swagger.json",
				angular: false,
				http: false,
				help: false,
			});

			expect(result.modelsPath).toBe(join("outputs", "models", "index.ts"));
			expect(result.servicePath).toBe("");
		});

		test("should return Angular paths when angular option is true and project detected", () => {
			writeFileSync("angular.json", "{}");
			const result = getOutputPaths({
				input: "swagger.json",
				angular: true,
				http: false,
				help: false,
			});

			expect(result.modelsPath).toBe(
				join("src", "app", "sauron", "models", "index.ts"),
			);
			expect(result.servicePath).toBe("");
		});

		test("should return outputs paths when angular option is true but project not detected", () => {
			const result = getOutputPaths({
				input: "swagger.json",
				angular: true,
				http: false,
				help: false,
			});

			expect(result.modelsPath).toBe(join("outputs", "models", "index.ts"));
			expect(result.servicePath).toBe("");
		});

		test("should use custom output directory when specified", () => {
			const customOutput = join(tempDir, "custom-output");
			const result = getOutputPaths({
				input: "swagger.json",
				angular: false,
				http: false,
				help: false,
				output: customOutput,
			});

			expect(result.modelsPath).toBe(join(customOutput, "models", "index.ts"));
			expect(result.servicePath).toBe("");
		});

		test("should create only models directory when http generation is disabled", () => {
			getOutputPaths({
				input: "swagger.json",
				angular: false,
				http: false,
				help: false,
			});

			expect(existsSync(join("outputs", "models"))).toBe(true);
			expect(existsSync(join("outputs", "http-client"))).toBe(false);
		});

		test("should create service directory and path when http generation is enabled", () => {
			const result = getOutputPaths({
				input: "swagger.json",
				angular: false,
				http: true,
				help: false,
			});

			expect(result.modelsPath).toBe(join("outputs", "models", "index.ts"));
			expect(result.servicePath).toBe(
				join("outputs", "http-client", "sauron-api.client.ts"),
			);
			expect(existsSync(join("outputs", "http-client"))).toBe(true);
		});
	});
});
