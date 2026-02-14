import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CliOptions } from "./types";

/**
 * Is angular project.
 * @returns Is angular project output as `boolean`.
 * @example
 * ```ts
 * const result = isAngularProject();
 * // result: boolean
 * ```
 */
export function isAngularProject(): boolean {
	if (existsSync("angular.json")) {
		return true;
	}

	try {
		const packageJsonPath = join(process.cwd(), "package.json");
		if (existsSync(packageJsonPath)) {
			const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
			const deps = {
				...packageJson.dependencies,
				...packageJson.devDependencies,
			};
			return "@angular/core" in deps;
		}
	} catch (_error) {
		// Ignore errors when checking package.json
	}

	return false;
}

/**
 * Get output paths.
 * @param options Input parameter `options`.
 * @returns Get output paths output as `unknown`.
 * @example
 * ```ts
 * const result = getOutputPaths({});
 * // result: unknown
 * ```
 */
export function getOutputPaths(options: CliOptions): {
	modelsPath: string;
	servicePath: string | undefined;
} {
	const basePath = resolveOutputBasePath(options, options.angular);

	mkdirSync(join(basePath, "models"), { recursive: true });

	let servicePath: string;
	if (options.http) {
		const serviceDir =
			options.angular && isAngularProject()
				? "angular-http-client"
				: "http-client";
		mkdirSync(join(basePath, serviceDir), { recursive: true });

		const serviceFileName =
			options.angular && isAngularProject()
				? "sauron-api.service.ts"
				: "sauron-api.client.ts";

		servicePath = join(basePath, serviceDir, serviceFileName);
	} else {
		servicePath = "";
	}

	return {
		modelsPath: join(basePath, "models", "index.ts"),
		servicePath,
	};
}

/**
 * Resolve output base path.
 * @param options Input parameter `options`.
 * @param preferAngularOutput Input parameter `preferAngularOutput`.
 * @returns Resolve output base path output as `string`.
 * @example
 * ```ts
 * const result = resolveOutputBasePath(
 * 	{ input: "swagger.json", angular: false, http: false, help: false },
 * 	false,
 * );
 * // result: string
 * ```
 */
export function resolveOutputBasePath(
	options: CliOptions,
	preferAngularOutput: boolean,
): string {
	if (options.output) {
		return resolve(options.output);
	}

	const angularDetected = isAngularProject();
	if (preferAngularOutput && angularDetected) {
		console.log("✅ Angular project detected! Generating in src/app/sauron/");
		return "src/app/sauron";
	}

	if (options.angular && !angularDetected) {
		console.warn(
			"⚠️  --angular flag used but Angular project not detected. Generating in outputs/ instead.",
		);
	}

	return "outputs";
}
