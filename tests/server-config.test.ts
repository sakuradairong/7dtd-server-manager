import * as fs from "fs";
import * as path from "path";
import { ServerConfigManager } from "../src/main/server-config";

describe("ServerConfigManager", () => {
	let tempDir: string;
	let configFile: string;
	let manager: ServerConfigManager;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join("/tmp", "7dtd-config-test-"));
		configFile = path.join(tempDir, "serverconfig.xml");
		fs.writeFileSync(
			configFile,
			`<?xml version="1.0" encoding="UTF-8"?>
<ServerSettings>
  <property name="ServerName" value="My Server"/>
  <property name="ServerPort" value="26900"/>
  <property name="MaxPlayers" value="8"/>
  <property name="ZombiesRun" value="0"/>
</ServerSettings>`,
		);
		manager = new ServerConfigManager();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("loads serverconfig.xml properties", () => {
		const config = manager.load(configFile);

		expect(config.filePath).toBe(configFile);
		expect(config.properties).toHaveLength(4);
		expect(config.properties).toContainEqual({
			name: "ServerName",
			value: "My Server",
		});
		expect(config.properties).toContainEqual({
			name: "MaxPlayers",
			value: "8",
		});
	});

	it("saves updated properties while preserving XML declaration", () => {
		manager.save(configFile, [
			{ name: "ServerName", value: "Updated Server" },
			{ name: "MaxPlayers", value: "16" },
		]);

		const updated = manager.load(configFile);
		expect(updated.properties).toContainEqual({
			name: "ServerName",
			value: "Updated Server",
		});
		expect(updated.properties).toContainEqual({
			name: "MaxPlayers",
			value: "16",
		});

		const rawContent = fs.readFileSync(configFile, "utf8");
		expect(
			rawContent.startsWith('<?xml version="1.0" encoding="UTF-8"?>'),
		).toBe(true);
	});

	it("returns editable subset of properties", () => {
		const config = manager.load(configFile);
		const editable = manager.getEditableProperties(config);

		expect(editable).toContainEqual({ name: "ServerName", value: "My Server" });
		expect(editable).toContainEqual({ name: "MaxPlayers", value: "8" });
		expect(editable).not.toContainEqual({
			name: "UnknownProperty",
			value: "value",
		});
	});

	it("handles invalid XML gracefully", () => {
		fs.writeFileSync(configFile, "<ServerSettings><unclosed>");
		const config = manager.load(configFile);
		expect(config.filePath).toBe(configFile);
		expect(config.properties).toEqual([]);
	});

	it("handles XML missing ServerSettings root gracefully", () => {
		fs.writeFileSync(
			configFile,
			`<?xml version="1.0" encoding="UTF-8"?>
<NotServerSettings>
  <property name="ServerName" value="My Server"/>
</NotServerSettings>`,
		);
		const config = manager.load(configFile);
		expect(config.properties).toEqual([]);
	});

	it("handles empty file gracefully", () => {
		fs.writeFileSync(configFile, "");
		const config = manager.load(configFile);
		expect(config.properties).toEqual([]);
	});
});
