import { main } from "./cli/main";

export {
	parseArgs,
	parseCommand,
	showHelp,
} from "./cli/args";

export {
	createGeneratedFileHeader,
	initConfigFile,
	loadSauronConfig,
	mergeOptionsWithConfig,
} from "./cli/config";

export { getOutputPaths, isAngularProject } from "./cli/project";
export type { CliOptions, SauronConfig } from "./cli/types";

export { generateAngularService } from "./generators/angular";
export {
	createFetchHttpMethods,
	extractMethodParameters,
	extractResponseType,
	generateFetchService,
	generateMethodName,
} from "./generators/fetch";
export {
	createMissingSwaggerDefinitionsReport,
	generateMissingSwaggerDefinitionsFile,
} from "./generators/missing-definitions";
export {
	createTypeCoverageReport,
	generateTypeCoverageReportFile,
} from "./generators/type-coverage";
export {
	BUILTIN_PLUGIN_IDS,
	createDefaultPluginRegistry,
	createPluginRegistry,
} from "./plugins/registry";
export { runPlugins, runHttpPlugins } from "./plugins/runner";
export type { PluginContext, SauronPlugin } from "./plugins/types";

export { main };

if (import.meta.main) {
	main();
}
