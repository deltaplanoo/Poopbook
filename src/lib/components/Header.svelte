<script lang="ts">
	import { auth } from '$lib/auth.svelte';
	import { installPrompt } from '$lib/installPrompt.svelte';
	import { displayName } from '$lib/utils';
	import type { UserRecord } from '$lib/types';

	let showIosTip = $state(false);
</script>

<header
	class="sticky top-0 z-40 bg-brown-600 pt-[env(safe-area-inset-top)] text-butter-200 shadow-md"
>
	<div class="mx-auto flex h-14 w-full max-w-lg items-center justify-between gap-2 px-4">
		<h1 class="shrink-0 text-lg font-bold tracking-tight">💩 PoopBook</h1>
		<div class="flex min-w-0 items-center gap-2">
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
			<span class="max-w-20 truncate text-sm text-butter-300">
				{displayName(auth.user as UserRecord)}
			</span>
			<button
				class="min-h-9 shrink-0 rounded-lg bg-brown-700 px-3 py-2 text-xs font-semibold text-butter-200 active:bg-brown-800"
				onclick={() => auth.logout()}
			>
				Logout
			</button>
		</div>
	</div>
	{#if showIosTip}
		<div class="border-t border-brown-700 bg-brown-700 px-4 py-2 text-xs text-butter-200">
			Tap <strong>Share</strong> ⬆️, then <strong>"Add to Home Screen"</strong> to install PoopBook.
		</div>
	{/if}
</header>
