import type { AuthRecord } from 'pocketbase';
import { pb } from './pb';

class AuthState {
	user = $state<AuthRecord>(pb.authStore.record);

	constructor() {
		pb.authStore.onChange(() => {
			this.user = pb.authStore.record;
		});
	}

	get isLoggedIn(): boolean {
		return pb.authStore.isValid && !!this.user;
	}

	logout() {
		pb.authStore.clear();
	}
}

export const auth = new AuthState();
