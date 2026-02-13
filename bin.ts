#!/usr/bin/env bun

// Execute the main TypeScript file with all arguments passed through
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const scriptPath = join(__dirname, "src", "index.ts");

execSync(`bun run "${scriptPath}" ${process.argv.slice(2).join(" ")}`, {
	stdio: "inherit",
	cwd: process.cwd(),
});
