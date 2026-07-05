type MapViewerLogger = (message: string, type: "error" | "event") => void;

type MapFile = {
	readonly name: string;
	readonly path: string;
};

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

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const ZOOM_IN_FACTOR = 1.2;
const ZOOM_OUT_FACTOR = 1 / 1.2;
const DRAG_THRESHOLD = 4;

export function initMapViewer(options: MapViewerOptions): void {
	const selectMapDirBtn = requireElement("select-map-dir", HTMLButtonElement);
	const mapDirPathEl = requireElement("map-dir-path", HTMLDivElement);
	const mapFileFilterInput = requireElement(
		"map-file-filter",
		HTMLInputElement,
	);
	const mapFileListEl = requireElement("map-file-list", HTMLDivElement);
	const mapPreviewEl = requireElement("map-preview", HTMLDivElement);
	const zoomInBtn = requireElement("map-zoom-in", HTMLButtonElement);
	const zoomOutBtn = requireElement("map-zoom-out", HTMLButtonElement);
	const zoomResetBtn = requireElement("map-zoom-reset", HTMLButtonElement);

	let currentFiles: readonly MapFile[] = [];
	let selectedFilePath: string | null = null;
	let currentImage: HTMLImageElement | null = null;
	let currentScale = 1;
	let translateX = 0;
	let translateY = 0;
	let isFitted = false;

	let isDragging = false;
	let dragMoved = false;
	let dragStartX = 0;
	let dragStartY = 0;
	let dragStartTranslateX = 0;
	let dragStartTranslateY = 0;

	function clearPreview(): void {
		currentImage = null;
		isFitted = false;
		options.clearElement(mapPreviewEl);
	}

	function showPreviewLoading(): void {
		clearPreview();
		const loading = document.createElement("div");
		loading.className = "map-loading";
		const spinner = document.createElement("div");
		spinner.className = "map-spinner";
		const label = document.createElement("span");
		label.textContent = "加载中...";
		loading.appendChild(spinner);
		loading.appendChild(label);
		mapPreviewEl.appendChild(loading);
	}

	function showPreviewEmpty(message: string): void {
		clearPreview();
		const empty = document.createElement("div");
		empty.className = "map-preview-empty";
		empty.textContent = message;
		mapPreviewEl.appendChild(empty);
	}

	function applyTransform(): void {
		if (!currentImage) return;
		currentImage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentScale})`;
	}

	function fitImage(): void {
		if (!currentImage) return;
		const containerWidth = mapPreviewEl.clientWidth;
		const containerHeight = mapPreviewEl.clientHeight;
		const imageWidth = currentImage.naturalWidth;
		const imageHeight = currentImage.naturalHeight;
		if (
			containerWidth === 0 ||
			containerHeight === 0 ||
			imageWidth === 0 ||
			imageHeight === 0
		) {
			return;
		}
		currentScale = Math.min(
			containerWidth / imageWidth,
			containerHeight / imageHeight,
		);
		currentScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, currentScale));
		translateX = (containerWidth - imageWidth * currentScale) / 2;
		translateY = (containerHeight - imageHeight * currentScale) / 2;
		applyTransform();
		isFitted = true;
	}

	function zoomAround(
		factor: number,
		centerX: number,
		centerY: number,
	): void {
		if (!currentImage) return;
		const newScale = Math.max(
			MIN_SCALE,
			Math.min(MAX_SCALE, currentScale * factor),
		);
		if (newScale === currentScale) return;
		const imageX = (centerX - translateX) / currentScale;
		const imageY = (centerY - translateY) / currentScale;
		translateX = centerX - imageX * newScale;
		translateY = centerY - imageY * newScale;
		currentScale = newScale;
		isFitted = false;
		applyTransform();
	}

	function zoomIn(): void {
		const centerX = mapPreviewEl.clientWidth / 2;
		const centerY = mapPreviewEl.clientHeight / 2;
		zoomAround(ZOOM_IN_FACTOR, centerX, centerY);
	}

	function zoomOut(): void {
		const centerX = mapPreviewEl.clientWidth / 2;
		const centerY = mapPreviewEl.clientHeight / 2;
		zoomAround(ZOOM_OUT_FACTOR, centerX, centerY);
	}

	function resetView(): void {
		fitImage();
	}

	function onImageMouseDown(event: MouseEvent): void {
		if (event.button !== 0 || !currentImage) return;
		event.preventDefault();
		isDragging = true;
		dragMoved = false;
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		dragStartTranslateX = translateX;
		dragStartTranslateY = translateY;
		currentImage.classList.add("dragging");
		window.addEventListener("mousemove", onWindowMouseMove);
		window.addEventListener("mouseup", onWindowMouseUp);
	}

	function onWindowMouseMove(event: MouseEvent): void {
		if (!isDragging) return;
		const deltaX = event.clientX - dragStartX;
		const deltaY = event.clientY - dragStartY;
		if (
			Math.abs(deltaX) > DRAG_THRESHOLD ||
			Math.abs(deltaY) > DRAG_THRESHOLD
		) {
			dragMoved = true;
		}
		translateX = dragStartTranslateX + deltaX;
		translateY = dragStartTranslateY + deltaY;
		isFitted = false;
		applyTransform();
	}

	function onWindowMouseUp(): void {
		isDragging = false;
		currentImage?.classList.remove("dragging");
		window.removeEventListener("mousemove", onWindowMouseMove);
		window.removeEventListener("mouseup", onWindowMouseUp);
	}

	function onPreviewWheel(event: WheelEvent): void {
		if (!currentImage) return;
		event.preventDefault();
		const rect = mapPreviewEl.getBoundingClientRect();
		const centerX = event.clientX - rect.left;
		const centerY = event.clientY - rect.top;
		const factor = event.deltaY < 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;
		zoomAround(factor, centerX, centerY);
	}

	async function loadMapImage(filePath: string): Promise<void> {
		selectedFilePath = filePath;
		updateSelectionHighlight();
		showPreviewLoading();
		try {
			const result = await options.api.readMapImage(filePath);
			if (!result.success || !result.dataUri) {
				options.log(`读取地图图片失败: ${result.error}`, "error");
				showPreviewEmpty("地图加载失败");
				return;
			}

			const dataUri = result.dataUri;
			clearPreview();
			const img = document.createElement("img");
			img.src = dataUri;
			img.alt = "地图预览";
			img.draggable = false;
			img.addEventListener("dragstart", (event) =>
				event.preventDefault(),
			);
			img.addEventListener("mousedown", onImageMouseDown);
			img.addEventListener("click", () => {
				if (!dragMoved) {
					window.open(dataUri, "_blank");
				}
			});
			img.addEventListener("load", () => {
				currentImage = img;
				fitImage();
			});
			img.addEventListener("error", () => {
				options.log("地图图片解码失败", "error");
				showPreviewEmpty("无法显示地图图片");
			});
			mapPreviewEl.appendChild(img);
		} catch (error) {
			options.log(
				`读取地图图片失败: ${error instanceof Error ? error.message : String(error)}`,
				"error",
			);
			showPreviewEmpty("地图加载失败");
		}
	}

	function updateSelectionHighlight(): void {
		const items = Array.from(
			mapFileListEl.querySelectorAll<HTMLButtonElement>(".map-file-item"),
		);
		for (const item of items) {
			item.classList.toggle("selected", item.dataset.path === selectedFilePath);
		}
	}

	function renderFileList(files: readonly MapFile[]): void {
		options.clearElement(mapFileListEl);
		const query = mapFileFilterInput.value.trim().toLowerCase();
		const filtered = files.filter((file) =>
			file.name.toLowerCase().includes(query),
		);
		if (filtered.length === 0) {
			const empty = document.createElement("div");
			empty.className = "map-file-empty";
			empty.textContent = query
				? "没有匹配的文件"
				: "目录中没有找到地图图片";
			mapFileListEl.appendChild(empty);
			return;
		}

		const fragment = document.createDocumentFragment();
		for (const file of filtered) {
			const item = document.createElement("button");
			item.type = "button";
			item.className = "map-file-item";
			item.textContent = file.name;
			item.dataset.path = file.path;
			item.addEventListener("click", () => loadMapImage(file.path));
			fragment.appendChild(item);
		}
		mapFileListEl.appendChild(fragment);
		updateSelectionHighlight();
	}

	async function loadMapFiles(directory: string): Promise<void> {
		try {
			const result = await options.api.getMapFiles(directory);
			if (!result.success) {
				options.log(`获取地图文件失败: ${result.error}`, "error");
				return;
			}

			currentFiles = result.files;
			selectedFilePath = null;
			mapFileFilterInput.value = "";
			renderFileList(currentFiles);
		} catch (error) {
			options.log(
				`获取地图文件失败: ${error instanceof Error ? error.message : String(error)}`,
				"error",
			);
		}
	}

	mapFileFilterInput.addEventListener("input", () => {
		renderFileList(currentFiles);
	});

	mapPreviewEl.addEventListener("wheel", onPreviewWheel, { passive: false });

	zoomInBtn.addEventListener("click", zoomIn);
	zoomOutBtn.addEventListener("click", zoomOut);
	zoomResetBtn.addEventListener("click", resetView);

	window.addEventListener("resize", () => {
		if (currentImage && isFitted) {
			fitImage();
		}
	});

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
