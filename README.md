# OpenAPI to TypeScript Converter

Este projeto converte automaticamente schemas OpenAPI/Swagger JSON em definições TypeScript (interfaces e tipos).

## Funcionalidades

- ✅ **Interfaces TypeScript**: Converte objetos OpenAPI em interfaces TypeScript
- ✅ **Tipos Union**: Converte enums OpenAPI em tipos union TypeScript
- ✅ **Tipos Primitivos**: Suporte completo a string, number, boolean, integer
- ✅ **Arrays**: Suporte a arrays com tipagem correta
- ✅ **Propriedades Nullable**: Converte `nullable: true` para `| null`
- ✅ **Referências ($ref)**: Resolve referências entre schemas
- ✅ **Datas**: Converte `format: "date-time"` para tipo `Date`
- ✅ **Propriedades Obrigatórias**: Todas as propriedades definidas são obrigatórias por padrão
- ✅ **Plugin system para geradores**: Plugins built-in `fetch`, `angular`, `axios` e `mcp`
- ✅ **Seleção explícita de plugin**: `--plugin <id>` (aceita múltiplos)
- ✅ **Compatibilidade retroativa**: `--http` e `--angular` continuam funcionando como aliases
- ✅ **Relatório de definições ausentes**: Cada plugin HTTP gera relatório com os pontos que viraram `any`

## Como Usar

### Opção 1: Binário Compilado (Recomendado)

Após compilar o projeto, você pode usar o binário executável diretamente:

```bash
# Compilar o projeto
bun build --compile ./src/index.ts --outfile sauron

# Usar o binário
./sauron --input swaggerAfEstoque.json --angular --http
```

### Opção 2: Desenvolvimento com Bun

```bash
# Instalar dependências
bun install

# Criar arquivo de configuração inicial
bun run cli -- init

# Executar diretamente
bun run src/index.ts

# Ou usar o CLI wrapper
bun run cli --input swaggerAfEstoque.json --angular
```

### Executar Testes

```bash
# Executar todos os testes
bun test

# Executar testes em modo watch
bun test --watch

# Executar com cobertura
bun test --coverage
```

O comando irá:

1. Ler o arquivo OpenAPI/Swagger especificado
2. Validar o schema OpenAPI
3. **Por padrão**: Gerar apenas interfaces TypeScript (models)
4. **Com `--http`**: Gerar também métodos HTTP (fetch por padrão)
5. **Com `--angular --http`**: Detectar projeto Angular e gerar serviço Angular
6. **Com `--plugin <id>`**: Escolher explicitamente o plugin (`fetch`, `angular`, `axios`, `mcp`)
7. **Com `--plugin angular` fora de projeto Angular**: fallback automático para `fetch`
8. Salvar nos diretórios apropriados (`outputs/` ou `src/app/sauron/`)
9. Gerar relatório de definições ausentes ao lado do cliente/serviço HTTP gerado

### Flags Disponíveis

- **`init`**: Cria `sauron.config.ts` com configurações iniciais
- **Sem flags**: Apenas models TypeScript
- **`--http`**: Models + métodos HTTP com plugin padrão (`fetch`)
- **`--angular --http`**: Models + serviço Angular (alias compatível)
- **`--plugin <id>`**: Seleciona plugin explicitamente (`fetch`, `angular`, `axios`, `mcp`)
- **`--input arquivo.json`**: Especificar arquivo de entrada
- **`--output diretorio`**: Diretório de saída customizado
- **`--config arquivo.ts`**: Caminho para arquivo de configuração (padrão: `sauron.config.ts`)

Regras de precedência:

- Se `--plugin` for informado, ele tem prioridade sobre `--http` e `--angular`.
- Se `--plugin` não for informado, `--http` usa `fetch`.
- Se `--plugin` não for informado, `--http --angular` usa `angular`.

### Arquivo de Configuração (`sauron.config.ts`)

Você pode centralizar as opções do CLI em um arquivo:

