import { EventEmitter } from "events";
import { TelnetClient } from "../src/main/telnet-client";

class MockSocket extends EventEmitter {
	writable = false;

	connect(): void {
		this.writable = true;
		process.nextTick(() => this.emit("connect"));
	}

	write(data: string): boolean {
		if (data.includes("testpass")) {
			process.nextTick(() =>
				this.emit("data", Buffer.from("Authenticated\r\n")),
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
