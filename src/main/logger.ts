import * as fs from "fs";
import * as path from "path";

export type LogLevel = "info" | "command" | "response" | "error" | "event";

export interface LogEntry {
	readonly timestamp: Date;
	readonly level: LogLevel;
	readonly message: string;
}

export class FileLogger {
	private logDir: string;
	private currentFile: string;
	private currentDate: string;
	private maxFiles: number;

	constructor(logDir: string, maxFiles = 30) {
		this.logDir = logDir;
		this.maxFiles = maxFiles;
		this.currentDate = this.formatDate(new Date());
		this.currentFile = this.buildFilePath(this.currentDate);
		this.ensureDirectory();
	}

	log(message: string, level: LogLevel = "info"): void {
		const entry: LogEntry = {
			timestamp: new Date(),
			level,
			message,
		};

		this.writeEntry(entry);
	}

	private writeEntry(entry: LogEntry): void {
		const entryDate = this.formatDate(entry.timestamp);
		if (entryDate !== this.currentDate) {
			this.currentDate = entryDate;
			this.currentFile = this.buildFilePath(entryDate);
			this.cleanupOldFiles();
		}

		const line = `[${entry.timestamp.toISOString()}] [${entry.level.toUpperCase()}] ${entry.message}\n`;

		try {
			fs.appendFileSync(this.currentFile, line, { encoding: "utf8" });
		} catch (error) {
			console.error("Failed to write log entry:", error);
		}
	}

	private buildFilePath(date: string): string {
		return path.join(this.logDir, `7dtd-manager-${date}.log`);
	}

	private ensureDirectory(): void {
		try {
			fs.mkdirSync(this.logDir, { recursive: true });
		} catch (error) {
			console.error("Failed to create log directory:", error);
		}
	}

	cleanupOldFiles(): void {
		try {
			const files = fs
				.readdirSync(this.logDir)
				.filter(
					(file) => file.startsWith("7dtd-manager-") && file.endsWith(".log"),
				)
				.map((file) => ({
					name: file,
					path: path.join(this.logDir, file),
					stat: fs.statSync(path.join(this.logDir, file)),
				}))
				.sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

			for (const file of files.slice(this.maxFiles)) {
				fs.unlinkSync(file.path);
			}
		} catch (error) {
			console.error("Failed to cleanup old log files:", error);
		}
	}

	private formatDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	getLogDirectory(): string {
		return this.logDir;
	}
}
