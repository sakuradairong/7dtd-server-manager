import type {
	PlayerInfo,
	EntityInfo,
	BanEntry,
	GamePreference,
} from "../common/types";

const LOG_LINE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\s+\d+\.\d+\s+(INF|WRN|ERR|EXC|DBG)\s+/;

function isLogLine(line: string): boolean {
	return LOG_LINE_PATTERN.test(line);
}

function normalizeLines(response: string): string[] {
	const result: string[] = [];
	for (const rawLine of response.split("\n")) {
		const line = rawLine.trim();
		if (line.length > 0 && !isLogLine(line)) {
			result.push(line);
		}
	}
	return result;
}

function trimParts(parts: string[]): string[] {
	const result: string[] = [];
	for (const part of parts) {
		result.push(part.trim());
	}
	return result;
}

const DURATION_PATTERN = /\d+\s*(minute|hour|day|week|month|year|min|h|d)/i;

function findDurationPart(parts: string[]): string | undefined {
	for (let index = 1; index < parts.length; index += 1) {
		if (DURATION_PATTERN.test(parts[index])) {
			return parts[index];
		}
	}
	return undefined;
}

function parsePosition(
	text: string,
): { x: number; y: number; z: number } | undefined {
	const values: number[] = [];
	for (const token of text.split(" ")) {
		const value = Number(token);
		if (!Number.isNaN(value)) {
			values.push(value);
		}
	}

	if (values.length === 3) {
		return { x: values[0], y: values[1], z: values[2] };
	}
	return undefined;
}

export function parseListPlayers(response: string): PlayerInfo[] {
	const players: PlayerInfo[] = [];
	const lines = normalizeLines(response);

	// Expected format (V2.5/V2.6):
	// id, name, pos, rot, remote, health, deaths, zombies, players, score, level, steamid, ip, ping
	for (const line of lines) {
		const parts = trimParts(line.split(","));
		if (parts.length < 14 || /^\D/.test(parts[0])) {
			// Skip header lines or malformed lines
			continue;
		}

		const entityId = parseInt(parts[0], 10);
		const name = parts[1];
		const position = parsePosition(parts[2]);
		const health = parseInt(parts[5], 10);
		const level = parseInt(parts[10], 10);
		const steamId = parts[11];
		const ping = parseInt(parts[13], 10);

		if (Number.isNaN(entityId)) {
			continue;
		}

		players.push({
			entityId,
			name,
			position,
			health: Number.isNaN(health) ? undefined : health,
			level: Number.isNaN(level) ? undefined : level,
			steamId: steamId || undefined,
			ping: Number.isNaN(ping) ? undefined : ping,
		});
	}

	return players;
}

export function parseListPlayerIds(
	response: string,
): Pick<PlayerInfo, "entityId" | "name">[] {
	const players: Pick<PlayerInfo, "entityId" | "name">[] = [];
	const lines = normalizeLines(response);

	// Expected format:
	// 1. PlayerName
	for (const line of lines) {
		const match = line.match(/^(\d+)\.\s*(.+)$/);
		if (match) {
			players.push({
				entityId: parseInt(match[1], 10),
				name: match[2].trim(),
			});
		}
	}

	return players;
}

export function parseListEntities(response: string): EntityInfo[] {
	const entities: EntityInfo[] = [];
	const lines = normalizeLines(response);

	for (const line of lines) {
		const parts = trimParts(line.split(","));
		if (parts.length < 2) continue;

		const entityId = parseInt(parts[0], 10);
		if (Number.isNaN(entityId)) continue;

		// Format: id, type, [name], [position]
		// Some versions include health/status columns; we extract the first recognizable fields.
		const type = parts[1];
		let name: string | undefined;
		let position: { x: number; y: number; z: number } | undefined;

		for (let index = 2; index < parts.length; index += 1) {
			const value = parts[index];
			if (!value) continue;

			const possiblePosition = parsePosition(value);
			if (possiblePosition) {
				position = possiblePosition;
				continue;
			}

			const looksLikeName = /^[a-zA-Z_]/.test(value) && value !== type;
			const hasCapitalLetter =
				/^[A-Z]/.test(value) || /[A-Z]/.test(value.slice(1));
			if (!name && looksLikeName && hasCapitalLetter) {
				name = value;
			}
		}

		entities.push({
			entityId,
			type,
			name,
			position,
		});
	}

	return entities;
}

export function parseBanList(response: string): BanEntry[] {
	const entries: BanEntry[] = [];
	const lines = normalizeLines(response);

	for (const line of lines) {
		// Try comma-separated first, then whitespace-separated
		let parts = trimParts(line.split(","));
		if (parts.length < 2) {
			parts = trimParts(line.split(/\s{2,}/));
		}
		if (parts.length < 2) continue;

		// Heuristic: duration often contains time units or is a timestamp
		const duration = findDurationPart(parts);
		const reasonParts = duration
			? parts.slice(parts.indexOf(duration) + 1)
			: parts.slice(2);

		entries.push({
			playerId: parts[0],
			duration: duration ?? parts[1],
			reason: reasonParts.length > 0 ? reasonParts.join(", ") : undefined,
		});
	}

	return entries;
}

export function parseGamePreferences(response: string): GamePreference[] {
	const prefs: GamePreference[] = [];
	const lines = normalizeLines(response);

	for (const line of lines) {
		const separatorIndex = line.indexOf("=");
		if (separatorIndex === -1) continue;

		const name = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();

		if (name && value) {
			prefs.push({ name, value });
		}
	}

	return prefs;
}

export function parseTime(
	response: string,
): { day: number; time: string } | null {
	const lines = normalizeLines(response);
	const text = lines.join(" ");
	const match = text.match(/Day\s+(\d+),\s*(\d{1,2}:\d{2})/i);
	if (!match) return null;

	return {
		day: parseInt(match[1], 10),
		time: match[2],
	};
}

export function parseVersion(
	response: string,
): { gameVersion: string; mods: string[] } | null {
	const lines = normalizeLines(response);
	if (lines.length === 0) return null;

	let gameVersion = lines[0];
	const gameVersionPrefix = "Game version:";
	if (gameVersion.toLowerCase().startsWith(gameVersionPrefix.toLowerCase())) {
		gameVersion = gameVersion.slice(gameVersionPrefix.length).trim();
	}

	const mods: string[] = [];

	for (let index = 1; index < lines.length; index += 1) {
		const line = lines[index];
		if (line.toLowerCase().startsWith("mod ")) {
			mods.push(line.slice(4).trim());
		} else if (line) {
			mods.push(line);
		}
	}

	return { gameVersion, mods };
}
