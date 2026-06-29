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
});
