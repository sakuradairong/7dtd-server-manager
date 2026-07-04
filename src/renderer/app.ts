import { buildActionCommand, buildPlayerCommand } from "./command-builder.js";
import { TELNET_COMMANDS } from "./telnet-commands.gen.js";

type TauriUnlisten = () => void;
type TauriInvoke = <T>(
	command: string,
	args?: Record<string, unknown>,
) => Promise<T>;

interface TauriEvent<T> {
	payload: T;
}

interface TauriGlobal {
	core: {
		invoke: TauriInvoke;
	};
	event: {
		listen: <T>(
			event: string,
			handler: (event: TauriEvent<T>) => void,
		) => Promise<TauriUnlisten>;
	};
}

declare global {
	interface Window {
		__TAURI__?: TauriGlobal;
	}
}

function invokeTauri<T>(
	command: string,
	args?: Record<string, unknown>,
): Promise<T> {
	if (!window.__TAURI__) {
		return Promise.reject(new Error("No desktop runtime bridge is available"));
	}
	return window.__TAURI__.core.invoke<T>(command, args);
}

function createTauriApi(): DesktopApi {
	return {
		connect: (config) => invokeTauri("connect", { config }),
		disconnect: () => invokeTauri("disconnect"),
		getState: () => invokeTauri("get_state"),
		sendCommand: (command) => invokeTauri("send_command", { command }),
		apiCall: (method, args) => invokeTauri("api_call", { method, args }),
		getLogDirectory: () => invokeTauri("get_log_directory"),
		openLogDirectory: () => invokeTauri("open_log_directory"),
		selectServerConfigFile: () => invokeTauri("select_server_config_file"),
		loadServerConfig: (filePath) =>
			invokeTauri("load_server_config", { filePath }),
		saveServerConfig: (filePath, updates) =>
			invokeTauri("save_server_config", { filePath, updates }),
		selectMapDirectory: () => invokeTauri("select_map_directory"),
		getMapFiles: (directory) =>
			invokeTauri("get_map_files", { directory }),
		readMapImage: (filePath) =>
			invokeTauri("read_map_image", { filePath }),
		getProfiles: () => invokeTauri("get_profiles"),
		saveProfile: (profile) => invokeTauri("save_profile", { profile }),
		deleteProfile: (id) => invokeTauri("delete_profile", { id }),
		getLastUsedProfile: () => invokeTauri("get_last_used_profile"),
		setLastUsedProfile: (id) => invokeTauri("set_last_used_profile", { id }),
		onServerEvent: (callback) => {
			const unlistenPromise = window.__TAURI__?.event
				.listen<{ type: string; [key: string]: unknown }>(
					"server-event",
					(event) => callback(event.payload),
				)
				.catch((error) => {
					console.error("Failed to listen for server events", error);
				});

			return () => {
				void unlistenPromise?.then((unlisten) => unlisten?.());
			};
		},
	};
}

const api = createTauriApi();

function getRuntimeName(): string {
	return window.__TAURI__ ? "Tauri" : "Unknown";
}

const connectionForm = document.getElementById(
	"connection-form",
) as HTMLFormElement;
const commandForm = document.getElementById("command-form") as HTMLFormElement;
const commandInput = document.getElementById(
	"command-input",
) as HTMLInputElement;
const passwordInput = document.getElementById("password") as HTMLInputElement;
const togglePasswordBtn = document.getElementById(
	"toggle-password",
) as HTMLButtonElement;
const copyDiagnosticsBtn = document.getElementById(
	"copy-diagnostics",
) as HTMLButtonElement;
const copyLogBtn = document.getElementById("copy-log") as HTMLButtonElement;
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
const connectionDiagnostics = document.getElementById(
	"connection-diagnostics",
) as HTMLDivElement;
const actionButtons = Array.from(
	document.querySelectorAll<HTMLButtonElement>(".action-btn, .cmd-btn"),
);
const iconSidebar = document.getElementById("icon-sidebar") as HTMLElement;
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
const navItems = Array.from(document.querySelectorAll(".nav-item"));
const serverAddressEl = document.getElementById(
	"server-address",
) as HTMLSpanElement;
const resultModal = document.getElementById(
	"result-modal",
) as HTMLDivElement;
const modalTitle = document.getElementById(
	"modal-title",
) as HTMLHeadingElement;
const modalContent = document.getElementById(
	"modal-content",
) as HTMLPreElement;
const modalCloseBtn = document.getElementById(
	"modal-close",
) as HTMLButtonElement;
const modalCloseBtn2 = document.getElementById(
	"modal-close-btn",
) as HTMLButtonElement;
const modalCopyBtn = document.getElementById(
	"modal-copy",
) as HTMLButtonElement;

