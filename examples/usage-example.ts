/**
 * Exemplos de uso das funções de conversão OpenAPI → TypeScript
 *
 * Este arquivo demonstra como usar as funções utilitárias para
 * converter schemas OpenAPI em definições TypeScript.
 */

import {
	createModels,
	readJsonFile,
	verifySwaggerComposition,
} from "../src/utils";

/**
 * Exemplo 1: Conversão básica de um arquivo Swagger
 */
async function basicConversion() {
	try {
		// 1. Ler arquivo JSON
		const swaggerData = await readJsonFile("swaggerCreditos.json");

		// 2. Validar schema OpenAPI
		const validatedSchema = verifySwaggerComposition(swaggerData);

		// 3. Gerar definições TypeScript
		const typeDefinitions = createModels(validatedSchema);

		// 4. Usar as definições geradas
		console.log("Generated TypeScript definitions:");
		console.log(typeDefinitions.join("\n\n"));
	} catch (error) {
		console.error("Error during conversion:", error);
	}
}

/**
 * Exemplo 2: Trabalhar com schemas individuais
 */
function individualSchemaConversion() {
	// Schema OpenAPI de exemplo
	const _exampleSchema = {
		type: "object",
		properties: {
			id: { type: "integer" },
			name: { type: "string", nullable: true },
			email: { type: "string", format: "email" },
			createdAt: { type: "string", format: "date-time" },
			tags: {
				type: "array",
				items: { type: "string" },
			},
			status: {
				type: "string",
				enum: ["active", "inactive", "pending"],
			},
		},
		required: ["id", "email"], // Apenas id e email são obrigatórios
	};

	// Simular conversão (em um cenário real, isso viria da função createModels)
	const expectedOutput = `
export interface ExampleModel {
  id: number;                    // obrigatório (está em required)
  name?: string | null;          // opcional + nullable
  email: string;                 // obrigatório (está em required)
  createdAt: Date;               // obrigatório (definido no schema)
  tags: string[];                // obrigatório (definido no schema)
  status: "active" | "inactive" | "pending"; // obrigatório (definido no schema)
}`;

	console.log("Expected TypeScript output:");
	console.log(expectedOutput);
}

/**
 * Exemplo 3: Tratamento de erros
 */
async function errorHandlingExample() {
	try {
		// Tentar ler arquivo inexistente
		await readJsonFile("non-existent-file.json");
	} catch (error) {
		console.log("Erro esperado:", error.message);
	}

	try {
		// Tentar validar schema inválido
		verifySwaggerComposition({ invalid: "schema" });
	} catch (error) {
		console.log("Erro esperado:", error.message);
	}
}

// Executar exemplos
if (require.main === module) {
	console.log("=== Basic Conversion Example ===");
	basicConversion();

	console.log("\n=== Individual Schema Example ===");
	individualSchemaConversion();

	console.log("\n=== Error Handling Example ===");
	errorHandlingExample();
}
