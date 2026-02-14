import { createAngularPlugin } from "./builtin/angular";
import { createAxiosPlugin } from "./builtin/axios";
import { createFetchPlugin } from "./builtin/fetch";
import type { SauronPlugin } from "./types";

/**
 * Built-in plugin IDs.
 */
export const BUILTIN_PLUGIN_IDS = ["fetch", "angular", "axios"] as const;

/**
 * Plugin registry.
 */
export type PluginRegistry = {
	getAll(): SauronPlugin[];
	resolve(idOrAlias: string): SauronPlugin | undefined;
};

/**
 * Create plugin registry.
 * @param plugins Input parameter `plugins`.
 * @returns Create plugin registry output as `PluginRegistry`.
 * @example
 * ```ts
 * const result = createPluginRegistry([]);
 * // result: PluginRegistry
 * ```
 */
export function createPluginRegistry(plugins: SauronPlugin[]): PluginRegistry {
	const allPlugins = [...plugins];
	const idMap = createPluginIdMap(allPlugins);

	return {
		getAll: () => [...allPlugins],
		resolve: (idOrAlias: string) => {
			const normalized = idOrAlias.trim().toLowerCase();
			if (!normalized) {
				return undefined;
			}
			return idMap.get(normalized);
		},
	};
}

/**
 * Create default plugin registry.
 * @returns Create default plugin registry output as `PluginRegistry`.
 * @example
 * ```ts
 * const result = createDefaultPluginRegistry();
 * // result: PluginRegistry
 * ```
 */
export function createDefaultPluginRegistry(): PluginRegistry {
	return createPluginRegistry([
		createFetchPlugin(),
		createAngularPlugin(),
		createAxiosPlugin(),
	]);
}

/**
 * Create plugin ID map.
 * @param plugins Input parameter `plugins`.
 * @returns Create plugin ID map output as `Map<string, SauronPlugin>`.
 * @example
 * ```ts
 * const result = createPluginIdMap([]);
 * // result: Map<string, SauronPlugin>
 * ```
 */
function createPluginIdMap(plugins: SauronPlugin[]): Map<string, SauronPlugin> {
	const idMap = new Map<string, SauronPlugin>();

	for (const plugin of plugins) {
		idMap.set(plugin.id.toLowerCase(), plugin);
		const aliases = plugin.aliases ?? [];
		for (const alias of aliases) {
			idMap.set(alias.toLowerCase(), plugin);
		}
	}

	return idMap;
}
