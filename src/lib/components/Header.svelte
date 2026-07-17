<script lang="ts">
	import { auth } from '$lib/auth.svelte';
	import { installPrompt } from '$lib/installPrompt.svelte';
	import { displayName } from '$lib/utils';
	import type { UserRecord } from '$lib/types';
	import { CircleUser, LogOut } from '@lucide/svelte';

	let showIosTip = $state(false);
	let showUserMenu = $state(false);
	let menuEl = $state<HTMLDivElement | undefined>();
	let triggerEl = $state<HTMLButtonElement | undefined>();

	// Close the popover on an outside click or Escape. The listeners are
	// attached a tick after the state flips, so the same click that opens
	// the menu (via the trigger button) never immediately closes it again.
	$effect(() => {
		if (!showUserMenu) return;
		function onDocClick(e: MouseEvent) {
			const target = e.target as Node;
			if (menuEl?.contains(target) || triggerEl?.contains(target)) return;
			showUserMenu = false;
		}
		function onKeydown(e: KeyboardEvent) {
			if (e.key === 'Escape') showUserMenu = false;
		}
		document.addEventListener('click', onDocClick);
		document.addEventListener('keydown', onKeydown);
		return () => {
			document.removeEventListener('click', onDocClick);
			document.removeEventListener('keydown', onKeydown);
		};
	});

	function logout() {
		showUserMenu = false;
		auth.logout();
	}
</script>

<header
	class="sticky top-0 z-40 bg-brown-600 pt-[env(safe-area-inset-top)] text-butter-200 shadow-md"
>
	<div class="mx-auto flex h-14 w-full max-w-lg items-center px-4">
		<div class="flex flex-1 items-center gap-2">
			{#if installPrompt.canInstall}
				<button
					type="button"
					class="min-h-9 shrink-0 rounded-lg bg-butter-300 px-2.5 py-2 text-xs font-semibold text-brown-900 active:bg-butter-400"
					onclick={() => installPrompt.prompt()}
				>
					⬇️ Install
				</button>
			{:else if installPrompt.showIosHint}
				<button
					type="button"
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base active:bg-brown-700"
					aria-label="How to install PoopBook on iOS"
					aria-expanded={showIosTip}
					title="Tap Share, then “Add to Home Screen”."
					onclick={() => (showIosTip = !showIosTip)}
				>
					📲
				</button>
			{/if}
		</div>

		<h1 class="shrink-0 text-lg font-bold tracking-tight">💩 PoopBook</h1>

		<div class="relative flex flex-1 items-center justify-end">
			<button
				bind:this={triggerEl}
				type="button"
				class="flex h-9 w-9 items-center justify-center rounded-full text-butter-200 active:bg-brown-700"
				aria-label="Account menu"
				aria-haspopup="true"
				aria-expanded={showUserMenu}
				onclick={() => (showUserMenu = !showUserMenu)}
			>
				<CircleUser class="size-6" />
			</button>

			{#if showUserMenu}
				<div
					bind:this={menuEl}
					class="absolute top-full right-0 z-50 mt-2 w-48 rounded-xl border border-brown-100 bg-white p-3 text-brown-900 shadow-lg"
				>
					<p class="truncate text-sm font-semibold">
						{displayName(auth.user as UserRecord)}
					</p>
					<button
						type="button"
						class="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-brown-700 px-3 py-2 text-xs font-semibold text-butter-200 active:bg-brown-800"
						onclick={logout}
					>
						<LogOut class="size-3.5" />
						Logout
					</button>
				</div>
			{/if}
		</div>
	</div>
	{#if showIosTip}
		<div class="border-t border-brown-700 bg-brown-700 px-4 py-2 text-xs text-butter-200">
			Tap <strong>Share</strong> ⬆️, then <strong>"Add to Home Screen"</strong> to install PoopBook.
		</div>
	{/if}
</header>
