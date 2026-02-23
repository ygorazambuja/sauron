import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { createDefaultPluginRegistry, type PluginRegistry } from "./registry";
import type {
	PluginCanRunFailure,
	PluginContext,
	PluginOutputArtifact,
	PluginOutputPaths,
	PluginExecutionResult,
	PluginFile,
	SauronPlugin,
} from "./types";

/**
 * Run plugins.
 * @param requestedPluginIds Input parameter `requestedPluginIds`.
 * @param context Input parameter `context`.
 * @param registry Input parameter `registry`.
 * @returns Run plugins output as `Promise<PluginExecutionResult[]>`.
 * @example
 * ```ts
 * const result = await runPlugins([], {} as PluginContext);
 * // result: PluginExecutionResult[]
 * ```
 */
export async function runPlugins(
	requestedPluginIds: string[],
	context: PluginContext,
	registry = createDefaultPluginRegistry(),
): Promise<PluginExecutionResult[]> {
	if (requestedPluginIds.length === 0) {
		return [];
	}

	const results: PluginExecutionResult[] = [];
	for (const requestedPluginId of requestedPluginIds) {
		const requestedPlugin = resolvePluginOrThrow(requestedPluginId, registry);
		const executablePlugin = resolveRunnablePlugin(
			requestedPlugin,
			context,
			registry,
			new Set<string>(),
		);
		const outputPaths = executablePlugin.resolveOutputs(context);
		const generated = await executablePlugin.generate(context);
		await writePluginFiles(generated.files, context);
		const artifacts = resolveArtifacts(outputPaths, generated.files);
		const result: PluginExecutionResult = {
			requestedPluginId,
			executedPluginId: executablePlugin.id,
			kind: executablePlugin.kind,
			methodCount: generated.methodCount,
			artifacts,
		};
		if (outputPaths.servicePath) {
			result.servicePath = outputPaths.servicePath;
		}
		if (outputPaths.reportPath) {
			result.reportPath = outputPaths.reportPath;
		}
		if (outputPaths.typeCoverageReportPath) {
			result.typeCoverageReportPath = outputPaths.typeCoverageReportPath;
		}
		results.push(result);
	}

	return results;
}

/**
 * Resolve runnable plugin.
 * @param plugin Input parameter `plugin`.
 * @param context Input parameter `context`.
 * @param registry Input parameter `registry`.
 * @param visitedPluginIds Input parameter `visitedPluginIds`.
 * @returns Resolve runnable plugin output as `SauronPlugin`.
 * @example
 * ```ts
 * const result = resolveRunnablePlugin(
 *  { id: "fetch", kind: "http-client", canRun: () => ({ ok: true }), resolveOutputs: () => ({ servicePath: "", reportPath: "" }), generate: async () => ({ files: [], methodCount: 0 }) },
 *  {} as PluginContext,
 *  createDefaultPluginRegistry(),
 *  new Set<string>(),
 * );
 * // result: SauronPlugin
 * ```
 */
function resolveRunnablePlugin(
	plugin: SauronPlugin,
	context: PluginContext,
	registry: PluginRegistry,
	visitedPluginIds: Set<string>,
): SauronPlugin {
	if (visitedPluginIds.has(plugin.id)) {
		throw new Error(
			`Circular fallback detected while resolving plugin "${plugin.id}".`,
		);
	}

	visitedPluginIds.add(plugin.id);
	const canRunResult = plugin.canRun(context);
	if (canRunResult.ok) {
		return plugin;
	}

	warnPluginFailure(canRunResult);
	if (!canRunResult.fallbackPluginId) {
		throw new Error(
			`Plugin "${plugin.id}" cannot run: ${canRunResult.reason}`,
		);
	}

	const fallbackPlugin = resolvePluginOrThrow(
		canRunResult.fallbackPluginId,
		registry,
	);
	return resolveRunnablePlugin(
		fallbackPlugin,
		context,
		registry,
		visitedPluginIds,
	);
}

/**
 * Resolve plugin or throw.
 * @param pluginId Input parameter `pluginId`.
 * @param registry Input parameter `registry`.
 * @returns Resolve plugin or throw output as `SauronPlugin`.
 * @example
 * ```ts
 * const result = resolvePluginOrThrow("fetch", createDefaultPluginRegistry());
 * // result: SauronPlugin
 * ```
 */
function resolvePluginOrThrow(
	pluginId: string,
	registry: PluginRegistry,
): SauronPlugin {
	const plugin = registry.resolve(pluginId);
	if (plugin) {
		return plugin;
	}

	throw new Error(`Unknown plugin "${pluginId}".`);
}

/**
 * Warn plugin failure.
 * @param canRunFailure Input parameter `canRunFailure`.
 * @example
 * ```ts
 * warnPluginFailure({ ok: false, reason: "fallback", fallbackPluginId: "fetch" });
 * ```
 */
function warnPluginFailure(canRunFailure: PluginCanRunFailure): void {
	if (!canRunFailure.reason) {
		return;
	}

	console.warn(canRunFailure.reason);
}

/**
 * Write plugin files.
 * @param files Input parameter `files`.
 * @param context Input parameter `context`.
 * @returns Write plugin files output as `Promise<void>`.
 * @example
 * ```ts
 * const result = await writePluginFiles([], {} as PluginContext);
 * // result: void
 * ```
 */
async function writePluginFiles(
	files: PluginFile[],
	context: PluginContext,
): Promise<void> {
	for (const file of files) {
		mkdirSync(dirname(file.path), { recursive: true });
		await context.writeFormattedFile(file.path, file.content);
	}
}

/**
 * Resolve output artifacts.
 * @param outputPaths Input parameter `outputPaths`.
 * @param files Input parameter `files`.
 * @returns Resolve output artifacts output as `PluginOutputArtifact[]`.
 * @example
 * ```ts
 * const result = resolveArtifacts({ artifacts: [] }, []);
 * // result: PluginOutputArtifact[]
 * ```
 */
function resolveArtifacts(
	outputPaths: PluginOutputPaths,
	files: PluginFile[],
): PluginOutputArtifact[] {
	if (outputPaths.artifacts.length > 0) {
		return outputPaths.artifacts;
	}

	return files.map((file) => ({
		kind: "other",
		path: file.path,
	}));
}

/**
 * Run HTTP plugins.
 * @param requestedPluginIds Input parameter `requestedPluginIds`.
 * @param context Input parameter `context`.
 * @param registry Input parameter `registry`.
 * @returns Run HTTP plugins output as `Promise<PluginExecutionResult[]>`.
 * @example
 * ```ts
 * const result = await runHttpPlugins([], {} as PluginContext);
 * // result: PluginExecutionResult[]
 * ```
 */
export async function runHttpPlugins(
	requestedPluginIds: string[],
	context: PluginContext,
	registry = createDefaultPluginRegistry(),
): Promise<PluginExecutionResult[]> {
	return runPlugins(requestedPluginIds, context, registry);
}
