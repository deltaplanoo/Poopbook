<script lang="ts">
	import { onMount } from 'svelte';
	import { pb } from '$lib/pb';
	import { auth } from '$lib/auth.svelte';
	import { installPrompt } from '$lib/installPrompt.svelte';
	import { fmtDateTime, poopEmojis, haversineDistanceKm, parseDate } from '$lib/utils';
	import type { Poop } from '$lib/types';

	type GeoStatus = 'locating' | 'ok' | 'error' | 'unsupported';
	type PlaceSuggestion = { place: string; distanceKm: number };

	// Set the first time a log is saved from this browser, so we only ever
	// offer the install prompt once, right after that first success.
	const HAS_LOGGED_FIRST_POOP_KEY = 'poopbook:hasLoggedFirstPoop';

	/** Build a datetime-local value (YYYY-MM-DDTHH:mm) in the user's local timezone. */
	function toLocalInput(d: Date): string {
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}
	function nowLocalInput(): string {
		return toLocalInput(new Date());
	}

	// Form state
	let when = $state(nowLocalInput());
	let place = $state('');
	let note = $state('');
	let rating = $state(3);
	let hoverRating = $state(0);
	let saving = $state(false);
	let saveError = $state('');
	let showSuccess = $state(false);
	let successTimer: ReturnType<typeof setTimeout> | undefined;

	// "Where" auto-suggest, based on this user's own past logs only.
	let placeHistory = $state<Poop[]>([]);
	let showPlaceSuggestions = $state(false);
	let placeSuggestions = $derived.by((): PlaceSuggestion[] => {
		if (latitude === null || longitude === null || placeHistory.length === 0) return [];
		const best = new Map<string, PlaceSuggestion>();
		for (const p of placeHistory) {
			const distanceKm = haversineDistanceKm(latitude, longitude, p.latitude, p.longitude);
			const key = p.place.trim().toLowerCase();
			const existing = best.get(key);
			if (!existing || distanceKm < existing.distanceKm) {
				best.set(key, { place: p.place, distanceKm });
			}
		}
		return [...best.values()].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 2);
	});

	// Geolocation state — entries can still be saved without a fix.
	let geoStatus = $state<GeoStatus>('locating');
	let geoMessage = $state('');
	let latitude = $state<number | null>(null);
	let longitude = $state<number | null>(null);

	// Recent drops
	let recent = $state<Poop[]>([]);
	let recentLoading = $state(true);
	let recentError = $state('');
	let listError = $state('');

	// Editing an existing drop (only one at a time).
	let editingId = $state<string | null>(null);
	let editWhen = $state('');
	let editPlace = $state('');
	let editNote = $state('');
	let editRating = $state(3);
	let editHoverRating = $state(0);
	let editSaving = $state(false);
	let editError = $state('');
	let deletingId = $state<string | null>(null);

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

	// Only ever fetches *this* user's own logs — kept private, never used for
	// anyone else's suggestions.
	async function loadPlaceHistory() {
		try {
			const items = await pb.collection('poops').getFullList<Poop>({
				filter: pb.filter('user = {:id} && place != ""', { id: auth.user!.id })
			});
			placeHistory = items.filter((p) => p.latitude !== 0 || p.longitude !== 0);
		} catch {
			// Suggestions are a nice-to-have — fail silently, the input still works.
		}
	}

	function pickSuggestion(s: PlaceSuggestion) {
		place = s.place;
		showPlaceSuggestions = false;
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
			await Promise.all([loadRecent(), loadPlaceHistory()]);

			const isFirstLog = !localStorage.getItem(HAS_LOGGED_FIRST_POOP_KEY);
			localStorage.setItem(HAS_LOGGED_FIRST_POOP_KEY, 'true');
			if (isFirstLog) {
				installPrompt.prompt();
			}
		} catch (err) {
			saveError = err instanceof Error && err.message ? err.message : 'Could not save. Try again.';
		} finally {
			saving = false;
		}
	}

	function startEdit(p: Poop) {
		editingId = p.id;
		editWhen = toLocalInput(parseDate(p.timestamp));
		editPlace = p.place;
		editNote = p.note;
		editRating = p.rating;
		editHoverRating = 0;
		editError = '';
	}

	function cancelEdit() {
		editingId = null;
		editError = '';
	}

	async function saveEdit(id: string) {
		if (editSaving) return;
		editSaving = true;
		editError = '';
		try {
			const updated = await pb.collection('poops').update<Poop>(id, {
				timestamp: new Date(editWhen).toISOString(),
				place: editPlace,
				note: editNote,
				rating: editRating
			});
			recent = recent.map((r) => (r.id === id ? updated : r));
			editingId = null;
			await loadPlaceHistory();
		} catch (err) {
			editError = err instanceof Error && err.message ? err.message : 'Could not save. Try again.';
		} finally {
			editSaving = false;
		}
	}

	async function deletePoop(p: Poop) {
		if (deletingId) return;
		if (!confirm(`Delete this drop from ${fmtDateTime(p.timestamp)}?`)) return;
		listError = '';
		deletingId = p.id;
		try {
			await pb.collection('poops').delete(p.id);
			recent = recent.filter((r) => r.id !== p.id);
			if (editingId === p.id) editingId = null;
		} catch {
			listError = 'Could not delete that drop. Try again.';
		} finally {
			deletingId = null;
		}
	}

	onMount(() => {
		locate();
		loadRecent();
		loadPlaceHistory();
		return () => {
			stopLocating();
			clearTimeout(successTimer);
		};
	});