let isConnected = false;
const connectionDiagnosticMessages: string[] = [];
const seenConnectionDiagnostics = new Set<string>();
const commandHistory: string[] = [];
let commandHistoryIndex = 0;

const MAX_LOG_ENTRIES = 500;
let pendingScroll = false;

function log(
	message: string,
	type: "info" | "command" | "response" | "error" | "event" = "info",
): void {
	const entry = document.createElement("div");
	entry.className = `log-entry ${type}`;
	entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
	logOutput.appendChild(entry);

	while (logOutput.childElementCount > MAX_LOG_ENTRIES) {
		logOutput.removeChild(logOutput.firstChild!);
	}

	if (!pendingScroll) {
		pendingScroll = true;
		requestAnimationFrame(() => {
			logOutput.scrollTop = logOutput.scrollHeight;
			pendingScroll = false;
		});
	}
}

function showResultModal(title: string, content: string): void {
	modalTitle.textContent = title;
	modalContent.textContent = content;
	resultModal.classList.add("active");
	resultModal.setAttribute("aria-hidden", "false");
}

function closeResultModal(): void {
	resultModal.classList.remove("active");
	resultModal.setAttribute("aria-hidden", "true");
	modalContent.textContent = "";
}

function appendConnectionDiagnostic(
	message: string,
	options: { dedupe?: boolean } = {},
): boolean {
	if (options.dedupe && seenConnectionDiagnostics.has(message)) {
		return false;
	}
	if (options.dedupe) {
		seenConnectionDiagnostics.add(message);
	}

	connectionDiagnosticMessages.push(
		`[${new Date().toLocaleTimeString()}] ${message}`,
	);
	if (connectionDiagnosticMessages.length > 20) {
		connectionDiagnosticMessages.shift();
	}
	connectionDiagnostics.textContent = connectionDiagnosticMessages.join("\n");
	return true;
}

function resetConnectionDiagnostics(message: string): void {
	connectionDiagnosticMessages.length = 0;
	seenConnectionDiagnostics.clear();
	appendConnectionDiagnostic(message);
}

function logConnectionDiagnostics(
	diagnostics: readonly ConnectionDiagnostic[] | undefined,
): void {
	if (!diagnostics || diagnostics.length === 0) return;
	for (const diagnostic of diagnostics) {
		const message = `连接诊断[${diagnostic.phase}]: ${diagnostic.message}`;
		if (appendConnectionDiagnostic(message, { dedupe: true })) {
			log(message, "event");
		}
	}
}

log(`客户端已启动，运行时: ${getRuntimeName()}`, "event");
resetConnectionDiagnostics(`客户端已启动，运行时: ${getRuntimeName()}`);

async function copyTextToClipboard(text: string): Promise<boolean> {
	if (!text.trim()) return false;
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

function getLogText(): string {
	return Array.from(logOutput.querySelectorAll(".log-entry"))
		.map((entry) => entry.textContent ?? "")
		.filter(Boolean)
		.join("\n");
}

function clearElement(element: Element): void {
	while (element.firstChild) {
		element.removeChild(element.firstChild);
	}
}

function clearLog(): void {
	clearElement(logOutput);
}

function clearPlayersTable(): void {
	clearElement(playersTableBody);
}

function updateCommandControls(enabled: boolean): void {
	commandInput.disabled = !enabled;
	refreshPlayersBtn.disabled = !enabled;
	for (const button of actionButtons) {
		button.disabled = !enabled;
	}
	renderCommandList();
}

function switchTab(tabId: string): void {
	for (const panel of tabPanels) {
		const isActive = panel.id === `tab-${tabId}`;
		panel.classList.toggle("active", isActive);
	}
	for (const item of navItems) {
		const isActive = item.getAttribute("data-tab") === tabId;
		item.classList.toggle("active", isActive);
		item.setAttribute("aria-selected", String(isActive));
		item.setAttribute("tabindex", isActive ? "0" : "-1");
	}
}

iconSidebar.addEventListener("click", (event) => {
	const target = (event.target as HTMLElement).closest(
		".nav-item",
	) as HTMLElement | null;
	if (!target) return;
	const tabId = target.getAttribute("data-tab");
	if (!tabId) return;
	switchTab(tabId);
});

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
		statusText.textContent = "已连接";
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
	updateCommandControls(isConnected);
}

