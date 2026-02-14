import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { z } from "zod";
import type { SwaggerOrOpenAPISchema } from "../schemas/swagger";
import { isAngularProject } from "./project";
import {
	type CliOptions,
	DEFAULT_CONFIG_FILE,
	DEFAULT_SAURON_VERSION,
	type SauronConfig,
} from "./types";

/**
 * Format generated file.
 * @param content Input parameter `content`.
 * @param filePath Input parameter `filePath`.
 * @returns Format generated file output as `Promise<string>`.
 * @example
 * ```ts
 * const result = await formatGeneratedFile("value", "value");
 * // result: string
 * ```
 */
export async function formatGeneratedFile(
	content: string,
	filePath: string,
): Promise<string> {
	try {
		const prettier = await import("prettier");
		return await prettier.format(content, { filepath: filePath });
	} catch (error) {
		console.warn(
			`⚠️  Could not format ${filePath} with Prettier. Writing unformatted output.`,
			error,
		);
		return content;
	}
}

/**
 * Get sauron version.
 * @returns Get sauron version output as `string`.
 * @example
 * ```ts
 * const result = getSauronVersion();
 * // result: string
 * ```
 */
function getSauronVersion(): string {
	try {
		const packageJsonPath = resolve(
			import.meta.dir,
			"..",
			"..",
			"package.json",
		);
		const packageJsonContent = readFileSync(packageJsonPath, "utf-8");
		const packageJson = JSON.parse(packageJsonContent) as { version?: unknown };
		if (
			typeof packageJson.version === "string" &&
			packageJson.version.length > 0
		) {
			return packageJson.version;
		}
	} catch {
		// Fallback to default version when package metadata cannot be read.
	}

	return DEFAULT_SAURON_VERSION;
}

/**
 * Create generated file header.
 * @param schema Input parameter `schema`.
 * @param generatedAt Input parameter `generatedAt`.
 * @returns Create generated file header output as `string`.
 * @example
 * ```ts
 * const result = createGeneratedFileHeader({}, {});
 * // result: string
 * ```
 */
export function createGeneratedFileHeader(
	schema: z.infer<typeof SwaggerOrOpenAPISchema>,
	generatedAt = new Date().toISOString(),
): string {
	return `/**
 * Gerado por Sauron v${getSauronVersion()}
 * Timestamp: ${generatedAt}
 * Nao edite manualmente.
 * ${schema.info.title}
 * OpenAPI spec version: ${schema.info.version}
 */
`;
}

/**
 * Init config file.
 * @param configFilePath Input parameter `configFilePath`.
 * @returns Init config file output as `Promise<void>`.
 * @example
 * ```ts
 * const result = await initConfigFile({});
 * // result: void
 * ```
 */
export async function initConfigFile(
	configFilePath = DEFAULT_CONFIG_FILE,
): Promise<void> {
	const resolvedConfigPath = resolve(configFilePath);
	if (existsSync(resolvedConfigPath)) {
		console.warn(`⚠️  Config file already exists: ${configFilePath}`);
		return;
	}
	const angularProjectDetected = isAngularProject();
	const defaultOutput = angularProjectDetected ? "src/app/sauron" : "outputs";

	const template = `import type { SauronConfig } from "sauron";

export default {
  // Use either "input" or "url". If both are set, "url" takes precedence.
  input: "swagger.json",
  // url: "https://example.com/openapi.json",
  // plugin: ["fetch"],
  output: "${defaultOutput}",
  angular: ${angularProjectDetected},
  http: true,
} satisfies SauronConfig;
`;

	const formattedTemplate = await formatGeneratedFile(
		template,
		resolvedConfigPath,
	);
	writeFileSync(resolvedConfigPath, formattedTemplate);
	console.log(`✅ Created config file: ${configFilePath}`);
}

/**
 * Load sauron config.
 * @param configFilePath Input parameter `configFilePath`.
 * @returns Load sauron config output as `Promise<SauronConfig | null>`.
 * @example
 * ```ts
 * const result = await loadSauronConfig({});
 * // result: SauronConfig | null
 * ```
 */
export async function loadSauronConfig(
	configFilePath = DEFAULT_CONFIG_FILE,
): Promise<SauronConfig | null> {
	const resolvedConfigPath = resolve(configFilePath);
	if (!existsSync(resolvedConfigPath)) {
		return null;
	}

	const configModule = await import(
		`${pathToFileURL(resolvedConfigPath).href}?t=${Date.now()}`
	);
	const loadedConfig = configModule.default;

	if (!loadedConfig || typeof loadedConfig !== "object") {
		throw new Error(
			`Invalid config file format in ${configFilePath}. Expected a default exported object.`,
		);
	}

	return loadedConfig as SauronConfig;
}

/**
 * Merge options with config.
 * @param options Input parameter `options`.
 * @param config Input parameter `config`.
 * @returns Merge options with config output as `CliOptions`.
 * @example
 * ```ts
 * const result = mergeOptionsWithConfig({}, {});
 * // result: CliOptions
 * ```
 */
export function mergeOptionsWithConfig(
	options: CliOptions,
	config: SauronConfig,
): CliOptions {
	const mergedPlugins = resolveMergedPlugins(options.plugin, config.plugin);

	return {
		input:
			options.input !== "swagger.json"
				? options.input
				: (config.input ?? "swagger.json"),
		url: options.url ?? config.url,
		angular: options.angular || !!config.angular,
		http: options.http || !!config.http,
		plugin: mergedPlugins,
		output: options.output ?? config.output,
		config: options.config,
		help: options.help,
	};
}

/**
 * Resolve merged plugins.
 * @param cliPlugins Input parameter `cliPlugins`.
 * @param configPlugins Input parameter `configPlugins`.
 * @returns Resolve merged plugins output as `string[] | undefined`.
 * @example
 * ```ts
 * const result = resolveMergedPlugins(["fetch"], ["angular"]);
 * // result: string[] | undefined
 * ```
 */
function resolveMergedPlugins(
	cliPlugins?: string[],
	configPlugins?: string[],
): string[] | undefined {
	if (Array.isArray(cliPlugins) && cliPlugins.length > 0) {
		return [...cliPlugins];
	}

	if (Array.isArray(configPlugins) && configPlugins.length > 0) {
		return [...configPlugins];
	}

	return undefined;
}
