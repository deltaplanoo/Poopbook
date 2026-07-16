<script lang="ts">
	import { onMount } from 'svelte';
	import L from 'leaflet';
	import 'leaflet/dist/leaflet.css';
	import { pb } from '$lib/pb';
	import { auth } from '$lib/auth.svelte';
	import { userColor, displayName, fmtDateTime, poopEmojis } from '$lib/utils';
	import type { Poop, League, UserRecord } from '$lib/types';

	const myId = auth.user!.id;

	let leagues = $state<League[]>([]);
	let leaguesError = $state('');
	let scope = $state('me'); // 'me' or a league id
	let poops = $state<Poop[]>([]);
	let loading = $state(true);
	let error = $state('');

	let mapEl = $state<HTMLDivElement>();
	let mapReady = $state(false);
	let map: L.Map | undefined;
	let markers: L.FeatureGroup | undefined;
	let loadToken = 0;

	const activeLeague = $derived(leagues.find((l) => l.id === scope) ?? null);
	const located = $derived(poops.filter((p) => !(p.latitude === 0 && p.longitude === 0)));
	const legendMembers = $derived<UserRecord[]>(activeLeague?.expand?.members ?? []);
	const countsByUser = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const p of located) {
			counts.set(p.user, (counts.get(p.user) ?? 0) + 1);
		}
		return counts;
	});

	function escapeHtml(s: string): string {
		return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
	}

	function popupHtml(p: Poop): string {
		const lines = [`<strong>${escapeHtml(displayName(p.expand?.user))}</strong>`];
		if (p.place) lines.push(escapeHtml(p.place));
		lines.push(escapeHtml(fmtDateTime(p.timestamp)));
		if (p.rating > 0) lines.push(poopEmojis(p.rating));
		if (p.note) lines.push(`<em>${escapeHtml(p.note)}</em>`);
		return lines.join('<br>');
	}

	async function loadLeagues(): Promise<void> {
		leaguesError = '';
		try {
			leagues = await pb.collection('leagues').getFullList<League>({
				filter: pb.filter('members.id ?= {:id} || owner = {:id}', { id: myId }),
				sort: 'name',
				expand: 'members'
			});
		} catch {
			// The "Just me" scope still works — say so instead of failing silently.
			leaguesError = "Couldn't load your leagues — showing just you for now.";
		}
	}

	async function loadPoops(scopeValue: string): Promise<void> {
		const token = ++loadToken;
		loading = true;
		error = '';
		try {
			let filter: string;
			if (scopeValue === 'me') {
				filter = pb.filter('user = {:id}', { id: myId });
			} else {
				const league = leagues.find((l) => l.id === scopeValue);
				const memberIds = league?.members ?? [];
				if (memberIds.length === 0) {
					if (token === loadToken) poops = [];
					return;
				}
				filter = memberIds.map((id) => pb.filter('user = {:id}', { id })).join(' || ');
			}
			const result = await pb.collection('poops').getFullList<Poop>({
				filter,
				sort: '-timestamp',
				expand: 'user'
			});
			if (token === loadToken) poops = result;
		} catch {
			if (token === loadToken) {
				poops = [];
				error = 'Could not load the drops. Try again in a moment.';
			}
		} finally {
			if (token === loadToken) loading = false;
		}
	}

	function redraw(points: Poop[]): void {
		if (!map || !markers) return;
		markers.clearLayers();
		for (const p of points) {
			L.circleMarker([p.latitude, p.longitude], {
				radius: 9,
				color: '#fdfaf0',
				weight: 2,
				fillColor: userColor(p.user),
				fillOpacity: 0.85
			})
				.bindPopup(popupHtml(p))
				.addTo(markers);
		}
		if (points.length > 0) {
			map.fitBounds(markers.getBounds(), { padding: [30, 30], maxZoom: 15 });
		} else {
			map.setView([20, 0], 2);
		}
	}

	onMount(() => {
		if (!mapEl) return;
		map = L.map(mapEl).setView([20, 0], 2);
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution:
				'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
			maxZoom: 19
		}).addTo(map);
		markers = L.featureGroup().addTo(map);
		// The container is measured after layout settles, otherwise tiles misalign.
		requestAnimationFrame(() => map?.invalidateSize());
		mapReady = true;
		void loadLeagues();

		return () => {
			map?.remove();
			map = undefined;
			markers = undefined;
		};
	});

	// Reload the data whenever the scope changes (also runs once on init).
	$effect(() => {
		void loadPoops(scope);
	});

	// Redraw markers whenever the locatable set changes.
	$effect(() => {
		if (!mapReady) return;
		redraw(located);
	});
</script>

<div class="space-y-6">
	<section class="space-y-2">
		<h2 class="section-title">Whose drops?</h2>
		<div class="card">
			<label class="sr-only" for="map-scope">Choose whose drops to show</label>
			<select id="map-scope" class="input-field" bind:value={scope}>
				<option value="me">🙋 Just me</option>
				{#each leagues as league (league.id)}
					<option value={league.id}>🏆 {league.name}</option>
				{/each}
			</select>
			{#if leaguesError}
				<p class="mt-2 text-sm text-brown-500" role="alert">{leaguesError}</p>
			{/if}
		</div>
	</section>

	{#if error}
		<p class="rounded-xl bg-butter-200 px-3 py-2 text-sm font-medium text-brown-800" role="alert">
			{error}
		</p>
	{/if}

	<section class="space-y-2">
		<h2 class="section-title">The map</h2>
		{#if loading}
			<p class="text-sm text-brown-500">Loading the evidence… 🕵️</p>
		{:else if located.length === 0 && !error}
			<p class="rounded-xl bg-butter-200 px-3 py-2 text-sm font-medium text-brown-800">
				No located drops yet — log one with GPS on!
			</p>
		{/if}
		<div
			bind:this={mapEl}
			class="z-0 h-[60dvh] min-h-80 w-full overflow-hidden rounded-2xl border border-brown-200 shadow-sm"
		></div>
		<p class="text-sm text-brown-500">
			{located.length}
			{located.length === 1 ? 'drop' : 'drops'} on the map
		</p>
	</section>

	{#if activeLeague}
		<section class="space-y-2">
			<h2 class="section-title">Legend — {activeLeague.name}</h2>
			<div class="card">
				{#if legendMembers.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each legendMembers as member (member.id)}
							<span
								class="inline-flex items-center gap-2 rounded-full border border-brown-100 bg-butter-100 px-3 py-2 text-sm text-brown-800"
							>
								<span
									class="inline-block h-3 w-3 shrink-0 rounded-full"
									style="background-color: {userColor(member.id)}"
								></span>
								<span class="max-w-36 truncate">{displayName(member)}</span>
								<span class="font-semibold text-brown-500">
									{countsByUser.get(member.id) ?? 0}
								</span>
							</span>
						{/each}
					</div>
				{:else}
					<p class="text-center text-sm text-brown-500">
						<span class="mb-1 block text-3xl">🏜️</span>
						This league has no members yet.
					</p>
				{/if}
			</div>
		</section>
	{/if}
</div>
