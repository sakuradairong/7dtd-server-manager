import * as fs from "fs";
import * as path from "path";
import type { ServerProfile } from "../common/types";

export interface ProfileStorage {
	readonly profiles: ServerProfile[];
	readonly lastUsedProfileId?: string;
}

export class ProfileManager {
	private filePath: string;
	private data: ProfileStorage;

	constructor(storageDir: string) {
		this.filePath = path.join(storageDir, "profiles.json");
		this.data = this.loadFromDisk();
	}

	getProfiles(): ServerProfile[] {
		return [...this.data.profiles];
	}

	getProfile(id: string): ServerProfile | undefined {
		return this.data.profiles.find((profile) => profile.id === id);
	}

	saveProfile(
		profile: Omit<ServerProfile, "id"> & { id?: string },
	): ServerProfile {
		const id = profile.id ?? this.generateId();
		const existingIndex = this.data.profiles.findIndex((p) => p.id === id);
		const newProfile: ServerProfile = { ...profile, id };

		if (existingIndex >= 0) {
			const updatedProfiles = [...this.data.profiles];
			updatedProfiles[existingIndex] = newProfile;
			this.data = { ...this.data, profiles: updatedProfiles };
		} else {
			this.data = {
				...this.data,
				profiles: [...this.data.profiles, newProfile],
			};
		}

		this.persist();
		return newProfile;
	}

	deleteProfile(id: string): boolean {
		const originalLength = this.data.profiles.length;
		const filteredProfiles = this.data.profiles.filter(
			(profile) => profile.id !== id,
		);

		if (filteredProfiles.length === originalLength) {
			return false;
		}

		this.data = {
			...this.data,
			profiles: filteredProfiles,
			lastUsedProfileId:
				this.data.lastUsedProfileId === id
					? undefined
					: this.data.lastUsedProfileId,
		};
		this.persist();
		return true;
	}

	setLastUsedProfile(id: string): void {
		if (this.data.profiles.some((profile) => profile.id === id)) {
			this.data = { ...this.data, lastUsedProfileId: id };
			this.persist();
		}
	}

	getLastUsedProfile(): ServerProfile | undefined {
		if (!this.data.lastUsedProfileId) return undefined;
		return this.getProfile(this.data.lastUsedProfileId);
	}

	private loadFromDisk(): ProfileStorage {
		try {
			if (fs.existsSync(this.filePath)) {
				const content = fs.readFileSync(this.filePath, "utf8");
				const parsed = JSON.parse(content) as ProfileStorage;
				if (Array.isArray(parsed.profiles)) {
					return parsed;
				}
			}
		} catch (error) {
			console.error("Failed to load profiles:", error);
		}

		return { profiles: [] };
	}

	private persist(): void {
		try {
			fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
			fs.writeFileSync(
				this.filePath,
				JSON.stringify(this.data, null, 2),
				"utf8",
			);
		} catch (error) {
			console.error("Failed to save profiles:", error);
		}
	}

	private generateId(): string {
		return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
	}
}
