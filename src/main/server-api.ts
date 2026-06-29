import type {
	PlayerInfo,
	EntityInfo,
	BanEntry,
	GamePreference,
	PermissionLevel,
	CommandResult,
} from "../common/types";
import type { TelnetClient, CommandOptions } from "./telnet-client";
import {
	parseListPlayers,
	parseListPlayerIds,
	parseListEntities,
	parseBanList,
	parseGamePreferences,
	parseTime,
	parseVersion,
} from "./parsers";

const SHORT_RESPONSE: CommandOptions = { silenceMs: 100, timeoutMs: 5000 };
const LONG_RESPONSE: CommandOptions = { silenceMs: 400, timeoutMs: 15000 };

export class ServerApi {
	private client: TelnetClient;

	constructor(client: TelnetClient) {
		this.client = client;
	}

	getClient(): TelnetClient {
		return this.client;
	}

	sendRaw(command: string, options?: CommandOptions): Promise<CommandResult> {
		return this.client.sendCommand(command, options);
	}

	// --- Player Management ---

	async listPlayers(): Promise<PlayerInfo[]> {
		const result = await this.client.sendCommand("listplayers", LONG_RESPONSE);
		return parseListPlayers(result.response);
	}

	async listPlayerIds(): Promise<Pick<PlayerInfo, "entityId" | "name">[]> {
		const result = await this.client.sendCommand(
			"listplayerids",
			SHORT_RESPONSE,
		);
		return parseListPlayerIds(result.response);
	}

	kick(target: string, reason?: string): Promise<CommandResult> {
		const command = reason
			? `kick "${target}" "${reason}"`
			: `kick "${target}"`;
		return this.client.sendCommand(command, SHORT_RESPONSE);
	}

	kickAll(reason?: string): Promise<CommandResult> {
		const command = reason ? `kickall "${reason}"` : "kickall";
		return this.client.sendCommand(command, SHORT_RESPONSE);
	}

	banAdd(
		target: string,
		duration: number,
		unit: "minutes" | "hours" | "days" | "weeks" | "months" | "years",
		reason?: string,
	): Promise<CommandResult> {
		let command = `ban add "${target}" ${duration} ${unit}`;
		if (reason) {
			command += ` "${reason}"`;
		}
		return this.client.sendCommand(command, SHORT_RESPONSE);
	}

	banRemove(target: string): Promise<CommandResult> {
		return this.client.sendCommand(`ban remove "${target}"`, SHORT_RESPONSE);
	}

	async banList(): Promise<BanEntry[]> {
		const result = await this.client.sendCommand("ban list", SHORT_RESPONSE);
		return parseBanList(result.response);
	}

	adminAdd(target: string, level: PermissionLevel): Promise<CommandResult> {
		return this.client.sendCommand(
			`admin add "${target}" ${level}`,
			SHORT_RESPONSE,
		);
	}

	adminRemove(target: string): Promise<CommandResult> {
		return this.client.sendCommand(`admin remove "${target}"`, SHORT_RESPONSE);
	}

	whitelistAdd(target: string): Promise<CommandResult> {
		return this.client.sendCommand(`whitelist add "${target}"`, SHORT_RESPONSE);
	}

	whitelistRemove(target: string): Promise<CommandResult> {
		return this.client.sendCommand(
			`whitelist remove "${target}"`,
			SHORT_RESPONSE,
		);
	}

	teleportPlayer(
		target: string,
		destination: { x: number; y: number; z: number } | string,
	): Promise<CommandResult> {
		if (typeof destination === "string") {
			return this.client.sendCommand(
				`teleportplayer "${target}" "${destination}"`,
				SHORT_RESPONSE,
			);
		}
		return this.client.sendCommand(
			`teleportplayer "${target}" ${destination.x} ${destination.y} ${destination.z}`,
			SHORT_RESPONSE,
		);
	}

	sayPlayer(target: string, message: string): Promise<CommandResult> {
		return this.client.sendCommand(
			`sayplayer "${target}" "${message}"`,
			SHORT_RESPONSE,
		);
	}

	showInventory(target: string): Promise<CommandResult> {
		return this.client.sendCommand(`showinventory "${target}"`, LONG_RESPONSE);
	}

	kill(target: string): Promise<CommandResult> {
		return this.client.sendCommand(`kill "${target}"`, SHORT_RESPONSE);
	}

	killAll(): Promise<CommandResult> {
		return this.client.sendCommand("killall", SHORT_RESPONSE);
	}

	// --- World Management ---

	saveWorld(): Promise<CommandResult> {
		return this.client.sendCommand("saveworld", {
			timeoutMs: 30000,
			silenceMs: 500,
		});
	}

	shutdown(): Promise<CommandResult> {
		return this.client.sendCommand("shutdown", {
			timeoutMs: 10000,
			silenceMs: 200,
		});
	}

	setTime(time: "day" | "night" | string): Promise<CommandResult> {
		return this.client.sendCommand(`settime ${time}`, SHORT_RESPONSE);
	}

	setTimeDetailed(
		day: number,
		hour: number,
		minute: number,
	): Promise<CommandResult> {
		return this.client.sendCommand(
			`settime ${day} ${hour} ${minute}`,
			SHORT_RESPONSE,
		);
	}

