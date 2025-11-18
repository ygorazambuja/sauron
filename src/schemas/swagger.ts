import { z } from "zod";

// --- 1. Schemas de Nível Mais Baixo (Responses, Methods) ---

/**
 * Representa o Response Object (OpenAPI 3.0)
 * Foca apenas na descrição, que é obrigatória.
 */
const ResponseSchema = z
	.object({
		description: z.string().min(1, "A descrição da resposta é obrigatória."),
		// Campos como 'content' e 'headers' seriam adicionados aqui
	})
	.passthrough();

/**
 * Representa o Operation Object (OpenAPI 3.0), como 'get', 'post', etc.
 * Foca em 'responses' que é obrigatório.
 */
const HttpMethodSchema = z
	.object({
		tags: z.array(z.string()).optional(),
		responses: z.record(
			z
				.string()
				.regex(/^(\d{3}|default)$/), // Chave é o código de status HTTP (ex: "200") ou "default" para Swagger 2.0
			ResponseSchema,
		),
		// Campos como 'parameters' e 'requestBody' seriam opcionais aqui
	})
	.passthrough();

/**
 * Representa o Path Item Object (OpenAPI 3.0)
 * Contém os métodos HTTP permitidos para um único caminho (path).
 */
const PathItemSchema = z
	.object({
		get: HttpMethodSchema.optional(),
		post: HttpMethodSchema.optional(),
		put: HttpMethodSchema.optional(),
		delete: HttpMethodSchema.optional(),
		// Adicione outros métodos se necessário, como head, patch, etc.
	})
	.partial(); // Usamos .partial() para que os métodos sejam opcionais no Path Item

// --- 2. Schemas de Nível Superior (Info, Paths) ---

/**
 * Representa o Info Object (OpenAPI 3.0)
 * Requer 'title' e 'version'.
 */
const InfoSchema = z
	.object({
		title: z.string().min(1, "O título da API é obrigatório."),
		version: z.string().min(1, "A versão da API é obrigatória."),
		// Campos como 'description' e 'license' seriam opcionais
	})
	.passthrough();

/**
 * Representa o Paths Object (OpenAPI 3.0)
 * É um mapa (record) onde a chave é o path e o valor é o PathItemSchema.
 */
export const PathsSchema = z.record(
	z
		.string()
		.startsWith("/"), // A chave deve ser uma string de path (ex: "/users")
	PathItemSchema,
);

export const ComponentsSchema = z
	.object({
		schemas: z.record(z.string(), z.any()), // Onde os DTOs reais seriam validados
		securitySchemes: z.record(z.string(), z.any()).optional(),
		// Simplificado. Adicione mais componentes se precisar de validação rigorosa.
	})
	.passthrough();

// --- 3. Schemas Raiz (OpenAPI e Swagger Objects) ---

/**
 * Representa o Objeto Swagger 2.0 Raiz (swagger.json)
 * Valida os campos obrigatórios e essenciais para Swagger 2.0.
 */
export const SwaggerBasicSchema = z
	.object({
		swagger: z.string().startsWith("2.0", "Deve ser uma versão Swagger 2.0."), // Garante a versão 2.0
		info: InfoSchema,
		host: z.string().optional(),
		basePath: z.string().optional(),
		schemes: z.array(z.string()).optional(),
		consumes: z.array(z.string()).optional(),
		produces: z.array(z.string()).optional(),
		paths: PathsSchema,
		definitions: z.record(z.string(), z.any()).optional(), // Swagger 2.0 usa 'definitions' em vez de 'components.schemas'
		parameters: z.record(z.string(), z.any()).optional(),
		responses: z.record(z.string(), z.any()).optional(),
		securityDefinitions: z.record(z.string(), z.any()).optional(),
		security: z.array(z.any()).optional(),
		tags: z.array(z.object({
			name: z.string(),
			description: z.string().optional(),
			externalDocs: z.any().optional(),
		})).optional(),
		externalDocs: z.any().optional(),
		// Outros campos opcionais do Swagger 2.0
	})
	.passthrough();

/**
 * Representa o Objeto OpenAPI 3.0+ Raiz (swagger.json)
 * Valida os campos obrigatórios e essenciais.
 */
export const OpenAPIBasicSchema = z
	.object({
		openapi: z.string().startsWith("3.0", "Deve ser uma versão OpenAPI 3.x.x."), // Garante a versão 3.x.x
		info: InfoSchema,
		paths: PathsSchema,
		components: ComponentsSchema.optional(),
		// components: ... Adicione a validação dos componentes se necessário
		// security: ...
	})
	.passthrough();

/**
 * Union schema que aceita tanto OpenAPI 3.0+ quanto Swagger 2.0
 */
export const SwaggerOrOpenAPISchema = z.union([
	OpenAPIBasicSchema,
	SwaggerBasicSchema,
]);