connectionForm.addEventListener("submit", async (event) => {
	event.preventDefault();

	const originalConnectText = connectBtn.textContent ?? "连接";
	connectBtn.disabled = true;
	disconnectBtn.disabled = true;
	connectBtn.textContent = "连接中...";

	const host = (document.getElementById("host") as HTMLInputElement).value;
	const port = parseInt(
		(document.getElementById("port") as HTMLInputElement).value,
		10,
	);
	const password = passwordInput.value;

	log(`正在连接到 ${host}:${port}...`, "event");
	resetConnectionDiagnostics(`正在连接到 ${host}:${port}...`);

	try {
		const result = await api.connect({
			host,
			port,
			password,
			timeoutMs: 10000,
		});
		logConnectionDiagnostics(result.diagnostics);

		if (result.success) {
			log("连接成功", "event");
			appendConnectionDiagnostic("连接成功");
			updateStatus(
				result.state as { connected: boolean; authenticated: boolean },
			);
			serverAddressEl.textContent = `${host}:${port}`;
			await refreshPlayers();
		} else {
			log(`连接失败: ${result.error}`, "error");
			appendConnectionDiagnostic(`连接失败: ${result.error}`);
			updateStatus({
				connected: false,
				authenticated: false,
				lastError: result.error,
			});
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log(`连接调用异常: ${message}`, "error");
		appendConnectionDiagnostic(`连接调用异常: ${message}`);
		updateStatus({
			connected: false,
			authenticated: false,
			lastError: message,
		});
	} finally {
		connectBtn.textContent = originalConnectText;
		connectBtn.disabled = isConnected;
		disconnectBtn.disabled = !isConnected;
	}
});

disconnectBtn.addEventListener("click", async () => {
	await api.disconnect();
	log("已断开连接", "event");
	updateStatus({ connected: false, authenticated: false });
	serverAddressEl.textContent = "--";
	clearPlayersTable();
});

commandForm.addEventListener("submit", async (event) => {
	event.preventDefault();

	const command = commandInput.value.trim();

	if (!command) return;

	if (commandHistory[commandHistory.length - 1] !== command) {
		commandHistory.push(command);
		if (commandHistory.length > 50) commandHistory.shift();
	}
	commandHistoryIndex = commandHistory.length;

	log(`> ${command}`, "command");
	commandInput.value = "";

	const result = await api.sendCommand(command);

	if (result.success) {
		if (result.response) {
			log(result.response, "response");
		}
	} else {
		log(`错误: ${result.error}`, "error");
	}
});

document.querySelectorAll(".action-btn, .cmd-btn").forEach((button) => {
	button.addEventListener("click", async () => {
		const btn = button as HTMLButtonElement;
		const action = btn.dataset.action!;
		const confirmMessage = btn.dataset.confirm;
		const fixedArgs = btn.dataset.args;
		const promptLabel = btn.dataset.prompt;
		const isCmdBtn = btn.classList.contains("cmd-btn");

		if (confirmMessage && !window.confirm(confirmMessage)) {
			return;
		}

		const promptValue = promptLabel ? window.prompt(promptLabel) : undefined;
		if (promptValue === null) return;

		const command = buildActionCommand({
			action,
			fixedArgs,
			promptValue,
			quotePrompt: btn.dataset.quotePrompt !== "false",
		});

		log(`> ${command}`, "command");
		const result = await api.sendCommand(command);

		if (result.success) {
			const responseText = result.response || "命令执行成功";
			log(responseText, "response");
			if (isCmdBtn) {
				showResultModal(command, responseText);
			}
			if (action === "listplayers") {
				await refreshPlayers();
			}
		} else {
			const errorText = `错误: ${result.error}`;
			log(errorText, "error");
			if (isCmdBtn) {
				showResultModal(`${command} - 错误`, result.error || "未知错误");
			}
		}
	});
});

commandInput.addEventListener("keydown", (event) => {
	if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
	if (commandHistory.length === 0) return;

	event.preventDefault();
	if (event.key === "ArrowUp") {
		commandHistoryIndex = Math.max(0, commandHistoryIndex - 1);
	} else {
		commandHistoryIndex = Math.min(
			commandHistory.length,
			commandHistoryIndex + 1,
		);
	}
	commandInput.value = commandHistory[commandHistoryIndex] ?? "";
	commandInput.setSelectionRange(
		commandInput.value.length,
		commandInput.value.length,
	);
});

refreshPlayersBtn.addEventListener("click", refreshPlayers);

togglePasswordBtn.addEventListener("click", () => {
	const isHidden = passwordInput.type === "password";
	passwordInput.type = isHidden ? "text" : "password";
	togglePasswordBtn.textContent = isHidden ? "隐藏" : "显示";
});

copyDiagnosticsBtn.addEventListener("click", async () => {
	const copied = await copyTextToClipboard(
		connectionDiagnostics.textContent ?? "",
	);
	log(
		copied ? "连接诊断已复制" : "连接诊断为空或复制失败",
		copied ? "event" : "error",
	);
});

clearLogBtn.addEventListener("click", clearLog);

copyLogBtn.addEventListener("click", async () => {
	const copied = await copyTextToClipboard(getLogText());
	log(copied ? "日志已复制" : "日志为空或复制失败", copied ? "event" : "error");
});

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
	label: string,
): HTMLButtonElement {
	const button = document.createElement("button");
	button.dataset.action = action;
	button.dataset.player = playerName;
	button.textContent = label;
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

	const fragment = document.createDocumentFragment();
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
		actionsDiv.appendChild(
			createPlayerActionButton("kick", player.name, "踢出"),
		);
		actionsDiv.appendChild(
			createPlayerActionButton("kill", player.name, "击杀"),
		);
		actionsDiv.appendChild(
			createPlayerActionButton("sayplayer", player.name, "私聊"),
		);
		actionsDiv.appendChild(
			createPlayerActionButton("ban", player.name, "封禁"),
		);
		actionsCell.appendChild(actionsDiv);
		row.appendChild(actionsCell);

		fragment.appendChild(row);
	}
	playersTableBody.appendChild(fragment);
}

