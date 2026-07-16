<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import { auth } from '$lib/auth.svelte';
	import { displayName } from '$lib/utils';
	import type { UserRecord } from '$lib/types';

	let { children } = $props();

	const tabs = [
		{ href: '/', label: 'Log', icon: '💩' },
		{ href: '/map', label: 'Map', icon: '🗺️' },
		{ href: '/leagues', label: 'Leagues', icon: '🏆' },
		{ href: '/analysis', label: 'Stats', icon: '📊' }
	];

	const webManifestLink = $derived(pwaInfo ? pwaInfo.webManifest.linkTag : '');
	const isLoginPage = $derived(page.url.pathname === '/login');
	const title = $derived.by(() => {
		const tab = tabs.find((t) => t.href === page.url.pathname);
		return tab && tab.href !== '/' ? `PoopBook — ${tab.label}` : 'PoopBook';
	});

	// Auth guard: unauthenticated users can only see /login.
	$effect(() => {
		if (!auth.isLoggedIn && !isLoginPage) {
			goto('/login', { replaceState: true });
		} else if (auth.isLoggedIn && isLoginPage) {
			goto('/', { replaceState: true });
		}
	});

	onMount(async () => {
		if ('serviceWorker' in navigator) {
			const { registerSW } = await import('virtual:pwa-register');
			registerSW({ immediate: true });
		}
	});
</script>

<svelte:head>
	{#if !isLoginPage}
		<title>{title}</title>
	{/if}
	<link rel="icon" href={favicon} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html webManifestLink}
</svelte:head>

{#if isLoginPage}
	{@render children()}
{:else if auth.isLoggedIn}
	<div class="flex min-h-dvh flex-col">
		<header
			class="sticky top-0 z-40 bg-brown-600 pt-[env(safe-area-inset-top)] text-butter-200 shadow-md"
		>
			<div class="mx-auto flex h-14 w-full max-w-lg items-center justify-between px-4">
				<h1 class="text-lg font-bold tracking-tight">💩 PoopBook</h1>
				<div class="flex items-center gap-3">
					<span class="max-w-32 truncate text-sm text-butter-300">
						{displayName(auth.user as UserRecord)}
					</span>
					<button
						class="min-h-9 rounded-lg bg-brown-700 px-3 py-2 text-xs font-semibold text-butter-200 active:bg-brown-800"
						onclick={() => auth.logout()}
					>
						Logout
					</button>
				</div>
			</div>
		</header>

		<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-28">
			{@render children()}
		</main>

		<nav
			class="fixed inset-x-0 bottom-0 z-40 border-t border-brown-700 bg-brown-600 pb-[env(safe-area-inset-bottom)]"
		>
			<div class="mx-auto flex w-full max-w-lg items-stretch justify-around">
				{#each tabs as tab (tab.href)}
					{@const active = page.url.pathname === tab.href}
					<a
						href={tab.href}
						class="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-semibold transition-colors
							{active ? 'text-butter-300' : 'text-butter-200/85'}"
						aria-current={active ? 'page' : undefined}
					>
						<span class="text-xl leading-none {active ? '' : 'grayscale-75 opacity-80'}">
							{tab.icon}
						</span>
						{tab.label}
						<span class="h-0.5 w-8 rounded-full {active ? 'bg-butter-300' : 'bg-transparent'}"
						></span>
					</a>
				{/each}
			</div>
		</nav>
	</div>
{:else}
	<!-- Splash while the auth guard redirects to /login -->
	<div class="flex min-h-dvh items-center justify-center bg-butter-100">
		<span class="animate-bounce text-6xl">💩</span>
	</div>
{/if}
