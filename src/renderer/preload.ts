import { contextBridge, ipcRenderer } from "electron";
import type { ServerConfig, CommandResult } from "../common/types";

export interface ElectronApi {
	connect(
		config: ServerConfig,
	): Promise<{ success: boolean; state?: unknown; error?: string }>;
	disconnect(): Promise<{ success: boolean; error?: string }>;
	getState(): Promise<{
		connected: boolean;
		authenticated: boolean;
		lastError?: string;
	}>;
	sendCommand(command: string): Promise<CommandResult>;
	apiCall(
		method: string,
		args: unknown[],
	): Promise<{ success: boolean; data?: unknown; error?: string }>;
	getLogDirectory(): Promise<string>;
	openLogDirectory(): Promise<{ success: boolean; error?: string }>;
	selectServerConfigFile(): Promise<{
		success: boolean;
		filePath?: string;
		error?: string;
	}>;
	loadServerConfig(
		filePath: string,
	): Promise<{
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
	onServerEvent(
		callback: (event: { type: string; [key: string]: unknown }) => void,
	): () => void;
}

const api: ElectronApi = {
	connect: (config: ServerConfig) => ipcRenderer.invoke("connect", config),
	disconnect: () => ipcRenderer.invoke("disconnect"),
	getState: () => ipcRenderer.invoke("getState"),
	sendCommand: (command: string) => ipcRenderer.invoke("sendCommand", command),
	apiCall: (method: string, args: unknown[]) =>
		ipcRenderer.invoke("apiCall", method, args),
	getLogDirectory: () => ipcRenderer.invoke("getLogDirectory"),
	openLogDirectory: () => ipcRenderer.invoke("openLogDirectory"),
	selectServerConfigFile: () => ipcRenderer.invoke("selectServerConfigFile"),
	loadServerConfig: (filePath: string) =>
		ipcRenderer.invoke("loadServerConfig", filePath),
	saveServerConfig: (
		filePath: string,
		updates: { name: string; value: string }[],
	) => ipcRenderer.invoke("saveServerConfig", filePath, updates),
	getProfiles: () => ipcRenderer.invoke("getProfiles"),
	saveProfile: (profile: {
		id?: string;
		name: string;
		host: string;
		port: number;
		password: string;
	}) => ipcRenderer.invoke("saveProfile", profile),
	deleteProfile: (id: string) => ipcRenderer.invoke("deleteProfile", id),
	getLastUsedProfile: () => ipcRenderer.invoke("getLastUsedProfile"),
	setLastUsedProfile: (id: string) =>
		ipcRenderer.invoke("setLastUsedProfile", id),
	onServerEvent: (callback) => {
		const handler = (
			_event: unknown,
			data: { type: string; [key: string]: unknown },
		) => callback(data);
		ipcRenderer.on("server-event", handler);
		return () => ipcRenderer.removeListener("server-event", handler);
	},
};

contextBridge.exposeInMainWorld("electronAPI", api);