playersTableBody.addEventListener("click", async (event) => {
	const button = (event.target as HTMLElement).closest(
		"button[data-action]",
	) as HTMLButtonElement | null;
	if (!button) return;

	const action = button.dataset.action!;
	const playerName = button.dataset.player!;

	let promptValue: string | null | undefined;
	if (action === "kick") {
		promptValue = window.prompt(`踢出 ${playerName} 的原因（可选）:`);
		if (promptValue === null) return;
	} else if (action === "sayplayer") {
		promptValue = window.prompt(`发送给 ${playerName} 的私聊内容:`);
		if (promptValue === null || !promptValue.trim()) return;
	} else if (action === "ban") {
		promptValue = window.prompt(
			`封禁 ${playerName} 的时长/单位/原因，例如: 2 hours griefing`,
		);
		if (promptValue === null) return;
	}

	const command = buildPlayerCommand(action, playerName, promptValue);
	log(`> ${command}`, "command");
	const result = await api.sendCommand(command);

	if (result.success) {
		log(result.response || "操作成功", "response");
		await refreshPlayers();
	} else {
		log(`错误: ${result.error}`, "error");
	}
});

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

const CONFIG_PROPERTY_LABELS: Record<string, string> = {
	ServerName: "服务器名称",
	ServerDescription: "服务器描述",
	ServerWebsiteURL: "服务器网站",
	ServerPassword: "服务器密码",
	ServerLoginConfirmationText: "登录确认文本",
	Region: "地区",
	Language: "语言",
	ServerPort: "服务器端口",
	ServerVisibility: "服务器可见性",
	MaxPlayers: "最大玩家数",
	MaxPlayerCount: "最大玩家数（备用）",
	GameWorld: "游戏世界",
	WorldGenSeed: "世界种子",
	WorldGenSize: "世界大小",
	GameName: "游戏名称",
	GameDifficulty: "游戏难度",
	BlockDamagePlayer: "玩家方块伤害",
	BlockDamageAI: "AI 方块伤害",
	BlockDamageAIBM: "血月 AI 方块伤害",
	XPMultiplier: "经验倍率",
	PlayerSafeZoneLevel: "安全区等级",
	PlayerSafeZoneHours: "安全区时长",
	BuildCreate: "创造模式建造",
	DayNightLength: "昼夜长度",
	DayLightLength: "白天长度",
	DeathPenalty: "死亡惩罚",
	DropOnDeath: "死亡掉落",
	DropOnQuit: "退出掉落",
	BloodMoonEnemyCount: "血月敌人数",
	EnemyDifficulty: "敌人难度",
	EnemySpawnMode: "敌人生成模式",
	ZombiesRun: "僵尸奔跑",
	ZombieFeralSense: "僵尸野性感知",
	ZombieBMMove: "血月僵尸移动",
	ZombieFeralMove: "野性僵尸移动",
	ZombieNormalMove: "普通僵尸移动",
	ZombieNightMove: "夜间僵尸移动",
	EACEnabled: "反作弊启用",
	LandClaimCount: "领地声明数",
	LandClaimSize: "领地大小",
	LandClaimDeadZone: "领地死区",
	LandClaimDecayMode: "领地衰减模式",
	LandClaimExpiryTime: "领地过期时间",
	LandClaimOfflineDurabilityModifier: "离线耐久修正",
	LandClaimOnlineDurabilityModifier: "在线耐久修正",
	AirDropFrequency: "空投频率",
	AirDropMarker: "空投标记",
	PartySharedKillRange: "队伍共享击杀范围",
	PlayerKillingMode: "玩家击杀模式",
	PersistenceDirectory: "持久化目录",
	ChatWindowEnabled: "聊天窗口启用",
	ShowFriendPlayerOnMap: "好友地图显示",
	CameraRestrictionMode: "相机限制模式",
	JarRefund: "罐子返还",
	AISmellMode: "AI 嗅觉模式",
};

