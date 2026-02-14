import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { generateAngularService } from "../generators/angular";
import {
	createMissingSwaggerDefinitionsReport,
	generateMissingSwaggerDefinitionsFile,
} from "../generators/missing-definitions";
import {
	createFetchHttpMethods,
	generateFetchService,
} from "../generators/fetch";
import {
	createAngularHttpClientMethods,
	createModelsWithOperationTypes,
	fetchJsonFromUrl,
	readJsonFile,
	verifySwaggerComposition,
} from "../utils";
import { parseArgs, parseCommand, showHelp } from "./args";
import {
	createGeneratedFileHeader,
	formatGeneratedFile,
	initConfigFile,
	loadSauronConfig,
	mergeOptionsWithConfig,
} from "./config";
import { getOutputPaths, isAngularProject } from "./project";
import { DEFAULT_CONFIG_FILE } from "./types";

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
		} else {
			console.log(`📖 Reading OpenAPI spec from: ${options.input}`);
			config = await readJsonFile(options.input);
		}

		if (typeof config !== "object") {
			throw new Error("Config is not an object");
		}

		console.log("✅ Validating OpenAPI schema...");
		const schema = verifySwaggerComposition(config as Record<string, unknown>);

		const { modelsPath, servicePath } = getOutputPaths(options);
		const fileHeader = createGeneratedFileHeader(schema);

		console.log("🔧 Generating TypeScript models...");
		const { models, operationTypes, typeNameMap } =
			createModelsWithOperationTypes(schema);
		const formattedModels = await formatGeneratedFile(
			`${fileHeader}\n${models.join("\n")}`,
			modelsPath,
		);
		writeFileSync(modelsPath, formattedModels);

		let httpMethodsCount = 0;

		if (options.http && servicePath) {
			if (options.angular && isAngularProject()) {
				console.log("🔧 Generating Angular HTTP Client service...");
				const {
					methods: angularMethods,
					imports: angularImports,
					paramsInterfaces: angularParamsInterfaces,
				} = createAngularHttpClientMethods(schema, operationTypes, typeNameMap);
				const angularService = generateAngularService(
					angularMethods,
					angularImports,
					true,
					angularParamsInterfaces,
				);
				const formattedAngularService = await formatGeneratedFile(
					`${fileHeader}\n${angularService}`,
					servicePath,
				);
				writeFileSync(servicePath, formattedAngularService);
				httpMethodsCount = angularMethods.length;
			} else {
				console.log("🔧 Generating fetch-based HTTP methods...");
				const usedTypes = new Set<string>();
				const {
					methods: fetchMethods,
					paramsInterfaces: fetchParamsInterfaces,
				} = createFetchHttpMethods(
					schema,
					usedTypes,
					operationTypes,
					typeNameMap,
				);
				const fetchService = generateFetchService(
					fetchMethods,
					modelsPath,
					usedTypes,
					fetchParamsInterfaces,
				);
				const formattedFetchService = await formatGeneratedFile(
					`${fileHeader}\n${fetchService}`,
					servicePath,
				);
				writeFileSync(servicePath, formattedFetchService);
				httpMethodsCount = fetchMethods.length;
			}

			const missingDefinitionsReport = createMissingSwaggerDefinitionsReport(
				schema,
				operationTypes,
			);
			const missingDefinitionsReportPath = join(
				dirname(servicePath),
				"missing-swagger-definitions.json",
			);
			const reportFileContent = generateMissingSwaggerDefinitionsFile(
				missingDefinitionsReport,
			);
			writeFileSync(missingDefinitionsReportPath, reportFileContent);
			console.log(
				`🧾 Missing Swagger definitions report: ${missingDefinitionsReportPath}`,
			);
			console.log(
				`🔎 Missing definitions found: ${missingDefinitionsReport.totalIssues}`,
			);
		}

		console.log(`\n✅ Generation complete!`);
		console.log(`📄 Models: ${models.length} TypeScript interfaces/types`);
		if (options.http) {
			console.log(
				`🔗 HTTP Methods: ${httpMethodsCount} ${
					options.angular && isAngularProject() ? "Angular" : "fetch"
				} methods`,
			);
		}
		console.log(
			`📁 Output: ${
				options.output ||
				(options.angular && isAngularProject() ? "src/app/sauron" : "outputs")
			}`,
		);
	} catch (error) {
		console.error("❌ Error:", error);
		process.exit(1);
	}
}
