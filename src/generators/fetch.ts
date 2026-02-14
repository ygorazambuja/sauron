import type { z } from "zod";
import type { SwaggerOrOpenAPISchema } from "../schemas/swagger";
import type {
  OpenApiOperation,
  OpenApiPath,
  OpenApiSchema,
  OperationTypeInfo,
  OperationTypeMap,
} from "../utils";

/**
 * Generate method name.
 * @param path Input parameter `path`.
 * @param httpMethod Input parameter `httpMethod`.
 * @param operation Input parameter `operation`.
 * @returns Generate method name output as `string`.
 * @example
 * ```ts
 * const result = generateMethodName("value", "value", {});
 * // result: string
 * ```
 */
export function generateMethodName(
  path: string,
  httpMethod: string,
  operation: OpenApiOperation,
): string {
  const pathParts = path.split("/").filter((part) => part && part !== "api");
  const tags = operation.tags || [];

  const baseName = resolveBaseMethodName(pathParts, tags);

  const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9]/g, "");
  const methodPrefix = httpMethod.charAt(0).toUpperCase() + httpMethod.slice(1);

  const hasPathParams = path.includes("{");
  const hasQueryParams =
    operation.parameters?.some((p) => p.in === "query") || false;
  const hasBody = !!operation.requestBody;
  const additionalSuffix = resolveMethodSuffix(
    httpMethod,
    hasPathParams,
    hasQueryParams,
    hasBody,
  );

  return methodPrefix + sanitizedBaseName + additionalSuffix;
}

/**
 * Resolve base method name.
 * @param pathParts Input parameter `pathParts`.
 * @param tags Input parameter `tags`.
 * @returns Resolve base method name output as `string`.
 * @example
 * ```ts
 * const result = resolveBaseMethodName([], []);
 * // result: string
 * ```
 */
