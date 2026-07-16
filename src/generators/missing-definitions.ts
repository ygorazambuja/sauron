import type { z } from "zod";
import type { SwaggerOrOpenAPISchema } from "../schemas/swagger";
import type { OperationTypeMap } from "../utils";
import {
	createTypeCoverageReport,
	type TypeCoverageIssue,
	type TypeCoverageLocation,
} from "./type-coverage";

/**
 * Missing Swagger definition issue.
 */
export type MissingSwaggerDefinitionIssue = TypeCoverageIssue & {
	recommendedDefinition: string;
};

/**
 * Missing Swagger definitions report.
 */
export type MissingSwaggerDefinitionsReport = {
	generatedAt: string;
	totalIssues: number;
	summary: {
		pathParameters: number;
		queryParameters: number;
		requestBodies: number;
		responseBodies: number;
	};
	issues: MissingSwaggerDefinitionIssue[];
};

/**
 * Create missing Swagger definitions report.
 * @param data Input parameter `data`.
 * @param operationTypes Input parameter `operationTypes`.
 * @returns Create missing Swagger definitions report output as `MissingSwaggerDefinitionsReport`.
 * @example
 * ```ts
 * const result = createMissingSwaggerDefinitionsReport({ paths: {} } as never, {});
 * // result: MissingSwaggerDefinitionsReport
 * ```
 */
export function createMissingSwaggerDefinitionsReport(
	data: z.infer<typeof SwaggerOrOpenAPISchema>,
	operationTypes?: OperationTypeMap,
): MissingSwaggerDefinitionsReport {
	const coverageReport = createTypeCoverageReport(data, operationTypes);
	const issues = coverageReport.issues.map(addRecommendedDefinition);

	return {
		generatedAt: coverageReport.generatedAt,
		totalIssues: issues.length,
		summary: {
			pathParameters: coverageReport.summary.pathParameters.untyped,
			queryParameters: coverageReport.summary.queryParameters.untyped,
			requestBodies: coverageReport.summary.requestBodies.untyped,
			responseBodies: coverageReport.summary.responseBodies.untyped,
		},
		issues,
	};
}

/**
 * Generate missing Swagger definitions file content.
 * @param report Input parameter `report`.
 * @returns Generate missing Swagger definitions file content output as `string`.
 * @example
 * ```ts
 * const result = generateMissingSwaggerDefinitionsFile({ generatedAt: "", totalIssues: 0, summary: { pathParameters: 0, queryParameters: 0, requestBodies: 0, responseBodies: 0 }, issues: [] });
 * // result: string
 * ```
 */
export function generateMissingSwaggerDefinitionsFile(
	report: MissingSwaggerDefinitionsReport,
): string {
	return `${JSON.stringify(report, null, 2)}\n`;
}

/**
 * Add the remediation guidance associated with a type coverage issue.
 * @param issue Type coverage issue to enrich.
 * @returns Missing definition issue with remediation guidance.
 * @example
 * ```ts
 * const issue = addRecommendedDefinition({ path: "/users/{id}", method: "GET", location: "path.parameter", reason: "Path parameter is missing from operation.parameters." });
 * // issue.recommendedDefinition: "Add a path parameter definition with schema.type or schema.$ref."
 * ```
 */
function addRecommendedDefinition(
	issue: TypeCoverageIssue,
): MissingSwaggerDefinitionIssue {
	return {
		...issue,
		recommendedDefinition: resolveRecommendedDefinition(issue),
	};
}

/**
 * Resolve remediation guidance for a type coverage issue.
 * @param issue Type coverage issue to inspect.
 * @returns Recommended OpenAPI definition change.
 * @example
 * ```ts
 * const recommendation = resolveRecommendedDefinition({ path: "/users", method: "GET", location: "query.parameter", reason: "Query parameter schema is missing or unresolved." });
 * // recommendation: "Define query parameter schema.type, schema.enum, schema.items, anyOf/oneOf/allOf, or schema.$ref."
 * ```
 */
function resolveRecommendedDefinition(issue: TypeCoverageIssue): string {
	if (issue.reason === "Path parameter is missing from operation.parameters.") {
		return "Add a path parameter definition with schema.type or schema.$ref.";
	}

	const recommendations: Record<TypeCoverageLocation, string> = {
		"path.parameter":
			"Define parameter.schema with a primitive type, enum, object, array, or valid $ref.",
		"query.parameter":
			"Define query parameter schema.type, schema.enum, schema.items, anyOf/oneOf/allOf, or schema.$ref.",
		"request.body": resolveRequestBodyRecommendation(issue.reason),
		"response.body": resolveResponseBodyRecommendation(issue.reason),
	};

	return recommendations[issue.location];
}

/**
 * Resolve request body remediation guidance.
 * @param reason Reason reported by the shared type analysis.
 * @returns Recommended request body definition change.
 * @example
 * ```ts
 * const recommendation = resolveRequestBodyRecommendation("Request body exists but no schema was documented in content.");
 * // recommendation: "Add requestBody.content['application/json'].schema with type/object/array or $ref."
 * ```
 */
function resolveRequestBodyRecommendation(reason: string): string {
	if (
		reason === "Request body exists but no schema was documented in content."
	) {
		return "Add requestBody.content['application/json'].schema with type/object/array or $ref.";
	}

	return "Reference a schema with $ref or define a complete inline schema in requestBody.content.";
}

/**
 * Resolve response body remediation guidance.
 * @param reason Reason reported by the shared type analysis.
 * @returns Recommended response body definition change.
 * @example
 * ```ts
 * const recommendation = resolveResponseBodyRecommendation("No 2xx success response is documented for this operation.");
 * // recommendation: "Add a 200/201 (or any 2xx) response with content schema for the HTTP client return type."
 * ```
 */
function resolveResponseBodyRecommendation(reason: string): string {
	if (reason === "No 2xx success response is documented for this operation.") {
		return "Add a 200/201 (or any 2xx) response with content schema for the HTTP client return type.";
	}

	if (
		reason ===
		"Success response exists but no response schema was documented in content."
	) {
		return "Add response.content['application/json'].schema using $ref or a fully defined inline schema.";
	}

	return "Use $ref to a schema in components.schemas/definitions or define response schema details explicitly.";
}
