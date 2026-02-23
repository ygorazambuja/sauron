import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	createModelsWithOperationTypes,
	fetchJsonFromUrl,
	readJsonFile,
	verifySwaggerComposition,
} from "../utils";
import { runPlugins } from "../plugins/runner";
import type { PluginExecutionResult } from "../plugins/types";
import { parseArgs, parseCommand, showHelp } from "./args";
import {
	createGeneratedFileHeader,
	formatGeneratedFile,
	initConfigFile,
	loadSauronConfig,
	mergeOptionsWithConfig,
} from "./config";
import { isAngularProject, resolveOutputBasePath } from "./project";
import { DEFAULT_CONFIG_FILE, type CliOptions } from "./types";

/**
 * Main.
 * @example
 * ```ts
 * main();
 * ```
 */
export async function main() {
	const command = parseCommand();
	const cliOptions = parseArgs();

	if (cliOptions.help) {
		showHelp();
		return;
	}

	if (command === "init") {
		await initConfigFile(cliOptions.config || DEFAULT_CONFIG_FILE);
		return;
	}

	let options = cliOptions;

	try {
		const loadedConfig = await loadSauronConfig(
			options.config || DEFAULT_CONFIG_FILE,
		);
		if (loadedConfig) {
			options = mergeOptionsWithConfig(cliOptions, loadedConfig);
			console.log(
				`⚙️  Using config file: ${options.config || DEFAULT_CONFIG_FILE}`,
			);
		}

		let config: unknown;
		if (options.url) {
			console.log(`📖 Downloading OpenAPI spec from: ${options.url}`);
			config = await fetchJsonFromUrl(options.url);
		}
		if (!options.url) {
			console.log(`📖 Reading OpenAPI spec from: ${options.input}`);
			config = await readJsonFile(options.input);
		}

		if (typeof config !== "object") {
			throw new Error("Config is not an object");
		}

		console.log("✅ Validating OpenAPI schema...");
		const schema = verifySwaggerComposition(config as Record<string, unknown>);

		const requestedPluginIds = resolveEffectivePluginIds(options);
		logPluginCompatibilityNotice(options, requestedPluginIds);

		const angularDetected = isAngularProject();
		const preferAngularOutput = requestedPluginIds.includes("angular");
		const baseOutputPath = resolveOutputBasePath(options, preferAngularOutput);
		const modelsPath = join(baseOutputPath, "models", "index.ts");
		mkdirSync(dirname(modelsPath), { recursive: true });

		const fileHeader = createGeneratedFileHeader(schema);

		console.log("🔧 Generating TypeScript models...");
		const { models, operationTypes, typeNameMap } =
			createModelsWithOperationTypes(schema);
		const formattedModels = await formatGeneratedFile(
			`${fileHeader}\n${models.join("\n")}`,
			modelsPath,
		);
		writeFileSync(modelsPath, formattedModels);

		const pluginResults = await runPlugins(requestedPluginIds, {
			schema,
			options,
			baseOutputPath,
			modelsPath,
			fileHeader,
			operationTypes,
			typeNameMap,
			isAngularProject: angularDetected,
			writeFormattedFile: async (filePath: string, content: string) => {
				const formattedContent = await formatGeneratedFile(content, filePath);
				writeFileSync(filePath, formattedContent);
			},
		});

		logPluginReports(pluginResults);

		console.log("\n✅ Generation complete!");
		console.log(`📄 Models: ${models.length} TypeScript interfaces/types`);
		logPluginSummary(pluginResults);
		console.log(`📁 Output: ${resolveOutputDisplayPath(options, angularDetected, preferAngularOutput)}`);
	} catch (error) {
		console.error("❌ Error:", error);
		process.exit(1);
	}
}

/**
 * Resolve effective plugin IDs.
 * @param options Input parameter `options`.
 * @returns Resolve effective plugin IDs output as `string[]`.
 * @example
 * ```ts
 * const result = resolveEffectivePluginIds({
 * 	input: "swagger.json",
 * 	angular: false,
 * 	http: true,
 * 	help: false,
 * });
 * // result: string[]
 * ```
 */
