type ServerConfigLogger = (message: string, type: "error" | "event") => void;

type ServerConfigEditorOptions = {
	readonly api: DesktopApi;
	readonly log: ServerConfigLogger;
};

type ConfigProperty = {
	readonly name: string;
	readonly value: string;
};

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

function requireElement<T extends HTMLElement>(
	id: string,
	constructor: { new (...args: never[]): T },
): T {
	const element = document.getElementById(id);
	if (element instanceof constructor) {
		return element;
	}
	throw new Error(`Missing required element: ${id}`);
}

function clearElement(element: Element): void {
	while (element.firstChild) {
		element.removeChild(element.firstChild);
	}
}

export function initServerConfigEditor(
	options: ServerConfigEditorOptions,
): void {
	const selectConfigFileBtn = requireElement(
		"select-config-file",
		HTMLButtonElement,
	);
	const saveConfigBtn = requireElement("save-config", HTMLButtonElement);
	const configFilePathEl = requireElement("config-file-path", HTMLDivElement);
	const configForm = requireElement("config-form", HTMLFormElement);

	let currentConfigFilePath: string | null = null;

	function renderConfigForm(properties: readonly ConfigProperty[]): void {
		clearElement(configForm);
		const fragment = document.createDocumentFragment();

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
			fragment.appendChild(row);
		}

		configForm.appendChild(fragment);
	}

	function collectUpdates(): { readonly name: string; readonly value: string }[] {
		const updates: { readonly name: string; readonly value: string }[] = [];
		for (const input of Array.from(
			configForm.querySelectorAll<HTMLInputElement>("input[data-name]"),
		)) {
			const name = input.dataset.name;
			if (name) {
				updates.push({ name, value: input.value });
			}
		}
		return updates;
	}

	selectConfigFileBtn.addEventListener("click", async () => {
		try {
			const result = await options.api.selectServerConfigFile();
			if (!result.success || !result.filePath) {
				options.log(`选择文件失败: ${result.error}`, "error");
				return;
			}

			currentConfigFilePath = result.filePath;
			configFilePathEl.textContent = result.filePath;

			const loadResult = await options.api.loadServerConfig(result.filePath);
			if (!loadResult.success || !loadResult.config) {
				options.log(`加载配置失败: ${loadResult.error}`, "error");
				return;
			}

			renderConfigForm(loadResult.config.properties);
			saveConfigBtn.disabled = false;
			options.log(
				`已加载服务器配置: ${loadResult.config.properties.length} 项`,
				"event",
			);
		} catch (error) {
			options.log(
				`选择配置文件失败: ${error instanceof Error ? error.message : String(error)}`,
				"error",
			);
		}
	});

	saveConfigBtn.addEventListener("click", async () => {
		if (!currentConfigFilePath) return;

		try {
			const result = await options.api.saveServerConfig(
				currentConfigFilePath,
				collectUpdates(),
			);
			if (result.success) {
				options.log("服务器配置已保存", "event");
			} else {
				options.log(`保存配置失败: ${result.error}`, "error");
			}
		} catch (error) {
			options.log(
				`保存配置失败: ${error instanceof Error ? error.message : String(error)}`,
				"error",
			);
		}
	});
}
