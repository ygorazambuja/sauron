import { describe, expect, test } from "bun:test";
import * as sauron from "./index";

describe("Public API exports", () => {
	test("should expose expected public functions", () => {
		expect(typeof sauron.main).toBe("function");
		expect(typeof sauron.parseArgs).toBe("function");
		expect(typeof sauron.parseCommand).toBe("function");
		expect(typeof sauron.showHelp).toBe("function");
		expect(typeof sauron.initConfigFile).toBe("function");
		expect(typeof sauron.loadSauronConfig).toBe("function");
		expect(typeof sauron.mergeOptionsWithConfig).toBe("function");
		expect(typeof sauron.isAngularProject).toBe("function");
		expect(typeof sauron.getOutputPaths).toBe("function");
		expect(typeof sauron.generateAngularService).toBe("function");
		expect(typeof sauron.createFetchHttpMethods).toBe("function");
		expect(typeof sauron.extractMethodParameters).toBe("function");
		expect(typeof sauron.extractResponseType).toBe("function");
		expect(typeof sauron.generateFetchService).toBe("function");
		expect(typeof sauron.generateMethodName).toBe("function");
		expect(typeof sauron.createGeneratedFileHeader).toBe("function");
	});
});
