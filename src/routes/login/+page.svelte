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
	let serverError = $state('');
	let fieldErrors = $state<Partial<Record<'name' | 'email' | 'password' | 'passwordConfirm', string>>>(
		{}
	);

	function switchMode(next: Mode) {
		if (mode === next || loading) return;
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
		const e = err as {
			message?: string;
			response?: { data?: Record<string, { message?: string } | undefined> };
		};
		const parts: string[] = [];
		if (e?.message) parts.push(e.message);
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
					onclick={() => switchMode('login')}
				>
					Login
				</button>
				<button
					type="button"
					aria-pressed={mode === 'signup'}
					class="flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors
						{mode === 'signup' ? 'bg-brown-600 text-butter-200 shadow-sm' : 'text-brown-600'}"
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

				<button type="submit" class="btn-primary w-full" disabled={loading}>
					{#if mode === 'login'}
						{loading ? 'Signing in…' : 'Sign in'}
					{:else}
						{loading ? 'Creating account…' : 'Create account'}
					{/if}
				</button>
			</form>
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