function renderConfigForm(properties: { name: string; value: string }[]): void {
	while (configForm.firstChild) {
		configForm.removeChild(configForm.firstChild);
	}

	for (const property of properties) {
		const row = document.createElement("div");
		row.className = "config-row";

		const label = document.createElement("label");
		label.textContent = CONFIG_PROPERTY_LABELS[property.name] ?? property.name;
		label.title = property.name;

		const input = document.createElement("input");
		input.type = "text";
		input.value = property.value;
		input.dataset.name = property.name;
		input.title = property.name;

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
		case "diagnostic": {
			const message = `连接诊断[${String(event.phase)}]: ${String(event.message)}`;
			if (appendConnectionDiagnostic(message, { dedupe: true })) {
				log(message, "event");
			}
			break;
		}
		default:
			log(`未知服务器事件: ${JSON.stringify(event)}`, "info");
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
		password: passwordInput.value,
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

// --- Command Center ---

const COMMAND_CATEGORIES: Record<string, string> = {
	admin: "玩家管理",
	ban: "玩家管理",
	kick: "玩家管理",
	kickall: "玩家管理",
	kill: "玩家管理",
	killall: "玩家管理",
	listplayerids: "玩家管理",
	listplayers: "玩家管理",
	listknownplayers: "玩家管理",
	whitelist: "玩家管理",
	teleportplayer: "玩家管理",
	sayplayer: "通信",
	showinventory: "玩家管理",
	playerOwnedEntities: "玩家管理",
	pplist: "玩家管理",
	printpinfo: "玩家管理",
	reply: "通信",
	commandpermission: "权限管理",
	permissionsallowed: "权限管理",
	overridemaxplayercount: "权限管理",
	createwebuser: "权限管理",
	webpermission: "权限管理",
	webtokens: "权限管理",
	saveworld: "世界管理",
	shutdown: "世界管理",
	chunkreset: "世界管理",
	regionreset: "世界管理",
	rendermap: "世界管理",
	generatemap: "世界管理",
	visitmap: "世界管理",
	agemap: "世界管理",
	expiryinfo: "世界管理",
	repairchunkdensity: "世界管理",
	chunkcache: "世界管理",
	chunkobserver: "世界管理",
	showchunkdata: "世界管理",
	resetallstats: "世界管理",
	exportcurrentconfigs: "世界管理",
	exportprefab: "世界管理",
	smoothpoi: "世界管理",
	smoothworldall: "世界管理",
	prefab: "世界管理",
	prefabeditor: "世界管理",
	prefabupdater: "世界管理",
	placeblockrotations: "世界管理",
	placeblockshapes: "世界管理",
	pois: "世界管理",
	poiwaypoints: "世界管理",
	tppoi: "世界管理",
	teleportpoirelative: "世界管理",
	trees: "世界管理",
	mapdata: "世界管理",
	listents: "实体控制",
	spawnentity: "实体控制",
	spawnentityat: "实体控制",
	spawnwanderinghorde: "实体控制",
	spawnscouts: "实体控制",
	spawnairdrop: "实体控制",
	spawnsupplycrate: "实体控制",
	shownexthordetime: "实体控制",
	bents: "实体控制",
	sdcs: "实体控制",
	lock: "AI 与 Director",
	buff: "玩家状态",
	buffplayer: "玩家状态",
	debuff: "玩家状态",
	debuffplayer: "玩家状态",
	giveself: "玩家状态",
	giveselfxp: "玩家状态",
	givexp: "玩家状态",
	give: "玩家状态",
	givequest: "玩家状态",
	removequest: "玩家状态",
	gamestage: "玩家状态",
	starve: "玩家状态",
	thirsty: "玩家状态",
	exhausted: "玩家状态",
	sleep: "玩家状态",
	spectator: "玩家状态",
	automove: "玩家状态",
	calibrate: "玩家状态",
	fov: "视觉与渲染",
	camera: "视觉与渲染",
	creativemenu: "玩家状态",
	debugmenu: "调试与性能",
	debugpanels: "调试与性能",
	debugshot: "调试与性能",
	show: "视觉与渲染",
	showalbedo: "视觉与渲染",
	shownormals: "视觉与渲染",
	showspecular: "视觉与渲染",
	showswings: "视觉与渲染",
	showhits: "视觉与渲染",
	showtriggers: "视觉与渲染",
	togglelm: "视觉与渲染",
	ScreenEffect: "视觉与渲染",
	spawnscreen: "玩家状态",
	switchview: "视觉与渲染",
	squarespiral: "玩家状态",
	playervisitmap: "世界管理",
	getgamepref: "游戏设置",
	setgamepref: "游戏设置",
	getgamestat: "游戏设置",
	setgamestat: "游戏设置",
	gettime: "游戏设置",
	settime: "游戏设置",
	settempunit: "游戏设置",
	setwatervalue: "游戏设置",
	settargetfps: "游戏设置",
	getoptions: "游戏设置",
	getlogpath: "游戏设置",
	config: "游戏设置",
	cvar: "游戏设置",
	setcvar: "游戏设置",
	weather: "游戏设置",
	weathersurvival: "游戏设置",
	newweathersurvival: "游戏设置",
	debugweather: "游戏设置",
	spectrum: "游戏设置",
	ForceEventDate: "游戏设置",
	mem: "调试与性能",
	memcl: "调试与性能",
	listthreads: "调试与性能",
	loggamestate: "调试与性能",
	loglevel: "调试与性能",
	clear: "调试与性能",
	memprofile: "调试与性能",
	profiler: "调试与性能",
	profiling: "调试与性能",
	profilenetwork: "调试与性能",
	meshdatamanager: "调试与性能",
	exception: "调试与性能",
	testloop: "调试与性能",
	unittest: "调试与性能",
	SystemInfo: "调试与性能",
	occlusion: "调试与性能",
	testoccreport: "调试与性能",
	openiddebug: "调试与性能",
	say: "通信",
	help: "通信",
	version: "通信",
	versionui: "通信",
	listitems: "查询与列表",
	listdlc: "查询与列表",
	listgameobjects: "查询与列表",
	listpes: "查询与列表",
	ai: "AI 与 Director",
	aiddebug: "AI 与 Director",
	utilityai: "AI 与 Director",
	actiondelay: "AI 与 Director",
	adjustmarkup: "AI 与 Director",
	dialog: "AI 与 Director",
	sleeper: "AI 与 Director",
	enablerendering: "视觉与渲染",
	showClouds: "视觉与渲染",
	lights: "视觉与渲染",
	gfx: "视觉与渲染",
	graph: "视觉与渲染",
	networkclient: "网络",
	networkserver: "网络",
	audio: "音频",
	dms: "音频",
	mumblepositionalaudio: "音频",
	dynamicmesh: "动态网格",
	dynamicmeshdebug: "动态网格",
	dynamicproperties: "动态网格",
	ReloadSCore: "SCore / Mod",
	weaponsway: "SCore / Mod",
	gears: "SCore / Mod",
	quartz: "SCore / Mod",
	fireclear: "SCore / Mod",
	bsclearcache: "BeyondStorage",
	bshelp: "BeyondStorage",
	bsreloadconfig: "BeyondStorage",
	bssetconfig: "BeyondStorage",
	bsshowconfig: "BeyondStorage",
	discord: "Discord / Twitch",
	twitch: "Discord / Twitch",
	twitchadmin: "Discord / Twitch",
	AdminSpeed: "其他",
	AccDecay: "其他",
	challenges: "其他",
	damagereset: "其他",
	decomgr: "其他",
	invalidatecaches: "其他",
	maivd: "其他",
	na: "其他",
	pirs: "其他",
	plc: "其他",
	stab: "其他",
	tcs: "其他",
	tls: "其他",
	traderarea: "其他",
	transformdebug: "其他",
	floatingorigin: "其他",
	xui: "其他",
	uioptions: "其他",
	reloadentityclasses: "其他",
	reloadlog: "其他",
	wsmats: "其他",
	search: "查询与列表",
	output: "查询与列表",
	outputdetailed: "查询与列表",
	nwzbotblockfill: "NaiwaziBot",
	nwzbotremoveentity: "NaiwaziBot",
	nwzbot_test: "NaiwaziBot",
};

const CATEGORY_LABELS: Record<string, string> = {
	玩家管理: "玩家管理",
	权限管理: "权限管理",
	世界管理: "世界管理",
	实体控制: "实体控制",
	玩家状态: "玩家状态",
	游戏设置: "游戏设置",
	调试与性能: "调试与性能",
	通信: "通信",
	查询与列表: "查询与列表",
	"AI 与 Director": "AI 与 Director",
	视觉与渲染: "视觉与渲染",
	音频: "音频",
	网络: "网络",
	动态网格: "动态网格",
	"SCore / Mod": "SCore / Mod",
	BeyondStorage: "BeyondStorage",
	"Discord / Twitch": "Discord / Twitch",
	NaiwaziBot: "NaiwaziBot",
	其他: "其他",
};

const commandSearchInput = document.getElementById(
	"command-search",
) as HTMLInputElement;
const commandCategorySelect = document.getElementById(
	"command-category",
) as HTMLSelectElement;
const commandListEl = document.getElementById("command-list") as HTMLDivElement;
const commandDetailEl = document.getElementById(
	"command-detail",
) as HTMLDivElement;
const commandCountEl = document.getElementById(
	"command-count",
) as HTMLSpanElement;

let selectedCommandName: string | null = null;
const commandEntries = Object.entries(TELNET_COMMANDS).map(([name, meta]) => ({
	name,
	usage: meta.usage,
	minLevel: meta.minLevel,
	category: COMMAND_CATEGORIES[name] ?? "其他",
}));

function getCategoryDisplayName(category: string): string {
	return CATEGORY_LABELS[category] ?? category;
}

function populateCommandCategories(): void {
	const categories = Array.from(
		new Set(commandEntries.map((entry) => entry.category)),
	).sort();

	while (commandCategorySelect.options.length > 1) {
		commandCategorySelect.remove(1);
	}

	for (const category of categories) {
		const option = document.createElement("option");
		option.value = category;
		option.textContent = getCategoryDisplayName(category);
		commandCategorySelect.appendChild(option);
	}
}

function debounce<T extends (...args: unknown[]) => void>(
	fn: T,
	ms: number,
): (...args: Parameters<T>) => void {
	let timer: ReturnType<typeof setTimeout> | null = null;
	return (...args: Parameters<T>) => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => fn(...args), ms);
	};
}

