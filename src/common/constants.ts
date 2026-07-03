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
	listplayerids: { usage: "listplayerids (lpi)", minLevel: 1000 },
	listplayers: { usage: "listplayers (lp)", minLevel: 1000 },
	listknownplayers: { usage: "listknownplayers [filter]", minLevel: 1000 },
	whitelist: { usage: "whitelist <add|remove|list> [player]", minLevel: 0 },
	teleportplayer: {
		usage: "teleportplayer <player> <x> <y> <z|player> (tele)",
		minLevel: 1,
	},
	sayplayer: { usage: "sayplayer <player> <message> (pm)", minLevel: 1 },
	showinventory: { usage: "showinventory <player>", minLevel: 1 },
	playerOwnedEntities: { usage: "playerOwnedEntities (poe)", minLevel: 1000 },
	pplist: { usage: "pplist", minLevel: 1000 },
	printpinfo: { usage: "printpinfo", minLevel: 1000 },
	reply: { usage: "reply <message> (re)", minLevel: 1 },

	// Permission & Admin
	commandpermission: {
		usage: "commandpermission <add|remove|list> [command] [level] (cp)",
		minLevel: 0,
	},
	permissionsallowed: {
		usage: "permissionsallowed <mask> (pallowed|pa)",
		minLevel: 0,
	},
	overridemaxplayercount: {
		usage: "overridemaxplayercount <count>",
		minLevel: 0,
	},
	createwebuser: { usage: "createwebuser", minLevel: 0 },
	webpermission: { usage: "webpermission", minLevel: 0 },
	webtokens: { usage: "webtokens", minLevel: 0 },

	// World Management
	saveworld: { usage: "saveworld (sa)", minLevel: 0 },
	shutdown: { usage: "shutdown", minLevel: 0 },
	chunkreset: { usage: "chunkreset <x> <z> (cr)", minLevel: 0 },
	regionreset: { usage: "regionreset [region] (rr)", minLevel: 0 },
	rendermap: { usage: "rendermap", minLevel: 0 },
	generatemap: { usage: "generatemap", minLevel: 0 },
	visitmap: { usage: "visitmap [x] [z] (vpois|visitpois)", minLevel: 0 },
	agemap: { usage: "agemap", minLevel: 0 },
	expiryinfo: { usage: "expiryinfo", minLevel: 0 },
	repairchunkdensity: {
		usage: "repairchunkdensity <x> <z> [fix] (rcd)",
		minLevel: 0,
	},
	chunkcache: { usage: "chunkcache (cc)", minLevel: 1000 },
	chunkobserver: { usage: "chunkobserver <x> <y> <z> [range] (co)", minLevel: 0 },
	showchunkdata: { usage: "showchunkdata (sc)", minLevel: 1000 },
	resetallstats: { usage: "resetallstats [true]", minLevel: 0 },
	exportcurrentconfigs: { usage: "exportcurrentconfigs", minLevel: 0 },
	exportprefab: { usage: "exportprefab", minLevel: 0 },
	smoothpoi: { usage: "smoothpoi", minLevel: 0 },
	smoothworldall: { usage: "smoothworldall (swa)", minLevel: 0 },
	prefab: { usage: "prefab <subcommand>", minLevel: 0 },
	prefabeditor: { usage: "prefabeditor (prefabedit|pedit)", minLevel: 0 },
	prefabupdater: { usage: "prefabupdater", minLevel: 0 },
	placeblockrotations: { usage: "placeblockrotations (pbr)", minLevel: 1000 },
	placeblockshapes: { usage: "placeblockshapes (pbs)", minLevel: 1000 },
	pois: { usage: "pois <on|off>", minLevel: 1000 },
	poiwaypoints: { usage: "poiwaypoints <filter> (pwp)", minLevel: 1000 },
	tppoi: { usage: "tppoi", minLevel: 1000 },
	teleportpoirelative: { usage: "teleportpoirelative (tppr)", minLevel: 1000 },
	trees: { usage: "trees <on|off>", minLevel: 1000 },
	mapdata: { usage: "mapdata", minLevel: 0 },

	// Entity Control
	listents: { usage: "listents (le)", minLevel: 1000 },
	spawnentity: { usage: "spawnentity [playerId] [entityId] (se)", minLevel: 0 },
	spawnentityat: {
		usage: "spawnentityat <entityId> <x> <y> <z> (sea)",
		minLevel: 0,
	},
	spawnwanderinghorde: { usage: "spawnwanderinghorde (spawnw)", minLevel: 0 },
	spawnscouts: { usage: "spawnscouts [player] [x] [y] [z]", minLevel: 0 },
	spawnairdrop: { usage: "spawnairdrop", minLevel: 0 },
	spawnsupplycrate: { usage: "spawnsupplycrate", minLevel: 0 },
	shownexthordetime: { usage: "shownexthordetime", minLevel: 1000 },
	bents: { usage: "bents <on|off|count>", minLevel: 1000 },
	sdcs: { usage: "sdcs <subcommand>", minLevel: 0 },
	lock: { usage: "lock", minLevel: 0 },

	// Player State
	buff: { usage: "buff <buffName>", minLevel: 1000 },
	buffplayer: { usage: "buffplayer <player> <buffName>", minLevel: 1 },
	debuff: { usage: "debuff <buffName>", minLevel: 1000 },
	debuffplayer: { usage: "debuffplayer <player> <buffName>", minLevel: 1 },
	giveself: { usage: "giveself <itemName> [quality=6] [count=1] [putInInventory=false] [spawnWithMods=true]", minLevel: 1000 },
	giveselfxp: { usage: "giveselfxp <amount>", minLevel: 1000 },
	givexp: { usage: "givexp <player> <amount>", minLevel: 1 },
	give: { usage: "give <player> <itemName> <amount>", minLevel: 1 },
	givequest: { usage: "givequest <questName> [tier]", minLevel: 1 },
	removequest: { usage: "removequest <questName>", minLevel: 1 },
	gamestage: { usage: "gamestage", minLevel: 1000 },
	starve: { usage: "starve [percent] (hungry|food)", minLevel: 1000 },
	thirsty: { usage: "thirsty [percent]", minLevel: 1000 },
	exhausted: { usage: "exhausted", minLevel: 1000 },
	sleep: { usage: "sleep <seconds>", minLevel: 1000 },
	spectator: { usage: "spectator (spectatormode|sm)", minLevel: 1000 },
	automove: { usage: "automove", minLevel: 1000 },
	calibrate: { usage: "calibrate (calib)", minLevel: 1000 },
	fov: { usage: "fov <value>", minLevel: 1000 },
	camera: { usage: "camera <lock|unlock|load|save> (cam)", minLevel: 1000 },
	creativemenu: { usage: "creativemenu [on|off] (cm)", minLevel: 0 },
	debugmenu: { usage: "debugmenu [on|off] (dm)", minLevel: 0 },
	debugpanels: { usage: "debugpanels [on|off]", minLevel: 0 },
	debugshot: { usage: "debugshot (dbs)", minLevel: 1000 },
	show: { usage: "show <layer>", minLevel: 1000 },
	showalbedo: { usage: "showalbedo [on|off] (albedo)", minLevel: 1000 },
	shownormals: { usage: "shownormals [on|off] (norms)", minLevel: 1000 },
	showspecular: { usage: "showspecular [on|off] (spec)", minLevel: 1000 },
	showswings: { usage: "showswings", minLevel: 1000 },
	showhits: { usage: "showhits", minLevel: 1000 },
	showtriggers: { usage: "showtriggers <visibility>", minLevel: 1000 },
	togglelm: { usage: "togglelm", minLevel: 1000 },
	ScreenEffect: { usage: "ScreenEffect <effect>", minLevel: 1000 },
	spawnscreen: { usage: "spawnscreen", minLevel: 1000 },
	switchview: { usage: "switchview (sv)", minLevel: 1000 },
	squarespiral: { usage: "squarespiral (sqs)", minLevel: 1000 },
	playervisitmap: { usage: "playervisitmap <x> <z> <w> <d> [log] (pvm)", minLevel: 0 },

	// Game Settings
	getgamepref: { usage: "getgamepref [filter] (gg)", minLevel: 1000 },
	setgamepref: { usage: "setgamepref <prefName> <value> (sg)", minLevel: 0 },
	getgamestat: { usage: "getgamestat [filter] (ggs)", minLevel: 1000 },
	setgamestat: { usage: "setgamestat <statName> <value> (sgs)", minLevel: 0 },
	gettime: { usage: "gettime (gt)", minLevel: 1000 },
	settime: { usage: "settime <day|night|time|day hour minute> (st)", minLevel: 0 },
	settempunit: { usage: "settempunit <c|f> (stu)", minLevel: 1000 },
	setwatervalue: { usage: "setwatervalue <value> (swv)", minLevel: 0 },
	settargetfps: { usage: "settargetfps <fps>", minLevel: 0 },
	getoptions: { usage: "getoptions", minLevel: 1000 },
	getlogpath: { usage: "getlogpath (glp)", minLevel: 1000 },
	config: { usage: "config <import|export> <path>", minLevel: 0 },
	cvar: { usage: "cvar <set|get|track|list> [name] [value]", minLevel: 0 },
	setcvar: { usage: "setcvar <name> <value>", minLevel: 0 },
	weather: { usage: "weather <setting>", minLevel: 0 },
	weathersurvival: { usage: "weathersurvival <on|off>", minLevel: 0 },
	newweathersurvival: { usage: "newweathersurvival <on|off>", minLevel: 0 },
	debugweather: { usage: "debugweather", minLevel: 1000 },
	spectrum: { usage: "spectrum <name>", minLevel: 0 },
	ForceEventDate: { usage: "ForceEventDate <date>", minLevel: 0 },

	// Debug & Performance
	mem: { usage: "mem", minLevel: 1000 },
	memcl: { usage: "memcl", minLevel: 1000 },
	listthreads: { usage: "listthreads (lt)", minLevel: 1000 },
	loggamestate: { usage: "loggamestate <message> [true|false] (lgs)", minLevel: 0 },
	loglevel: {
		usage: "loglevel <INF|WRN|ERR|EXC|ALL> <true|false>",
		minLevel: 0,
	},
	clear: { usage: "clear", minLevel: 1000 },
	memprofile: { usage: "memprofile (mprof)", minLevel: 1000 },
	profiler: { usage: "profiler", minLevel: 1000 },
	profiling: { usage: "profiling", minLevel: 1000 },
	profilenetwork: { usage: "profilenetwork", minLevel: 1000 },
	meshdatamanager: { usage: "meshdatamanager (mdm)", minLevel: 1000 },
	exception: { usage: "exception <message>", minLevel: 0 },
	testloop: { usage: "testloop", minLevel: 0 },
	unittest: { usage: "unittest", minLevel: 0 },
	SystemInfo: { usage: "SystemInfo", minLevel: 1000 },
	occlusion: { usage: "occlusion <subcommand>", minLevel: 1000 },
	testoccreport: { usage: "testoccreport (toccr)", minLevel: 1000 },
	openiddebug: { usage: "openiddebug <on|off>", minLevel: 0 },

	// Communication
	say: { usage: "say <message>", minLevel: 1 },
	help: { usage: "help [command]", minLevel: 1000 },
	version: { usage: "version", minLevel: 1000 },
	versionui: { usage: "versionui", minLevel: 1000 },

	// Lists & Lookup
	listitems: { usage: "listitems [filter] (li)", minLevel: 1000 },
	listdlc: { usage: "listdlc (dlcs)", minLevel: 1000 },
	listgameobjects: { usage: "listgameobjects (lgo)", minLevel: 1000 },
	listpes: { usage: "listpes [name]", minLevel: 1000 },

	// AI & Director
	ai: { usage: "ai <subcommand>", minLevel: 0 },
	aiddebug: { usage: "aiddebug", minLevel: 0 },
	utilityai: { usage: "utilityai (uai)", minLevel: 0 },
	actiondelay: { usage: "actiondelay [seconds] (ad)", minLevel: 0 },
	adjustmarkup: { usage: "adjustmarkup", minLevel: 0 },
	dialog: { usage: "dialog (dialogs)", minLevel: 0 },
	sleeper: { usage: "sleeper", minLevel: 1000 },

	// Rendering & Visuals
	enablerendering: { usage: "enablerendering <on|off>", minLevel: 0 },
	showClouds: { usage: "showClouds", minLevel: 1000 },
	lights: { usage: "lights", minLevel: 1000 },
	gfx: { usage: "gfx", minLevel: 1000 },
	graph: { usage: "graph", minLevel: 1000 },

	// Network
	networkclient: { usage: "networkclient (netc)", minLevel: 1000 },
	networkserver: { usage: "networkserver (nets)", minLevel: 0 },

	// Audio
	audio: { usage: "audio", minLevel: 1000 },
	dms: { usage: "dms <subcommand>", minLevel: 1000 },
	mumblepositionalaudio: { usage: "mumblepositionalaudio (mpa)", minLevel: 1000 },

	// Dynamic Mesh
	dynamicmesh: { usage: "dynamicmesh (zz)", minLevel: 0 },
	dynamicmeshdebug: { usage: "dynamicmeshdebug (zd)", minLevel: 0 },
	dynamicproperties: { usage: "dynamicproperties (dprop)", minLevel: 1000 },

	// SCore / Utility Mods
	ReloadSCore: { usage: "ReloadSCore <xmlName>", minLevel: 0 },
	weaponsway: { usage: "weaponsway <args>", minLevel: 1000 },
	gears: { usage: "gears <args>", minLevel: 0 },
	quartz: { usage: "quartz <args>", minLevel: 0 },
	fireclear: { usage: "fireclear", minLevel: 0 },

	// BeyondStorage
	bsclearcache: { usage: "bsclearcache", minLevel: 0 },
	bshelp: { usage: "bshelp", minLevel: 1000 },
	bsreloadconfig: { usage: "bsreloadconfig", minLevel: 0 },
	bssetconfig: { usage: "bssetconfig <key> <value>", minLevel: 0 },
	bsshowconfig: { usage: "bsshowconfig", minLevel: 1000 },

	// Discord / Twitch
	discord: { usage: "discord (dc)", minLevel: 1000 },
	twitch: { usage: "twitch <command> <params>", minLevel: 0 },
	twitchadmin: { usage: "twitchadmin", minLevel: 0 },

	// Misc Server
	AdminSpeed: { usage: "AdminSpeed [value] (as)", minLevel: 0 },
	AccDecay: { usage: "AccDecay [show|hide|reset|<value>] (SetAccDecay|SetAccuracyDecay|sad)", minLevel: 1000 },
	challenges: { usage: "challenges <subcommand>", minLevel: 1000 },
	damagereset: { usage: "damagereset", minLevel: 0 },
	decomgr: { usage: "decomgr [state]", minLevel: 1000 },
	invalidatecaches: { usage: "invalidatecaches", minLevel: 0 },
	maivd: { usage: "maivd", minLevel: 1000 },
	na: { usage: "na", minLevel: 1000 },
	pirs: { usage: "pirs", minLevel: 1000 },
	plc: { usage: "plc", minLevel: 1000 },
	stab: { usage: "stab", minLevel: 1000 },
	tcs: { usage: "tcs (testCoverSystem)", minLevel: 1000 },
	tls: { usage: "tls", minLevel: 1000 },
	traderarea: { usage: "traderarea", minLevel: 1000 },
	transformdebug: { usage: "transformdebug (tdbg)", minLevel: 1000 },
	floatingorigin: { usage: "floatingorigin (fo)", minLevel: 1000 },
	xui: { usage: "xui <args>", minLevel: 0 },
	uioptions: { usage: "uioptions <key> <value> (uio)", minLevel: 0 },
	reloadentityclasses: { usage: "reloadentityclasses (rec)", minLevel: 0 },
	reloadlog: { usage: "reloadlog (rlog)", minLevel: 1000 },
	wsmats: { usage: "wsmats (workstationmaterials)", minLevel: 0 },

	// Search / Help Utilities
	search: { usage: "search <string>", minLevel: 1000 },
	output: { usage: "output", minLevel: 1000 },
	outputdetailed: { usage: "outputdetailed", minLevel: 1000 },

	// NaiwaziBot / Custom Mod Commands (observed on this server)
	nwzbotblockfill: { usage: "nwzbot-blockfill <args>", minLevel: 0 },
	nwzbotremoveentity: { usage: "nwzbot-removeentity <args>", minLevel: 0 },
	nwzbot_test: { usage: "nwzbot-test <args>", minLevel: 0 },
} as const;

export type CommandName = keyof typeof TELNET_COMMANDS;
