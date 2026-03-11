#!/usr/bin/env node

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const distEntrypoint = resolve(currentDirectory, "dist", "index.js");

if (existsSync(distEntrypoint)) {
	const { main } = await import("./dist/index.js");
	await main();
	process.exit(0);
}

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { main } = await jiti.import("./src/index.ts");
await main();
