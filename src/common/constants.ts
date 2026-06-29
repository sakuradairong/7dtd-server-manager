export const DEFAULT_TELNET_PORT = 8081;
export const DEFAULT_TIMEOUT_MS = 10000;
export const LINE_DELIMITER = "\r\n";

export const TELNET_COMMANDS = {
	// Player Management
	admin: { usage: "admin <add|remove|list> [player] [level]", minLevel: 0 },
	ban: {
		usage: "ban <add|remove|list> [player] [duration] [unit] [reason]",
		minLevel: 1,
	},
	kick: { usage: "kick <player> [reason]", minLevel: 1 },
	kickall: { usage: "kickall [reason]", minLevel: 1 },
	kill: { usage: "kill <player or entityId>", minLevel: 1 },
	killall: { usage: "killall", minLevel: 1 },
	listplayerids: { usage: "listplayerids", minLevel: 1000 },
	listplayers: { usage: "listplayers", minLevel: 1000 },
	listknownplayers: { usage: "listknownplayers [filter]", minLevel: 1000 },
	whitelist: { usage: "whitelist <add|remove|list> [player]", minLevel: 0 },
	teleportplayer: {
		usage: "teleportplayer <player> <x> <y> <z|player>",
		minLevel: 1,
	},
	sayplayer: { usage: "sayplayer <player> <message>", minLevel: 1 },
	showinventory: { usage: "showinventory <player>", minLevel: 1 },

	// World Management
	saveworld: { usage: "saveworld", minLevel: 0 },
	shutdown: { usage: "shutdown", minLevel: 0 },
	chunkreset: { usage: "chunkreset <x> <z>", minLevel: 0 },
	regionreset: { usage: "regionreset [region]", minLevel: 0 },
	rendermap: { usage: "rendermap", minLevel: 0 },
	generatemap: { usage: "generatemap", minLevel: 0 },
	visitmap: { usage: "visitmap [x] [z]", minLevel: 0 },
	agemap: { usage: "agemap", minLevel: 0 },
	expiryinfo: { usage: "expiryinfo", minLevel: 0 },
	repairchunkdensity: {
		usage: "repairchunkdensity <x> <z> [fix]",
		minLevel: 0,
	},

	// Entity Control
	listents: { usage: "listents", minLevel: 1000 },
	spawnentity: { usage: "spawnentity [playerId] [entityId]", minLevel: 0 },
	spawnentityat: { usage: "spawnentityat <entityId> <x> <y> <z>", minLevel: 0 },
	spawnwanderinghorde: { usage: "spawnwanderinghorde", minLevel: 0 },
	spawnscouts: { usage: "spawnscouts [player] [x] [y] [z]", minLevel: 0 },
	spawnairdrop: { usage: "spawnairdrop", minLevel: 0 },
	spawnsupplycrate: { usage: "spawnsupplycrate", minLevel: 0 },

	// Player State
	buff: { usage: "buff <buffName>", minLevel: 1000 },
	buffplayer: { usage: "buffplayer <player> <buffName>", minLevel: 1 },
	debuff: { usage: "debuff <buffName>", minLevel: 1000 },
	debuffplayer: { usage: "debuffplayer <player> <buffName>", minLevel: 1 },
	giveself: { usage: "giveself <itemName> [quality]", minLevel: 1000 },
	giveselfxp: { usage: "giveselfxp <amount>", minLevel: 1000 },
	givexp: { usage: "givexp <player> <amount>", minLevel: 1 },
	give: { usage: "give <player> <itemName> <amount>", minLevel: 1 },
	gamestage: { usage: "gamestage", minLevel: 1000 },

	// Game Settings
	getgamepref: { usage: "getgamepref [filter]", minLevel: 1000 },
	setgamepref: { usage: "setgamepref <prefName> <value>", minLevel: 0 },
	getgamestat: { usage: "getgamestat [filter]", minLevel: 1000 },
	setgamestat: { usage: "setgamestat <statName> <value>", minLevel: 0 },
	gettime: { usage: "gettime", minLevel: 1000 },
	settime: { usage: "settime <day|night|time|day hour minute>", minLevel: 0 },
	settempunit: { usage: "settempunit <c|f>", minLevel: 1000 },
	cp: { usage: "cp <add|remove|list> [command] [level]", minLevel: 0 },

	// Debug & Performance
	mem: { usage: "mem", minLevel: 1000 },
	memcl: { usage: "memcl", minLevel: 1000 },
	listthreads: { usage: "listthreads", minLevel: 1000 },
	debugmenu: { usage: "debugmenu [on|off]", minLevel: 0 },
	loggamestate: { usage: "loggamestate <message> [true|false]", minLevel: 0 },
	loglevel: {
		usage: "loglevel <INF|WRN|ERR|EXC|ALL> <true|false>",
		minLevel: 0,
	},
	clear: { usage: "clear", minLevel: 1000 },

	// Communication
	say: { usage: "say <message>", minLevel: 1 },
	reply: { usage: "reply <message>", minLevel: 1 },
	help: { usage: "help [command]", minLevel: 1000 },
	version: { usage: "version", minLevel: 1000 },

	// Visuals
	weather: { usage: "weather <setting>", minLevel: 0 },
	weathersurvival: { usage: "weathersurvival <on|off>", minLevel: 0 },
	teleport: { usage: "teleport <x> [y] <z|player|offset>", minLevel: 1000 },
	switchview: { usage: "switchview", minLevel: 1000 },
	spawnscreen: { usage: "spawnscreen", minLevel: 1000 },
} as const;

export type CommandName = keyof typeof TELNET_COMMANDS;
