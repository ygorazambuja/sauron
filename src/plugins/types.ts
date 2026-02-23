import type { z } from "zod";
import type { CliOptions } from "../cli/types";
import type { SwaggerOrOpenAPISchema } from "../schemas/swagger";
import type { OperationTypeMap, TypeNameMap } from "../utils";

/**
 * Plugin kind.
 */
export type PluginKind = "http-client" | "mcp-server";

/**
 * Plugin can run success result.
 */
export type PluginCanRunSuccess = {
	ok: true;
};

/**
 * Plugin can run failure result.
 */
export type PluginCanRunFailure = {
	ok: false;
	reason: string;
	fallbackPluginId?: string;
};

/**
 * Plugin can run result.
 */
export type PluginCanRunResult = PluginCanRunSuccess | PluginCanRunFailure;

/**
 * Generated plugin file.
 */
export type PluginFile = {
	path: string;
	content: string;
};

/**
 * Plugin output paths.
 */
export type PluginOutputArtifact = {
	kind: "service" | "report" | "type-coverage" | "manifest" | "other";
	path: string;
	label?: string;
};

/**
 * Plugin output paths.
 */
export type PluginOutputPaths = {
	artifacts: PluginOutputArtifact[];
	servicePath?: string;
	reportPath?: string;
	typeCoverageReportPath?: string;
};

/**
 * Plugin generation result.
 */
export type PluginGenerateResult = {
	files: PluginFile[];
	methodCount: number;
};

/**
 * Plugin context.
 */
export type PluginContext = {
	schema: z.infer<typeof SwaggerOrOpenAPISchema>;
	options: CliOptions;
	baseOutputPath: string;
	modelsPath: string;
	fileHeader: string;
	operationTypes: OperationTypeMap;
	typeNameMap: TypeNameMap;
	isAngularProject: boolean;
	writeFormattedFile: (
		filePath: string,
		content: string,
	) => Promise<void>;
};

/**
 * Sauron plugin definition.
 */
export interface SauronPlugin {
	id: string;
	aliases?: string[];
	kind: PluginKind;
	canRun(context: PluginContext): PluginCanRunResult;
	resolveOutputs(context: PluginContext): PluginOutputPaths;
	generate(context: PluginContext): Promise<PluginGenerateResult>;
}

/**
 * Plugin execution result.
 */
export type PluginExecutionResult = {
	requestedPluginId: string;
	executedPluginId: string;
	kind: PluginKind;
	methodCount: number;
	artifacts: PluginOutputArtifact[];
	servicePath?: string;
	reportPath?: string;
	typeCoverageReportPath?: string;
};
