type PromptResult = {
	readonly confirmed: boolean;
	readonly value: string;
};

type PromptModal = {
	readonly confirm: (message: string) => Promise<boolean>;
	readonly prompt: (title: string, message: string, defaultValue?: string) => Promise<string | null>;
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

export function initPromptModal(): PromptModal {
	const modal = requireElement("prompt-modal", HTMLDivElement);
	const title = requireElement("prompt-modal-title", HTMLHeadingElement);
	const message = requireElement("prompt-modal-message", HTMLParagraphElement);
	const input = requireElement("prompt-modal-input", HTMLInputElement);
	const confirmBtn = requireElement("prompt-modal-confirm", HTMLButtonElement);
	const cancelBtn = requireElement("prompt-modal-cancel", HTMLButtonElement);
	const closeBtn = requireElement("prompt-modal-close", HTMLButtonElement);

	let resolvePromise: ((result: PromptResult) => void) | null = null;

	function open(titleText: string, messageText: string, showInput: boolean, defaultValue = ""): void {
		title.textContent = titleText;
		message.textContent = messageText;
		input.value = defaultValue;
		input.style.display = showInput ? "block" : "none";
		modal.classList.add("active");
		modal.setAttribute("aria-hidden", "false");
		if (showInput) {
			input.focus();
		} else {
			confirmBtn.focus();
		}
	}

	function close(): void {
		modal.classList.remove("active");
		modal.setAttribute("aria-hidden", "true");
		input.value = "";
	}

	function finish(confirmed: boolean, value = ""): void {
		if (resolvePromise) {
			resolvePromise({ confirmed, value });
			resolvePromise = null;
		}
		close();
	}

	confirmBtn.addEventListener("click", () => finish(true, input.value));
	cancelBtn.addEventListener("click", () => finish(false));
	closeBtn.addEventListener("click", () => finish(false));
	modal.addEventListener("click", (event) => {
		if (event.target === modal) {
			finish(false);
		}
	});
	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			finish(true, input.value);
		} else if (event.key === "Escape") {
			finish(false);
		}
	});
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && modal.classList.contains("active")) {
			finish(false);
		}
	});

	return {
		confirm: (messageText: string) =>
			new Promise<boolean>((resolve) => {
				resolvePromise = (result: PromptResult) => resolve(result.confirmed);
				open("确认", messageText, false);
			}),
		prompt: (titleText: string, messageText: string, defaultValue?: string) =>
			new Promise<string | null>((resolve) => {
				resolvePromise = (result: PromptResult) =>
					resolve(result.confirmed ? result.value : null);
				open(titleText, messageText, true, defaultValue);
			}),
	};
}
