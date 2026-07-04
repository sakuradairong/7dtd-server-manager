type MapViewerLogger = (message: string, type: "error" | "event") => void;

type MapViewerOptions = {
	readonly api: DesktopApi;
	readonly log: MapViewerLogger;
	readonly clearElement: (element: Element) => void;
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

export function initMapViewer(options: MapViewerOptions): void {
	const selectMapDirBtn = requireElement("select-map-dir", HTMLButtonElement);
	const mapDirPathEl = requireElement("map-dir-path", HTMLDivElement);
	const mapFileListEl = requireElement("map-file-list", HTMLDivElement);
	const mapPreviewEl = requireElement("map-preview", HTMLDivElement);

	async function loadMapImage(filePath: string): Promise<void> {
		try {
			const result = await options.api.readMapImage(filePath);
			if (!result.success || !result.dataUri) {
				options.log(`读取地图图片失败: ${result.error}`, "error");
				return;
			}

			options.clearElement(mapPreviewEl);

			const img = document.createElement("img");
			img.src = result.dataUri;
			img.alt = "地图预览";
			img.addEventListener("click", () => {
				window.open(result.dataUri, "_blank");
			});
			mapPreviewEl.appendChild(img);
		} catch (error) {
			options.log(
				`读取地图图片失败: ${error instanceof Error ? error.message : String(error)}`,
				"error",
			);
		}
	}

	async function loadMapFiles(directory: string): Promise<void> {
		try {
			const result = await options.api.getMapFiles(directory);
			if (!result.success) {
				options.log(`获取地图文件失败: ${result.error}`, "error");
				return;
			}

			options.clearElement(mapFileListEl);

			if (result.files.length === 0) {
				const empty = document.createElement("div");
				empty.className = "map-file-empty";
				empty.textContent = "目录中没有找到地图图片";
				mapFileListEl.appendChild(empty);
				return;
			}

			const fragment = document.createDocumentFragment();
			for (const file of result.files) {
				const item = document.createElement("button");
				item.type = "button";
				item.className = "map-file-item";
				item.textContent = file.name;
				item.addEventListener("click", () => loadMapImage(file.path));
				fragment.appendChild(item);
			}
			mapFileListEl.appendChild(fragment);
		} catch (error) {
			options.log(
				`获取地图文件失败: ${error instanceof Error ? error.message : String(error)}`,
				"error",
			);
		}
	}

	selectMapDirBtn.addEventListener("click", async () => {
		try {
			const result = await options.api.selectMapDirectory();
			if (!result.success || !result.directory) {
				options.log(`选择地图目录失败: ${result.error}`, "error");
				return;
			}

			mapDirPathEl.textContent = result.directory;
			await loadMapFiles(result.directory);
			options.log(`已加载地图目录: ${result.directory}`, "event");
		} catch (error) {
			options.log(
				`选择地图目录失败: ${error instanceof Error ? error.message : String(error)}`,
				"error",
			);
		}
	});
}
