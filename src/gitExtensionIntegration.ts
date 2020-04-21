/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RemoteSourceProvider, RemoteSource } from './typings/git';
import { CredentialStore, GitHub } from './github/credentials';
import { Remote } from './common/remote';
import { Protocol } from './common/protocol';

function asRemoteSource(raw: any) {
	return { name: raw.full_name, url: raw.clone_url };
}

export class GithubRemoteSourceProvider implements RemoteSourceProvider {

	readonly name = 'GitHub';
	readonly supportsQuery = true;

	private userReposCache: RemoteSource[] = [];

	constructor(private readonly credentialStore: CredentialStore) { }

	async getRemoteSources(query?: string): Promise<RemoteSource[]> {
		const hub = await this.getHub();

		if (!hub) {
			throw new Error('Could not fetch repositories from GitHub.');
		}

		const [fromUser, fromQuery] = await Promise.all([
			this.getUserRemoteSources(hub, query),
			this.getQueryRemoteSources(hub, query)
		]);

		const userRepos = new Set(fromUser.map(r => r.name));

		return [
			...fromUser,
			...fromQuery.filter(r => !userRepos.has(r.name))
		];
	}

	private async getUserRemoteSources(hub: GitHub, query?: string): Promise<RemoteSource[]> {
		if (!query) {
			const res = await hub.octokit.repos.list();
			this.userReposCache = res.data.map(asRemoteSource);
		}

		return this.userReposCache;
	}

	private async getQueryRemoteSources(hub: GitHub, query?: string): Promise<RemoteSource[]> {
		if (!query) {
			return [];
		}

		const raw = await hub.octokit.search.repos({ q: query });
		return raw.data.items.map(asRemoteSource);
	}

	private async getHub(): Promise<GitHub | undefined> {
		// TODO: eventually remove
		const url = 'https://github.com/microsoft/vscode.git';
		const remote = new Remote('origin', url, new Protocol(url));

		if (await this.credentialStore.hasOctokit(remote)) {
			return await this.credentialStore.getHub(remote)!;
		}

		const hub = await this.credentialStore.loginWithConfirmation(remote);

		if (!hub) {
			return this.credentialStore.login(remote);
		}
	}
}