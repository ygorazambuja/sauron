export interface CliOptions {
	input: string;
	url?: string;
	angular: boolean;
	http: boolean;
	plugin?: string[];
	output?: string;
	config?: string;
	help: boolean;
}

export interface SauronConfig {
	input?: string;
	url?: string;
	angular?: boolean;
	http?: boolean;
	plugin?: string[];
	output?: string;
}

export const DEFAULT_CONFIG_FILE = "sauron.config.ts";
export const DEFAULT_SAURON_VERSION = "1.0.0";
