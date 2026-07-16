<script lang="ts">
	import { onMount } from 'svelte';
	import { pb } from '$lib/pb';
	import { auth } from '$lib/auth.svelte';
	import { fmtDateTime, poopEmojis } from '$lib/utils';
	import type { Poop } from '$lib/types';

	type GeoStatus = 'locating' | 'ok' | 'error' | 'unsupported';

	/** Build a datetime-local value (YYYY-MM-DDTHH:mm) in the user's local timezone. */
	function nowLocalInput(): string {
		const d = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	// Form state
	let when = $state(nowLocalInput());
	let place = $state('');
	let note = $state('');
	let rating = $state(3);
	let saving = $state(false);
	let saveError = $state('');
	let showSuccess = $state(false);
	let successTimer: ReturnType<typeof setTimeout> | undefined;

	// Geolocation state — entries can still be saved without a fix.
	let geoStatus = $state<GeoStatus>('locating');
	let geoMessage = $state('');
	let latitude = $state<number | null>(null);
	let longitude = $state<number | null>(null);

	// Recent drops
	let recent = $state<Poop[]>([]);
	let recentLoading = $state(true);
	let recentError = $state('');

	let geoWatchId: number | null = null;

	// watchPosition (instead of a one-shot fix at mount) keeps the coordinates
	// fresh if the user walks around before logging.
	function locate() {
		if (!('geolocation' in navigator)) {
			geoStatus = 'unsupported';
			return;
		}
		stopLocating();
		geoStatus = 'locating';
		geoWatchId = navigator.geolocation.watchPosition(
			(pos) => {
				latitude = pos.coords.latitude;
				longitude = pos.coords.longitude;
				geoStatus = 'ok';
			},
			(err) => {
				geoStatus = 'error';
				geoMessage =
					err.code === err.PERMISSION_DENIED
						? 'Location permission denied.'
						: 'Could not get your location.';
			},
			{ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
		);
	}

	function stopLocating() {
		if (geoWatchId !== null) {
			navigator.geolocation.clearWatch(geoWatchId);
			geoWatchId = null;
		}
	}

	async function loadRecent() {
		recentError = '';
		try {
			const res = await pb.collection('poops').getList<Poop>(1, 5, {
				filter: pb.filter('user = {:id}', { id: auth.user!.id }),
				sort: '-timestamp'
			});
			recent = res.items;
		} catch {
			recentError = 'Could not load your recent drops.';
		} finally {
			recentLoading = false;
		}
	}

	async function submit() {
		if (saving) return;
		saving = true;
		saveError = '';
		try {
			await pb.collection('poops').create({
				user: auth.user!.id,
				timestamp: new Date(when).toISOString(),
				latitude: latitude ?? 0,
				longitude: longitude ?? 0,
				note,
				place,
				rating
			});
			// Reset the form for the next drop.
			place = '';
			note = '';
			rating = 3;
			when = nowLocalInput();
			showSuccess = true;
			clearTimeout(successTimer);
			successTimer = setTimeout(() => (showSuccess = false), 2500);
			await loadRecent();
		} catch (err) {
			saveError = err instanceof Error && err.message ? err.message : 'Could not save. Try again.';
		} finally {
			saving = false;
		}
	}

	onMount(() => {
		locate();
		loadRecent();
		return () => {
			stopLocating();
			clearTimeout(successTimer);
		};
	});
</script>

<div class="space-y-6">
	<div>
		<h2 class="text-xl font-bold text-brown-900">Time to drop a log? 💩</h2>
		<p class="text-sm text-brown-500">Log it while it's fresh — your league mates are watching.</p>
	</div>

	{#if showSuccess}
		<p
			class="rounded-xl bg-butter-300 px-3 py-2 text-sm font-semibold text-brown-900"
			role="status"
		>
			Logged! 🎉
		</p>
	{/if}

	<form
		class="card space-y-4"
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		<div class="flex min-h-9 items-center justify-between gap-3 text-sm">
			{#if geoStatus === 'locating'}
				<span class="text-brown-500">📍 Locating…</span>
			{:else if geoStatus === 'ok' && latitude !== null && longitude !== null}
				<span class="text-brown-800">📍 {latitude.toFixed(5)}, {longitude.toFixed(5)}</span>
			{:else if geoStatus === 'unsupported'}
				<span class="text-brown-500">📍 Location isn't supported on this device.</span>
			{:else}
				<span class="text-brown-500">📍 {geoMessage}</span>
				<button type="button" class="btn-secondary shrink-0 px-3 text-xs" onclick={locate}>
					Retry
				</button>
			{/if}
		</div>

		<div>
			<label for="when" class="mb-1 block text-sm font-semibold text-brown-800">When</label>
			<input id="when" type="datetime-local" class="input-field" bind:value={when} required />
		</div>

		<div>
			<label for="place" class="mb-1 block text-sm font-semibold text-brown-800">Where</label>
			<input
				id="place"
				type="text"
				class="input-field"
				placeholder="Home throne, office 2nd floor…"
				bind:value={place}
			/>
		</div>

		<div>
			<span class="mb-1 block text-sm font-semibold text-brown-800">Rating</span>
			<div class="flex items-center justify-between" role="group" aria-label="Rating">
				{#each [1, 2, 3, 4, 5] as r (r)}
					<button
						type="button"
						class="flex h-12 w-12 items-center justify-center rounded-xl text-3xl transition-transform
							{rating === r ? 'scale-105 bg-butter-200 ring-2 ring-brown-500' : 'opacity-40 grayscale'}"
						aria-pressed={rating === r}
						aria-label="Rate {r} of 5"
						onclick={() => (rating = r)}
					>
						💩
					</button>
				{/each}
			</div>
		</div>

		<div>
			<label for="note" class="mb-1 block text-sm font-semibold text-brown-800">Notes</label>
			<textarea
				id="note"
				class="input-field"
				rows="2"
				placeholder="Anything worth remembering? (optional)"
				bind:value={note}
			></textarea>
		</div>

		{#if saveError}
			<p class="rounded-xl bg-butter-200 px-3 py-2 text-sm font-medium text-brown-800" role="alert">
				{saveError}
			</p>
		{/if}

		<button type="submit" class="btn-primary w-full text-lg" disabled={saving}>
			{saving ? 'Saving…' : 'Log it 💩'}
		</button>
	</form>

	<section class="space-y-2">
		<h3 class="section-title">Recent drops</h3>
		<div class="card">
			{#if recentLoading}
				<p class="text-sm text-brown-500">Loading…</p>
			{:else if recentError}
				<p class="rounded-xl bg-butter-200 px-3 py-2 text-sm font-medium text-brown-800" role="alert">
					{recentError}
				</p>
			{:else if recent.length === 0}
				<div class="flex flex-col items-center gap-2 py-6 text-center">
					<span class="text-5xl">🕳️</span>
					<p class="text-sm text-brown-500">Nothing logged yet. Today is the day. 💪</p>
				</div>
			{:else}
				<ul class="divide-y divide-brown-100">
					{#each recent as p (p.id)}
						<li class="space-y-0.5 py-3 first:pt-0 last:pb-0">
							<div class="flex items-baseline justify-between gap-3">
								<span class="text-base leading-none">{poopEmojis(p.rating)}</span>
								<span class="shrink-0 text-sm text-brown-500">{fmtDateTime(p.timestamp)}</span>
							</div>
							<p class="truncate text-sm font-semibold text-brown-800">
								{p.place || 'Somewhere mysterious'}
							</p>
							{#if p.note}
								<p class="truncate text-sm text-brown-500">{p.note}</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>
</div>