```ts
import type { SauronConfig } from "@ygorazambuja/sauron";

export default {
  input: "swagger.json",
  // url: "https://api.exemplo.com/openapi.json",
  // plugin: ["fetch"], // fetch | angular | axios | mcp
  output: "outputs",
  angular: false,
  http: true,
} satisfies SauronConfig;
```

As flags da CLI têm prioridade sobre os valores do arquivo de configuração.

### Uso Programático

```typescript
import {
  readJsonFile,
  verifySwaggerComposition,
  createModels,
} from "./src/utils";

// 1. Ler arquivo JSON
const swaggerData = await readJsonFile("swagger.json");

// 2. Validar schema
const validatedSchema = verifySwaggerComposition(swaggerData);

// 3. Gerar definições TypeScript
const typeDefinitions = createModels(validatedSchema);

// Resultado: array de strings com definições TypeScript
console.log(typeDefinitions);
```

## Estrutura dos Arquivos

```
src/
├── index.ts           # Ponto de entrada principal
├── utils/
│   └── index.ts       # Funções utilitárias de conversão
└── schemas/
    └── swagger.ts     # Schema Zod para validação OpenAPI

outputs/
├── models/
│   └── index.ts                            # Arquivo gerado com tipos TypeScript
└── http-client/                            # Quando plugin fetch/axios
    ├── sauron-api.client.ts               # Cliente fetch (plugin fetch)
    ├── sauron-api.axios-client.ts         # Cliente axios (plugin axios)
    ├── missing-swagger-definitions.json   # Relatório (plugin fetch)
    ├── type-coverage-report.json          # Cobertura de tipos (plugin fetch)
    ├── missing-swagger-definitions.axios.json # Relatório (plugin axios)
    └── type-coverage-report.axios.json    # Cobertura de tipos (plugin axios)

outputs/
└── mcp/                                    # Quando plugin mcp
    ├── index.ts                            # Entrypoint do servidor MCP (STDIO)
    ├── server.ts                           # Factory do servidor MCP
    ├── client/
    │   └── api.client.ts                   # Cliente HTTP base com auth
    ├── tools/
    │   └── *.tool.ts                       # Uma tool por recurso
    ├── types/
    │   └── *.types.ts                      # Tipos de input/action por recurso
    ├── schemas/
    │   └── *.schema.ts                     # JSON Schema por recurso
    ├── mcp-tools-report.json               # Inventário de tools/actions geradas
    └── README.md                           # Guia do output MCP gerado

src/app/sauron/
├── models/
│   └── index.ts                            # Arquivo gerado com tipos TypeScript
└── angular-http-client/                    # Quando --angular --http
    ├── sauron-api.service.ts              # Serviço Angular
    ├── missing-swagger-definitions.json   # Relatório de definições ausentes
    └── type-coverage-report.json          # Cobertura de tipos
```

## Exemplo de Saída

**Schema OpenAPI:**

```json
{
  "MesValorIndexadorDto": {
    "type": "object",
    "properties": {
      "dominioMesID": { "type": "integer" },
      "valor": { "type": "number" }
    }
  }
}
```

**Resultado TypeScript:**

```typescript
export interface MesValorIndexadorDto {
  dominioMesID: number;
  valor: number;
}
```

## API Reference

### `readJsonFile(filePath: string): Promise<unknown>`

Lê e faz parse de um arquivo JSON do sistema de arquivos.

**Parâmetros:**

- `filePath`: Caminho para o arquivo JSON

**Retorna:** Conteúdo JSON parseado

### `verifySwaggerComposition(swaggerData: Record<string, unknown>)`

Valida dados OpenAPI/Swagger contra o schema esperado.

**Parâmetros:**

- `swaggerData`: Dados brutos do OpenAPI JSON

**Retorna:** Schema validado e tipado

**Lança:** Error se a validação falhar

### `createModels(openApiSchema): string[]`

Gera definições TypeScript a partir de schemas OpenAPI.

**Parâmetros:**