function renderCommandList(): void {
	const search = commandSearchInput.value.trim().toLowerCase();
	const category = commandCategorySelect.value;

	const filtered = commandEntries.filter((entry) => {
		const matchesSearch =
			entry.name.toLowerCase().includes(search) ||
			entry.usage.toLowerCase().includes(search);
		const matchesCategory = !category || entry.category === category;
		return matchesSearch && matchesCategory;
	});

	clearElement(commandListEl);
	commandCountEl.textContent = `${filtered.length} / ${commandEntries.length}`;

	if (filtered.length === 0) {
		const empty = document.createElement("div");
		empty.className = "command-list-empty";
		empty.textContent = "没有匹配的命令";
		commandListEl.appendChild(empty);
		return;
	}

	const fragment = document.createDocumentFragment();
	for (const entry of filtered) {
		const item = document.createElement("button");
		item.type = "button";
		item.className = "command-list-item";
		item.disabled = !isConnected;
		if (entry.name === selectedCommandName) {
			item.classList.add("active");
		}
		item.addEventListener("click", () => selectCommand(entry.name));

		const main = document.createElement("div");
		main.className = "command-list-main";

		const name = document.createElement("span");
		name.className = "command-list-name";
		name.textContent = entry.name;

		const categoryEl = document.createElement("span");
		categoryEl.className = "command-list-category";
		categoryEl.textContent = getCategoryDisplayName(entry.category);

		main.appendChild(name);
		main.appendChild(categoryEl);

		const usage = document.createElement("div");
		usage.className = "command-list-usage";
		usage.textContent = entry.usage;
		usage.title = entry.usage;

		item.appendChild(main);
		item.appendChild(usage);
		fragment.appendChild(item);
	}
	commandListEl.appendChild(fragment);
}

