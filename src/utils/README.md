# OpenAPI to TypeScript Converter - Tests

Este documento descreve os testes implementados para as funções utilitárias de conversão OpenAPI → TypeScript.

## Como Executar os Testes

```bash
# Executar todos os testes
bun test

# Executar testes em modo watch (re-executa automaticamente quando arquivos mudam)
bun test --watch

# Executar testes com cobertura
bun test --coverage
```

## Estrutura dos Testes

### `readJsonFile`

Testa a função de leitura de arquivos JSON:

- ✅ **Leitura de JSON válido**: Verifica se arquivos JSON válidos são lidos e parseados corretamente
- ✅ **Arquivo inexistente**: Testa tratamento de erro para arquivos que não existem
- ✅ **JSON inválido**: Verifica se erros de parsing JSON são tratados adequadamente
- ✅ **Caminho vazio**: Valida entrada de parâmetros (caminho vazio)
- ✅ **Tipo inválido**: Testa validação de tipo do parâmetro (não-string)

### `verifySwaggerComposition`

Testa a validação de schemas OpenAPI:

- ✅ **Schema válido**: Verifica se schemas OpenAPI corretos são validados com sucesso
- ✅ **Campos obrigatórios ausentes**: Testa validação de campos obrigatórios (openapi, info, paths)
- ✅ **Versão inválida**: Verifica validação da versão OpenAPI (deve ser 3.x.x)
- ✅ **Entrada não-objeto**: Testa validação de tipo de entrada

### `createModels`

Testa a geração de definições TypeScript:

- ✅ **Schemas básicos**: Testa geração de interfaces e tipos a partir de schemas simples
- ✅ **Arrays e referências**: Verifica tratamento de arrays com referências ($ref)
- ✅ **Campos obrigatórios**: Testa lógica de propriedades obrigatórias vs opcionais
- ✅ **Conversão date-time**: Verifica conversão de `format: "date-time"` para `Date`
- ✅ **Enums numéricos**: Testa conversão de enums com valores numéricos
- ✅ **Schemas vazios**: Verifica tratamento graceful de componentes sem schemas
- ✅ **Tipos não suportados**: Testa fallback para tipos não reconhecidos

### Testes de Integração Complexa

- ✅ **Especificação OpenAPI completa**: Testa cenário real com múltiplas interfaces, enums, arrays e referências

## Cobertura de Cenários

Os testes cobrem todos os principais cenários de uso:

### Tipos Primitivos
- `string` → `string`
- `integer` → `number`
- `number` → `number`
- `boolean` → `boolean`

### Tipos Especiais
- `string` + `format: "date-time"` → `Date`
- `nullable: true` → `| null`

### Estruturas Complexas
- Arrays: `type: "array"` + `items` → `T[]`
- Referências: `$ref: "#/components/schemas/Model"` → `Model`
- Enums: `enum: [...]` → `"value1" | "value2" | ...`

### Propriedades
- **Obrigatórias**: Propriedades definidas no schema (sem `required` explícito)
- **Explicitamente obrigatórias**: Propriedades listadas em `required`
- **Opcionais**: Propriedades não listadas em `required` (quando array existe)

## Arquivos de Teste

- `src/utils/index.test.ts`: Arquivo principal com todos os testes
- `package.json`: Configurado com scripts de teste do Bun

## Convenções de Teste

- **Descrição clara**: Cada teste tem uma descrição que explica o que está sendo testado
- **Casos edge**: Testes incluem casos normais e casos de erro
- **Validações completas**: Testes verificam tanto o sucesso quanto o tratamento de erros
- **Mocks e fixtures**: Uso de dados de teste realistas baseados em especificações OpenAPI

## Executando Testes Específicos

```bash
# Executar apenas testes de readJsonFile
bun test --grep "readJsonFile"

# Executar apenas testes de validação
bun test --grep "verifySwaggerComposition"

# Executar apenas testes de geração
bun test --grep "createModels"
```
