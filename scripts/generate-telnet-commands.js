const fs = require("fs");
const path = require("path");

const SOURCE = process.env.TELNET_COMMANDS_SOURCE
	? path.resolve(process.env.TELNET_COMMANDS_SOURCE)
	: path.join(__dirname, "..", "src", "common", "constants.ts");
const TARGET = process.env.TELNET_COMMANDS_TARGET
	? path.resolve(process.env.TELNET_COMMANDS_TARGET)
	: path.join(__dirname, "..", "src", "renderer", "telnet-commands.gen.ts");

const source = fs.readFileSync(SOURCE, "utf8");
const match = source.match(
	/export const TELNET_COMMANDS = \{[\s\S]*?\} as const;/,
);
if (!match) {
	throw new Error("TELNET_COMMANDS not found in src/common/constants.ts");
}

const output = `// Auto-generated from src/common/constants.ts by scripts/generate-telnet-commands.js
// Do not edit manually; run \`npm run generate:telnet-commands\` instead.

${match[0]}

export type CommandName = keyof typeof TELNET_COMMANDS;
`;

const commandCount = (match[0].match(/^\s*[a-zA-Z0-9_]+: \{/gm) ?? []).length;
fs.mkdirSync(path.dirname(TARGET), { recursive: true });
fs.writeFileSync(TARGET, output);
console.log(`Generated ${TARGET} (${commandCount} commands)`);
