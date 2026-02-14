import { join } from "node:path";
import {
	createMissingSwaggerDefinitionsReport,
	generateMissingSwaggerDefinitionsFile,
} from "../../generators/missing-definitions";
import { createFetchHttpMethods } from "../../generators/fetch";
import {
	createTypeCoverageReport,
	generateTypeCoverageReportFile,
} from "../../generators/type-coverage";
import type {
	PluginCanRunResult,
	PluginContext,
	PluginGenerateResult,
	PluginOutputPaths,
	SauronPlugin,
} from "../types";

/**
 * Create axios plugin.
 * @returns Create axios plugin output as `SauronPlugin`.
 * @example
 * ```ts
 * const result = createAxiosPlugin();
 * // result: SauronPlugin
 * ```
 */
export function createAxiosPlugin(): SauronPlugin {
	return {
		id: "axios",
		aliases: ["ax"],
		kind: "http-client",
		canRun,
		resolveOutputs,
		generate,
	};
}

/**
 * Can run axios plugin.
 * @param _context Input parameter `_context`.
 * @returns Can run axios plugin output as `PluginCanRunResult`.
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
 * Resolve axios plugin outputs.
 * @param context Input parameter `context`.
 * @returns Resolve axios plugin outputs output as `PluginOutputPaths`.
 * @example
 * ```ts
 * const result = resolveOutputs({ baseOutputPath: "outputs" } as PluginContext);
 * // result: PluginOutputPaths
 * ```
 */
function resolveOutputs(context: PluginContext): PluginOutputPaths {
	const serviceDirectory = join(context.baseOutputPath, "http-client");
	return {
		servicePath: join(serviceDirectory, "sauron-api.axios-client.ts"),
		reportPath: join(
			serviceDirectory,
			"missing-swagger-definitions.axios.json",
		),
		typeCoverageReportPath: join(
			serviceDirectory,
			"type-coverage-report.axios.json",
		),
	};
}

/**
 * Generate axios plugin files.
 * @param context Input parameter `context`.
 * @returns Generate axios plugin files output as `Promise<PluginGenerateResult>`.
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
		paramsInterfaces,
	} = createFetchHttpMethods(
		context.schema,
		usedTypes,
		context.operationTypes,
		context.typeNameMap,
	);
	const axiosMethods = fetchMethods.map((method) =>
		convertFetchMethodToAxios(method),
	);
	const axiosService = generateAxiosService(
		axiosMethods,
		usedTypes,
		paramsInterfaces,
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
			content: `${context.fileHeader}\n${axiosService}`,
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
		methodCount: axiosMethods.length,
	};
}

/**
 * Convert fetch method to axios adapter method.
 * @param fetchMethod Input parameter `fetchMethod`.
 * @returns Convert fetch method to axios adapter method output as `string`.
 * @example
 * ```ts
 * const result = convertFetchMethodToAxios("const response = await fetch(url, {});");
 * // result: string
 * ```
 */
function convertFetchMethodToAxios(fetchMethod: string): string {
	return fetchMethod.replace(
		"const response = await fetch(",
		"const response = await this.fetchWithAxios(",
	);
}

/**
 * Generate axios service.
 * @param methods Input parameter `methods`.
 * @param usedTypes Input parameter `usedTypes`.
 * @param paramsInterfaces Input parameter `paramsInterfaces`.
 * @returns Generate axios service output as `string`.
 * @example
 * ```ts
 * const result = generateAxiosService([], new Set<string>(), []);
 * // result: string
 * ```
 */
function generateAxiosService(
	methods: string[],
	usedTypes: Set<string>,
	paramsInterfaces: string[],
): string {
	const importStatement = buildModelImportStatement(usedTypes);
	const interfacesBlock = buildInterfacesBlock(paramsInterfaces);

	return `// Generated axios-based HTTP client
import axios, { type AxiosError, type AxiosInstance } from "axios";
import qs from "query-string";
${importStatement}
${interfacesBlock}

type AxiosFetchConfig = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

type AxiosLikeResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

function createAxiosLikeResponse(status: number, data: unknown, ok: boolean): AxiosLikeResponse {
  return {
    ok,
    status,
    async json() {
      return data;
    },
  };
}

export class SauronAxiosApiClient {
  private baseUrl = "";
  private readonly httpClient: AxiosInstance;

  constructor(baseUrl?: string, httpClient: AxiosInstance = axios.create()) {
    this.httpClient = httpClient;
    if (baseUrl) {
      this.baseUrl = baseUrl;
    }
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  private buildUrl(path: string): string {
    if (/^(https?:)?\\/\\//i.test(path)) {
      return path;
    }

    const normalizedBase = this.baseUrl.replace(/\\/+$/, "");
    const normalizedPath = path.startsWith("/") ? path : \`/\${path}\`;

    if (!normalizedBase) {
      return normalizedPath;
    }

    return \`\${normalizedBase}\${normalizedPath}\`;
  }

  private async fetchWithAxios(
    url: string,
    config: AxiosFetchConfig,
  ): Promise<AxiosLikeResponse> {
    try {
      const response = await this.httpClient.request({
        url,
        method: config.method,
        headers: config.headers,
        data: config.body,
      });
      return createAxiosLikeResponse(response.status, response.data, true);
    } catch (error) {
      const axiosError = error as AxiosError;
      const response = axiosError.response;
      if (response) {
        return createAxiosLikeResponse(response.status, response.data, false);
      }

      throw error;
    }
  }

${methods.join("\n\n")}
}

export const sauronAxiosApi = new SauronAxiosApiClient();
`;
}

/**
 * Build model import statement.
 * @param usedTypes Input parameter `usedTypes`.
 * @returns Build model import statement output as `string`.
 * @example
 * ```ts
 * const result = buildModelImportStatement(new Set<string>());
 * // result: string
 * ```
 */
function buildModelImportStatement(usedTypes: Set<string>): string {
	if (usedTypes.size === 0) {
		return "";
	}

	const importList = Array.from(usedTypes).join(", ");
	return `import { ${importList} } from "../models";`;
}

/**
 * Build interfaces block.
 * @param paramsInterfaces Input parameter `paramsInterfaces`.
 * @returns Build interfaces block output as `string`.
 * @example
 * ```ts
 * const result = buildInterfacesBlock([]);
 * // result: string
 * ```
 */
function buildInterfacesBlock(paramsInterfaces: string[]): string {
	if (paramsInterfaces.length === 0) {
		return "";
	}

	return `${paramsInterfaces.join("\n\n")}\n`;
}
