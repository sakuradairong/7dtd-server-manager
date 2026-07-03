import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

function extractCommandKeys(content: string): readonly string[] {
	const match = content.match(
		/export const TELNET_COMMANDS = \{[\s\S]*?\} as const;/,
	);
	if (!match) {
		throw new Error("TELNET_COMMANDS export not found");
	}

	return Array.from(
		match[0].matchAll(/^\s*([a-zA-Z0-9_]+): \{/gm),
		(keyMatch) => keyMatch[1],
	);
}

describe("telnet command generator", () => {
	it("generates the renderer command registry from common constants", () => {
		const repoRoot = path.resolve(__dirname, "..");
		const scriptPath = path.join(
			repoRoot,
			"scripts",
			"generate-telnet-commands.js",
		);
		const sourcePath = path.join(repoRoot, "src", "common", "constants.ts");
		const tempDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "7dtd-telnet-commands-"),
		);
		const targetPath = path.join(tempDir, "telnet-commands.gen.ts");

		try {
			execFileSync(process.execPath, [scriptPath], {
				cwd: repoRoot,
				env: { ...process.env, TELNET_COMMANDS_TARGET: targetPath },
				stdio: "pipe",
			});

			const source = fs.readFileSync(sourcePath, "utf8");
			const generated = fs.readFileSync(targetPath, "utf8");
			const sourceKeys = extractCommandKeys(source);
			const generatedKeys = extractCommandKeys(generated);

			expect(generated).toContain(
				"Auto-generated from src/common/constants.ts",
			);
			expect(generated).toContain(
				"export type CommandName = keyof typeof TELNET_COMMANDS;",
			);
			expect(generatedKeys).toEqual(sourceKeys);
			expect(generatedKeys.length).toBeGreaterThan(100);
			expect(generatedKeys).toEqual(
				expect.arrayContaining(["admin", "listplayers", "saveworld"]),
			);
		} finally {
			fs.rmSync(tempDir, { force: true, recursive: true });
		}
	});
});
