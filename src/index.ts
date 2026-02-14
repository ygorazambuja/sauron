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

export { main };

if (import.meta.main) {
	main();
}
