import type { ElectronApi } from "./preload";

declare global {
	interface Window {
		electronAPI: ElectronApi;
	}
}

const api = window.electronAPI;

const connectionForm = document.getElementById(
	"connection-form",
) as HTMLFormElement;
const commandForm = document.getElementById("command-form") as HTMLFormElement;
const connectBtn = document.getElementById("connect-btn") as HTMLButtonElement;
const disconnectBtn = document.getElementById(
	"disconnect-btn",
) as HTMLButtonElement;
const statusDot = document.getElementById("status-dot") as HTMLSpanElement;
const statusText = document.getElementById("status-text") as HTMLSpanElement;
const logOutput = document.getElementById("log-output") as HTMLPreElement;
const playersTableBody = document.querySelector(
	"#players-table tbody",
) as HTMLTableSectionElement;
const refreshPlayersBtn = document.getElementById(
	"refresh-players",
) as HTMLButtonElement;
const clearLogBtn = document.getElementById("clear-log") as HTMLButtonElement;
const openLogDirBtn = document.getElementById(
	"open-log-dir",
) as HTMLButtonElement;

let isConnected = false;

function log(
	message: string,
	type: "info" | "command" | "response" | "error" | "event" = "info",
): void {
	const entry = document.createElement("div");
	entry.className = `log-entry ${type}`;
	entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
	logOutput.appendChild(entry);
	logOutput.scrollTop = logOutput.scrollHeight;
}

function clearLog(): void {
	while (logOutput.firstChild) {
		logOutput.removeChild(logOutput.firstChild);
	}
}

function clearPlayersTable(): void {
	while (playersTableBody.firstChild) {
		playersTableBody.removeChild(playersTableBody.firstChild);
	}
}

function updateStatus(state: {
	connected: boolean;
	authenticated: boolean;
	lastError?: string;
}): void {
	statusDot.className = "status-dot";

	if (state.authenticated) {
		statusDot.classList.add("authenticated");
		statusText.textContent = "已认证";
		isConnected = true;
	} else if (state.connected) {
		statusDot.classList.add("connected");
		statusText.textContent = "已连接（未认证）";
		isConnected = true;
	} else {
		statusDot.classList.add("disconnected");
		statusText.textContent = state.lastError
			? `未连接 (${state.lastError})`
			: "未连接";
		isConnected = false;
	}

	connectBtn.disabled = isConnected;
	disconnectBtn.disabled = !isConnected;
}

connectionForm.addEventListener("submit", async (event) => {
	event.preventDefault();

	const host = (document.getElementById("host") as HTMLInputElement).value;
	const port = parseInt(
		(document.getElementById("port") as HTMLInputElement).value,
		10,
	);
	const password = (document.getElementById("password") as HTMLInputElement)
		.value;

	log(`正在连接到 ${host}:${port}...`, "event");

	const result = await api.connect({ host, port, password, timeoutMs: 10000 });

	if (result.success) {
		log("连接成功", "event");
		updateStatus(
			result.state as { connected: boolean; authenticated: boolean },
		);
		await refreshPlayers();
	} else {
		log(`连接失败: ${result.error}`, "error");
		updateStatus({
			connected: false,
			authenticated: false,
			lastError: result.error,
		});
	}
});

disconnectBtn.addEventListener("click", async () => {
	await api.disconnect();
	log("已断开连接", "event");
	updateStatus({ connected: false, authenticated: false });
	clearPlayersTable();
});

commandForm.addEventListener("submit", async (event) => {
	event.preventDefault();

	const input = document.getElementById("command-input") as HTMLInputElement;
	const command = input.value.trim();

	if (!command) return;

	log(`> ${command}`, "command");
	input.value = "";

	const result = await api.sendCommand(command);

	if (result.success) {
		if (result.response) {
			log(result.response, "response");
		}
	} else {
		log(`错误: ${result.error}`, "error");
	}
});

document.querySelectorAll(".action-btn").forEach((button) => {
	button.addEventListener("click", async () => {
		const action = (button as HTMLButtonElement).dataset.action!;
		const confirmMessage = (button as HTMLButtonElement).dataset.confirm;

		if (confirmMessage && !window.confirm(confirmMessage)) {
			return;
		}

		log(`> ${action}`, "command");
		const result = await api.sendCommand(action);

		if (result.success) {
			log(result.response || "命令执行成功", "response");
			if (action === "listplayers") {
				await refreshPlayers();
			}
		} else {
			log(`错误: ${result.error}`, "error");
		}
	});
});

refreshPlayersBtn.addEventListener("click", refreshPlayers);

clearLogBtn.addEventListener("click", clearLog);

