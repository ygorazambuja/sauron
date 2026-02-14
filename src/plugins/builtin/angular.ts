import { join } from "node:path";
import { generateAngularService } from "../../generators/angular";
import {
	createMissingSwaggerDefinitionsReport,
	generateMissingSwaggerDefinitionsFile,
} from "../../generators/missing-definitions";
import {
	createTypeCoverageReport,
	generateTypeCoverageReportFile,
} from "../../generators/type-coverage";
import { createAngularHttpClientMethods } from "../../utils";
import type {
	PluginCanRunResult,
	PluginContext,
	PluginGenerateResult,
	PluginOutputPaths,
	SauronPlugin,
} from "../types";

/**
 * Create angular plugin.
 * @returns Create angular plugin output as `SauronPlugin`.
 * @example
 * ```ts
 * const result = createAngularPlugin();
 * // result: SauronPlugin
 * ```
 */
export function createAngularPlugin(): SauronPlugin {
	return {
		id: "angular",
		aliases: ["ng"],
		kind: "http-client",
		canRun,
		resolveOutputs,
		generate,
	};
}

/**
 * Can run angular plugin.
 * @param context Input parameter `context`.
 * @returns Can run angular plugin output as `PluginCanRunResult`.
 * @example
 * ```ts
 * const result = canRun({ isAngularProject: true } as PluginContext);
 * // result: PluginCanRunResult
 * ```
 */
function canRun(context: PluginContext): PluginCanRunResult {
	if (context.isAngularProject) {
		return { ok: true };
	}

	return {
		ok: false,
		reason:
			"⚠️  Angular plugin requested but Angular project not detected. Falling back to fetch plugin.",
		fallbackPluginId: "fetch",
	};
}

/**
 * Resolve angular plugin outputs.
 * @param context Input parameter `context`.
 * @returns Resolve angular plugin outputs output as `PluginOutputPaths`.
 * @example
 * ```ts
 * const result = resolveOutputs({ baseOutputPath: "src/app/sauron" } as PluginContext);
 * // result: PluginOutputPaths
 * ```
 */
function resolveOutputs(context: PluginContext): PluginOutputPaths {
	const serviceDirectory = join(context.baseOutputPath, "angular-http-client");
	return {
		servicePath: join(serviceDirectory, "sauron-api.service.ts"),
		reportPath: join(serviceDirectory, "missing-swagger-definitions.json"),
		typeCoverageReportPath: join(serviceDirectory, "type-coverage-report.json"),
	};
}

/**
 * Generate angular plugin files.
 * @param context Input parameter `context`.
 * @returns Generate angular plugin files output as `Promise<PluginGenerateResult>`.
 * @example
 * ```ts
 * const result = await generate({} as PluginContext);
 * // result: PluginGenerateResult
 * ```
 */
async function generate(
	context: PluginContext,
): Promise<PluginGenerateResult> {
	const {
		methods: angularMethods,
		imports: angularImports,
		paramsInterfaces: angularParamsInterfaces,
	} = createAngularHttpClientMethods(
		context.schema,
		context.operationTypes,
		context.typeNameMap,
	);
	const angularService = generateAngularService(
		angularMethods,
		angularImports,
		true,
		angularParamsInterfaces,
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
			content: `${context.fileHeader}\n${angularService}`,
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
		methodCount: angularMethods.length,
	};
}