- `openApiSchema`: Schema OpenAPI validado

**Retorna:** Array de strings com definições TypeScript

## Regras de Conversão

### Propriedades Obrigatórias vs Opcionais

- **Por padrão**: Todas as propriedades definidas no schema são obrigatórias
- **Se houver lista `required`**: Apenas propriedades na lista são obrigatórias
- **Nullable**: Propriedades com `nullable: true` recebem `| null`

### Tipos Suportados

| OpenAPI                              | TypeScript |
| ------------------------------------ | ---------- | --- | --- |
| `string`                             | `string`   |
| `integer`                            | `number`   |
| `number`                             | `number`   |
| `boolean`                            | `boolean`  |
| `string` + `format: "date-time"`     | `Date`     |
| `array` + `items`                    | `T[]`      |
| `enum: [1, 2, 3]`                    | `1         | 2   | 3`  |
| `$ref: "#/components/schemas/Model"` | `Model`    |

## Desenvolvimento

### Executar Testes

```bash
bun run src/index.ts
```

### Modificar Schemas

Os schemas de validação estão em `src/schemas/swagger.ts`. Eles usam a biblioteca Zod para validação robusta.

### Adicionar Novos Conversores

Para adicionar suporte a novos tipos OpenAPI, modifique a função `convertSchemaToTypeScript` em `src/utils/index.ts`.

## Serviço Angular Gerado

Além dos tipos TypeScript, o projeto também gera um serviço Angular completo com métodos HTTP Client para todas as rotas da API.

### Características do Serviço Gerado

- ✅ **HttpClient injection**: Usa o novo sistema de injeção do Angular
- ✅ **Métodos tipados**: Cada método tem assinatura correta de parâmetros
- ✅ **Tipos de resposta**: Retorna `Observable<T>` com tipos específicos (quando definido no schema)
- ✅ **Observables**: Retorna `Observable<any>` quando tipo não é especificado
- ✅ **Parâmetros de path**: Suporte a parâmetros na URL (`/users/{id}`)
- ✅ **Query parameters**: Suporte a parâmetros de query
- ✅ **Request body**: Suporte a POST/PUT/PATCH com body
- ✅ **Nomes únicos**: Evita conflitos de nomes entre métodos
- ✅ **Imports automáticos**: Importa apenas os tipos utilizados

### Exemplo de Serviço Gerado

```typescript
import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { LaboratorioDtoResultPaginateFilterDto, LaboratorioDto } from "../models";

@Injectable({
  providedIn: "root"
})
export class SauronApiService {
  private readonly httpClient = inject(HttpClient);

  // Padrão: Get{Resource}{Modifier}

  // Retorna Observable<any> quando não há schema definido
  GetApiGenerica(): Observable<any> {
    return this.httpClient.get("/api/ApiGenerica/credorDivida");
  }

  // Retorna tipo específico quando schema está definido
  GetLaboratorioWithParams(Nome?: any, AlteracaoCadastro?: any, Pagina?: any, TamanhoDaPagina?: any, Ordenacao?: any, TipoOrdenacao?: any): Observable<LaboratorioDtoResultPaginateFilterDto> {
    return this.httpClient.get("/api/Laboratorio/ListarTodos", { params: { Nome, AlteracaoCadastro, Pagina, TamanhoDaPagina, Ordenacao, TipoOrdenacao } });
  }

  // Retorna objeto único
  GetLaboratorioById(id: any): Observable<LaboratorioDto> {
    return this.httpClient.get(\`/api/Laboratorio/\${id}\`);
  }

  // Operações CREATE/UPDATE/DELETE
  PostLaboratorioCreate(body: any): Observable<LaboratorioDto> {
    return this.httpClient.post("/api/Laboratorio/Incluir", body);
  }

  PutLaboratorioCreate(body: any): Observable<any> {
    return this.httpClient.put("/api/Laboratorio/Alterar", body);
  }

  DeleteLaboratorio(id?: any): Observable<any> {
    return this.httpClient.delete("/api/Laboratorio/Excluir", { params: { id } });
  }

  // ... mais métodos
}
```