openLogDirBtn.addEventListener("click", async () => {
	try {
		const result = await api.openLogDirectory();
		if (!result.success) {
			log(`打开日志目录失败: ${result.error}`, "error");
		}
	} catch (error) {
		log(
			`打开日志目录失败: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
});

async function refreshPlayers(): Promise<void> {
	if (!isConnected) return;

	const result = await api.apiCall("listPlayers", []);

	if (result.success) {
		renderPlayers(
			result.data as Array<{
				entityId: number;
				name: string;
				level?: number;
				health?: number;
				position?: { x: number; y: number; z: number };
				ping?: number;
			}>,
		);
	} else {
		log(`获取玩家列表失败: ${result.error}`, "error");
	}
}

function createCell(text: string): HTMLTableCellElement {
	const cell = document.createElement("td");
	cell.textContent = text;
	return cell;
}

function createPlayerActionButton(
	action: string,
	playerName: string,
): HTMLButtonElement {
	const button = document.createElement("button");
	button.dataset.action = action;
	button.dataset.player = playerName;
	button.textContent = action === "kick" ? "踢出" : "击杀";
	return button;
}

function renderEmptyPlayersRow(): void {
	clearPlayersTable();
	const row = document.createElement("tr");
	row.className = "empty-row";
	const cell = document.createElement("td");
	cell.colSpan = 7;
	cell.textContent = "暂无在线玩家";
	row.appendChild(cell);
	playersTableBody.appendChild(row);
}

function renderPlayers(
	players: Array<{
		entityId: number;
		name: string;
		level?: number;
		health?: number;
		position?: { x: number; y: number; z: number };
		ping?: number;
	}>,
): void {
	clearPlayersTable();

	if (players.length === 0) {
		renderEmptyPlayersRow();
		return;
	}

	for (const player of players) {
		const row = document.createElement("tr");
		const positionText = player.position
			? `${Math.round(player.position.x)}, ${Math.round(player.position.y)}, ${Math.round(player.position.z)}`
			: "-";

		row.appendChild(createCell(String(player.entityId)));
		row.appendChild(createCell(player.name));
		row.appendChild(createCell(String(player.level ?? "-")));
		row.appendChild(createCell(String(player.health ?? "-")));
		row.appendChild(createCell(positionText));
		row.appendChild(createCell(String(player.ping ?? "-")));

		const actionsCell = document.createElement("td");
		const actionsDiv = document.createElement("div");
		actionsDiv.className = "player-actions";
		actionsDiv.appendChild(createPlayerActionButton("kick", player.name));
		actionsDiv.appendChild(createPlayerActionButton("kill", player.name));
		actionsCell.appendChild(actionsDiv);
		row.appendChild(actionsCell);

		playersTableBody.appendChild(row);
	}

	playersTableBody.querySelectorAll("button[data-action]").forEach((button) => {
		button.addEventListener("click", async () => {
			const action = (button as HTMLButtonElement).dataset.action!;
			const playerName = (button as HTMLButtonElement).dataset.player!;

			let command = action;
			if (action === "kick") {
				const reason = window.prompt(`踢出 ${playerName} 的原因:`);
				command = reason
					? `kick "${escapeArgument(playerName)}" "${escapeArgument(reason)}"`
					: `kick "${escapeArgument(playerName)}"`;
			} else if (action === "kill") {
				command = `kill "${escapeArgument(playerName)}"`;
			}

			log(`> ${command}`, "command");
			const result = await api.sendCommand(command);

			if (result.success) {
				log(result.response || "操作成功", "response");
				await refreshPlayers();
			} else {
				log(`错误: ${result.error}`, "error");
			}
		});
	});
}

function escapeArgument(text: string): string {
	return text.replace(/"/g, '""');
}

// --- Server Config Editing ---

const selectConfigFileBtn = document.getElementById(
	"select-config-file",
) as HTMLButtonElement;
const saveConfigBtn = document.getElementById(
	"save-config",
) as HTMLButtonElement;
const configFilePathEl = document.getElementById(
	"config-file-path",
) as HTMLDivElement;
const configForm = document.getElementById("config-form") as HTMLFormElement;

let currentConfigFilePath: string | null = null;

selectConfigFileBtn.addEventListener("click", async () => {
	try {
		const result = await api.selectServerConfigFile();
		if (!result.success || !result.filePath) {
			log(`选择文件失败: ${result.error}`, "error");
			return;
		}

		currentConfigFilePath = result.filePath;
		configFilePathEl.textContent = result.filePath;

		const loadResult = await api.loadServerConfig(result.filePath);
		if (!loadResult.success || !loadResult.config) {
			log(`加载配置失败: ${loadResult.error}`, "error");
			return;
		}

		renderConfigForm(loadResult.config.properties);
		saveConfigBtn.disabled = false;
		log(`已加载服务器配置: ${loadResult.config.properties.length} 项`, "event");
	} catch (error) {
		log(
			`选择配置文件失败: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
});

saveConfigBtn.addEventListener("click", async () => {
	if (!currentConfigFilePath) return;

	const updates: { name: string; value: string }[] = [];
	configForm.querySelectorAll(".config-row").forEach((row) => {
		const name = (row.querySelector("label") as HTMLLabelElement).textContent!;
		const value = (row.querySelector("input") as HTMLInputElement).value;
		updates.push({ name, value });
	});

	try {
		const result = await api.saveServerConfig(currentConfigFilePath, updates);
		if (result.success) {
			log("服务器配置已保存", "event");
		} else {
			log(`保存配置失败: ${result.error}`, "error");
		}
	} catch (error) {
		log(
			`保存配置失败: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
});

function renderConfigForm(properties: { name: string; value: string }[]): void {
	while (configForm.firstChild) {
		configForm.removeChild(configForm.firstChild);
	}

	for (const property of properties) {
		const row = document.createElement("div");
		row.className = "config-row";

		const label = document.createElement("label");
		label.textContent = property.name;

		const input = document.createElement("input");
		input.type = "text";
		input.value = property.value;
		input.dataset.name = property.name;

		row.appendChild(label);
		row.appendChild(input);
		configForm.appendChild(row);
	}
}

api.onServerEvent((event) => {
	switch (event.type) {
		case "connected":
			log("服务器事件: 已连接", "event");
			break;
		case "authenticated":
			log("服务器事件: 已认证", "event");
			updateStatus({ connected: true, authenticated: true });
			break;
		case "disconnected":
			log("服务器事件: 已断开", "event");
			updateStatus({ connected: false, authenticated: false });
			clearPlayersTable();
			break;
		case "error":
			log(`服务器错误: ${event.message}`, "error");
			break;
		case "line":
			log(`< ${event.line}`, "response");
			break;
	}
});

// --- Profile Management ---

const profileSelect = document.getElementById(
	"profile-select",
) as HTMLSelectElement;
const saveProfileBtn = document.getElementById(
	"save-profile",
) as HTMLButtonElement;
const deleteProfileBtn = document.getElementById(
	"delete-profile",
) as HTMLButtonElement;

interface Profile {
	id: string;
	name: string;
	host: string;
	port: number;
	password: string;
}

let profiles: Profile[] = [];

async function loadProfiles(): Promise<void> {
	try {
		const result = await api.getProfiles();
		if (!result.success) return;

		profiles = result.profiles;
		populateProfileSelect();

		const lastUsed = await api.getLastUsedProfile();
		if (lastUsed.success && lastUsed.profile) {
			profileSelect.value = lastUsed.profile.id;
			fillConnectionForm(lastUsed.profile);
			deleteProfileBtn.disabled = false;
		}
	} catch (error) {
		log(
			`加载配置文件失败: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
}

function populateProfileSelect(): void {
	while (profileSelect.options.length > 1) {
		profileSelect.remove(1);
	}

	for (const profile of profiles) {
		const option = document.createElement("option");
		option.value = profile.id;
		option.textContent = profile.name;
		profileSelect.appendChild(option);
	}
}

function fillConnectionForm(profile: Profile): void {
	(document.getElementById("host") as HTMLInputElement).value = profile.host;
	(document.getElementById("port") as HTMLInputElement).value = String(
		profile.port,
	);
	(document.getElementById("password") as HTMLInputElement).value =
		profile.password;
}

function getConnectionFormValues(): {
	host: string;
	port: number;
	password: string;
} {
	return {
		host: (document.getElementById("host") as HTMLInputElement).value,
		port: parseInt(
			(document.getElementById("port") as HTMLInputElement).value,
			10,
		),
		password: (document.getElementById("password") as HTMLInputElement).value,
	};
}

profileSelect.addEventListener("change", async () => {
	const profileId = profileSelect.value;
	deleteProfileBtn.disabled = !profileId;

	if (!profileId) {
		return;
	}

	const profile = profiles.find((p) => p.id === profileId);
	if (profile) {
		fillConnectionForm(profile);
		await api.setLastUsedProfile(profileId);
	}
});

saveProfileBtn.addEventListener("click", async () => {
	const values = getConnectionFormValues();
	const profileId = profileSelect.value;
	const profile = profileId
		? profiles.find((p) => p.id === profileId)
		: undefined;

	const name = window.prompt(
		"配置文件名称:",
		profile?.name ?? `${values.host}:${values.port}`,
	);
	if (!name) return;

	try {
		const result = await api.saveProfile({
			id: profile?.id,
			name,
			...values,
		});

		if (result.success && result.profile) {
			await loadProfiles();
			profileSelect.value = result.profile.id;
			deleteProfileBtn.disabled = false;
			log("连接配置已保存", "event");
		} else {
			log(`保存配置失败: ${result.error}`, "error");
		}
	} catch (error) {
		log(
			`保存配置失败: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
});

deleteProfileBtn.addEventListener("click", async () => {
	const profileId = profileSelect.value;
	if (!profileId) return;

	if (!window.confirm("确定要删除此连接配置吗?")) return;

	try {
		const result = await api.deleteProfile(profileId);
		if (result.success) {
			await loadProfiles();
			profileSelect.value = "";
			deleteProfileBtn.disabled = true;
			log("连接配置已删除", "event");
		} else {
			log(`删除配置失败: ${result.error}`, "error");
		}
	} catch (error) {
		log(
			`删除配置失败: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
});

// Initialize
loadProfiles();

api
	.getState()
	.then(updateStatus)
	.catch(() => {
		updateStatus({ connected: false, authenticated: false });
	});