function resolveBaseMethodName(pathParts: string[], tags: string[]): string {
  if (pathParts.length > 1) {
    return pathParts
      .map((part) => {
        if (part.startsWith("{")) {
          return `By${part.slice(1, -1).charAt(0).toUpperCase()}${part.slice(2, -1)}`;
        }
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join("");
  }
  if (tags.length > 0) {
    return tags
      .map((tag) => tag.charAt(0).toUpperCase() + tag.slice(1))
      .join("");
  }
  return "Api";
}

/**
 * Resolve method suffix.
 * @param httpMethod Input parameter `httpMethod`.
 * @param hasPathParams Input parameter `hasPathParams`.
 * @param hasQueryParams Input parameter `hasQueryParams`.
 * @param hasBody Input parameter `hasBody`.
 * @returns Resolve method suffix output as `string`.
 * @example
 * ```ts
 * const result = resolveMethodSuffix("value", true, true, true);
 * // result: string
 * ```
 */
function resolveMethodSuffix(
  httpMethod: string,
  hasPathParams: boolean,
  hasQueryParams: boolean,
  hasBody: boolean,
): string {
  if (hasPathParams && httpMethod === "get") {
    return "";
  }
  if (hasQueryParams && httpMethod === "get") {
    return "WithParams";
  }
  if (hasBody && ["post", "put", "patch"].includes(httpMethod)) {
    return "Create";
  }
  return "";
}

/**
 * To pascal case.
 * @param value Input parameter `value`.
 * @returns To pascal case output as `string`.
 * @example
 * ```ts
 * const result = toPascalCase("value");
 * // result: string
 * ```
 */
function toPascalCase(value: string): string {
  const sanitized = value
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

  if (!sanitized) {
    return "";
  }

  if (/^[0-9]/.test(sanitized)) {
    return `Type${sanitized}`;
  }

  return sanitized;
}

/**
 * Sanitize type name.
 * @param value Input parameter `value`.
 * @returns Sanitize type name output as `string`.
 * @example
 * ```ts
 * const result = sanitizeTypeName("value");
 * // result: string
 * ```
 */
function sanitizeTypeName(value: string): string {
  const sanitized = toPascalCase(value);
  return sanitized || "Type";
}

/**
 * Resolve type name.
 * @param value Input parameter `value`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @returns Resolve type name output as `string`.
 * @example
 * ```ts
 * const result = resolveTypeName("value", new Map());
 * // result: string
 * ```
 */
function resolveTypeName(
  value: string,
  typeNameMap?: Map<string, string>,
): string {
  return typeNameMap?.get(value) ?? sanitizeTypeName(value);
}

/**
 * Convert param schema to type.
 * @param schema Input parameter `schema`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @returns Convert param schema to type output as `string`.
 * @example
 * ```ts
 * const result = convertParamSchemaToType({}, new Map());
 * // result: string
 * ```
 */
function convertParamSchemaToType(
  schema: any,
  typeNameMap?: Map<string, string>,
): string {
  if (!schema || typeof schema !== "object") {
    return "any";
  }

  if (schema.$ref && typeof schema.$ref === "string") {
    const refParts = schema.$ref.split("/");
    const rawName = refParts[refParts.length - 1];
    return rawName ? resolveTypeName(rawName, typeNameMap) : "any";
  }

  if (Array.isArray(schema.enum)) {
    const unionValues = schema.enum
      .map((enumValue: unknown) =>
        typeof enumValue === "string" ? `"${enumValue}"` : String(enumValue),
      )
      .join(" | ");
    return unionValues || "any";
  }

  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    const variants = (schema.anyOf || schema.oneOf || [])
      .map((variant: any) => convertParamSchemaToType(variant, typeNameMap))
      .filter(Boolean);
    return variants.join(" | ") || "any";
  }

  if (Array.isArray(schema.allOf)) {
    const variants = schema.allOf
      .map((variant: any) => convertParamSchemaToType(variant, typeNameMap))
      .filter(Boolean);
    return variants.join(" & ") || "any";
  }

  if (schema.type === "array" && schema.items) {
    const itemType = convertParamSchemaToType(schema.items, typeNameMap);
    return `${itemType}[]`;
  }

  if (schema.type === "object" && schema.properties) {
    const requiredProperties = Array.isArray(schema.required)
      ? schema.required
      : [];
    const hasExplicitRequiredList = requiredProperties.length > 0;
    const entries = Object.entries(schema.properties as Record<string, any>);

    if (entries.length === 0) {
      return "{}";
    }

    const propertyDefinitions = entries.map(
      ([propertyName, propertySchema]) => {
        const propertyType = convertParamSchemaToType(
          propertySchema,
          typeNameMap,
        );
        const isRequired = hasExplicitRequiredList
          ? requiredProperties.includes(propertyName)
          : true;
        const optionalMarker = isRequired ? "" : "?";
        return `${propertyName}${optionalMarker}: ${propertyType};`;
      },
    );

    return `{ ${propertyDefinitions.join(" ")} }`;
  }

  let typeScriptType = resolvePrimitiveSchemaType(schema);

  if (schema.nullable === true) {
    typeScriptType += " | null";
  }

  return typeScriptType;
}

const primitiveSchemaTypeMap: Record<string, string> = {
  string: "string",
  number: "number",
  integer: "number",
  boolean: "boolean",
};

/**
 * Resolve primitive schema type.
 * @param schema Input parameter `schema`.
 * @returns Resolve primitive schema type output as `string`.
 * @example
 * ```ts
 * const result = resolvePrimitiveSchemaType({});
 * // result: string
 * ```
 */
function resolvePrimitiveSchemaType(schema: any): string {
  if (schema.type === "string" && schema.format === "numeric") {
    return "number";
  }
  return primitiveSchemaTypeMap[schema.type] ?? "any";
}

/**
 * Add param type imports.
 * @param paramTypes Input parameter `paramTypes`.
 * @param usedTypes Input parameter `usedTypes`.
 * @example
 * ```ts
 * addParamTypeImports([], new Set());
 * ```
 */
function addParamTypeImports(paramTypes: string[], usedTypes: Set<string>) {
  for (const type of paramTypes) {
    const parts = type.split(/[|&]/).map((part) => part.trim());
    for (let part of parts) {
      while (part.endsWith("[]")) {
        part = part.slice(0, -2);
      }
      if (!part) {
        continue;
      }
      if (
        part === "string" ||
        part === "number" ||
        part === "boolean" ||
        part === "any" ||
        part === "unknown" ||
        part === "object" ||
        part === "null" ||
        part === "undefined" ||
        part === "Date"
      ) {
        continue;
      }
      if (
        part.startsWith('"') ||
        part.startsWith("'") ||
        part.startsWith("{") ||
        /^[0-9]/.test(part)
      ) {
        continue;
      }
      usedTypes.add(part);
    }
  }
}

/**
 * Build parameter info.
 * @param path Input parameter `path`.
 * @param operation Input parameter `operation`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @example
 * ```ts
 * buildParameterInfo("value", {}, new Map());
 * ```
 */
function buildParameterInfo(
  path: string,
  operation: OpenApiOperation,
  typeNameMap?: Map<string, string>,
) {
  const usedNames = new Set<string>();

  const makeUniqueName = (base: string, suffix: string) => {
    if (!usedNames.has(base)) {
      usedNames.add(base);
      return base;
    }
    const candidate = `${base}${suffix}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    let counter = 2;
    while (usedNames.has(`${candidate}${counter}`)) {
      counter++;
    }
    const unique = `${candidate}${counter}`;
    usedNames.add(unique);
    return unique;
  };

  const pathParams: Array<{ name: string; varName: string; type: string }> = [];
  const queryParams: Array<{
    name: string;
    varName: string;
    required: boolean;
    type: string;
  }> = [];
  let bodyParam: { name: string; varName: string } | null = null;

  const pathParamMatches = path.match(/\{([^}]+)\}/g);
  if (pathParamMatches) {
    const pathParamSchemas =
      operation.parameters?.filter((param) => param.in === "path") || [];
    for (const match of pathParamMatches) {
      const paramName = match.slice(1, -1);
      usedNames.add(paramName);
      const schema = pathParamSchemas.find(
        (param) => param.name === paramName,
      )?.schema;
      const type = schema
        ? convertParamSchemaToType(schema, typeNameMap)
        : "any";
      pathParams.push({ name: paramName, varName: paramName, type });
    }
  }

  if (operation.parameters) {
    for (const param of operation.parameters) {
      if (param.in === "query") {
        const varName = makeUniqueName(param.name, "Query");
        queryParams.push({
          name: param.name,
          varName,
          required: !!param.required,
          type: convertParamSchemaToType(param.schema, typeNameMap),
        });
      }
    }
  }

  if (operation.requestBody) {
    const varName = makeUniqueName("body", "Payload");
    bodyParam = { name: "body", varName };
  }

  return { pathParams, queryParams, bodyParam };
}

/**
 * Generate params interface.
 * @example
 * ```ts
 * generateParamsInterface();
 * ```
 */
function generateParamsInterface(
  methodName: string,
  queryParams: Array<{ name: string; required: boolean; type: string }>,
): string {
  const props = queryParams.map((param) => {
    const optional = param.required ? "" : "?";
    return `  ${param.name}${optional}: ${param.type};`;
  });
  return `export interface ${methodName}Params {\n${props.join("\n")}\n}`;
}

/**
 * Extract method parameters.
 * @param path Input parameter `path`.
 * @param operation Input parameter `operation`.
 * @param typeInfo Input parameter `typeInfo`.
 * @param _components Input parameter `_components`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @param methodName Input parameter `methodName`.
 * @returns Extract method parameters output as `string`.
 * @example
 * ```ts
 * const result = extractMethodParameters("value", {}, {}, {}, new Map(), "value");
 * // result: string
 * ```
 */
export function extractMethodParameters(
  path: string,
  operation: OpenApiOperation,
  typeInfo?: OperationTypeInfo,
  _components?: any,
  typeNameMap?: Map<string, string>,
  methodName?: string,
): string {
  const requiredParams: string[] = [];
  const optionalParams: string[] = [];
  const { pathParams, queryParams, bodyParam } = buildParameterInfo(
    path,
    operation,
    typeNameMap,
  );

  for (const param of pathParams) {
    requiredParams.push(`${param.varName}: ${param.type}`);
  }

  if (queryParams.length > 0 && methodName) {
    requiredParams.push(`params: ${methodName}Params`);
  }
  if (!(queryParams.length > 0 && methodName)) {
    for (const param of queryParams) {
      if (param.required) {
        requiredParams.push(`${param.varName}: ${param.type}`);
      }
      if (!param.required) {
        optionalParams.push(`${param.varName}?: ${param.type}`);
      }
    }
  }

  if (bodyParam) {
    const bodyType =
      typeInfo?.requestType ??
      extractRequestType(operation, typeNameMap) ??
      "any";
    requiredParams.push(`${bodyParam.varName}: ${bodyType}`);
  }

  return [...requiredParams, ...optionalParams].join(", ");
}

/**
 * Extract response type.
 * @param operation Input parameter `operation`.
 * @param _components Input parameter `_components`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @returns Extract response type output as `string`.
 * @example
 * ```ts
 * const result = extractResponseType({}, {}, new Map());
 * // result: string
 * ```
 */
export function extractResponseType(
  operation: OpenApiOperation,
  _components?: any,
  typeNameMap?: Map<string, string>,
): string {
  const response =
    operation.responses?.["200"] ||
    operation.responses?.["201"] ||
    (Object.keys(operation.responses || {}).find(
      (key) => key.startsWith("2") && operation.responses?.[key],
    ) &&
      operation.responses?.[
        Object.keys(operation.responses).find((key) => key.startsWith("2"))!
      ]);

  if (!response || typeof response !== "object") {
    return "any";
  }

  const content = (response as any).content;
  if (content?.["application/json"]?.schema) {
    const schema = content["application/json"].schema;

    if (schema.$ref && typeof schema.$ref === "string") {
      const refParts = schema.$ref.split("/");
      const typeName = refParts[refParts.length - 1];
      return typeName ? resolveTypeName(typeName, typeNameMap) : "any";
    }

    if (schema.type === "array" && schema.items?.$ref) {
      const refParts = schema.items.$ref.split("/");
      const itemTypeName = refParts[refParts.length - 1];
      return itemTypeName
        ? `${resolveTypeName(itemTypeName, typeNameMap)}[]`
        : "any[]";
    }

    return "any";
  }

  return "any";
}

/**
 * Get preferred content schema.
 * @example
 * ```ts
 * getPreferredContentSchema();
 * ```
 */
function getPreferredContentSchema(
  content?: Record<string, { schema: OpenApiSchema }>,
): OpenApiSchema | undefined {
  if (!content) {
    return undefined;
  }

  if (content["application/json"]?.schema) {
    return content["application/json"].schema;
  }

  const firstKey = Object.keys(content)[0];
  return firstKey ? content[firstKey]?.schema : undefined;
}

/**
 * Extract request type.
 * @param operation Input parameter `operation`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @returns Extract request type output as `string | undefined`.
 * @example
 * ```ts
 * const result = extractRequestType({}, new Map());
 * // result: string | undefined
 * ```
 */
function extractRequestType(
  operation: OpenApiOperation,
  typeNameMap?: Map<string, string>,
): string | undefined {
  const schema = getPreferredContentSchema(operation.requestBody?.content);
  if (!schema) {
    return undefined;
  }

  if (schema.$ref && typeof schema.$ref === "string") {
    const refParts = schema.$ref.split("/");
    const rawName = refParts[refParts.length - 1];
    return rawName ? resolveTypeName(rawName, typeNameMap) : undefined;
  }

  if (schema.type === "array" && schema.items?.$ref) {
    const refParts = schema.items.$ref.split("/");
    const itemTypeName = refParts[refParts.length - 1];
    return itemTypeName
      ? `${resolveTypeName(itemTypeName, typeNameMap)}[]`
      : undefined;
  }

  return undefined;
}

/**
 * Create fetch http methods.
 * @param data Input parameter `data`.
 * @param usedTypes Input parameter `usedTypes`.
 * @param operationTypes Input parameter `operationTypes`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @returns Create fetch http methods output as `unknown`.
 * @example
 * ```ts
 * const result = createFetchHttpMethods({}, new Set(), {}, new Map());
 * // result: unknown
 * ```
 */
export function createFetchHttpMethods(
  data: z.infer<typeof SwaggerOrOpenAPISchema>,
  usedTypes?: Set<string>,
  operationTypes?: OperationTypeMap,
  typeNameMap?: Map<string, string>,
): { methods: string[]; paramsInterfaces: string[] } {
  if (!data.paths) {
    return { methods: [], paramsInterfaces: [] };
  }

  const methods: string[] = [];
  const paramsInterfaces: string[] = [];
  const pathEntries = Object.entries(data.paths);

  for (const [path, pathItem] of pathEntries) {
    const result = generateFetchMethodsForPath(
      path,
      pathItem as OpenApiPath,
      data.components,
      usedTypes,
      operationTypes,
      typeNameMap,
    );
    methods.push(...result.methods);
    paramsInterfaces.push(...result.paramsInterfaces);
  }

  return { methods, paramsInterfaces };
}

/**
 * Generate fetch methods for path.
 * @param path Input parameter `path`.
 * @param operations Input parameter `operations`.
 * @param components Input parameter `components`.
 * @param usedTypes Input parameter `usedTypes`.
 * @param operationTypes Input parameter `operationTypes`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @returns Generate fetch methods for path output as `unknown`.
 * @example
 * ```ts
 * const result = generateFetchMethodsForPath("value", {}, {}, new Set(), {}, new Map());
 * // result: unknown
 * ```
 */
function generateFetchMethodsForPath(
  path: string,
  operations: OpenApiPath,
  components?: any,
  usedTypes?: Set<string>,
  operationTypes?: OperationTypeMap,
  typeNameMap?: Map<string, string>,
): { methods: string[]; paramsInterfaces: string[] } {
  const methods: string[] = [];
  const paramsInterfaces: string[] = [];
  const httpMethods = [
    "get",
    "post",
    "put",
    "delete",
    "patch",
    "head",
    "options",
  ] as const;

  for (const httpMethod of httpMethods) {
    if (operations[httpMethod]) {
      const result = generateFetchMethod(
        path,
        httpMethod,
        operations[httpMethod],
        components,
        usedTypes,
        operationTypes,
        typeNameMap,
      );
      if (result) {
        methods.push(result.method);
        if (result.paramsInterface) {
          paramsInterfaces.push(result.paramsInterface);
        }
      }
    }
  }

  return { methods, paramsInterfaces };
}

/**
 * Generate fetch method.
 * @param path Input parameter `path`.
 * @param httpMethod Input parameter `httpMethod`.
 * @param operation Input parameter `operation`.
 * @param components Input parameter `components`.
 * @param usedTypes Input parameter `usedTypes`.
 * @param operationTypes Input parameter `operationTypes`.
 * @param typeNameMap Input parameter `typeNameMap`.
 * @returns Generate fetch method output as `unknown`.
 * @example
 * ```ts
 * const result = generateFetchMethod("value", "value", {}, {}, new Set(), {}, new Map());
 * // result: unknown
 * ```
 */
function generateFetchMethod(
  path: string,
  httpMethod: string,
  operation: OpenApiOperation,
  components?: any,
  usedTypes?: Set<string>,
  operationTypes?: OperationTypeMap,
  typeNameMap?: Map<string, string>,
): { method: string; paramsInterface?: string } | null {
  try {
    const methodName = generateMethodName(path, httpMethod, operation);
    const paramInfo = buildParameterInfo(path, operation, typeNameMap);
    const typeInfo = operationTypes?.[path]?.[httpMethod];
    const parameters = extractMethodParameters(
      path,
      operation,
      typeInfo,
      components,
      typeNameMap,
      methodName,
    );

    const requestType =
      typeInfo?.requestType ?? extractRequestType(operation, typeNameMap);
    let responseType =
      typeInfo?.responseType ??
      extractResponseType(operation, components, typeNameMap);
    if (
      responseType === "any" &&
      requestType &&
      ["post", "put", "patch"].includes(httpMethod)
    ) {
      responseType = requestType;
    }
    const returnType =
      responseType !== "any" ? `Promise<${responseType}>` : "Promise<any>";

    if (requestType) {
      usedTypes?.add(requestType);
    }
    if (usedTypes && responseType !== "any" && !responseType.includes("[]")) {
      usedTypes.add(responseType);
    }
    if (usedTypes && responseType.includes("[]")) {
      const baseType = responseType.replace("[]", "");
      usedTypes.add(baseType);
    }
    if (usedTypes) {
      const paramTypes = [
        ...paramInfo.pathParams.map((param) => param.type),
        ...paramInfo.queryParams.map((param) => param.type),
      ];
      addParamTypeImports(paramTypes, usedTypes);
    }

    let paramsInterface: string | undefined;
    const queryParams = paramInfo.queryParams || [];
    const hasQueryParams = queryParams.length > 0;
    if (hasQueryParams) {
      paramsInterface = generateParamsInterface(methodName, queryParams);
    }

    const hasPathParams = path.includes("{");

    if (hasQueryParams) {
      const queryStringLine = `const queryString = qs.stringify({ ...params }, { skipNull: true, skipEmptyString: true });`;
      const queryUrl = createQueryUrl(path, hasPathParams);
      return {
        method: buildFetchMethodWithQueryString(
          methodName,
          parameters,
          returnType,
          queryUrl,
          operation,
          paramInfo,
          queryStringLine,
          httpMethod,
        ),
        paramsInterface,
      };
    }

    const url = createPathUrl(path, hasPathParams);

    const fetchOptions: string[] = [];
    fetchOptions.push(`method: '${httpMethod.toUpperCase()}'`);
    fetchOptions.push(`headers: {
    'Content-Type': 'application/json',
  }`);

    if (operation.requestBody) {
      const bodyVar = paramInfo.bodyParam?.varName || "body";
      fetchOptions.push(`body: JSON.stringify(${bodyVar})`);
    }

    const optionsString = fetchOptions.join(",\n    ");

    return {
      method: `  async ${methodName}(${parameters}): ${returnType} {
    const response = await fetch(${url}, {
      ${optionsString}
    });

    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }

    return await response.json();
  }`,
      paramsInterface,
    };
  } catch (error) {
    console.warn(
      `Warning: Could not generate fetch method for ${httpMethod.toUpperCase()} ${path}:`,
      error,
    );
    return null;
  }
}

/**
 * Build fetch method with query string.
 * @example
 * ```ts
 * buildFetchMethodWithQueryString();
 * ```
 */
function buildFetchMethodWithQueryString(
  methodName: string,
  parameters: string,
  returnType: string,
  url: string,
  operation: OpenApiOperation,
  paramInfo: { bodyParam: { varName: string } | null },
  queryStringLine: string,
  httpMethod: string,
): string {
  const fetchOptions: string[] = [];
  fetchOptions.push(`method: '${httpMethod.toUpperCase()}'`);
  fetchOptions.push(`headers: {
    'Content-Type': 'application/json',
  }`);

  if (operation.requestBody) {
    const bodyVar = paramInfo.bodyParam?.varName || "body";
    fetchOptions.push(`body: JSON.stringify(${bodyVar})`);
  }

  const optionsString = fetchOptions.join(",\n    ");

  return `  async ${methodName}(${parameters}): ${returnType} {
    ${queryStringLine}
    const response = await fetch(${url}, {
      ${optionsString}
    });

    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }

    return await response.json();
  }`;
}

/**
 * Create path url.
 * @param path Input parameter `path`.
 * @param hasPathParams Input parameter `hasPathParams`.
 * @returns Create path url output as `string`.
 * @example
 * ```ts
 * const result = createPathUrl("value", true);
 * // result: string
 * ```
 */
function createPathUrl(path: string, hasPathParams: boolean): string {
  if (!hasPathParams) {
    return `this.buildUrl(\`${path}\`)`;
  }
  const pathWithParams = path.replace(/\{([^}]+)\}/g, "${$1}");
  return `this.buildUrl(\`${pathWithParams}\`)`;
}

