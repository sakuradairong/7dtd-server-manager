import {
	parseListPlayers,
	parseListPlayerIds,
	parseListEntities,
	parseBanList,
	parseGamePreferences,
	parseTime,
	parseVersion,
} from "../src/main/parsers";

describe("parseListPlayers", () => {
	it("parses V2.5/V2.6 listplayers output", () => {
		const response = `id,name,position,rot,remote,health,deaths,zombies,players,score,level,steamid,ip,ping
1,PlayerOne,-200 77 300,0,True,100,0,5,0,0,5,123456789,192.168.1.10,45
2,PlayerTwo,100 50 -300,90,True,85,1,12,1,50,10,987654321,192.168.1.11,120`;

		const players = parseListPlayers(response);

		expect(players).toHaveLength(2);
		expect(players[0]).toEqual({
			entityId: 1,
			name: "PlayerOne",
			position: { x: -200, y: 77, z: 300 },
			health: 100,
			level: 5,
			steamId: "123456789",
			ping: 45,
		});
	});

	it("skips header and malformed lines", () => {
		const response = `id,name,position
not a player
1,ValidPlayer,0 0 0,0,True,100,0,0,0,0,1,123,127.0.0.1,30`;

		const players = parseListPlayers(response);

		expect(players).toHaveLength(1);
		expect(players[0].name).toBe("ValidPlayer");
	});
});

describe("parseListPlayerIds", () => {
	it("parses numbered player list", () => {
		const response = `1. PlayerOne
2. PlayerTwo`;

		const players = parseListPlayerIds(response);

		expect(players).toEqual([
			{ entityId: 1, name: "PlayerOne" },
			{ entityId: 2, name: "PlayerTwo" },
		]);
	});
});

describe("parseListEntities", () => {
	it("parses entity list output", () => {
		const response = `1,zombieBoe,Boe,100 50 200
2,animalRabbit,Rabbit,300 60 -100`;

		const entities = parseListEntities(response);

		expect(entities).toHaveLength(2);
		expect(entities[0]).toEqual({
			entityId: 1,
			type: "zombieBoe",
			name: "Boe",
			position: { x: 100, y: 50, z: 200 },
		});
	});

	it("handles entity rows with extra columns", () => {
		const response = `1,animalBoar,alive,100,BoarName,150 75 -250`;

		const entities = parseListEntities(response);

		expect(entities).toHaveLength(1);
		expect(entities[0]).toEqual({
			entityId: 1,
			type: "animalBoar",
			name: "BoarName",
			position: { x: 150, y: 75, z: -250 },
		});
	});
});

describe("parseBanList", () => {
	it("parses comma-separated ban list entries", () => {
		const response = `123456789,10 hours,Griefing
987654321,1 year,Hacking`;

		const bans = parseBanList(response);

		expect(bans).toEqual([
			{ playerId: "123456789", duration: "10 hours", reason: "Griefing" },
			{ playerId: "987654321", duration: "1 year", reason: "Hacking" },
		]);
	});

	it("parses whitespace-separated ban list entries", () => {
		const response = `123456789  10 hours  Griefing
987654321  1 year  Hacking`;

		const bans = parseBanList(response);

		expect(bans).toEqual([
			{ playerId: "123456789", duration: "10 hours", reason: "Griefing" },
			{ playerId: "987654321", duration: "1 year", reason: "Hacking" },
		]);
	});
});

describe("parseGamePreferences", () => {
	it("parses key=value preference lines", () => {
		const response = `ZombiesRun=0
DayLightLength=18
AirDropFrequency=72`;

		const prefs = parseGamePreferences(response);

		expect(prefs).toEqual([
			{ name: "ZombiesRun", value: "0" },
			{ name: "DayLightLength", value: "18" },
			{ name: "AirDropFrequency", value: "72" },
		]);
	});
});

describe("parseTime", () => {
	it("parses game time output", () => {
		const response = "Day 12, 14:30";

		const time = parseTime(response);

		expect(time).toEqual({ day: 12, time: "14:30" });
	});

	it("returns null for invalid input", () => {
		expect(parseTime("invalid")).toBeNull();
	});
});

describe("parseVersion", () => {
	it("parses version and mod list", () => {
		const response = `Alpha V2.5 (b23) Stable
Mod SomeMod v1.0
Mod AnotherMod v2.0`;

		const version = parseVersion(response);

		expect(version).toEqual({
			gameVersion: "Alpha V2.5 (b23) Stable",
			mods: ["SomeMod v1.0", "AnotherMod v2.0"],
		});
	});

	it("parses real V2.5 server output with INF log prefix", () => {
		const response = `2026-07-02T01:21:04 184106.964 INF Executing command 'version' by Telnet from 183.146.214.73:45476
Game version: V 2.5 (b32) Compatibility Version: V 2.5
Mod TFP_Harmony: 1.1.0.4
Mod ZombiesIncreaseOverTime: 1.3
Mod 0-SCore_sphereii: 2.5.10.2106`;

		const version = parseVersion(response);

		expect(version).toEqual({
			gameVersion: "V 2.5 (b32) Compatibility Version: V 2.5",
			mods: [
				"TFP_Harmony: 1.1.0.4",
				"ZombiesIncreaseOverTime: 1.3",
				"0-SCore_sphereii: 2.5.10.2106",
			],
		});
	});
});

describe("parseTime", () => {
	it("parses real server output with INF log prefix", () => {
		const response = `2026-07-02T01:21:04 184107.450 INF Executing command 'gettime' by Telnet from 183.146.214.73:45476
Day 1, 08:28`;

		const time = parseTime(response);

		expect(time).toEqual({ day: 1, time: "08:28" });
	});
});

describe("parseGamePreferences", () => {
	it("parses real server output with INF log prefix", () => {
		const response = `2026-07-02T01:21:05 184107.951 INF Executing command 'getgamepref' by Telnet from 183.146.214.73:45476
GamePref.AirDropFrequency = 72
GamePref.GameDifficulty = 3
GamePref.ServerMaxPlayerCount = 8
GamePref.XPMultiplier = 300`;

		const prefs = parseGamePreferences(response);

		expect(prefs).toEqual([
			{ name: "GamePref.AirDropFrequency", value: "72" },
			{ name: "GamePref.GameDifficulty", value: "3" },
			{ name: "GamePref.ServerMaxPlayerCount", value: "8" },
			{ name: "GamePref.XPMultiplier", value: "300" },
		]);
	});
});

describe("empty server responses", () => {
	it("returns empty players when no one is online", () => {
		const response = `2026-07-02T01:21:06 184108.811 INF Executing command 'listplayers' by Telnet from 183.146.214.73:45476
Total of 0 in the game`;

		expect(parseListPlayers(response)).toEqual([]);
	});

	it("returns empty player IDs when no one is online", () => {
		const response = `2026-07-02T01:21:06 184109.311 INF Executing command 'listplayerids' by Telnet from 183.146.214.73:45476
Total of 0 in the game`;

		expect(parseListPlayerIds(response)).toEqual([]);
	});

	it("returns empty entities when none exist", () => {
		const response = `2026-07-02T01:21:07 184109.814 INF Executing command 'listents' by Telnet from 183.146.214.73:45476
Total of 0 in the game`;

		expect(parseListEntities(response)).toEqual([]);
	});

	it("returns empty ban list when no bans exist", () => {
		const response = `2026-07-02T01:21:07 184110.258 INF Executing command 'ban list' by Telnet from 183.146.214.73:45476
Ban list entries:
Banned until - UserID (name) - Reason`;

		expect(parseBanList(response)).toEqual([]);
	});
});
