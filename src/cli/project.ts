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
	let basePath: string;

	if (options.output) {
		basePath = resolve(options.output);
	} else if (options.angular && isAngularProject()) {
		basePath = "src/app/sauron";
		console.log("✅ Angular project detected! Generating in src/app/sauron/");
	} else {
		basePath = "outputs";
		if (options.angular) {
			console.warn(
				"⚠️  --angular flag used but Angular project not detected. Generating in outputs/ instead.",
			);
		}
	}

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
