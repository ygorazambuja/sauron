import { parseArgs as parseCliArgs } from "node:util";
import type { CliOptions } from "./types";

/**
 * Parse command.
 * @returns Parse command output as `"generate" | "init"`.
 * @example
 * ```ts
 * const result = parseCommand();
 * // result: "generate" | "init"
 * ```
 */
export function parseCommand(): "generate" | "init" {
	const { positionals } = parseCliArgs({
		args: Bun.argv,
		options: {},
		strict: false,
		allowPositionals: true,
	});

	const command = positionals.slice(2)[0];
	return command === "init" ? "init" : "generate";
}

/**
 * Parse args.
 * @returns Parse args output as `CliOptions`.
 * @example
 * ```ts
 * const result = parseArgs();
 * // result: CliOptions
 * ```
 */
export function parseArgs(): CliOptions {
	const { values, positionals } = parseCliArgs({
		args: Bun.argv,
		options: {
			input: {
				type: "string",
				short: "i",
			},
			url: {
				type: "string",
				short: "u",
			},
			angular: {
				type: "boolean",
				short: "a",
			},
			http: {
				type: "boolean",
				short: "t",
			},
			plugin: {
				type: "string",
				short: "p",
				multiple: true,
			},
			output: {
				type: "string",
				short: "o",
			},
			config: {
				type: "string",
				short: "c",
			},
			help: {
				type: "boolean",
				short: "h",
			},
		},
		strict: true,
		allowPositionals: true,
	});

	const options: CliOptions = {
		input: "swagger.json",
		angular: false,
		http: false,
		help: false,
	};

	if (values.input) {
		options.input = values.input;
	}
	if (values.url) {
		options.url = values.url;
	}
	if (values.angular) {
		options.angular = values.angular;
	}
	if (values.http) {
		options.http = values.http;
	}
	if (values.plugin) {
		options.plugin = normalizePluginValues(values.plugin);
	}
	if (values.output) {
		options.output = values.output;
	}
	if (values.config) {
		options.config = values.config;
	}
	if (values.help) {
		options.help = values.help;
	}

	for (const positional of positionals.slice(2)) {
		if (positional === "init") {
			continue;
		}
		if (positional.endsWith(".json")) {
			options.input = positional;
		}
	}

	return options;
}

/**
 * Show help.
 * @example
 * ```ts
 * showHelp();
 * ```
 */
export function showHelp(): void {
	console.log(`
Sauron - OpenAPI to TypeScript/Angular Converter

USAGE:
  sauron [COMMAND] [OPTIONS] [INPUT_FILE]

OPTIONS:
  -i, --input <file>     Input OpenAPI/Swagger JSON file (default: swagger.json)
  -u, --url <url>        Download OpenAPI/Swagger JSON from URL
  -a, --angular          Generate Angular service in src/app/sauron (requires Angular project)
  -t, --http             Generate HTTP client/service methods
  -p, --plugin <id>      HTTP plugin to run (repeatable: fetch, angular, axios)
  -o, --output <dir>     Output directory (default: outputs or src/app/sauron)
  -c, --config <file>    Config file path (default: sauron.config.ts)
  -h, --help            Show this help message

COMMANDS:
  init                   Create sauron.config.ts with default settings

EXAMPLES:
  sauron init
  sauron --config ./sauron.config.ts
  sauron swagger.json
  sauron --input swaggerAfEstoque.json --angular --http
  sauron --url https://api.example.com/swagger.json --http
  sauron --http -i api.json -o ./generated
  sauron --plugin fetch -i api.json
  sauron --plugin axios -i api.json
  sauron --plugin angular --plugin fetch -i api.json

When --angular flag is used, the tool will:
1. Detect if current directory is an Angular project
2. Generate models in src/app/sauron/models/
3. Generate Angular service in src/app/sauron/sauron-api.service.ts

When --http flag is used without --angular:
1. Generate fetch-based HTTP methods in outputs/http-client/
2. Generate models in outputs/models/

Without flags, generates only TypeScript models.
`);
}

/**
 * Normalize plugin values.
 * @param pluginValues Input parameter `pluginValues`.
 * @returns Normalize plugin values output as `string[]`.
 * @example
 * ```ts
 * const result = normalizePluginValues(["fetch", "angular"]);
 * // result: string[]
 * ```
 */
function normalizePluginValues(
	pluginValues: string | string[],
): string[] {
	if (Array.isArray(pluginValues)) {
		return pluginValues
			.map((plugin) => plugin.trim())
			.filter((plugin) => plugin.length > 0);
	}

	const normalizedPlugin = pluginValues.trim();
	if (!normalizedPlugin) {
		return [];
	}

	return [normalizedPlugin];
}