function resolveEffectivePluginIds(options: CliOptions): string[] {
	if (options.plugin && options.plugin.length > 0) {
		return normalizePluginIds(options.plugin);
	}

	if (!options.http) {
		return [];
	}

	if (options.angular) {
		return ["angular"];
	}

	return ["fetch"];
}

/**
 * Normalize plugin IDs.
 * @param pluginIds Input parameter `pluginIds`.
 * @returns Normalize plugin IDs output as `string[]`.
 * @example
 * ```ts
 * const result = normalizePluginIds(["fetch", "Angular"]);
 * // result: string[]
 * ```
 */
function normalizePluginIds(pluginIds: string[]): string[] {
	const normalizedIds: string[] = [];
	const usedIds = new Set<string>();

	for (const pluginId of pluginIds) {
		const normalizedId = pluginId.trim().toLowerCase();
		if (!normalizedId) {
			continue;
		}
		if (usedIds.has(normalizedId)) {
			continue;
		}
		usedIds.add(normalizedId);
		normalizedIds.push(normalizedId);
	}

	return normalizedIds;
}

/**
 * Log plugin compatibility notice.
 * @param options Input parameter `options`.
 * @param effectivePluginIds Input parameter `effectivePluginIds`.
 * @example
 * ```ts
 * logPluginCompatibilityNotice(
 * 	{ input: "swagger.json", angular: true, http: true, help: false, plugin: ["fetch"] },
 * 	["fetch"],
 * );
 * ```
 */
function logPluginCompatibilityNotice(
	options: CliOptions,
	effectivePluginIds: string[],
): void {
	if (!options.plugin || options.plugin.length === 0) {
		return;
	}
	if (!options.http && !options.angular) {
		return;
	}
	if (effectivePluginIds.length === 0) {
		return;
	}

	console.log(
		"ℹ️  --plugin provided. Ignoring compatibility aliases --http/--angular.",
	);
}

/**
 * Log plugin reports.
 * @param pluginResults Input parameter `pluginResults`.
 * @example
 * ```ts
 * logPluginReports([]);
 * ```
 */
function logPluginReports(pluginResults: PluginExecutionResult[]): void {
	for (const result of pluginResults) {
		for (const artifact of result.artifacts) {
			if (artifact.kind === "report") {
				console.log(`🧾 Report (${result.executedPluginId}): ${artifact.path}`);
				continue;
			}
			if (artifact.kind === "type-coverage") {
				console.log(
					`📊 Type coverage (${result.executedPluginId}): ${artifact.path}`,
				);
				continue;
			}
			if (artifact.kind === "manifest") {
				console.log(`🧾 Manifest (${result.executedPluginId}): ${artifact.path}`);
			}
		}
	}
}

/**
 * Log plugin summary.
 * @param pluginResults Input parameter `pluginResults`.
 * @example
 * ```ts
 * logPluginSummary([]);
 * ```
 */
function logPluginSummary(pluginResults: PluginExecutionResult[]): void {
	for (const result of pluginResults) {
		if (result.kind === "mcp-server") {
			console.log(
				`🧩 MCP Tools (${result.executedPluginId}): ${result.methodCount} tools`,
			);
			continue;
		}
		console.log(
			`🔗 HTTP Methods (${result.executedPluginId}): ${result.methodCount} methods`,
		);
	}
}

/**
 * Resolve output display path.
 * @param options Input parameter `options`.
 * @param angularDetected Input parameter `angularDetected`.
 * @param preferAngularOutput Input parameter `preferAngularOutput`.
 * @returns Resolve output display path output as `string`.
 * @example
 * ```ts
 * const result = resolveOutputDisplayPath(
 * 	{ input: "swagger.json", angular: false, http: false, help: false },
 * 	false,
 * 	false,
 * );
 * // result: string
 * ```
 */
function resolveOutputDisplayPath(
	options: CliOptions,
	angularDetected: boolean,
	preferAngularOutput: boolean,
): string {
	if (options.output) {
		return options.output;
	}
	if (preferAngularOutput && angularDetected) {
		return "src/app/sauron";
	}
	return "outputs";
}
