import { app, BrowserWindow, ipcMain, dialog } from "electron";
import * as path from "path";
import { TelnetClient } from "./telnet-client";
import { ServerApi } from "./server-api";
import { FileLogger } from "./logger";
import { ServerConfigManager } from "./server-config";
import { ProfileManager } from "./profile-manager";
import type { ServerConfig, CommandResult } from "../common/types";

let mainWindow: BrowserWindow | null = null;
let telnetClient: TelnetClient | null = null;
let serverApi: ServerApi | null = null;
let logger: FileLogger | null = null;
let profileManager: ProfileManager | null = null;
const serverConfigManager = new ServerConfigManager();

function getProfileManager(): ProfileManager {
	if (!profileManager) {
		profileManager = new ProfileManager(app.getPath("userData"));
	}
	return profileManager;
}

function createWindow(): void {
	mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		webPreferences: {
			preload: path.join(__dirname, "../renderer/preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

function getLogger(): FileLogger {
	if (!logger) {
		const logDir = path.join(app.getPath("userData"), "logs");
		logger = new FileLogger(logDir, 30);
	}
	return logger;
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
	telnetClient?.disconnect();
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	if (mainWindow === null) {
		createWindow();
	}
});

// IPC handlers
ipcMain.handle("connect", async (_event, config: ServerConfig) => {
	try {
		telnetClient?.disconnect();
		telnetClient = new TelnetClient(config);
		serverApi = new ServerApi(telnetClient);

		setupClientEvents(telnetClient);
		await telnetClient.connect();

		getLogger().log(`Connected to ${config.host}:${config.port}`, "event");
		return { success: true, state: telnetClient.getState() };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		getLogger().log(`Connection failed: ${message}`, "error");
		return { success: false, error: message };
	}
});

ipcMain.handle("disconnect", () => {
	telnetClient?.disconnect();
	telnetClient = null;
	serverApi = null;
	getLogger().log("Disconnected from server", "event");
	return { success: true };
});

ipcMain.handle("getState", () => {
	return telnetClient?.getState() ?? { connected: false, authenticated: false };
});

ipcMain.handle("sendCommand", async (_event, command: string) => {
	if (!serverApi) {
		return { success: false, error: "Not connected" };
	}

	getLogger().log(`> ${command}`, "command");

	try {
		const result = await serverApi.sendRaw(command);
		logCommandResult(result);
		return result;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		getLogger().log(`Command error (${command}): ${message}`, "error");
		return {
			success: false,
			error: message,
			command,
			response: "",
		};
	}
});

ipcMain.handle("apiCall", async (_event, method: string, args: unknown[]) => {
	if (!serverApi) {
		return { success: false, error: "Not connected" };
	}

	const apiRecord = serverApi as unknown as Record<
		string,
		(...methodArgs: unknown[]) => Promise<unknown>
	>;
	const apiMethod = apiRecord[method];
	if (typeof apiMethod !== "function") {
		return { success: false, error: `Unknown method: ${method}` };
	}

	getLogger().log(
		`API call: ${method}(${args.map((a) => JSON.stringify(a)).join(", ")})`,
		"command",
	);

	try {
		const result = await apiMethod.apply(serverApi, args);
		getLogger().log(
			`API result: ${method} = ${JSON.stringify(result).slice(0, 500)}`,
			"response",
		);
		return { success: true, data: result };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		getLogger().log(`API error (${method}): ${message}`, "error");
		return {
			success: false,
			error: message,
		};
	}
});

ipcMain.handle("getLogDirectory", () => {
	return getLogger().getLogDirectory();
});

ipcMain.handle("openLogDirectory", async () => {
	const { shell } = await import("electron");
	await shell.openPath(getLogger().getLogDirectory());
	return { success: true };
});

ipcMain.handle("selectServerConfigFile", async () => {
	if (!mainWindow) {
		return { success: false, error: "Window not available" };
	}

	const result = await dialog.showOpenDialog(mainWindow, {
		properties: ["openFile"],
		filters: [
			{ name: "XML Files", extensions: ["xml"] },
			{ name: "All Files", extensions: ["*"] },
		],
	});

	if (result.canceled || result.filePaths.length === 0) {
		return { success: false, error: "No file selected" };
	}

	return { success: true, filePath: result.filePaths[0] };
});

ipcMain.handle("getProfiles", () => {
	return { success: true, profiles: getProfileManager().getProfiles() };
});

ipcMain.handle(
	"saveProfile",
	(
		_event,
		profile: {
			id?: string;
			name: string;
			host: string;
			port: number;
			password: string;
		},
	) => {
		try {
			const saved = getProfileManager().saveProfile(profile);
			return { success: true, profile: saved };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { success: false, error: message };
		}
	},
);

ipcMain.handle("deleteProfile", (_event, id: string) => {
	const deleted = getProfileManager().deleteProfile(id);
	return { success: deleted };
});

ipcMain.handle("getLastUsedProfile", () => {
	return { success: true, profile: getProfileManager().getLastUsedProfile() };
});

ipcMain.handle("setLastUsedProfile", (_event, id: string) => {
	getProfileManager().setLastUsedProfile(id);
	return { success: true };
});

ipcMain.handle("loadServerConfig", async (_event, filePath: string) => {
	try {
		const config = serverConfigManager.load(filePath);
		const editable = serverConfigManager.getEditableProperties(config);
		return { success: true, config: { filePath, properties: editable } };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		getLogger().log(`Failed to load serverconfig.xml: ${message}`, "error");
		return { success: false, error: message };
	}
});

ipcMain.handle(
	"saveServerConfig",
	async (
		_event,
		filePath: string,
		updates: { name: string; value: string }[],
	) => {
		try {
			serverConfigManager.save(filePath, updates);
			getLogger().log(`Saved serverconfig.xml: ${filePath}`, "event");
			return { success: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			getLogger().log(`Failed to save serverconfig.xml: ${message}`, "error");
			return { success: false, error: message };
		}
	},
);

function logCommandResult(result: CommandResult): void {
	if (!result.success) {
		getLogger().log(
			`Command failed (${result.command}): ${result.error}`,
			"error",
		);
		return;
	}

	if (result.response) {
		const truncated =
			result.response.length > 1000
				? `${result.response.slice(0, 1000)}... [truncated]`
				: result.response;
		getLogger().log(`< ${truncated}`, "response");
	}
}

function setupClientEvents(client: TelnetClient): void {
	client.on("connected", () => {
		getLogger().log("Server event: connected", "event");
		mainWindow?.webContents.send("server-event", { type: "connected" });
	});

	client.on("authenticated", () => {
		getLogger().log("Server event: authenticated", "event");
		mainWindow?.webContents.send("server-event", { type: "authenticated" });
	});

	client.on("disconnected", () => {
		getLogger().log("Server event: disconnected", "event");
		mainWindow?.webContents.send("server-event", { type: "disconnected" });
	});

	client.on("error", (error: Error) => {
		getLogger().log(`Server error: ${error.message}`, "error");
		mainWindow?.webContents.send("server-event", {
			type: "error",
			message: error.message,
		});
	});

	client.on("line", (line: string) => {
		getLogger().log(`Server line: ${line}`, "response");
		mainWindow?.webContents.send("server-event", { type: "line", line });
	});
}
