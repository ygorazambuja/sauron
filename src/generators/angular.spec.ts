import { describe, expect, test } from "bun:test";
import { generateAngularService } from "./angular";

describe("Angular generator", () => {
	test("should generate Angular service with methods and imports", () => {
		const methods = [
			"  getUsers(): Observable<User[]> {\n    return this.httpClient.get<User[]>('/api/users');\n  }",
			"  createUser(body: CreateUserDto): Observable<User> {\n    return this.httpClient.post<User>('/api/users', body);\n  }",
		];
		const imports = ["User", "CreateUserDto"];

		const result = generateAngularService(methods, imports, true);

		expect(result).toContain(
			'import { Injectable, inject } from "@angular/core"',
		);
		expect(result).toContain(
			'import { HttpClient } from "@angular/common/http"',
		);
		expect(result).toContain('import { Observable } from "rxjs"');
		expect(result).toContain('import { User, CreateUserDto } from "../models"');
		expect(result).toContain("@Injectable({");
		expect(result).toContain('providedIn: "root"');
		expect(result).toContain("export class SauronApiService");
		expect(result).toContain(
			"private readonly httpClient = inject(HttpClient)",
		);
		expect(result).toContain("getUsers(): Observable<User[]>");
		expect(result).toContain(
			"createUser(body: CreateUserDto): Observable<User>",
		);
	});

	test("should generate service without imports when none provided", () => {
		const methods = [
			"  getHealth(): Observable<any> {\n    return this.httpClient.get<any>('/health');\n  }",
		];

		const result = generateAngularService(methods, [], true);

		expect(result).toContain(
			'import { Injectable, inject } from "@angular/core"',
		);
		expect(result).not.toContain('import { } from "../models"');
		expect(result).toContain("getHealth(): Observable<any>");
	});

	test("should use correct import path for non-Angular projects", () => {
		const result = generateAngularService(
			[
				"  getData(): Observable<Data> {\n    return this.httpClient.get<Data>('/data');\n  }",
			],
			["Data"],
			false,
		);

		expect(result).toContain('import { Data } from "../models"');
	});

	test("should handle empty methods array", () => {
		const result = generateAngularService([], [], true);
		expect(result).toContain("export class SauronApiService");
		expect(result).toContain("}\n");
	});
});
