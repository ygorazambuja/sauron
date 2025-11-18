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
4. **Com `--http`**: Gerar também métodos HTTP (Angular ou fetch)
5. **Com `--angular --http`**: Detectar projeto Angular e gerar serviço Angular
6. **Com `--http` (sem Angular)**: Gerar cliente fetch-based
7. Salvar nos diretórios apropriados (`outputs/` ou `src/app/sauron/`)

### Flags Disponíveis

- **Sem flags**: Apenas models TypeScript
- **`--http`**: Models + métodos HTTP (fetch-based por padrão)
- **`--angular --http`**: Models + serviço Angular (requer projeto Angular)
- **`--input arquivo.json`**: Especificar arquivo de entrada
- **`--output diretorio`**: Diretório de saída customizado

### Uso Programático

```typescript
import { readJsonFile, verifySwaggerComposition, createModels } from './src/utils';

// 1. Ler arquivo JSON
const swaggerData = await readJsonFile('swagger.json');

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
└── models/
    └── index.ts       # Arquivo gerado com tipos TypeScript
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

| OpenAPI | TypeScript |
|---------|------------|
| `string` | `string` |
| `integer` | `number` |
| `number` | `number` |
| `boolean` | `boolean` |
| `string` + `format: "date-time"` | `Date` |
| `array` + `items` | `T[]` |
| `enum: [1, 2, 3]` | `1 | 2 | 3` |
| `$ref: "#/components/schemas/Model"` | `Model` |

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

```typescript
// Exemplo de uso
import { SauronApiClient } from './outputs/http-client/sauron-api.client';
import type { LaboratorioDto, LaboratorioDtoResultPaginateFilterDto } from './outputs/models';

// Criar instância com base URL
const api = new SauronApiClient('https://api.exemplo.com');

// Usar métodos assíncronos com tipos específicos
try {
  const laboratorios: LaboratorioDtoResultPaginateFilterDto = await api.GetLaboratorioWithParams('search', 1, 10);
  console.log('Resultados:', laboratorios);

  const laboratorio: LaboratorioDto = await api.GetLaboratorioById(123);
  console.log('Laboratório específico:', laboratorio);
} catch (error) {
  console.error('Erro na API:', error);
}
```

Ou usar a instância padrão:

```typescript
import { sauronApi } from './outputs/http-client/sauron-api.client';

const result = await sauronApi.GetLaboratorioWithParams('search', 1, 10);
```

### Serviço Angular

```bash
sauron swagger.json --angular --http
```

Gera models + serviço Angular em `src/app/sauron/angular-http-client/sauron-api.service.ts`.

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

## Distribuição

### Binário Executável

O projeto pode ser compilado em um único arquivo executável que roda em qualquer sistema com suporte ao Bun runtime:

```bash
# Compilar
bun build --compile ./src/index.ts --outfile sauron

# O arquivo 'sauron' pode ser distribuído e executado diretamente
./sauron --input api.json --angular
```

### NPM Package (Futuro)

Para distribuição via NPM:

```bash
npm publish
```

Então outros projetos podem instalar e usar:

```bash
npm install -g sauron
sauron --input swagger.json --angular
```

## Limitações

- Não suporta todos os recursos avançados do OpenAPI 3.x
- Focado principalmente em schemas de componentes
- Não gera validações em runtime (apenas tipos TypeScript)

## Licença

Este projeto é parte do sistema Sauron para conversão de APIs.
# sauron
# sauron
