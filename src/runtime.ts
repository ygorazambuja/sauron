import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Get runtime argv.
 * @returns Get runtime argv output as `string[]`.
 * @example
 * ```ts
 * const result = getRuntimeArgv();
 * // result: string[]
 * ```
 */
export function getRuntimeArgv(): string[] {
	return process.argv;
}

/**
 * Get module directory name.
 * @param moduleUrl Input parameter `moduleUrl`.
 * @returns Get module directory name output as `string`.
 * @example
 * ```ts
 * const result = getModuleDirname(import.meta.url);
 * // result: string
 * ```
 */
export function getModuleDirname(moduleUrl: string): string {
	return dirname(fileURLToPath(moduleUrl));
}

/**
 * Check whether the provided module URL is the current entrypoint.
 * @param moduleUrl Input parameter `moduleUrl`.
 * @returns Check whether the provided module URL is the current entrypoint output as `boolean`.
 * @example
 * ```ts
 * const result = isMainModule(import.meta.url);
 * // result: boolean
 * ```
 */
export function isMainModule(moduleUrl: string): boolean {
	if (!process.argv[1]) {
		return false;
	}

	return resolve(fileURLToPath(moduleUrl)) === resolve(process.argv[1]);
}