	async getTime(): Promise<{ day: number; time: string } | null> {
		const result = await this.client.sendCommand("gettime", SHORT_RESPONSE);
		return parseTime(result.response);
	}

	resetChunk(x: number, z: number): Promise<CommandResult> {
		return this.client.sendCommand(`chunkreset ${x} ${z}`, {
			timeoutMs: 20000,
			silenceMs: 300,
		});
	}

	repairChunkDensity(
		x: number,
		z: number,
		fix = false,
	): Promise<CommandResult> {
		return this.client.sendCommand(
			`repairchunkdensity ${x} ${z}${fix ? " fix" : ""}`,
			{ timeoutMs: 30000, silenceMs: 500 },
		);
	}

	// --- Entity Control ---

	async listEntities(): Promise<EntityInfo[]> {
		const result = await this.client.sendCommand("listents", LONG_RESPONSE);
		return parseListEntities(result.response);
	}

	spawnEntity(playerId: number, entityId: number): Promise<CommandResult> {
		return this.client.sendCommand(
			`spawnentity ${playerId} ${entityId}`,
			SHORT_RESPONSE,
		);
	}

	spawnEntityAt(
		entityId: number,
		position: { x: number; y: number; z: number },
	): Promise<CommandResult> {
		return this.client.sendCommand(
			`spawnentityat ${entityId} ${position.x} ${position.y} ${position.z}`,
			SHORT_RESPONSE,
		);
	}

	spawnWanderingHorde(): Promise<CommandResult> {
		return this.client.sendCommand("spawnwanderinghorde", SHORT_RESPONSE);
	}

	spawnScouts(
		target?: string,
		position?: { x: number; y: number; z: number },
	): Promise<CommandResult> {
		if (target) {
			return this.client.sendCommand(`spawnscouts "${target}"`, SHORT_RESPONSE);
		}
		if (position) {
			return this.client.sendCommand(
				`spawnscouts ${position.x} ${position.y} ${position.z}`,
				SHORT_RESPONSE,
			);
		}
		return this.client.sendCommand("spawnscouts", SHORT_RESPONSE);
	}

	spawnAirDrop(): Promise<CommandResult> {
		return this.client.sendCommand("spawnairdrop", SHORT_RESPONSE);
	}

	spawnSupplyCrate(): Promise<CommandResult> {
		return this.client.sendCommand("spawnsupplycrate", SHORT_RESPONSE);
	}

	// --- Player State ---

	buffPlayer(target: string, buffName: string): Promise<CommandResult> {
		return this.client.sendCommand(
			`buffplayer "${target}" ${buffName}`,
			SHORT_RESPONSE,
		);
	}

	debuffPlayer(target: string, buffName: string): Promise<CommandResult> {
		return this.client.sendCommand(
			`debuffplayer "${target}" ${buffName}`,
			SHORT_RESPONSE,
		);
	}

	give(
		target: string,
		itemName: string,
		amount: number,
	): Promise<CommandResult> {
		return this.client.sendCommand(
			`give "${target}" ${itemName} ${amount}`,
			SHORT_RESPONSE,
		);
	}

	giveXp(target: string, amount: number): Promise<CommandResult> {
		return this.client.sendCommand(
			`givexp "${target}" ${amount}`,
			SHORT_RESPONSE,
		);
	}

	// --- Game Settings ---

	async getGamePreferences(filter?: string): Promise<GamePreference[]> {
		const command = filter ? `getgamepref ${filter}` : "getgamepref";
		const result = await this.client.sendCommand(command, LONG_RESPONSE);
		return parseGamePreferences(result.response);
	}

	setGamePreference(name: string, value: string): Promise<CommandResult> {
		return this.client.sendCommand(
			`setgamepref ${name} ${value}`,
			SHORT_RESPONSE,
		);
	}

	async getGameStats(filter?: string): Promise<GamePreference[]> {
		const command = filter ? `getgamestat ${filter}` : "getgamestat";
		const result = await this.client.sendCommand(command, LONG_RESPONSE);
		return parseGamePreferences(result.response);
	}

	setGameStat(name: string, value: string): Promise<CommandResult> {
		return this.client.sendCommand(
			`setgamestat ${name} ${value}`,
			SHORT_RESPONSE,
		);
	}

	setWeather(setting: string): Promise<CommandResult> {
		return this.client.sendCommand(`weather ${setting}`, SHORT_RESPONSE);
	}

	setWeatherSurvival(enabled: boolean): Promise<CommandResult> {
		return this.client.sendCommand(
			`weathersurvival ${enabled ? "on" : "off"}`,
			SHORT_RESPONSE,
		);
	}

	// --- Communication ---

	say(message: string): Promise<CommandResult> {
		return this.client.sendCommand(`say "${message}"`, SHORT_RESPONSE);
	}

	getVersion(): Promise<CommandResult> {
		return this.client.sendCommand("version", SHORT_RESPONSE);
	}

	async getVersionParsed(): Promise<{
		gameVersion: string;
		mods: string[];
	} | null> {
		const result = await this.client.sendCommand("version", SHORT_RESPONSE);
		return parseVersion(result.response);
	}

	getHelp(commandName?: string): Promise<CommandResult> {
		return this.client.sendCommand(
			commandName ? `help ${commandName}` : "help",
			{ timeoutMs: 10000, silenceMs: 300 },
		);
	}
}
