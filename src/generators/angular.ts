/**
 * Generate angular service.
 * @param methods Input parameter `methods`.
 * @param imports Input parameter `imports`.
 * @param _isAngularProject Input parameter `_isAngularProject`.
 * @param paramsInterfaces Input parameter `paramsInterfaces`.
 * @returns Generate angular service output as `string`.
 * @example
 * ```ts
 * const result = generateAngularService([], [], true, []);
 * // result: string
 * ```
 */
export function generateAngularService(
  methods: string[],
  imports: string[],
  _isAngularProject: boolean,
  paramsInterfaces: string[] = [],
): string {
  const importStatement = buildModelImportStatement(imports);
  const interfacesBlock = buildInterfacesBlock(paramsInterfaces);
  const methodsBlock = methods.join("\n\n");

  const serviceTemplate = `import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

${importStatement}\n${interfacesBlock}\n\n
@Injectable({
  providedIn: "root"
})
export class SauronApiService {
  private readonly httpClient = inject(HttpClient);

${methodsBlock}
}
`;

  return serviceTemplate;
}

/**
 * Build model import statement.
 * @param imports Input parameter `imports`.
 * @returns Build model import statement output as `string`.
 * @example
 * ```ts
 * const result = buildModelImportStatement([]);
 * // result: string
 * ```
 */
function buildModelImportStatement(imports: string[]): string {
  if (imports.length === 0) {
    return "";
  }
  const importList = imports.join(", ");
  const importPath = "../models";
  return `import { ${importList} } from "${importPath}";\n`;
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
  return `${paramsInterfaces.join("\n\n")}\n\n`;
}
