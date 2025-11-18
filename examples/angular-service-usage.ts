/**
 * Exemplo de uso do serviço Angular gerado automaticamente
 *
 * Este arquivo demonstra como usar o SauronApiService gerado
 * a partir do OpenAPI/Swagger specification.
 */

import { Component, inject } from "@angular/core";
import type { Observable } from "rxjs";
import { SauronApiService } from "../outputs/angular-http-client/sauron-api.service";
// Import generated models
// import * as Models from '../outputs/models';

@Component({
	selector: "app-example",
	template: `
    <div>
      <h2>Exemplo de uso do SauronApiService</h2>
      <button (click)="loadCredorDivida()">Carregar Credor Dívida</button>
      <button (click)="loadSaldoCredor()">Carregar Saldo Credor</button>
      <button (click)="getUnidadeGestora(123)">Buscar Unidade Gestora</button>
    </div>
  `,
})
export class ExampleComponent {
	private readonly apiService = inject(SauronApiService);

	// Exemplo 1: GET sem parâmetros
	loadCredorDivida(): void {
		this.apiService.ApiGenericaGet().subscribe({
			next: (data) => console.log("Credor dívida:", data),
			error: (error) => console.error("Erro:", error),
		});
	}

	// Exemplo 2: GET com parâmetros de query
	loadSaldoCredor(): void {
		const params = {
			exercicio: 2024,
			credores: "123,456",
		};

		this.apiService
			.ApiGenericaWithParamsGet(params.exercicio, params.credores)
			.subscribe({
				next: (data) => console.log("Saldo credor:", data),
				error: (error) => console.error("Erro:", error),
			});
	}

	// Exemplo 3: GET com parâmetro de path
	getUnidadeGestora(unidadeGestoraCodigo: number): void {
		this.apiService.ApiGenericaByIdGet(unidadeGestoraCodigo).subscribe({
			next: (data) => console.log("Unidade gestora:", data),
			error: (error) => console.error("Erro:", error),
		});
	}

	// Exemplo 4: POST com body
	createParametrosProjecao(): void {
		const newParametro = {
			id: 0,
			nome: "Novo Parâmetro",
			telaTabelaValor: true,
			unidadeGestoraCodigo: "123",
			// ... outros campos
		};

		this.apiService.ParametrosProjecaoCreatePost(newParametro).subscribe({
			next: (response) => console.log("Criado:", response),
			error: (error) => console.error("Erro:", error),
		});
	}

	// Exemplo 5: PUT para atualizar
	updateParametrosProjecao(): void {
		const updatedParametro = {
			id: 1,
			nome: "Parâmetro Atualizado",
			// ... outros campos
		};

		this.apiService.ParametrosProjecaoCreatePut(updatedParametro).subscribe({
			next: (response) => console.log("Atualizado:", response),
			error: (error) => console.error("Erro:", error),
		});
	}

	// Exemplo 6: DELETE com parâmetros
	deleteParametrosProjecao(id: number): void {
		this.apiService.ParametrosProjecaoDelete(id).subscribe({
			next: () => console.log("Deletado com sucesso"),
			error: (error) => console.error("Erro:", error),
		});
	}

	// Exemplo 7: Usando tipos gerados (quando descomentado o import)
	loadTypedData(): void {
		// Quando os tipos estiverem importados, você pode usar:
		// this.apiService.ApiGenericaGet().subscribe((data: Models.SomeType) => {
		//   // data será tipado corretamente
		// });
	}

	// Exemplo 8: Tratamento de erro e loading states
	loadDataWithErrorHandling(): Observable<any> {
		// Retorna o observable para que o template possa usar async pipe
		// ou para composição com outros operadores RxJS
		return this.apiService.ApiGenericaGet();
	}
}

/**
 * Exemplo de serviço que usa o SauronApiService
 */
@Injectable({
	providedIn: "root",
})
export class DataService {
	private readonly api = inject(SauronApiService);

	getAllUnidadeGestora(): Observable<any> {
		return this.api.ApiGenericaGet1(); // unidadeGestora/ObterTodas
	}

	getNaturezaDespesa(): Observable<any> {
		return this.api.ApiGenericaGet2(); // NaturezaDespesa
	}

	searchReceitaExecutada(
		exercicio: number,
		tipoReceita: number,
	): Observable<any> {
		return this.api.ApiGenericaWithParamsGet2(exercicio, tipoReceita);
	}
}

/**
 * Exemplo de guard ou resolver usando o serviço
 */
@Injectable({
	providedIn: "root",
})
export class DataResolver {
	private readonly api = inject(SauronApiService);

	resolve(): Observable<any> {
		// Carregar dados necessários antes de ativar uma rota
		return this.api.ApiGenericaGet();
	}
}
