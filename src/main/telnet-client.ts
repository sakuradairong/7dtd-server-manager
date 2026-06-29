import { EventEmitter } from "events";
import { Socket } from "net";
import type {
	ServerConfig,
	ConnectionState,
	CommandResult,
} from "../common/types";
import { LINE_DELIMITER } from "../common/constants";

export interface CommandOptions {
	readonly timeoutMs?: number;
	readonly silenceMs?: number;
	readonly expectedLines?: number;
	readonly skipEcho?: boolean;
}

interface PendingCommand {
	readonly command: string;
	readonly options: CommandOptions;
	readonly resolve: (value: CommandResult) => void;
	readonly reject: (reason: Error) => void;
	readonly timeout: NodeJS.Timeout;
}

const DEFAULT_COMMAND_TIMEOUT_MS = 10000;
const DEFAULT_SILENCE_MS = 200;

export class TelnetClient extends EventEmitter {
	private socket: Socket | null = null;
	private config: ServerConfig;
	private state: ConnectionState = { connected: false, authenticated: false };
	private commandQueue: PendingCommand[] = [];
	private currentCommand: PendingCommand | null = null;
	private responseBuffer = "";
	private commandResponseAccumulator: string[] = [];
	private commandResponseTimeout: NodeJS.Timeout | null = null;
	private authenticationPromise: Promise<void> | null = null;

	constructor(
		config: Partial<ServerConfig> & Pick<ServerConfig, "host" | "password">,
	) {
		super();
		this.config = {
			port: 8081,
			timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
			...config,
		};
	}

	getState(): ConnectionState {
		return this.state;
	}

	async connect(): Promise<void> {
		if (this.socket?.writable) {
			return;
		}

		return new Promise((resolve, reject) => {
			this.socket = new Socket();

			const connectTimeout = setTimeout(() => {
				this.socket?.destroy();
				reject(
					new Error(`Connection timeout after ${this.config.timeoutMs}ms`),
				);
			}, this.config.timeoutMs);

			this.socket.once("connect", () => {
				clearTimeout(connectTimeout);
				this.state = { ...this.state, connected: true };
				this.emit("connected");
				this.authenticationPromise = this.authenticate();
				this.authenticationPromise.then(() => resolve()).catch(reject);
			});

			this.socket.once("error", (error) => {
				clearTimeout(connectTimeout);
				this.updateError(error.message);
				reject(error);
			});

			this.socket.on("data", (data) => this.handleData(data));
			this.socket.on("close", () => this.handleClose());
			this.socket.on("error", (error) => this.emit("error", error));

			this.socket.connect({ host: this.config.host, port: this.config.port });
		});
	}

	disconnect(): void {
		this.commandQueue.forEach((cmd) => {
			clearTimeout(cmd.timeout);
			cmd.reject(new Error("Disconnected before command could be executed"));
		});
		this.commandQueue = [];

		if (this.currentCommand) {
			clearTimeout(this.currentCommand.timeout);
			this.currentCommand.reject(
				new Error("Disconnected during command execution"),
			);
			this.currentCommand = null;
		}

		this.socket?.end();
		this.socket = null;
		this.state = { connected: false, authenticated: false };
		this.emit("disconnected");
	}

	async sendCommand(
		command: string,
		options: CommandOptions = {},
	): Promise<CommandResult> {
		await this.connect();

		return new Promise((resolve, reject) => {
			const timeoutMs = options.timeoutMs ?? this.config.timeoutMs;
			const timeout = setTimeout(() => {
				this.currentCommand = null;
				reject(new Error(`Command timeout: ${command}`));
				this.processQueue();
			}, timeoutMs);

			const pending: PendingCommand = {
				command,
				options,
				resolve,
				reject,
				timeout,
			};
			this.commandQueue.push(pending);
			this.processQueue();
		});
	}

