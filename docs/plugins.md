# Plugin Development Guide

Este guia descreve como criar um novo plugin HTTP no Sauron.

## Visao geral

O plugin system atual cobre geracao HTTP. O fluxo principal esta em:

- `src/plugins/types.ts`
- `src/plugins/registry.ts`
- `src/plugins/runner.ts`
- `src/plugins/builtin/`

O `main` gera models no core e delega clientes HTTP ao `runHttpPlugins`.

## Contrato do plugin

Todo plugin deve implementar `SauronPlugin` (em `src/plugins/types.ts`):

- `id: string`
- `aliases?: string[]`
- `kind: "http-client"`
- `canRun(context): { ok: true } | { ok: false; reason: string; fallbackPluginId?: string }`
- `resolveOutputs(context): { servicePath: string; reportPath: string }`
- `generate(context): Promise<{ files: Array<{ path: string; content: string }>; methodCount: number }>`

`PluginContext` oferece os dados necessarios:

- schema OpenAPI validado (`schema`)
- tipos derivados por operacao (`operationTypes`, `typeNameMap`)
- opcoes resolvidas (`options`)
- caminhos de saida (`baseOutputPath`, `modelsPath`)
- cabecalho padrao (`fileHeader`)
- status de projeto Angular (`isAngularProject`)
- escritor formatado (`writeFormattedFile`)

## Passo a passo para criar um plugin

1. Criar arquivo em `src/plugins/builtin/<nome>.ts`.
2. Implementar `create<Nome>Plugin(): SauronPlugin`.
3. Definir `canRun`.
4. Definir `resolveOutputs` com paths estaveis do plugin.
5. Definir `generate` para retornar todos os arquivos do plugin.
6. Incluir relatorio de definicoes ausentes no `generate`.
7. Registrar plugin em `src/plugins/registry.ts`.
8. Atualizar ajuda de CLI em `src/cli/args.ts` (opcoes de `--plugin`).
9. Adicionar/atualizar testes de registry e main.

## Template minimo

```ts
import { join } from "node:path";
import {
	createMissingSwaggerDefinitionsReport,
	generateMissingSwaggerDefinitionsFile,
} from "../../generators/missing-definitions";
import type {
	PluginCanRunResult,
	PluginContext,
	PluginGenerateResult,
	PluginOutputPaths,
	SauronPlugin,
} from "../types";

export function createExamplePlugin(): SauronPlugin {
	return {
		id: "example",
		aliases: ["ex"],
		kind: "http-client",
		canRun,
		resolveOutputs,
		generate,
	};
}

function canRun(_context: PluginContext): PluginCanRunResult {
	return { ok: true };
}

function resolveOutputs(context: PluginContext): PluginOutputPaths {
	const serviceDirectory = join(context.baseOutputPath, "http-client");
	return {
		servicePath: join(serviceDirectory, "sauron-api.example-client.ts"),
		reportPath: join(serviceDirectory, "missing-swagger-definitions.example.json"),
	};
}

async function generate(context: PluginContext): Promise<PluginGenerateResult> {
	const serviceSource = `export class ExampleClient {}`;
	const outputPaths = resolveOutputs(context);

	const missingDefinitionsReport = createMissingSwaggerDefinitionsReport(
		context.schema,
		context.operationTypes,
	);
	const reportFileContent = generateMissingSwaggerDefinitionsFile(
		missingDefinitionsReport,
	);

	return {
		files: [
			{
				path: outputPaths.servicePath,
				content: `${context.fileHeader}\n${serviceSource}`,
			},
			{
				path: outputPaths.reportPath,
				content: reportFileContent,
			},
		],
		methodCount: 0,
	};
}
```

## Registro do plugin

Em `src/plugins/registry.ts`:

1. Importar `createExamplePlugin`.
2. Adicionar o id em `BUILTIN_PLUGIN_IDS`.
3. Incluir instancia no `createDefaultPluginRegistry`.

## Fallbacks

Use fallback quando o plugin nao puder rodar no contexto atual.

Exemplo (plugin angular):

- `canRun` retorna `{ ok: false, reason: "...", fallbackPluginId: "fetch" }`
- runner resolve automaticamente o fallback

## Testes recomendados

- `src/plugins/registry.spec.ts`
- `src/plugins/runner.spec.ts`
- `src/cli/main.spec.ts`

Cenarios minimos:

- resolve por `id`
- resolve por `alias`
- erro para plugin desconhecido
- geracao de arquivo do novo plugin
- fallback (se aplicavel)
- compatibilidade com aliases de CLI (`--http`, `--angular`)

## Boas praticas

- Reaproveitar geradores existentes sempre que possivel.
- Manter o plugin focado em uma responsabilidade (geracao HTTP).
- Gerar caminho de output previsivel e estavel.
- Incluir o relatorio de definicoes ausentes em todos os plugins HTTP.
- Evitar quebrar comportamento legado sem migracao clara.
