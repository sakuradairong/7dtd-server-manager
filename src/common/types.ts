export interface ServerConfig {
	readonly host: string;
	readonly port: number;
	readonly password: string;
	readonly timeoutMs: number;
}

export interface ServerProfile {
	readonly id: string;
	readonly name: string;
	readonly host: string;
	readonly port: number;
	readonly password: string;
}

export interface ConnectionState {
	readonly connected: boolean;
	readonly authenticated: boolean;
	readonly lastError?: string;
}

export interface PlayerInfo {
	readonly entityId: number;
	readonly name: string;
	readonly steamId?: string;
	readonly position?: { x: number; y: number; z: number };
	readonly health?: number;
	readonly level?: number;
	readonly ping?: number;
}

export interface CommandResult {
	readonly command: string;
	readonly response: string;
	readonly success: boolean;
	readonly error?: string;
}

export interface BanEntry {
	readonly playerId: string;
	readonly duration: string;
	readonly reason?: string;
}

export interface GamePreference {
	readonly name: string;
	readonly value: string;
}

export interface EntityInfo {
	readonly entityId: number;
	readonly type: string;
	readonly name?: string;
	readonly position?: { x: number; y: number; z: number };
}

export type PermissionLevel = number;
