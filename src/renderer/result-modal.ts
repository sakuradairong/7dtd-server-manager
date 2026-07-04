type ResultModalOptions = {
	readonly copyTextToClipboard: (text: string) => Promise<boolean>;
};

type ResultModal = {
	readonly show: (title: string, content: string) => void;
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

export function initResultModal(options: ResultModalOptions): ResultModal {
	const resultModal = requireElement("result-modal", HTMLDivElement);
	const modalTitle = requireElement("modal-title", HTMLHeadingElement);
	const modalContent = requireElement("modal-content", HTMLPreElement);
	const modalCloseBtn = requireElement("modal-close", HTMLButtonElement);
	const modalCloseBtn2 = requireElement("modal-close-btn", HTMLButtonElement);
	const modalCopyBtn = requireElement("modal-copy", HTMLButtonElement);

	function show(title: string, content: string): void {
		modalTitle.textContent = title;
		modalContent.textContent = content;
		resultModal.classList.add("active");
		resultModal.setAttribute("aria-hidden", "false");
	}

	function close(): void {
		resultModal.classList.remove("active");
		resultModal.setAttribute("aria-hidden", "true");
		modalContent.textContent = "";
	}

	modalCloseBtn.addEventListener("click", close);
	modalCloseBtn2.addEventListener("click", close);
	modalCopyBtn.addEventListener("click", async () => {
		const copied = await options.copyTextToClipboard(
			modalContent.textContent ?? "",
		);
		if (copied) {
			modalCopyBtn.textContent = "已复制";
			setTimeout(() => {
				modalCopyBtn.textContent = "复制结果";
			}, 1500);
		}
	});
	resultModal.addEventListener("click", (event) => {
		if (event.target === resultModal) {
			close();
		}
	});
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && resultModal.classList.contains("active")) {
			close();
		}
	});

	return { show };
}
