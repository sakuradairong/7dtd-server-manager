import * as fs from "fs";
import * as path from "path";
import { FileLogger } from "../src/main/logger";

describe("FileLogger", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join("/tmp", "7dtd-logger-test-"));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("writes log entries to a dated file", () => {
		const logger = new FileLogger(tempDir);

		logger.log("Test message", "info");
		logger.log("Command executed", "command");

		const files = fs.readdirSync(tempDir);
		expect(files).toHaveLength(1);

		const content = fs.readFileSync(path.join(tempDir, files[0]), "utf8");
		expect(content).toContain("Test message");
		expect(content).toContain("Command executed");
		expect(content).toContain("[INFO]");
		expect(content).toContain("[COMMAND]");
	});

	it("cleans up old log files beyond maxFiles", () => {
		const logger = new FileLogger(tempDir, 2);

		// Create three old log files
		const dates = ["2024-01-01", "2024-01-02", "2024-01-03"];
		for (const date of dates) {
			fs.writeFileSync(
				path.join(tempDir, `7dtd-manager-${date}.log`),
				"old log",
			);
		}

		logger.cleanupOldFiles();

		const files = fs
			.readdirSync(tempDir)
			.filter((file) => file.startsWith("7dtd-manager-"));
		expect(files.length).toBeLessThanOrEqual(2);
	});

	it("reports the log directory", () => {
		const logger = new FileLogger(tempDir);
		expect(logger.getLogDirectory()).toBe(tempDir);
	});
});
