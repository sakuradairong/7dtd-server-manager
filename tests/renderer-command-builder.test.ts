import {
	buildActionCommand,
	buildPlayerCommand,
	escapeTelnetArgument,
} from "../src/renderer/command-builder";

describe("renderer command builder", () => {
	it("quotes prompted text by default and escapes double quotes", () => {
		expect(
			buildActionCommand({
				action: "say",
				promptValue: '欢迎 "新玩家"',
			}),
		).toBe('say "欢迎 ""新玩家"""');
	});

	it("supports raw prompted arguments for multi-argument commands", () => {
		expect(
			buildActionCommand({
				action: "settime",
				promptValue: "day 7 12:00",
				quotePrompt: false,
			}),
		).toBe("settime day 7 12:00");
	});

	it("uses fixed arguments before prompted values", () => {
		expect(
			buildActionCommand({
				action: "ban",
				fixedArgs: "list",
				promptValue: "ignored",
			}),
		).toBe("ban list");
	});

	it("omits empty prompted values", () => {
		expect(buildActionCommand({ action: "help", promptValue: "   " })).toBe(
			"help",
		);
	});

	it("builds common player management commands", () => {
		expect(buildPlayerCommand("kill", "Alice")).toBe('kill "Alice"');
		expect(buildPlayerCommand("kick", "Alice", "AFK")).toBe(
			'kick "Alice" "AFK"',
		);
		expect(buildPlayerCommand("sayplayer", "Alice", "你好")).toBe(
			'sayplayer "Alice" "你好"',
		);
		expect(buildPlayerCommand("ban", "Alice", "2 hours griefing")).toBe(
			'ban add "Alice" 2 hours griefing',
		);
		expect(buildPlayerCommand("whitelist", "Alice")).toBe(
			'whitelist add "Alice"',
		);
		expect(buildPlayerCommand("admin", "Alice", "0")).toBe(
			'admin add "Alice" 0',
		);
	});

	it("escapes quotes in player names", () => {
		expect(escapeTelnetArgument('A "quoted" name')).toBe('A ""quoted"" name');
	});
});