## Tipos de Saída

### Apenas Models (Padrão)

```bash
sauron swagger.json
```

Gera apenas interfaces TypeScript em `outputs/models/`.

### Cliente Fetch (Vanilla JS/TS)

```bash
sauron swagger.json --http
```

Gera models + cliente fetch-based em `outputs/http-client/sauron-api.client.ts`.
Também gera `outputs/http-client/missing-swagger-definitions.json`.

```typescript
// Exemplo de uso
import { SauronApiClient } from "./outputs/http-client/sauron-api.client";
import type {
  LaboratorioDto,
  LaboratorioDtoResultPaginateFilterDto,
} from "./outputs/models";

// Criar instância com base URL
const api = new SauronApiClient("https://api.exemplo.com");

// Usar métodos assíncronos com tipos específicos
try {
  const laboratorios: LaboratorioDtoResultPaginateFilterDto =
    await api.GetLaboratorioWithParams("search", 1, 10);
  console.log("Resultados:", laboratorios);

  const laboratorio: LaboratorioDto = await api.GetLaboratorioById(123);
  console.log("Laboratório específico:", laboratorio);
} catch (error) {
  console.error("Erro na API:", error);
}
```

Ou usar a instância padrão:

```typescript
import { sauronApi } from "./outputs/http-client/sauron-api.client";

// Configura uma única vez para todas as chamadas
sauronApi.setBaseUrl("https://api.exemplo.com");

const result = await sauronApi.GetLaboratorioWithParams("search", 1, 10);
```

### Cliente Axios

```bash
sauron swagger.json --plugin axios
```

Gera models + cliente axios em `outputs/http-client/sauron-api.axios-client.ts`.
Também gera `outputs/http-client/missing-swagger-definitions.axios.json`.

```typescript
import { SauronAxiosApiClient } from "./outputs/http-client/sauron-api.axios-client";

const api = new SauronAxiosApiClient("https://api.exemplo.com");
const result = await api.GetLaboratorioWithParams("search", 1, 10);
console.log(result);
```

### Servidor MCP (STDIO)

```bash
sauron swagger.json --plugin mcp
```

Gera models + servidor MCP em `outputs/mcp/index.ts`.
Também gera `outputs/mcp/mcp-tools-report.json`.

Variáveis de ambiente suportadas no servidor gerado:

- `API_BASE_URL` (obrigatória)
- `API_TOKEN` (opcional, Bearer token)
- `API_KEY` (opcional, API Key)
- `API_KEY_HEADER` (opcional, default `x-api-key`)

Execução:

```bash
bun run ./outputs/mcp/index.ts
```

### Serviço Angular

```bash
sauron swagger.json --angular --http
```

Gera models + serviço Angular em `src/app/sauron/angular-http-client/sauron-api.service.ts`.
Também gera `src/app/sauron/angular-http-client/missing-swagger-definitions.json`.

```typescript
// Exemplo de uso
import { SauronApiService } from './src/app/sauron/angular-http-client/sauron-api.service';

constructor(private api: SauronApiService) {}

loadData() {
  this.api.GetLaboratorioWithParams('search', 1, 10)
    .subscribe(result => console.log(result));
}
```

### Como Usar o Serviço Gerado