/**
 * Create query url.
 * @param path Input parameter `path`.
 * @param hasPathParams Input parameter `hasPathParams`.
 * @returns Create query url output as `string`.
 * @example
 * ```ts
 * const result = createQueryUrl("value", true);
 * // result: string
 * ```
 */
function createQueryUrl(path: string, hasPathParams: boolean): string {
  if (!hasPathParams) {
    return `this.buildUrl(\`${path}\${queryString ? \`?\${queryString}\` : ""}\`)`;
  }
  const pathWithParams = path.replace(/\{([^}]+)\}/g, "${$1}");
  return `this.buildUrl(\`${pathWithParams}\${queryString ? \`?\${queryString}\` : ""}\`)`;
}

/**
 * Generate fetch service.
 * @param methods Input parameter `methods`.
 * @param _modelsPath Input parameter `_modelsPath`.
 * @param usedTypes Input parameter `usedTypes`.
 * @param paramsInterfaces Input parameter `paramsInterfaces`.
 * @returns Generate fetch service output as `string`.
 * @example
 * ```ts
 * const result = generateFetchService([], "value", new Set(), []);
 * // result: string
 * ```
 */
export function generateFetchService(
  methods: string[],
  _modelsPath: string,
  usedTypes: Set<string>,
  paramsInterfaces: string[] = [],
): string {
  let importStatement = "";
  if (usedTypes.size > 0) {
    const importList = Array.from(usedTypes).join(", ");
    const importPath = "../models";
    importStatement = `import { ${importList} } from "${importPath}";\n`;
  }

  const interfacesBlock =
    paramsInterfaces.length > 0 ? `${paramsInterfaces.join("\n\n")}\n\n` : "";

  const serviceTemplate = `// Generated fetch-based HTTP client
import qs from "query-string";
${importStatement}\n${interfacesBlock}\nexport class SauronApiClient {
  private baseUrl = ''; // Configure your base URL

  constructor(baseUrl?: string) {
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

${methods.join("\n\n")}
}

// Export a default instance
export const sauronApi = new SauronApiClient();
`;

  return serviceTemplate;
}
