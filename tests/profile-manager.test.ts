import * as fs from "fs";
import * as path from "path";
import { ProfileManager } from "../src/main/profile-manager";

describe("ProfileManager", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join("/tmp", "7dtd-profile-test-"));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("saves and retrieves profiles", () => {
		const manager = new ProfileManager(tempDir);

		const profile = manager.saveProfile({
			name: "Local Server",
			host: "127.0.0.1",
			port: 8081,
			password: "secret",
		});

		expect(profile.id).toBeDefined();
		expect(manager.getProfiles()).toHaveLength(1);
		expect(manager.getProfile(profile.id)).toEqual(profile);
	});

	it("updates existing profile by id", () => {
		const manager = new ProfileManager(tempDir);
		const profile = manager.saveProfile({
			name: "Local Server",
			host: "127.0.0.1",
			port: 8081,
			password: "secret",
		});

		const updated = manager.saveProfile({
			id: profile.id,
			name: "Updated Server",
			host: "192.168.1.100",
			port: 8082,
			password: "newsecret",
		});

		expect(manager.getProfiles()).toHaveLength(1);
		expect(updated.name).toBe("Updated Server");
		expect(manager.getProfile(profile.id)?.host).toBe("192.168.1.100");
	});

	it("deletes profiles", () => {
		const manager = new ProfileManager(tempDir);
		const profile = manager.saveProfile({
			name: "Local Server",
			host: "127.0.0.1",
			port: 8081,
			password: "secret",
		});

		expect(manager.deleteProfile(profile.id)).toBe(true);
		expect(manager.getProfiles()).toHaveLength(0);
		expect(manager.deleteProfile(profile.id)).toBe(false);
	});

	it("tracks last used profile", () => {
		const manager = new ProfileManager(tempDir);
		const profile = manager.saveProfile({
			name: "Local Server",
			host: "127.0.0.1",
			port: 8081,
			password: "secret",
		});

		manager.setLastUsedProfile(profile.id);
		expect(manager.getLastUsedProfile()?.id).toBe(profile.id);
	});

	it("persists profiles across instances", () => {
		const manager1 = new ProfileManager(tempDir);
		const profile = manager1.saveProfile({
			name: "Persistent Server",
			host: "10.0.0.1",
			port: 8081,
			password: "persist",
		});

		const manager2 = new ProfileManager(tempDir);
		expect(manager2.getProfile(profile.id)).toEqual(profile);
	});

	it("obfuscates passwords on disk while keeping them readable in memory", () => {
		const manager = new ProfileManager(tempDir);
		const profile = manager.saveProfile({
			name: "Secure Server",
			host: "127.0.0.1",
			port: 8081,
			password: "supersecret",
		});

		expect(manager.getProfile(profile.id)?.password).toBe("supersecret");

		const raw = fs.readFileSync(path.join(tempDir, "profiles.json"), "utf8");
		expect(raw).not.toContain("supersecret");
		expect(raw).toContain("obf:");

		const parsed = JSON.parse(raw);
		const encodedPassword = parsed.profiles[0].password as string;
		expect(Buffer.from(encodedPassword.slice(4), "base64").toString("utf8")).toBe(
			"supersecret",
		);
	});

	it("reads legacy plaintext passwords", () => {
		fs.writeFileSync(
			path.join(tempDir, "profiles.json"),
			JSON.stringify(
				{
					profiles: [
						{
							id: "legacy",
							name: "Legacy",
							host: "127.0.0.1",
							port: 8081,
							password: "plaintext",
						},
					],
				},
				null,
				2,
			),
		);

		const manager = new ProfileManager(tempDir);
		expect(manager.getProfile("legacy")?.password).toBe("plaintext");
	});

	it("handles corrupted profiles.json gracefully", () => {
		fs.writeFileSync(path.join(tempDir, "profiles.json"), "not valid json {");

		const manager = new ProfileManager(tempDir);
		expect(manager.getProfiles()).toEqual([]);
		expect(manager.getLastUsedProfile()).toBeUndefined();

		const saved = manager.saveProfile({
			name: "Recovery",
			host: "127.0.0.1",
			port: 8081,
			password: "secret",
		});
		expect(manager.getProfile(saved.id)?.name).toBe("Recovery");
	});
});
