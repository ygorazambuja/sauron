import { join } from "node:path";
import {
	createMissingSwaggerDefinitionsReport,
	generateMissingSwaggerDefinitionsFile,
} from "../../generators/missing-definitions";
import {
	createTypeCoverageReport,
	generateTypeCoverageReportFile,
} from "../../generators/type-coverage";
import {
	createFetchHttpMethods,
	generateFetchService,
} from "../../generators/fetch";
import type {
	PluginCanRunResult,
	PluginContext,
	PluginGenerateResult,
	PluginOutputPaths,
	SauronPlugin,
} from "../types";

/**
 * Create fetch plugin.
 * @returns Create fetch plugin output as `SauronPlugin`.
 * @example
 * ```ts
 * const result = createFetchPlugin();
 * // result: SauronPlugin
 * ```
 */
export function createFetchPlugin(): SauronPlugin {
	return {
		id: "fetch",
		aliases: ["http", "http-client"],
		kind: "http-client",
		canRun,
		resolveOutputs,
		generate,
	};
}

/**
 * Can run fetch plugin.
 * @param _context Input parameter `_context`.
 * @returns Can run fetch plugin output as `PluginCanRunResult`.
 * @example
 * ```ts
 * const result = canRun({} as PluginContext);
 * // result: PluginCanRunResult
 * ```
 */
function canRun(_context: PluginContext): PluginCanRunResult {
	return { ok: true };
}

/**
 * Resolve fetch plugin outputs.
 * @param context Input parameter `context`.
 * @returns Resolve fetch plugin outputs output as `PluginOutputPaths`.
 * @example
 * ```ts
 * const result = resolveOutputs({ baseOutputPath: "outputs" } as PluginContext);
 * // result: PluginOutputPaths
 * ```
 */
function resolveOutputs(context: PluginContext): PluginOutputPaths {
	const serviceDirectory = join(context.baseOutputPath, "http-client");
	const servicePath = join(serviceDirectory, "sauron-api.client.ts");
	const reportPath = join(serviceDirectory, "missing-swagger-definitions.json");
	const typeCoverageReportPath = join(
		serviceDirectory,
		"type-coverage-report.json",
	);
	return {
		artifacts: [
			{ kind: "service", path: servicePath, label: "Fetch HTTP client" },
			{
				kind: "report",
				path: reportPath,
				label: "Missing Swagger definitions report",
			},
			{
				kind: "type-coverage",
				path: typeCoverageReportPath,
				label: "Type coverage report",
			},
		],
		servicePath,
		reportPath,
		typeCoverageReportPath,
	};
}

/**
 * Generate fetch plugin files.
 * @param context Input parameter `context`.
 * @returns Generate fetch plugin files output as `Promise<PluginGenerateResult>`.
 * @example
 * ```ts
 * const result = await generate({} as PluginContext);
 * // result: PluginGenerateResult
 * ```
 */
async function generate(
	context: PluginContext,
): Promise<PluginGenerateResult> {
	const usedTypes = new Set<string>();
	const {
		methods: fetchMethods,
		paramsInterfaces: fetchParamsInterfaces,
	} = createFetchHttpMethods(
		context.schema,
		usedTypes,
		context.operationTypes,
		context.typeNameMap,
	);
	const fetchService = generateFetchService(
		fetchMethods,
		context.modelsPath,
		usedTypes,
		fetchParamsInterfaces,
	);
	const outputPaths = resolveOutputs(context);

	const missingDefinitionsReport = createMissingSwaggerDefinitionsReport(
		context.schema,
		context.operationTypes,
	);
	const reportFileContent = generateMissingSwaggerDefinitionsFile(
		missingDefinitionsReport,
	);
	const typeCoverageReport = createTypeCoverageReport(
		context.schema,
		context.operationTypes,
	);
	const typeCoverageFileContent =
		generateTypeCoverageReportFile(typeCoverageReport);
	const files = [
		{
			path: outputPaths.servicePath,
			content: `${context.fileHeader}\n${fetchService}`,
		},
		{
			path: outputPaths.reportPath,
			content: reportFileContent,
		},
	];
	if (outputPaths.typeCoverageReportPath) {
		files.push({
			path: outputPaths.typeCoverageReportPath,
			content: typeCoverageFileContent,
		});
	}

	return {
		files,
		methodCount: fetchMethods.length,
	};
}
