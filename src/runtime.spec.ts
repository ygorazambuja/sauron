import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { pathToFileURL } from "node:url";
import { getModuleDirname, getRuntimeArgv, isMainModule } from "./runtime";

describe("runtime helpers", () => {
	let originalArgv: string[];

	beforeEach(() => {
		originalArgv = process.argv;
	});

	afterEach(() => {
		process.argv = originalArgv;
	});

	test("should expose the current process argv", () => {
		process.argv = ["node", "cli.js", "--help"];
		expect(getRuntimeArgv()).toEqual(process.argv);
	});

	test("should resolve module directory from module url", () => {
		const moduleUrl = pathToFileURL("C:/workspace/sauron/src/index.ts").href;
		expect(getModuleDirname(moduleUrl)).toContain("workspace");
	});

	test("should detect when a module is the current entrypoint", () => {
		process.argv = ["node", "C:/workspace/sauron/bin.js"];
		const moduleUrl = pathToFileURL("C:/workspace/sauron/bin.js").href;
		expect(isMainModule(moduleUrl)).toBe(true);
	});

	test("should return false when a module is not the current entrypoint", () => {
		process.argv = ["node", "C:/workspace/sauron/bin.js"];
		const moduleUrl = pathToFileURL("C:/workspace/sauron/src/index.ts").href;
		expect(isMainModule(moduleUrl)).toBe(false);
	});
});
