export interface ActionCommandInput {
	readonly action: string;
	readonly fixedArgs?: string;
	readonly promptValue?: string | null;
	readonly quotePrompt?: boolean;
}

export function escapeTelnetArgument(text: string): string {
	return text.replace(/"/g, '""');
}

function quoteTelnetArgument(text: string): string {
	return `"${escapeTelnetArgument(text)}"`;
}

export function buildActionCommand(input: ActionCommandInput): string {
	if (input.fixedArgs?.trim()) {
		return `${input.action} ${input.fixedArgs.trim()}`;
	}

	if (input.promptValue === null || input.promptValue === undefined) {
		return input.action;
	}

	const value = input.promptValue.trim();
	if (!value) {
		return input.action;
	}

	const formattedValue =
		input.quotePrompt === false ? value : quoteTelnetArgument(value);
	return `${input.action} ${formattedValue}`;
}

export function buildPlayerCommand(
	action: string,
	playerName: string,
	promptValue?: string | null,
): string {
	const quotedPlayerName = quoteTelnetArgument(playerName);
	const value = promptValue?.trim() ?? "";

	switch (action) {
		case "kick":
			return value
				? `kick ${quotedPlayerName} ${quoteTelnetArgument(value)}`
				: `kick ${quotedPlayerName}`;
		case "kill":
			return `kill ${quotedPlayerName}`;
		case "sayplayer":
			return value
				? `sayplayer ${quotedPlayerName} ${quoteTelnetArgument(value)}`
				: `sayplayer ${quotedPlayerName}`;
		case "ban":
			return value
				? `ban add ${quotedPlayerName} ${value}`
				: `ban add ${quotedPlayerName}`;
		case "whitelist":
			return `whitelist add ${quotedPlayerName}`;
		case "admin":
			return value
				? `admin add ${quotedPlayerName} ${value}`
				: `admin add ${quotedPlayerName}`;
		default:
			return `${action} ${quotedPlayerName}`;
	}
}
