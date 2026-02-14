import { describe, expect, test } from "bun:test";
import {
	BUILTIN_PLUGIN_IDS,
	createDefaultPluginRegistry,
	createPluginRegistry,
} from "./registry";

describe("plugin registry", () => {
	test("should expose default built-in plugin ids", () => {
		expect(BUILTIN_PLUGIN_IDS).toEqual(["fetch", "angular", "axios"]);
	});

	test("should resolve built-in plugin ids", () => {
		const registry = createDefaultPluginRegistry();
		expect(registry.resolve("fetch")?.id).toBe("fetch");
		expect(registry.resolve("angular")?.id).toBe("angular");
		expect(registry.resolve("axios")?.id).toBe("axios");
	});

	test("should resolve aliases", () => {
		const registry = createDefaultPluginRegistry();
		expect(registry.resolve("ng")?.id).toBe("angular");
		expect(registry.resolve("http-client")?.id).toBe("fetch");
		expect(registry.resolve("ax")?.id).toBe("axios");
	});

	test("should return undefined for unknown plugin", () => {
		const registry = createDefaultPluginRegistry();
		expect(registry.resolve("not-existing-plugin")).toBeUndefined();
	});

	test("should build registry from custom plugins", () => {
		const registry = createPluginRegistry([
			{
				id: "custom",
				aliases: ["c"],
				kind: "http-client",
				canRun: () => ({ ok: true }),
				resolveOutputs: () => ({ servicePath: "", reportPath: "" }),
				generate: async () => ({ files: [], methodCount: 0 }),
			},
		]);

		expect(registry.resolve("custom")?.id).toBe("custom");
		expect(registry.resolve("c")?.id).toBe("custom");
		expect(registry.getAll()).toHaveLength(1);
	});
});
