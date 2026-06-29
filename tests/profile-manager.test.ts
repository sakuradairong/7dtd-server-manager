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
});
