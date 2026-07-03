import { EventEmitter } from "events";
import { TelnetClient } from "../src/main/telnet-client";

let authenticationResponse = "Authenticated\r\n";

class MockSocket extends EventEmitter {
	writable = false;
	writes: string[] = [];

	connect(): void {
		this.writable = true;
		process.nextTick(() => this.emit("connect"));
	}

	write(data: string): boolean {
		this.writes.push(data);
		if (data.includes("testpass")) {
			process.nextTick(() =>
				this.emit("data", Buffer.from(authenticationResponse)),
			);
		}
		return true;
	}

	end(): void {
		this.writable = false;
		process.nextTick(() => this.emit("close"));
	}

	destroy(): void {
		this.writable = false;
	}
}

jest.mock("net", () => ({
	Socket: class {
		constructor() {
			return new MockSocket();
		}
	},
}));

describe("TelnetClient", () => {
	beforeEach(() => {
		authenticationResponse = "Authenticated\r\n";
	});

	function createClient(): TelnetClient {
		return new TelnetClient({
			host: "127.0.0.1",
			port: 8081,
			password: "testpass",
			timeoutMs: 1000,
		});
	}

	function getSocket(client: TelnetClient): MockSocket | undefined {
		return (client as unknown as { socket?: MockSocket }).socket;
	}

	it("connects and authenticates successfully", async () => {
		const client = createClient();
		client.on("error", () => {});

		const connectPromise = client.connect();

		process.nextTick(() => {
			getSocket(client)?.emit(
				"data",
				Buffer.from("Please enter password:\r\n"),
			);
		});

		await connectPromise;

		expect(client.getState().authenticated).toBe(true);

		client.removeAllListeners();
		client.disconnect();
	});

	it("authenticates with real 7DTD logon success text", async () => {
		authenticationResponse = "Logon successful.\r\n";
		const client = createClient();
		client.on("error", () => {});

		const connectPromise = client.connect();

		process.nextTick(() => {
			getSocket(client)?.emit(
				"data",
				Buffer.from("Please enter password:\r\n"),
			);
		});

		await connectPromise;

		expect(client.getState().authenticated).toBe(true);

		client.removeAllListeners();
		client.disconnect();
	});

	it("authenticates when prompt and success markers are split across packets", async () => {
		authenticationResponse = "Log";
		const client = createClient();
		client.on("error", () => {});

		const connectPromise = client.connect();
		process.nextTick(() => {
			getSocket(client)?.emit("data", Buffer.from("Please enter pass"));
		});
		setTimeout(() => {
			getSocket(client)?.emit("data", Buffer.from("word:\r\n"));
		}, 10);
		setTimeout(() => {
			getSocket(client)?.emit("data", Buffer.from("on successful.\r\n"));
		}, 20);

		await connectPromise;

		expect(client.getState().authenticated).toBe(true);
		expect(getSocket(client)?.writes).toContain("testpass\r\n");

		client.removeAllListeners();
		client.disconnect();
	});

	it("does not include authentication text in the first command response", async () => {
		authenticationResponse = "Logon successful.\r\n";
		const client = createClient();
		client.on("error", () => {});

		const connectPromise = client.connect();
		process.nextTick(() => {
			getSocket(client)?.emit(
				"data",
				Buffer.from("Please enter password:\r\n"),
			);
		});
		await connectPromise;

		const commandPromise = client.sendCommand("version", { silenceMs: 50 });
		setTimeout(() => {
			getSocket(client)?.emit("data", Buffer.from("V2.5 Stable\r\n"));
		}, 10);

		const result = await commandPromise;

		expect(result.response).toBe("V2.5 Stable");
		expect(result.response).not.toContain("password");
		expect(result.response).not.toContain("Logon successful");

		client.removeAllListeners();
		client.disconnect();
	});

	it("redacts every password occurrence from diagnostic events", async () => {
		authenticationResponse = "Authenticated testpass testpass\r\n";
		const client = createClient();
		client.on("error", () => {});
		const diagnostics: Array<{ phase: string; message: string }> = [];
		client.on("diagnostic", (diagnostic) => diagnostics.push(diagnostic));

		const connectPromise = client.connect();
		process.nextTick(() => {
			getSocket(client)?.emit(
				"data",
				Buffer.from("Please enter password:\r\n"),
			);
		});
		await connectPromise;

		expect(diagnostics.map((entry) => entry.message).join("\n")).not.toContain(
			"testpass",
		);
		expect(diagnostics.map((entry) => entry.message).join("\n")).toContain(
			"[password redacted]",
		);

		client.removeAllListeners();
		client.disconnect();
	});

	it("rejects when the server reports an authentication failure", async () => {
		authenticationResponse = "Wrong password\r\n";
		const client = createClient();
		client.on("error", () => {});

		const connectPromise = client.connect();
		process.nextTick(() => {
			getSocket(client)?.emit(
				"data",
				Buffer.from("Please enter password:\r\n"),
			);
		});

		await expect(connectPromise).rejects.toThrow("Authentication failed");
		expect(client.getState().lastError).toBe("Invalid password");

		client.removeAllListeners();
		client.disconnect();
	});

	it("queues commands and returns results after silence period", async () => {
		const client = createClient();
		client.on("error", () => {});

		const connectPromise = client.connect();
		process.nextTick(() => {
			getSocket(client)?.emit(
				"data",
				Buffer.from("Please enter password:\r\n"),
			);
		});
		await connectPromise;

		const commandPromise = client.sendCommand("listplayers", { silenceMs: 50 });

		setTimeout(() => {
			getSocket(client)?.emit("data", Buffer.from("1,Player,0 0 0\r\n"));
		}, 10);

		const result = await commandPromise;

		expect(result.success).toBe(true);
		expect(result.command).toBe("listplayers");
		expect(result.response).toContain("1,Player,0 0 0");

		client.removeAllListeners();
		client.disconnect();
	});

	it("skips command echo when configured", async () => {
		const client = createClient();
		client.on("error", () => {});

		const connectPromise = client.connect();
		process.nextTick(() => {
			getSocket(client)?.emit(
				"data",
				Buffer.from("Please enter password:\r\n"),
			);
		});
		await connectPromise;

		const commandPromise = client.sendCommand("version", { silenceMs: 50 });

		setTimeout(() => {
			getSocket(client)?.emit(
				"data",
				Buffer.from("> version\r\nV2.5 Stable\r\n"),
			);
		}, 10);

		const result = await commandPromise;

		expect(result.response).not.toContain("> version");
		expect(result.response).toContain("V2.5 Stable");

		client.removeAllListeners();
		client.disconnect();
	});
});
