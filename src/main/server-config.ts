import * as fs from "fs";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

export interface ServerConfigProperty {
	readonly name: string;
	readonly value: string;
}

export interface ServerConfigFile {
	readonly filePath: string;
	readonly properties: ServerConfigProperty[];
}

export interface ServerConfigUpdate {
	readonly name: string;
	readonly value: string;
}

interface RawProperty {
	"@_name": string;
	"@_value": string;
}

interface RawServerConfig {
	"?xml"?: string;
	ServerSettings?: {
		property: RawProperty | RawProperty[];
	};
}

export class ServerConfigManager {
	private parser: XMLParser;
	private builder: XMLBuilder;

	constructor() {
		this.parser = new XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: "@_",
			parseAttributeValue: false,
			trimValues: true,
		});
		this.builder = new XMLBuilder({
			ignoreAttributes: false,
			attributeNamePrefix: "@_",
			format: true,
			indentBy: "  ",
			suppressEmptyNode: true,
		});
	}

	load(filePath: string): ServerConfigFile {
		const content = fs.readFileSync(filePath, "utf8");
		const parsed = this.parser.parse(content) as RawServerConfig;

		const rawProperties = parsed.ServerSettings?.property;
		const properties: ServerConfigProperty[] = [];

		if (rawProperties) {
			const propertyArray = Array.isArray(rawProperties)
				? rawProperties
				: [rawProperties];

			for (const prop of propertyArray) {
				properties.push({
					name: prop["@_name"],
					value: prop["@_value"],
				});
			}
		}

		return { filePath, properties };
	}

	save(filePath: string, updates: ServerConfigUpdate[]): void {
		const content = fs.readFileSync(filePath, "utf8");
		const parsed = this.parser.parse(content) as RawServerConfig;

		if (!parsed.ServerSettings) {
			throw new Error("Invalid serverconfig.xml: missing ServerSettings root");
		}

		const updateMap = new Map(updates.map((u) => [u.name, u.value]));

		const rawProperties = parsed.ServerSettings.property;
		const propertyArray = Array.isArray(rawProperties)
			? rawProperties
			: rawProperties
				? [rawProperties]
				: [];

		for (const prop of propertyArray) {
			if (updateMap.has(prop["@_name"])) {
				prop["@_value"] = updateMap.get(prop["@_name"])!;
			}
		}

		// Preserve XML declaration from original if present
		const xmlDeclaration =
			content.match(/^<\?xml[^?]*\?>\s*/i)?.[0] ??
			'<?xml version="1.0" encoding="UTF-8"?>\n';
		const body = this.builder.build(parsed) as string;

		fs.writeFileSync(filePath, xmlDeclaration + body, "utf8");
	}

	getEditableProperties(config: ServerConfigFile): ServerConfigProperty[] {
		// Common 7DTD serverconfig.xml properties that admins frequently change
		const editableNames = new Set([
			"ServerName",
			"ServerDescription",
			"ServerWebsiteURL",
			"ServerPassword",
			"ServerLoginConfirmationText",
			"Region",
			"Language",
			"ServerPort",
			"ServerVisibility",
			"MaxPlayers",
			"MaxPlayerCount",
			"GameWorld",
			"WorldGenSeed",
			"WorldGenSize",
			"GameName",
			"GameDifficulty",
			"BlockDamagePlayer",
			"BlockDamageAI",
			"BlockDamageAIBM",
			"XPMultiplier",
			"PlayerSafeZoneLevel",
			"PlayerSafeZoneHours",
			"BuildCreate",
			"DayNightLength",
			"DayLightLength",
			"DeathPenalty",
			"DropOnDeath",
			"DropOnQuit",
			"BloodMoonEnemyCount",
			"EnemyDifficulty",
			"EnemySpawnMode",
			"ZombiesRun",
			"ZombieFeralSense",
			"ZombieBMMove",
			"ZombieFeralMove",
			"ZombieNormalMove",
			"ZombieNightMove",
			"EACEnabled",
			"LandClaimCount",
			"LandClaimSize",
			"LandClaimDeadZone",
			"LandClaimDecayMode",
			"LandClaimExpiryTime",
			"LandClaimOfflineDurabilityModifier",
			"LandClaimOnlineDurabilityModifier",
			"AirDropFrequency",
			"AirDropMarker",
			"PartySharedKillRange",
			"PlayerKillingMode",
			"PersistenceDirectory",
			"ChatWindowEnabled",
			"ShowFriendPlayerOnMap",
			"CameraRestrictionMode",
			"JarRefund",
			"AISmellMode",
		]);

		return config.properties.filter((prop) => editableNames.has(prop.name));
	}
}
