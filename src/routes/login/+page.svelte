<script lang="ts">
	import { goto } from '$app/navigation';
	import { pb } from '$lib/pb';

	type Mode = 'login' | 'signup';

	let mode = $state<Mode>('login');
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let passwordConfirm = $state('');

	let loading = $state(false);
	let oauthLoading = $state<'google' | null>(null);
	let serverError = $state('');
	let fieldErrors = $state<Partial<Record<'name' | 'email' | 'password' | 'passwordConfirm', string>>>(
		{}
	);
	const busy = $derived(loading || oauthLoading !== null);

	function switchMode(next: Mode) {
		if (mode === next || busy) return;
		mode = next;
		serverError = '';
		fieldErrors = {};
	}

	function validate(): boolean {
		const errors: typeof fieldErrors = {};
		if (mode === 'signup' && !name.trim()) {
			errors.name = 'Tell us your name.';
		}
		if (!email.trim()) {
			errors.email = 'Email is required.';
		}
		if (!password) {
			errors.password = 'Password is required.';
		} else if (password.length < 8) {
			errors.password = 'Password must be at least 8 characters.';
		}
		if (mode === 'signup' && passwordConfirm !== password) {
			errors.passwordConfirm = 'Passwords do not match.';
		}
		fieldErrors = errors;
		return Object.keys(errors).length === 0;
	}

	function extractError(err: unknown): string {
		// The PocketBase SDK collapses client-side OAuth2 failures (missing
		// provider, realtime disconnects, popup errors) into a generic
		// "Something went wrong." — the real reason survives on originalError.
		console.error(err);
		const e = err as {
			message?: string;
			originalError?: { message?: string };
			response?: { data?: Record<string, { message?: string } | undefined> };
		};
		const parts: string[] = [];
		const primary = e?.originalError?.message || e?.message;
		if (primary) parts.push(primary);
		const data = e?.response?.data;
		if (data) {
			for (const [field, detail] of Object.entries(data)) {
				if (detail?.message) parts.push(`${field}: ${detail.message}`);
			}
		}
		return parts.join(' ') || 'Something went wrong. Please try again.';
	}

	async function submit() {
		serverError = '';
		if (!validate()) return;
		loading = true;
		try {
			if (mode === 'signup') {
				await pb.collection('users').create({
					name: name.trim(),
					email: email.trim(),
					password,
					passwordConfirm,
					emailVisibility: false
				});
			}
			await pb.collection('users').authWithPassword(email.trim(), password);
			goto('/', { replaceState: true });
		} catch (err) {
			serverError = extractError(err);
		} finally {
			loading = false;
		}
	}

	async function loginWithGoogle() {
		if (busy) return;
		serverError = '';
		oauthLoading = 'google';
		try {
			await pb.collection('users').authWithOAuth2({ provider: 'google' });
			goto('/', { replaceState: true });
		} catch (err) {
			oauthLoading = null;
			serverError = extractError(err);
			return;
		}
		oauthLoading = null;
	}
</script>

<svelte:head>
	<title>PoopBook — Login</title>
</svelte:head>