```typescript
import { Component, inject } from '@angular/core';
import { SauronApiService } from './outputs/angular-http-client/sauron-api.service';
import { LaboratorioDtoResultPaginateFilterDto } from './outputs/models';

@Component({...})
export class MyComponent {
  private readonly api = inject(SauronApiService);

  // Com tipos específicos - IntelliSense e type safety
  loadLaboratorios() {
    this.api.GetLaboratorioWithParams(
      'search term',
      undefined, // AlteracaoCadastro
      1,         // Pagina
      10,        // TamanhoDaPagina
      'Nome',    // Ordenacao
      'asc'      // TipoOrdenacao
    ).subscribe((response: LaboratorioDtoResultPaginateFilterDto) => {
      // response.dados é tipado como LaboratorioDto[]
      // response.totalRegistros é tipado como number
      console.log('Total:', response.totalRegistros);
      console.log('Dados:', response.dados);
    });
  }

  // Buscar laboratório específico
  getLaboratorio(id: number) {
    this.api.GetLaboratorioById(id).subscribe(lab => {
      console.log('Laboratório:', lab);
    });
  }

  // Criar novo laboratório
  createLaboratorio(labData: any) {
    this.api.PostLaboratorioCreate(labData).subscribe(result => {
      console.log('Criado:', result);
    });
  }

  // Sem tipos específicos - ainda funciona
  loadGenericData() {
    this.api.GetApiGenerica().subscribe((data: any) => {
      console.log(data);
    });
  }
}
```

## Relatório de Definições Ausentes

Quando há geração HTTP, o CLI gera automaticamente um relatório ao lado do cliente/serviço.

Arquivos atuais:

- `missing-swagger-definitions.json` (plugin `fetch` e `angular`)
- `missing-swagger-definitions.axios.json` (plugin `axios`)
- `type-coverage-report.json` (plugin `fetch` e `angular`)
- `type-coverage-report.axios.json` (plugin `axios`)

Esse relatório lista os pontos da especificação Swagger/OpenAPI que resultaram em `any` na
camada HTTP gerada, para facilitar correções no contrato da API.

## Relatório de Cobertura de Tipos

Quando há geração HTTP, o CLI também gera um relatório de cobertura de tipos por operação.

Esse relatório mostra:

- Cobertura total de tipagem (`typed` vs `untyped`)
- Cobertura por localização (`path.parameter`, `query.parameter`, `request.body`, `response.body`)
- Resumo por operação (rota + método)
- Lista de ocorrências não tipadas em `issues`

### Estrutura do arquivo

- `generatedAt`: data/hora de geração (ISO string)
- `totalIssues`: total de ocorrências encontradas
- `summary.pathParameters`: total de problemas em parâmetros de path
- `summary.queryParameters`: total de problemas em parâmetros de query
- `summary.requestBodies`: total de problemas em corpos de requisição
- `summary.responseBodies`: total de problemas em corpos de resposta
- `issues`: lista detalhada de ocorrências

### Exemplo de item em `issues`

```json
{
  "path": "/api/users/{id}",
  "method": "GET",
  "location": "path.parameter",
  "field": "id",
  "reason": "Path parameter schema is missing or unresolved.",
  "recommendedDefinition": "Define parameter.schema with a primitive type, enum, object, array, or valid $ref."
}
```

## Sistema de Plugins

Plugins built-in:

- `fetch`
- `angular`
- `axios`
- `mcp`

Exemplos:

```bash
sauron swagger.json --plugin fetch
sauron swagger.json --plugin angular
sauron swagger.json --plugin axios
sauron swagger.json --plugin mcp
```

Para criar novos plugins, veja `docs/plugins.md`.

## Distribuição

### Binário Executável

O projeto pode ser compilado em um único arquivo executável que roda em qualquer sistema com suporte ao Bun runtime:

```bash
# Compilar
bun build --compile ./src/index.ts --outfile sauron

# O arquivo 'sauron' pode ser distribuído e executado diretamente
./sauron --input api.json --angular
```

### Publicação no NPM com Bun

Para validar e publicar no registro npm usando Bun:

```bash
bun publish --dry-run
bun publish --access public
```

Então outros projetos podem instalar e usar:

```bash
npm install -g @ygorazambuja/sauron
sauron --input swagger.json --angular
```

## Limitações

- Não suporta todos os recursos avançados do OpenAPI 3.x
- Focado principalmente em schemas de componentes
- Não gera validações em runtime (apenas tipos TypeScript)

## Licença

Este projeto é parte do sistema Sauron para conversão de APIs.
