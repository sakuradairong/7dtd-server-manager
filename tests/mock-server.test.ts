import { createServer, type Server, type Socket } from "net";
import { TelnetClient } from "../src/main/telnet-client";

function handleMockCommand(socket: Socket, text: string): void {
	if (text === "testpass") {
		socket.write("Authenticated\r\n");
		return;
	}

	if (text === "listplayers") {
		socket.write(
			"id,name,position,rot,remote,health,deaths,zombies,players,score,level,steamid,ip,ping\r\n",
		);
		socket.write(
			"1,PlayerOne,-200 77 300,0,True,100,0,5,0,0,5,12345,192.168.1.10,45\r\n",
		);
		return;
	}

	if (text === "gettime") {
		socket.write("Day 12, 14:30\r\n");
		return;
	}

	if (text.startsWith("say ")) {
		socket.write(`Server: ${text.slice(4)}\r\n`);
		return;
	}

	if (text === "shutdown") {
		socket.write("Shutting down...\r\n");
		socket.end();
		return;
	}

	socket.write(`Executed: ${text}\r\n`);
}

function createMockServer(): Server {
	return createServer((socket) => {
		socket.write("Please enter password:\r\n");
		socket.on("data", (data) =>
			handleMockCommand(socket, data.toString().trim()),
		);
	});
}

function startServer(server: Server): Promise<number> {
	return new Promise((resolve, reject) => {
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const resolvedPort = typeof address === "string" ? 0 : address!.port;
			resolve(resolvedPort);
		});
		server.once("error", reject);
	});
}

describe("TelnetClient with real mock server", () => {
	let server: Server;
	let serverSocket: Socket | null = null;
	let port: number;

	beforeEach(async () => {
		server = createMockServer();
		server.on("connection", (socket) => {
			serverSocket = socket;
		});
		port = await startServer(server);
	});

	afterEach((done) => {
		serverSocket?.destroy();
		server.close(() => done());
	});

	it("connects, authenticates, and executes commands against a real mock server", async () => {
		const client = new TelnetClient({
			host: "127.0.0.1",
			port,
			password: "testpass",
			timeoutMs: 2000,
		});

		await client.connect();
		expect(client.getState().authenticated).toBe(true);

		const listPlayersResult = await client.sendCommand("listplayers", {
			silenceMs: 100,
		});
		expect(listPlayersResult.response).toContain("PlayerOne");

		const timeResult = await client.sendCommand("gettime", { silenceMs: 100 });
		expect(timeResult.response).toContain("Day 12, 14:30");

		const sayResult = await client.sendCommand("say Hello survivors!", {
			silenceMs: 100,
		});
		expect(sayResult.response).toContain("Hello survivors!");

		client.disconnect();
	});

	it("handles connection refusal", async () => {
		server.close();
		await new Promise<void>((resolve) => server.once("close", resolve));

		const client = new TelnetClient({
			host: "127.0.0.1",
			port,
			password: "testpass",
			timeoutMs: 500,
		});
		client.on("error", () => {});

		await expect(client.connect()).rejects.toThrow();
	});
});