<div class="flex min-h-dvh flex-col items-center justify-center bg-butter-100 px-4 py-8">
	<div class="w-full max-w-sm space-y-6">
		<div class="text-center">
			<div class="animate-bounce text-7xl select-none" aria-hidden="true">💩</div>
			<h1 class="mt-3 text-3xl font-extrabold text-brown-900">PoopBook</h1>
			<p class="mt-1 text-sm text-brown-500">Track it. Map it. Brag about it.</p>
		</div>

		<div class="card space-y-4">
			<div class="flex rounded-xl bg-butter-200 p-1" role="group" aria-label="Login or sign up">
				<button
					type="button"
					aria-pressed={mode === 'login'}
					class="flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors
						{mode === 'login' ? 'bg-brown-600 text-butter-200 shadow-sm' : 'text-brown-600'}"
					disabled={busy}
					onclick={() => switchMode('login')}
				>
					Login
				</button>
				<button
					type="button"
					aria-pressed={mode === 'signup'}
					class="flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors
						{mode === 'signup' ? 'bg-brown-600 text-butter-200 shadow-sm' : 'text-brown-600'}"
					disabled={busy}
					onclick={() => switchMode('signup')}
				>
					Sign up
				</button>
			</div>

			<form
				class="space-y-4"
				novalidate
				onsubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				{#if mode === 'signup'}
					<div>
						<label class="mb-1 block text-sm font-semibold text-brown-800" for="name">Name</label>
						<input
							id="name"
							type="text"
							class="input-field"
							placeholder="Poopy McPoopface"
							autocomplete="name"
							required
							aria-invalid={fieldErrors.name ? 'true' : undefined}
							bind:value={name}
						/>
						{#if fieldErrors.name}
							<p class="mt-1 text-xs font-semibold text-brown-700">{fieldErrors.name}</p>
						{/if}
					</div>
				{/if}

				<div>
					<label class="mb-1 block text-sm font-semibold text-brown-800" for="email">Email</label>
					<input
						id="email"
						type="email"
						inputmode="email"
						class="input-field"
						placeholder="you@example.com"
						autocomplete="email"
						required
						aria-invalid={fieldErrors.email ? 'true' : undefined}
						bind:value={email}
					/>
					{#if fieldErrors.email}
						<p class="mt-1 text-xs font-semibold text-brown-700">{fieldErrors.email}</p>
					{/if}
				</div>

				<div>
					<label class="mb-1 block text-sm font-semibold text-brown-800" for="password">
						Password
					</label>
					<input
						id="password"
						type="password"
						class="input-field"
						placeholder="At least 8 characters"
						autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
						required
						aria-invalid={fieldErrors.password ? 'true' : undefined}
						bind:value={password}
					/>
					{#if fieldErrors.password}
						<p class="mt-1 text-xs font-semibold text-brown-700">{fieldErrors.password}</p>
					{/if}
				</div>

				{#if mode === 'signup'}
					<div>
						<label class="mb-1 block text-sm font-semibold text-brown-800" for="password-confirm">
							Confirm password
						</label>
						<input
							id="password-confirm"
							type="password"
							class="input-field"
							placeholder="Same as above"
							autocomplete="new-password"
							required
							aria-invalid={fieldErrors.passwordConfirm ? 'true' : undefined}
							bind:value={passwordConfirm}
						/>
						{#if fieldErrors.passwordConfirm}
							<p class="mt-1 text-xs font-semibold text-brown-700">
								{fieldErrors.passwordConfirm}
							</p>
						{/if}
					</div>
				{/if}

				{#if serverError}
					<p
						class="rounded-xl bg-butter-200 px-3 py-2 text-sm font-medium text-brown-800"
						role="alert"
					>
						{serverError}
					</p>
				{/if}

				<button type="submit" class="btn-primary w-full" disabled={busy}>
					{#if mode === 'login'}
						{loading ? 'Signing in…' : 'Sign in'}
					{:else}
						{loading ? 'Creating account…' : 'Create account'}
					{/if}
				</button>
			</form>

			<div class="flex items-center gap-3" aria-hidden="true">
				<div class="h-px flex-1 bg-brown-100"></div>
				<span class="text-xs font-semibold tracking-wide text-brown-400 uppercase">or</span>
				<div class="h-px flex-1 bg-brown-100"></div>
			</div>

			<div class="space-y-2">
				<button
					type="button"
					class="btn-secondary w-full"
					disabled={busy}
					onclick={loginWithGoogle}
				>
					<svg viewBox="0 0 18 18" class="size-4 shrink-0" aria-hidden="true">
						<path
							fill="#4285F4"
							d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z"
						/>
						<path
							fill="#34A853"
							d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18Z"
						/>
						<path
							fill="#FBBC05"
							d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33Z"
						/>
						<path
							fill="#EA4335"
							d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
						/>
					</svg>
					{oauthLoading === 'google' ? 'Connecting…' : 'Continue with Google'}
				</button>
			</div>
		</div>

		<p class="text-center text-sm text-brown-500">
			{mode === 'login' ? 'New here?' : 'Already a member?'}
			<button
				type="button"
				class="font-semibold text-brown-700 underline underline-offset-2"
				onclick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
			>
				{mode === 'login' ? 'Create an account' : 'Sign in instead'}
			</button>
		</p>
	</div>
</div>
