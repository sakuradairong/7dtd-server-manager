interface ConnectionDiagnostic {
	readonly phase: string;
	readonly message: string;
}

interface DesktopApi {
	connect(config: {
		readonly host: string;
		readonly port: number;
		readonly password: string;
		readonly timeoutMs: number;
	}): Promise<{
		success: boolean;
		state?: unknown;
		error?: string;
		diagnostics?: ConnectionDiagnostic[];
	}>;
	disconnect(): Promise<{ success: boolean; error?: string }>;
	getState(): Promise<{
		connected: boolean;
		authenticated: boolean;
		lastError?: string;
	}>;
	sendCommand(command: string): Promise<{
		command: string;
		response: string;
		success: boolean;
		error?: string;
	}>;
	apiCall(
		method: string,
		args: unknown[],
	): Promise<{ success: boolean; data?: unknown; error?: string }>;
	getLogDirectory(): Promise<string>;
	openLogDirectory(): Promise<{ success: boolean; error?: string }>;
	saveLog(text: string): Promise<{ success: boolean; error?: string }>;
	selectServerConfigFile(): Promise<{
		success: boolean;
		filePath?: string;
		error?: string;
	}>;
	loadServerConfig(filePath: string): Promise<{
		success: boolean;
		config?: {
			filePath: string;
			properties: { name: string; value: string }[];
		};
		error?: string;
	}>;
	saveServerConfig(
		filePath: string,
		updates: { name: string; value: string }[],
	): Promise<{ success: boolean; error?: string }>;
	getProfiles(): Promise<{
		success: boolean;
		profiles: {
			id: string;
			name: string;
			host: string;
			port: number;
			password: string;
		}[];
		error?: string;
	}>;
	saveProfile(profile: {
		id?: string;
		name: string;
		host: string;
		port: number;
		password: string;
	}): Promise<{
		success: boolean;
		profile?: {
			id: string;
			name: string;
			host: string;
			port: number;
			password: string;
		};
		error?: string;
	}>;
	deleteProfile(id: string): Promise<{ success: boolean; error?: string }>;
	getLastUsedProfile(): Promise<{
		success: boolean;
		profile?: {
			id: string;
			name: string;
			host: string;
			port: number;
			password: string;
		};
		error?: string;
	}>;
	setLastUsedProfile(id: string): Promise<{ success: boolean; error?: string }>;
	selectMapDirectory(): Promise<{
		success: boolean;
		directory?: string;
		error?: string;
	}>;
	getMapFiles(directory: string): Promise<{
		success: boolean;
		files: { name: string; path: string }[];
		error?: string;
	}>;
	readMapImage(filePath: string): Promise<{
		success: boolean;
		dataUri?: string;
		error?: string;
	}>;
	onServerEvent(
		callback: (event: { type: string; [key: string]: unknown }) => void,
	): () => void;
}
