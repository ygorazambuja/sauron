#!/usr/bin/env bun

// Execute the main TypeScript file with all arguments passed through
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const scriptPath = join(__dirname, "src", "index.ts");

execSync(`bun run "${scriptPath}" ${process.argv.slice(2).join(" ")}`, {
  stdio: "inherit",
  cwd: process.cwd(),
});