function selectCommand(name: string): void {
	selectedCommandName = name;
	const entry = commandEntries.find((e) => e.name === name);
	if (!entry) return;

	clearElement(commandDetailEl);

	const nameEl = document.createElement("div");
	nameEl.className = "command-detail-name";
	nameEl.textContent = entry.name;

	const usageEl = document.createElement("div");
	usageEl.className = "command-detail-usage";
	usageEl.textContent = entry.usage;

	const metaEl = document.createElement("div");
	metaEl.className = "command-detail-meta";

	const categoryEl = document.createElement("span");
	categoryEl.textContent = getCategoryDisplayName(entry.category);

	const levelEl = document.createElement("span");
	levelEl.textContent = `权限等级: ${entry.minLevel}`;

	metaEl.appendChild(categoryEl);
	metaEl.appendChild(levelEl);

	const argRow = document.createElement("div");
	argRow.className = "command-arg-row";

	const argInput = document.createElement("input");
	argInput.type = "text";
	argInput.placeholder = "参数（可选，会按原样追加）";
	argInput.id = "selected-command-arg";

	const executeBtn = document.createElement("button");
	executeBtn.type = "button";
	executeBtn.className = "btn-primary";
	executeBtn.textContent = "执行";
	executeBtn.disabled = !isConnected;
	executeBtn.addEventListener("click", () => {
		const args = argInput.value.trim();
		const fullCommand = args ? `${entry.name} ${args}` : entry.name;
		executeRawCommand(fullCommand);
	});

	argRow.appendChild(argInput);
	argRow.appendChild(executeBtn);

	commandDetailEl.appendChild(nameEl);
	commandDetailEl.appendChild(usageEl);
	commandDetailEl.appendChild(metaEl);
	commandDetailEl.appendChild(argRow);

	renderCommandList();
}

