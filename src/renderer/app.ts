import {
	buildActionCommand,
	buildPlayerCommand,
	quoteTelnetArgument,
} from "./command-builder.js";
import { initMapViewer } from "./map-viewer.js";
import { initPromptModal } from "./prompt-modal.js";
import { initResultModal } from "./result-modal.js";
import { initServerConfigEditor } from "./server-config-editor.js";
import { TELNET_COMMANDS } from "./telnet-commands.gen.js";
import type {
	ConnectionState,
	PlayerInfo,
	ServerProfile,
} from "../common/types.js";

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
		saveLog: (text) => invokeTauri("save_log", { text }),
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
const playerSearchInput = document.getElementById(
	"player-search",
) as HTMLInputElement;
const playerSortSelect = document.getElementById(
	"player-sort",
) as HTMLSelectElement;
const playerSelectAllCheckbox = document.getElementById(
	"player-select-all",
) as HTMLInputElement;
const playerSelectionCount = document.getElementById(
	"player-selection-count",
) as HTMLSpanElement;
const batchActionButtons = Array.from(
	document.querySelectorAll<HTMLButtonElement>(".batch-action-btn"),
);
const clearLogBtn = document.getElementById("clear-log") as HTMLButtonElement;
const openLogDirBtn = document.getElementById(
	"open-log-dir",
) as HTMLButtonElement;
const logSearchInput = document.getElementById("log-search") as HTMLInputElement;
const logLevelToggles = Array.from(
	document.querySelectorAll<HTMLInputElement>(".log-level-toggle input"),
);
const exportLogBtn = document.getElementById("export-log") as HTMLButtonElement;
const logScrollLock = document.getElementById(
	"log-scroll-lock",
) as HTMLDivElement;
const resumeScrollBtn = document.getElementById(
	"resume-scroll",
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
let isConnected = false;
let currentPlayers: PlayerInfo[] = [];
const selectedEntityIds = new Set<string>();
const connectionDiagnosticMessages: string[] = [];
const seenConnectionDiagnostics = new Set<string>();
const commandHistory: string[] = [];
let commandHistoryIndex = 0;

const MAX_LOG_ENTRIES = 500;
let pendingScroll = false;

const LOG_LEVELS = ["info", "command", "response", "error", "event"] as const;
type LogLevel = (typeof LOG_LEVELS)[number];
const enabledLogLevels = new Set<LogLevel>(
	Array.from(LOG_LEVELS),
);
let autoScrollLocked = false;

function log(
	message: string,
	type: LogLevel = "info",
): void {
	const entry = document.createElement("div");
	entry.className = `log-entry ${type}`;
	entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
	logOutput.appendChild(entry);

	while (logOutput.childElementCount > MAX_LOG_ENTRIES) {
		logOutput.removeChild(logOutput.firstChild!);
	}

	applyLogFilters();

	if (!pendingScroll && !autoScrollLocked) {
		pendingScroll = true;
		requestAnimationFrame(() => {
			logOutput.scrollTop = logOutput.scrollHeight;
			pendingScroll = false;
		});
	}
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

const resultModal = initResultModal({ copyTextToClipboard });
const promptModal = initPromptModal();

function getLogText(): string {
	return Array.from(logOutput.querySelectorAll(".log-entry:not(.hidden)"))
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

function updateLogScrollLockIndicator(): void {
	logScrollLock.hidden = !autoScrollLocked;
}

function isLogEntryVisible(entry: Element, search: string): boolean {
	const type = entry.className.split(" ").find((className) =>
		LOG_LEVELS.includes(className as LogLevel),
	);
	if (!type || !enabledLogLevels.has(type as LogLevel)) {
		return false;
	}
	if (!search) {
		return true;
	}
	const text = entry.textContent ?? "";
	return text.toLowerCase().includes(search);
}

function applyLogFilters(): void {
	const search = logSearchInput.value.trim().toLowerCase();
	for (const entry of Array.from(logOutput.querySelectorAll(".log-entry"))) {
		entry.classList.toggle(
			"hidden",
			!isLogEntryVisible(entry, search),
		);
	}
}

function scrollToLogBottom(): void {
	logOutput.scrollTop = logOutput.scrollHeight;
}

function resumeAutoScroll(): void {
	autoScrollLocked = false;
	updateLogScrollLockIndicator();
	scrollToLogBottom();
}

function handleLogScroll(): void {
	if (logOutput.childElementCount === 0) {
		return;
	}
	const threshold = 24;
	const isNearBottom =
		logOutput.scrollHeight -
			logOutput.scrollTop -
			logOutput.clientHeight <=
		threshold;
	if (autoScrollLocked && isNearBottom) {
		resumeAutoScroll();
	} else if (!autoScrollLocked && !isNearBottom) {
		autoScrollLocked = true;
		updateLogScrollLockIndicator();
	}
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
	updateBatchActionButtons();
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

function updateStatus(state: ConnectionState): void {
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
	selectedEntityIds.clear();
	updateSelectionUI();
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

		if (confirmMessage && !(await promptModal.confirm(confirmMessage))) {
			return;
		}

		const promptValue = promptLabel
			? await promptModal.prompt(promptLabel, promptLabel)
			: undefined;
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
				resultModal.show(command, responseText);
			}
			if (action === "listplayers") {
				await refreshPlayers();
			}
		} else {
			const errorText = `错误: ${result.error}`;
			log(errorText, "error");
			if (isCmdBtn) {
				resultModal.show(`${command} - 错误`, result.error || "未知错误");
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

logSearchInput.addEventListener("input", applyLogFilters);

for (const toggle of logLevelToggles) {
	toggle.addEventListener("change", () => {
		enabledLogLevels.clear();
		for (const input of logLevelToggles) {
			if (input.checked) {
				enabledLogLevels.add(input.value as LogLevel);
			}
		}
		applyLogFilters();
	});
}

exportLogBtn.addEventListener("click", async () => {
	const text = getLogText();
	if (!text.trim()) {
		log("没有可导出的日志内容", "error");
		return;
	}
	try {
		const result = await api.saveLog(text);
		if (result.success) {
			log("日志已导出", "event");
		} else {
			log(`导出日志失败: ${result.error}`, "error");
		}
	} catch (error) {
		log(
			`导出日志失败: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
});

logOutput.addEventListener("scroll", handleLogScroll, { passive: true });

resumeScrollBtn.addEventListener("click", resumeAutoScroll);

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
		const players = result.data as PlayerInfo[];
		for (const id of Array.from(selectedEntityIds)) {
			if (!players.some((player) => String(player.entityId) === id)) {
				selectedEntityIds.delete(id);
			}
		}
		currentPlayers = players;
		renderPlayers(currentPlayers);
		updateSelectionUI();
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

type PlayerCellField =
	| "entityId"
	| "name"
	| "level"
	| "health"
	| "position"
	| "ping";

function formatPlayerPosition(player: PlayerInfo): string {
	return player.position
		? `${Math.round(player.position.x)}, ${Math.round(player.position.y)}, ${Math.round(player.position.z)}`
		: "-";
}

function createPlayerCell(
	field: PlayerCellField,
	text: string,
): HTMLTableCellElement {
	const cell = createCell(text);
	cell.dataset.playerField = field;
	return cell;
}

function setPlayerCellText(
	row: HTMLTableRowElement,
	field: PlayerCellField,
	text: string,
): void {
	const cell = row.querySelector<HTMLTableCellElement>(
		`td[data-player-field="${field}"]`,
	);
	if (cell && cell.textContent !== text) {
		cell.textContent = text;
	}
}

function updatePlayerActionButtons(
	row: HTMLTableRowElement,
	playerName: string,
): void {
	for (const button of Array.from(
		row.querySelectorAll<HTMLButtonElement>("button[data-action]"),
	)) {
		if (button.dataset.player !== playerName) {
			button.dataset.player = playerName;
		}
	}
}

function updatePlayerRow(
	row: HTMLTableRowElement,
	player: PlayerInfo,
): void {
	setPlayerCellText(row, "entityId", String(player.entityId));
	setPlayerCellText(row, "name", player.name);
	setPlayerCellText(row, "level", String(player.level ?? "-"));
	setPlayerCellText(row, "health", String(player.health ?? "-"));
	setPlayerCellText(row, "position", formatPlayerPosition(player));
	setPlayerCellText(row, "ping", String(player.ping ?? "-"));
	updatePlayerActionButtons(row, player.name);
}

function createPlayerRow(player: PlayerInfo): HTMLTableRowElement {
	const row = document.createElement("tr");
	row.dataset.entityId = String(player.entityId);

	const checkboxCell = document.createElement("td");
	checkboxCell.className = "player-checkbox-cell";
	const checkbox = document.createElement("input");
	checkbox.type = "checkbox";
	checkbox.dataset.batchSelect = "true";
	checkbox.dataset.entityId = String(player.entityId);
	checkbox.checked = selectedEntityIds.has(String(player.entityId));
	checkboxCell.appendChild(checkbox);
	row.appendChild(checkboxCell);

	row.appendChild(createPlayerCell("entityId", String(player.entityId)));
	row.appendChild(createPlayerCell("name", player.name));
	row.appendChild(createPlayerCell("level", String(player.level ?? "-")));
	row.appendChild(createPlayerCell("health", String(player.health ?? "-")));
	row.appendChild(createPlayerCell("position", formatPlayerPosition(player)));
	row.appendChild(createPlayerCell("ping", String(player.ping ?? "-")));

	const actionsCell = document.createElement("td");
	const actionsDiv = document.createElement("div");
	actionsDiv.className = "player-actions";
	actionsDiv.appendChild(createPlayerActionButton("kick", player.name, "踢出"));
	actionsDiv.appendChild(createPlayerActionButton("kill", player.name, "击杀"));
	actionsDiv.appendChild(
		createPlayerActionButton("sayplayer", player.name, "私聊"),
	);
	actionsDiv.appendChild(createPlayerActionButton("ban", player.name, "封禁"));
	actionsCell.appendChild(actionsDiv);
	row.appendChild(actionsCell);

	return row;
}

function renderEmptyPlayersRow(message = "暂无在线玩家"): void {
	clearPlayersTable();
	const row = document.createElement("tr");
	row.className = "empty-row";
	const cell = document.createElement("td");
	cell.colSpan = 8;
	cell.textContent = message;
	row.appendChild(cell);
	playersTableBody.appendChild(row);
}

function getFilteredSortedPlayers(
	players: readonly PlayerInfo[],
): PlayerInfo[] {
	const search = playerSearchInput.value.trim().toLowerCase();
	const sort = playerSortSelect.value;

	const filtered = players.filter((player) => {
		if (!search) return true;
		return (
			player.name.toLowerCase().includes(search) ||
			String(player.entityId).includes(search)
		);
	});

	if (!sort) return filtered;

	const sorted = [...filtered];
	sorted.sort((a, b) => {
		switch (sort) {
			case "name-asc":
				return a.name.localeCompare(b.name, "zh-CN");
			case "name-desc":
				return b.name.localeCompare(a.name, "zh-CN");
			case "level-asc":
				return compareOptionalNumbers(a.level, b.level, "asc");
			case "level-desc":
				return compareOptionalNumbers(a.level, b.level, "desc");
			case "ping-asc":
				return compareOptionalNumbers(a.ping, b.ping, "asc");
			case "ping-desc":
				return compareOptionalNumbers(a.ping, b.ping, "desc");
			default:
				return 0;
		}
	});
	return sorted;
}

function compareOptionalNumbers(
	a: number | undefined,
	b: number | undefined,
	direction: "asc" | "desc",
): number {
	const aValue =
		a ?? (direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
	const bValue =
		b ?? (direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
	if (aValue === bValue) return 0;
	return direction === "asc"
		? aValue < bValue
			? -1
			: 1
		: aValue > bValue
			? -1
			: 1;
}

function setRowSelected(
	row: HTMLTableRowElement,
	selected: boolean,
): void {
	const checkbox = row.querySelector<HTMLInputElement>(
		"input[data-batch-select]",
	);
	if (checkbox) {
		checkbox.checked = selected;
	}
}

function renderPlayers(players: readonly PlayerInfo[]): void {
	const filteredPlayers = getFilteredSortedPlayers(players);

	if (filteredPlayers.length === 0) {
		renderEmptyPlayersRow(
			playerSearchInput.value.trim() ? "没有匹配的玩家" : "暂无在线玩家",
		);
		return;
	}

	playersTableBody.querySelector(".empty-row")?.remove();

	const rowsByEntityId = new Map<string, HTMLTableRowElement>();
	for (const row of Array.from(
		playersTableBody.querySelectorAll<HTMLTableRowElement>("tr[data-entity-id]"),
	)) {
		const entityId = row.dataset.entityId;
		if (entityId) {
			rowsByEntityId.set(entityId, row);
		}
	}

	const activeEntityIds = new Set<string>();
	const fragment = document.createDocumentFragment();
	for (const player of filteredPlayers) {
		const entityId = String(player.entityId);
		const existingRow = rowsByEntityId.get(entityId);
		const row = existingRow ?? createPlayerRow(player);
		activeEntityIds.add(entityId);

		if (existingRow) {
			updatePlayerRow(existingRow, player);
		}
		setRowSelected(row, selectedEntityIds.has(entityId));

		fragment.appendChild(row);
	}

	for (const [entityId, row] of rowsByEntityId) {
		if (!activeEntityIds.has(entityId)) {
			row.remove();
		}
	}

	playersTableBody.appendChild(fragment);
	updateSelectAllCheckboxState();
}

function updateSelectionUI(): void {
	playerSelectionCount.textContent = `已选择 ${selectedEntityIds.size} 人`;
	updateBatchActionButtons();
	updateSelectAllCheckboxState();
}

function updateSelectAllCheckboxState(): void {
	const visibleEntityIds = getFilteredSortedPlayers(currentPlayers).map((player) =>
		String(player.entityId),
	);
	const selectedVisibleCount = visibleEntityIds.filter((id) =>
		selectedEntityIds.has(id),
	).length;
	playerSelectAllCheckbox.checked =
		visibleEntityIds.length > 0 && selectedVisibleCount === visibleEntityIds.length;
	playerSelectAllCheckbox.indeterminate =
		selectedVisibleCount > 0 && selectedVisibleCount < visibleEntityIds.length;
}

function updateBatchActionButtons(): void {
	const disabled = !isConnected || selectedEntityIds.size === 0;
	for (const button of batchActionButtons) {
		button.disabled = disabled;
	}
}

function buildBatchCommand(
	action: string,
	playerName: string,
	promptValue: string,
): string {
	switch (action) {
		case "give-item": {
			const trimmed = promptValue.trim();
			const spaceIndex = trimmed.search(/\s/);
			const itemName =
				spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
			const quantity =
				spaceIndex === -1
					? "1"
					: trimmed.slice(spaceIndex + 1).trim() || "1";
			return `give ${quoteTelnetArgument(playerName)} ${itemName} ${quantity}`;
		}
		case "give-xp":
			return `givexp ${quoteTelnetArgument(playerName)} ${promptValue.trim()}`;
		case "teleport":
			return `teleport ${quoteTelnetArgument(playerName)} ${promptValue.trim()}`;
		default:
			return buildPlayerCommand(action, playerName, promptValue);
	}
}

async function runBatchAction(action: string): Promise<void> {
	if (selectedEntityIds.size === 0) return;

	const selectedPlayers = currentPlayers.filter((player) =>
		selectedEntityIds.has(String(player.entityId)),
	);
	if (selectedPlayers.length === 0) return;

	let promptValue: string | null = null;

	if (action === "kick") {
		promptValue = await promptModal.prompt("批量踢出玩家", "踢出原因（可选）:");
		if (promptValue === null) return;
	} else if (action === "ban") {
		promptValue = await promptModal.prompt(
			"批量封禁玩家",
			"时长/单位/原因，例如: 2 hours griefing",
		);
		if (promptValue === null) return;
	} else if (action === "sayplayer") {
		promptValue = await promptModal.prompt("批量私聊", "私聊内容:");
		if (promptValue === null || !promptValue.trim()) return;
	} else if (action === "give-item") {
		promptValue = await promptModal.prompt(
			"批量发送物品",
			"物品名 数量，例如: meleeToolTorch 1",
		);
		if (promptValue === null || !promptValue.trim()) return;
	} else if (action === "give-xp") {
		promptValue = await promptModal.prompt("批量给予经验", "经验值:");
		if (promptValue === null || !promptValue.trim()) return;
	} else if (action === "teleport") {
		promptValue = await promptModal.prompt("批量传送", "坐标 x y z:");
		if (promptValue === null || !promptValue.trim()) return;
	}

	if (promptValue === null) return;

	for (const player of selectedPlayers) {
		const command = buildBatchCommand(action, player.name, promptValue);
		log(`> ${command}`, "command");
		const result = await api.sendCommand(command);
		if (result.success) {
			log(result.response || "操作成功", "response");
		} else {
			log(`错误: ${result.error}`, "error");
		}
	}

	await refreshPlayers();
}

playerSearchInput.addEventListener("input", () => {
	renderPlayers(currentPlayers);
	updateSelectionUI();
});

playerSortSelect.addEventListener("change", () => {
	renderPlayers(currentPlayers);
	updateSelectionUI();
});

playerSelectAllCheckbox.addEventListener("change", () => {
	const checked = playerSelectAllCheckbox.checked;
	const visibleEntityIds = getFilteredSortedPlayers(currentPlayers).map((player) =>
		String(player.entityId),
	);
	for (const entityId of visibleEntityIds) {
		if (checked) {
			selectedEntityIds.add(entityId);
		} else {
			selectedEntityIds.delete(entityId);
		}
	}
	renderPlayers(currentPlayers);
	updateSelectionUI();
});

playersTableBody.addEventListener("change", (event) => {
	const checkbox = (event.target as HTMLElement).closest(
		"input[data-batch-select]",
	) as HTMLInputElement | null;
	if (!checkbox) return;

	const entityId = checkbox.dataset.entityId;
	if (!entityId) return;

	if (checkbox.checked) {
		selectedEntityIds.add(entityId);
	} else {
		selectedEntityIds.delete(entityId);
	}
	updateSelectionUI();
});

document.querySelector(".batch-actions")?.addEventListener("click", (event) => {
	const button = (event.target as HTMLElement).closest(
		"button[data-batch-action]",
	) as HTMLButtonElement | null;
	if (!button) return;

	const action = button.dataset.batchAction;
	if (!action) return;

	void runBatchAction(action);
});

playersTableBody.addEventListener("click", async (event) => {
	const button = (event.target as HTMLElement).closest(
		"button[data-action]",
	) as HTMLButtonElement | null;
	if (!button) return;

	const action = button.dataset.action!;
	const playerName = button.dataset.player!;

	let promptValue: string | null | undefined;
	if (action === "kick") {
		promptValue = await promptModal.prompt(
			"踢出玩家",
			`踢出 ${playerName} 的原因（可选）:`,
		);
		if (promptValue === null) return;
	} else if (action === "sayplayer") {
		promptValue = await promptModal.prompt(
			"私聊玩家",
			`发送给 ${playerName} 的私聊内容:`,
		);
		if (promptValue === null || !promptValue.trim()) return;
	} else if (action === "ban") {
		promptValue = await promptModal.prompt(
			"封禁玩家",
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
			selectedEntityIds.clear();
			updateSelectionUI();
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

let profiles: ServerProfile[] = [];

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

function fillConnectionForm(profile: ServerProfile): void {
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

	const name = await promptModal.prompt(
		"保存配置",
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

	if (!(await promptModal.confirm("确定要删除此连接配置吗?"))) return;

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

const CATEGORY_TRANSLATIONS: Record<string, string> = {
	"Player Management": "玩家管理",
	"Permission & Admin": "权限管理",
	"World Management": "世界管理",
	"Entity Control": "实体控制",
	"Player State": "玩家状态",
	"Game Settings": "游戏设置",
	"Debug & Performance": "调试与性能",
	Communication: "通信",
	"Lists & Lookup": "查询与列表",
	"AI & Director": "AI 与 Director",
	"Rendering & Visuals": "视觉与渲染",
	Network: "网络",
	Audio: "音频",
	"Dynamic Mesh": "动态网格",
	"SCore / Utility Mods": "SCore / Mod",
	BeyondStorage: "BeyondStorage",
	"Discord / Twitch": "Discord / Twitch",
	"Misc Server": "其他",
	"Search / Help Utilities": "查询与列表",
	"NaiwaziBot / Custom Mod": "NaiwaziBot",
};

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
	Object.values(CATEGORY_TRANSLATIONS).map((label) => [label, label]),
);

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
	category: CATEGORY_TRANSLATIONS[meta.category] ?? meta.category,
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

initServerConfigEditor({ api, log });
initMapViewer({ api, log, clearElement });
