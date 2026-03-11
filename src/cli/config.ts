import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getModuleDirname } from "../runtime";
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
		const packageJsonPath = findNearestPackageJsonPath(
			getModuleDirname(import.meta.url),
		);
		if (!packageJsonPath) {
			return DEFAULT_SAURON_VERSION;
		}
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
 * Find nearest package json path.
 * @param startDirectory Input parameter `startDirectory`.
 * @returns Find nearest package json path output as `string | null`.
 * @example
 * ```ts
 * const result = findNearestPackageJsonPath(process.cwd());
 * // result: string | null
 * ```
 */
function findNearestPackageJsonPath(
	startDirectory: string,
): string | null {
	let currentDirectory = startDirectory;

	while (true) {
		const packageJsonPath = resolve(currentDirectory, "package.json");
		if (existsSync(packageJsonPath)) {
			return packageJsonPath;
		}

		const parentDirectory = resolve(currentDirectory, "..");
		if (parentDirectory === currentDirectory) {
			return null;
		}

		currentDirectory = parentDirectory;
	}
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

	const template = `import type { SauronConfig } from "@ygorazambuja/sauron";

export default {
  // Use either "input" or "url". If both are set, "url" takes precedence.
  input: "swagger.json",
  // url: "https://example.com/openapi.json",
  // plugin: ["fetch"],
  // shortNames: true, // Use short type names (e.g. ProductDto instead of MyAppCoreDTOsProductDto)
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

	const configModule = await loadConfigModule(resolvedConfigPath);
	const loadedConfig = configModule.default;

	if (!loadedConfig || typeof loadedConfig !== "object") {
		throw new Error(
			`Invalid config file format in ${configFilePath}. Expected a default exported object.`,
		);
	}

	return loadedConfig as SauronConfig;
}

/**
 * Load config module.
 * @param resolvedConfigPath Input parameter `resolvedConfigPath`.
 * @returns Load config module output as `Promise<{ default?: unknown }>`.
 * @example
 * ```ts
 * const result = await loadConfigModule("sauron.config.ts");
 * // result: Promise<{ default?: unknown }>
 * ```
 */
async function loadConfigModule(
	resolvedConfigPath: string,
): Promise<{ default?: unknown }> {
	if (!resolvedConfigPath.endsWith(".ts")) {
		return import(`${pathToFileURL(resolvedConfigPath).href}?t=${Date.now()}`);
	}

	const source = readFileSync(resolvedConfigPath, "utf-8");
	const transpiledSource = transpileConfigSource(source);
	const temporaryModulePath = createTemporaryConfigModulePath(resolvedConfigPath);
	await writeFile(temporaryModulePath, transpiledSource, "utf-8");

	try {
		return await import(`${pathToFileURL(temporaryModulePath).href}?t=${Date.now()}`);
	} finally {
		await rm(temporaryModulePath, { force: true });
	}
}

/**
 * Transpile config source.
 * @param source Input parameter `source`.
 * @returns Transpile config source output as `string`.
 * @example
 * ```ts
 * const result = transpileConfigSource("export default {} satisfies SauronConfig;");
 * // result: string
 * ```
 */
function transpileConfigSource(source: string): string {
	return source
		.replace(/^\s*import\s+type\s+[^;]+;\s*$/gm, "")
		.replace(/\s+satisfies\s+[A-Za-z0-9_.,<>\s]+\s*;/g, ";");
}

/**
 * Create temporary config module path.
 * @param resolvedConfigPath Input parameter `resolvedConfigPath`.
 * @returns Create temporary config module path output as `string`.
 * @example
 * ```ts
 * const result = createTemporaryConfigModulePath("C:/repo/sauron.config.ts");
 * // result: string
 * ```
 */
function createTemporaryConfigModulePath(
	resolvedConfigPath: string,
): string {
	const configDirectory = dirname(resolvedConfigPath);
	const configBaseName = basename(resolvedConfigPath, ".ts");
	return resolve(
		configDirectory,
		`.${configBaseName}.sauron.${process.pid}.${Date.now()}.mjs`,
	);
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
		shortNames: config.shortNames ?? options.shortNames,
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