	private async authenticate(): Promise<void> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error("Authentication timeout"));
			}, this.config.timeoutMs);

			this.once("authenticated", () => {
				clearTimeout(timeout);
				resolve();
			});

			this.once("authFailed", (error: string) => {
				clearTimeout(timeout);
				reject(new Error(`Authentication failed: ${error}`));
			});
		});
	}

	private handleData(data: Buffer): void {
		const text = data.toString("utf8");
		this.responseBuffer += text;

		if (!this.state.authenticated) {
			this.handleAuthentication(text);
			return;
		}

		this.processResponseBuffer();
	}

	private handleAuthentication(text: string): void {
		const lowerText = text.toLowerCase();
		if (
			lowerText.includes("password") ||
			lowerText.includes("enter password")
		) {
			this.write(this.config.password);
			return;
		}

		if (
			lowerText.includes("logged in") ||
			lowerText.includes("authenticated")
		) {
			this.state = { ...this.state, authenticated: true };
			this.emit("authenticated");
			this.processQueue();
			return;
		}

		if (
			lowerText.includes("wrong password") ||
			lowerText.includes("authentication failed")
		) {
			this.updateError("Invalid password");
			this.emit("authFailed", "Invalid password");
			return;
		}
	}

	private processResponseBuffer(): void {
		let lineEndIndex = this.responseBuffer.indexOf(LINE_DELIMITER);

		while (lineEndIndex !== -1) {
			const line = this.responseBuffer.slice(0, lineEndIndex).trim();
			this.responseBuffer = this.responseBuffer.slice(
				lineEndIndex + LINE_DELIMITER.length,
			);

			if (line.length > 0) {
				this.handleLine(line);
			}

			lineEndIndex = this.responseBuffer.indexOf(LINE_DELIMITER);
		}
	}

	private handleLine(line: string): void {
		if (!this.currentCommand) {
			this.emit("line", line);
			return;
		}

		const { command, options } = this.currentCommand;

		// Optionally skip the command echo that some servers send back
		if (options.skipEcho !== false && this.isCommandEcho(line, command)) {
			return;
		}

		// Detect prompt-like lines which often indicate end of response
		if (this.isPromptLine(line)) {
			this.flushCommandResponse();
			return;
		}

		this.commandResponseAccumulator.push(line);

		if (
			options.expectedLines !== undefined &&
			this.commandResponseAccumulator.length >= options.expectedLines
		) {
			this.flushCommandResponse();
			return;
		}

		if (this.commandResponseTimeout) {
			clearTimeout(this.commandResponseTimeout);
		}

		const silenceMs = options.silenceMs ?? DEFAULT_SILENCE_MS;
		this.commandResponseTimeout = setTimeout(() => {
			this.flushCommandResponse();
		}, silenceMs);
	}

	private isCommandEcho(line: string, command: string): boolean {
		// 7DTD telnet may echo the command back with a leading "> " or just the command
		const trimmed = line.replace(/^>\s*/, "");
		return trimmed === command || trimmed.startsWith(`${command} `);
	}

	private isPromptLine(line: string): boolean {
		// Common prompt patterns in dedicated server telnet consoles
		const promptPattern = /^(>\s*|\$\s*|7dtd>\s*|server>\s*)$/i;
		return promptPattern.test(line);
	}

	private flushCommandResponse(): void {
		if (!this.currentCommand) return;

		const response = this.commandResponseAccumulator.join("\n");
		this.commandResponseAccumulator = [];
		this.completeCurrentCommand({ success: true, response });
	}

	private processQueue(): void {
		if (this.currentCommand || this.commandQueue.length === 0) {
			return;
		}

		if (!this.state.authenticated) {
			return;
		}

		this.currentCommand = this.commandQueue.shift()!;
		this.write(this.currentCommand.command);
	}

	private write(data: string): void {
		if (!this.socket?.writable) {
			throw new Error("Not connected to server");
		}
		this.socket.write(data + LINE_DELIMITER);
	}

	private completeCurrentCommand(
		result:
			| { success: true; response: string }
			| { success: false; response: string; error: string },
	): void {
		if (!this.currentCommand) return;

		if (this.commandResponseTimeout) {
			clearTimeout(this.commandResponseTimeout);
			this.commandResponseTimeout = null;
		}

		clearTimeout(this.currentCommand.timeout);
		const { command, resolve } = this.currentCommand;
		this.currentCommand = null;

		if (result.success) {
			resolve({ command, response: result.response, success: true });
		} else {
			resolve({
				command,
				response: result.response,
				success: false,
				error: result.error,
			});
		}
		this.processQueue();
	}

	private handleClose(): void {
		this.state = {
			...this.state,
			connected: false,
			authenticated: false,
			lastError: "Connection closed",
		};
		this.emit("disconnected");
	}

	private updateError(message: string): void {
		this.state = { ...this.state, lastError: message };
		this.emit("error", new Error(message));
	}
}
