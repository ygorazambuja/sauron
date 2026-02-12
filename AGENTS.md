# Repository Guidelines

## Project Structure & Module Organization
- `src/index.ts` is the CLI entry point and orchestration layer.
- `src/utils/` holds conversion utilities (model/service generation helpers).
- `src/schemas/` contains Zod schemas used to validate OpenAPI input.
- `src/index.test.ts` is the primary test suite (Bun test runner).
- `bin.ts` is the executable wrapper for CLI usage.
- `examples/` includes sample usage snippets for generated clients/services.
- Generated outputs default to `outputs/models/` and `outputs/http-client/` (or `src/app/sauron/` inside Angular projects).

## Build, Test, and Development Commands
- `bun install`: install dependencies.
- `bun run src/index.ts`: run the CLI directly (dev flow).
- `bun run cli -- --input swagger.json --angular --http`: run via the bin wrapper with flags.
- `bun test`: run the full test suite.
- `bun test --watch`: run tests in watch mode.
- `bun test --coverage`: produce a coverage report.
- `bun build --compile ./src/index.ts --outfile sauron`: compile a standalone binary.

## Coding Style & Naming Conventions
- Formatting and linting are handled by Biome (`biome.json`).
- Indentation: tabs. Quotes: double quotes.
- Prefer clear, descriptive function names for generators (e.g., `createModels`, `generateFetchService`).
- Files use `.ts` and are organized by responsibility (CLI vs utilities vs schemas).

## Testing Guidelines
- Framework: `bun:test` (see `src/index.test.ts`).
- Test names are descriptive sentences (e.g., “should parse input file from arguments”).
- Add tests when changing generator output or CLI parsing; keep coverage focused on behavior.

## Commit & Pull Request Guidelines
- Commit history uses short, imperative summaries in sentence case (e.g., “Fix working directory for bunx execution”).
- Keep commits scoped to one logical change.
- PRs should include: summary of behavior changes, sample command used, and any generated output paths.
- Include screenshots only if CLI output changes meaningfully.

## Configuration & Security Notes
- The CLI reads local OpenAPI/Swagger files; avoid committing real credentials or private specs.
- If adding new generation targets, document the output path conventions in `README.md`.