</script>

{#snippet ratingPicker(
	value: number,
	hovered: number,
	onHover: (r: number) => void,
	onSelect: (r: number) => void
)}
	<div class="flex items-center gap-1.5" role="group" aria-label="Rating">
		{#each [1, 2, 3, 4, 5] as r (r)}
			<button
				type="button"
				class="flex h-11 w-11 items-center justify-center rounded-xl text-3xl transition-transform
					{r <= (hovered || value) ? 'scale-105 bg-butter-200 ring-2 ring-brown-500' : 'opacity-40 grayscale'}"
				aria-pressed={value === r}
				aria-label="Rate {r} of 5"
				onmouseenter={() => onHover(r)}
				onmouseleave={() => onHover(0)}
				onfocus={() => onHover(r)}
				onblur={() => onHover(0)}
				onclick={() => onSelect(r)}
			>
				💩
			</button>
		{/each}
	</div>
{/snippet}

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

		<div class="relative">
			<label for="place" class="mb-1 block text-sm font-semibold text-brown-800">Where</label>
			<input
				id="place"
				type="text"
				class="input-field"
				placeholder="Home throne, office 2nd floor…"
				autocomplete="off"
				bind:value={place}
				onfocus={() => (showPlaceSuggestions = true)}
				onblur={() => (showPlaceSuggestions = false)}
			/>
			{#if showPlaceSuggestions && placeSuggestions.length > 0}
				<ul
					class="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-brown-100 bg-white shadow-md"
				>
					{#each placeSuggestions as s (s.place)}
						<li>
							<button
								type="button"
								class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-brown-800 active:bg-butter-100"
								onmousedown={(e) => e.preventDefault()}
								onclick={() => pickSuggestion(s)}
							>
								<span class="truncate">📍 {s.place}</span>
								<span class="shrink-0 text-xs text-brown-400">
									{s.distanceKm < 1
										? `${Math.round(s.distanceKm * 1000)} m`
										: `${s.distanceKm.toFixed(1)} km`}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div>
			<span class="mb-1 block text-sm font-semibold text-brown-800">Rating</span>
			{@render ratingPicker(rating, hoverRating, (r) => (hoverRating = r), (r) => (rating = r))}
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
		{#if listError}
			<p class="rounded-xl bg-butter-200 px-3 py-2 text-sm font-medium text-brown-800" role="alert">
				{listError}
			</p>
		{/if}
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
						<li class="py-3 first:pt-0 last:pb-0">
							{#if editingId === p.id}
								<div class="space-y-3">
									<div>
										<label
											for="edit-when-{p.id}"
											class="mb-1 block text-xs font-semibold text-brown-800">When</label
										>
										<input
											id="edit-when-{p.id}"
											type="datetime-local"
											class="input-field"
											bind:value={editWhen}
											required
										/>
									</div>
									<div>
										<label
											for="edit-place-{p.id}"
											class="mb-1 block text-xs font-semibold text-brown-800">Where</label
										>
										<input
											id="edit-place-{p.id}"
											type="text"
											class="input-field"
											bind:value={editPlace}
										/>
									</div>
									<div>
										<span class="mb-1 block text-xs font-semibold text-brown-800">Rating</span>
										{@render ratingPicker(
											editRating,
											editHoverRating,
											(r) => (editHoverRating = r),
											(r) => (editRating = r)
										)}
									</div>
									<div>
										<label
											for="edit-note-{p.id}"
											class="mb-1 block text-xs font-semibold text-brown-800">Notes</label
										>
										<textarea
											id="edit-note-{p.id}"
											class="input-field"
											rows="2"
											bind:value={editNote}
										></textarea>
									</div>
									{#if editError}
										<p
											class="rounded-xl bg-butter-200 px-3 py-2 text-sm font-medium text-brown-800"
											role="alert"
										>
											{editError}
										</p>
									{/if}
									<div class="flex gap-2">
										<button
											type="button"
											class="btn-primary flex-1"
											disabled={editSaving}
											onclick={() => saveEdit(p.id)}
										>
											{editSaving ? 'Saving…' : 'Save'}
										</button>
										<button
											type="button"
											class="btn-secondary flex-1"
											disabled={editSaving}
											onclick={cancelEdit}
										>
											Cancel
										</button>
									</div>
								</div>
							{:else}
								<div class="space-y-0.5">
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
									<div class="flex justify-end gap-1 pt-1">
										<button
											type="button"
											class="rounded-lg px-2 py-1 text-xs font-semibold text-brown-600 active:bg-butter-200"
											onclick={() => startEdit(p)}
										>
											✏️ Edit
										</button>
										<button
											type="button"
											class="rounded-lg px-2 py-1 text-xs font-semibold text-brown-600 active:bg-butter-200"
											disabled={deletingId === p.id}
											onclick={() => deletePoop(p)}
										>
											{deletingId === p.id ? 'Deleting…' : '🗑️ Delete'}
										</button>
									</div>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>
</div>