async function executeRawCommand(command: string): Promise<void> {
	log(`> ${command}`, "command");
	const result = await api.sendCommand(command);
	if (result.success) {
		log(result.response || "命令执行成功", "response");
	} else {
		log(`错误: ${result.error}`, "error");
	}
}

commandSearchInput.addEventListener("input", debounce(renderCommandList, 150));
commandCategorySelect.addEventListener("change", renderCommandList);

populateCommandCategories();
renderCommandList();

modalCloseBtn.addEventListener("click", closeResultModal);
modalCloseBtn2.addEventListener("click", closeResultModal);
modalCopyBtn.addEventListener("click", async () => {
	const copied = await copyTextToClipboard(modalContent.textContent ?? "");
	if (copied) {
		modalCopyBtn.textContent = "已复制";
		setTimeout(() => {
			modalCopyBtn.textContent = "复制结果";
		}, 1500);
	}
});
resultModal.addEventListener("click", (event) => {
	if (event.target === resultModal) {
		closeResultModal();
	}
});
document.addEventListener("keydown", (event) => {
	if (event.key === "Escape" && resultModal.classList.contains("active")) {
		closeResultModal();
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

// Disable command controls until a connection is established.
updateCommandControls(false);

// --- Map Viewer ---

const selectMapDirBtn = document.getElementById(
	"select-map-dir",
) as HTMLButtonElement;
const mapDirPathEl = document.getElementById(
	"map-dir-path",
) as HTMLDivElement;
const mapFileListEl = document.getElementById(
	"map-file-list",
) as HTMLDivElement;
const mapPreviewEl = document.getElementById(
	"map-preview",
) as HTMLDivElement;

let currentMapDirectory: string | null = null;

selectMapDirBtn.addEventListener("click", async () => {
	try {
		const result = await api.selectMapDirectory();
		if (!result.success || !result.directory) {
			log(`选择地图目录失败: ${result.error}`, "error");
			return;
		}

		currentMapDirectory = result.directory;
		mapDirPathEl.textContent = result.directory;
		await loadMapFiles(result.directory);
		log(`已加载地图目录: ${result.directory}`, "event");
	} catch (error) {
		log(
			`选择地图目录失败: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
});

async function loadMapFiles(directory: string): Promise<void> {
	try {
		const result = await api.getMapFiles(directory);
		if (!result.success) {
			log(`获取地图文件失败: ${result.error}`, "error");
			return;
		}

		clearElement(mapFileListEl);

		if (result.files.length === 0) {
			const empty = document.createElement("div");
			empty.className = "map-file-empty";
			empty.textContent = "目录中没有找到地图图片";
			mapFileListEl.appendChild(empty);
			return;
		}

		for (const file of result.files) {
			const item = document.createElement("button");
			item.type = "button";
			item.className = "map-file-item";
			item.textContent = file.name;
			item.addEventListener("click", () => loadMapImage(file.path));
			mapFileListEl.appendChild(item);
		}
	} catch (error) {
		log(
			`获取地图文件失败: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
}

async function loadMapImage(filePath: string): Promise<void> {
	try {
		const result = await api.readMapImage(filePath);
		if (!result.success || !result.dataUri) {
			log(`读取地图图片失败: ${result.error}`, "error");
			return;
		}

		clearElement(mapPreviewEl);

		const img = document.createElement("img");
		img.src = result.dataUri;
		img.alt = "地图预览";
		img.addEventListener("click", () => {
			window.open(result.dataUri, "_blank");
		});
		mapPreviewEl.appendChild(img);
	} catch (error) {
		log(
			`读取地图图片失败: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
}
