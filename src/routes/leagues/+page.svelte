<script lang="ts">
	import { onMount } from 'svelte';
	import { pb } from '$lib/pb';
	import { auth } from '$lib/auth.svelte';
	import { displayName, userColor } from '$lib/utils';
	import type { League, Poop, UserRecord } from '$lib/types';

	const myId = auth.user!.id;

	interface LeaderboardRow {
		userId: string;
		name: string;
		total: number;
		avg: number | null;
	}

	// --- My leagues ---
	let myLeagues = $state<League[]>([]);
	let loadingLeagues = $state(true);
	let leaguesError = $state('');

	// --- Accordion + leaderboards ---
	let openLeagueId = $state<string | null>(null);
	let leaderboards = $state<Record<string, LeaderboardRow[]>>({});
	let crunchingId = $state<string | null>(null);
	let leaderboardError = $state('');
	let actionBusyId = $state<string | null>(null);
	let actionError = $state('');

	// --- Create ---
	let newName = $state('');
	let creating = $state(false);
	let createError = $state('');

	// --- Search / join ---
	let searchQuery = $state('');
	let searchResults = $state<League[]>([]);
	let searching = $state(false);
	let searched = $state(false);
	let hiddenMatches = $state(0);
	let searchError = $state('');
	let joiningId = $state<string | null>(null);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	let searchToken = 0;

	/** Unique member ids of a league (the owner counts even if not in members). */
	function memberIds(league: League): string[] {
		return [...new Set([...(league.members ?? []), league.owner])];
	}

	function rankLabel(i: number): string {
		return ['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`;
	}

	async function loadMyLeagues(): Promise<void> {
		leaguesError = '';
		try {
			myLeagues = await pb.collection('leagues').getFullList<League>({
				filter: pb.filter('members.id ?= {:id} || owner = {:id}', { id: myId }),
				expand: 'members,owner',
				sort: 'name'
			});
		} catch {
			leaguesError = "Couldn't load your leagues. Pull yourself together and reload.";
		} finally {
			loadingLeagues = false;
		}
	}

	function toggleLeague(league: League): void {
		actionError = '';
		leaderboardError = '';
		if (openLeagueId === league.id) {
			openLeagueId = null;
			return;
		}
		openLeagueId = league.id;
		if (!leaderboards[league.id]) {
			void loadLeaderboard(league);
		}
	}

	async function loadLeaderboard(league: League): Promise<void> {
		crunchingId = league.id;
		leaderboardError = '';
		try {
			const ids = memberIds(league);
			const users = new Map<string, UserRecord>();
			for (const m of league.expand?.members ?? []) users.set(m.id, m);
			if (league.expand?.owner) users.set(league.expand.owner.id, league.expand.owner);

			const filter = ids.map((id) => pb.filter('user = {:id}', { id })).join(' || ');
			const poops = ids.length
				? await pb.collection('poops').getFullList<Poop>({ filter, sort: '-timestamp' })
				: [];

			const stats = new Map<string, { total: number; ratingSum: number; rated: number }>(
				ids.map((id) => [id, { total: 0, ratingSum: 0, rated: 0 }])
			);
			for (const p of poops) {
				const s = stats.get(p.user);
				if (!s) continue;
				s.total += 1;
				// PocketBase numbers default to 0 when unset — only count real ratings (1..5).
				if (p.rating >= 1) {
					s.ratingSum += p.rating;
					s.rated += 1;
				}
			}

			const rows: LeaderboardRow[] = ids.map((id) => {
				const s = stats.get(id)!;
				return {
					userId: id,
					name: displayName(users.get(id)),
					total: s.total,
					avg: s.rated > 0 ? s.ratingSum / s.rated : null
				};
			});
			rows.sort(
				(a, b) =>
					b.total - a.total || (b.avg ?? -1) - (a.avg ?? -1) || a.name.localeCompare(b.name)
			);
			leaderboards[league.id] = rows;
		} catch {
			leaderboardError = "Couldn't crunch the numbers. Tap the league to retry.";
		} finally {
			if (crunchingId === league.id) crunchingId = null;
		}
	}

	async function createLeague(): Promise<void> {
		const name = newName.trim();
		if (!name) {
			createError = 'Give your league a name first! ✍️';
			return;
		}
		creating = true;
		createError = '';
		try {
			await pb.collection('leagues').create({ name, owner: myId, members: [myId] });
			newName = '';
			await loadMyLeagues();
		} catch {
			createError = "Couldn't create the league. Try again.";
		} finally {
			creating = false;
		}
	}

	function onSearchInput(): void {
		if (searchTimer) clearTimeout(searchTimer);
		searchToken += 1; // invalidate any in-flight search
		const q = searchQuery.trim();
		searchError = '';
		if (!q) {
			searchResults = [];
			searched = false;
			searching = false;
			return;
		}
		searching = true;
		searchTimer = setTimeout(() => void runSearch(q), 300);
	}

	async function runSearch(q: string): Promise<void> {
		const token = ++searchToken;
		try {
			const results = await pb.collection('leagues').getFullList<League>({
				filter: pb.filter('name ~ {:q}', { q }),
				sort: 'name'
			});
			if (token !== searchToken) return;
			searchResults = results.filter(
				(l) => l.owner !== myId && !(l.members ?? []).includes(myId)
			);
			hiddenMatches = results.length - searchResults.length;
			searched = true;
		} catch {
			if (token !== searchToken) return;
			searchError = "Search hit a clog. Try again.";
		} finally {
			if (token === searchToken) searching = false;
		}
	}

	async function joinLeague(league: League): Promise<void> {
		joiningId = league.id;
		searchError = '';
		try {
			await pb.collection('leagues').update(league.id, { 'members+': myId });
			delete leaderboards[league.id]; // membership changed → stale
			searchResults = searchResults.filter((l) => l.id !== league.id);
			await loadMyLeagues();
		} catch {
			searchError = "Couldn't join that league. Try again.";
		} finally {
			joiningId = null;
		}
	}

	async function deleteLeague(league: League): Promise<void> {
		if (!confirm(`Delete "${league.name}" for everyone? This cannot be undone.`)) return;
		actionBusyId = league.id;
		actionError = '';
		try {
			await pb.collection('leagues').delete(league.id);
			if (openLeagueId === league.id) openLeagueId = null;
			delete leaderboards[league.id];
			await loadMyLeagues();
		} catch {
			actionError = "Couldn't delete the league. Try again.";
		} finally {
			actionBusyId = null;
		}
	}

	async function leaveLeague(league: League): Promise<void> {
		actionBusyId = league.id;
		actionError = '';
		try {
			await pb.collection('leagues').update(league.id, { 'members-': myId });
			if (openLeagueId === league.id) openLeagueId = null;
			delete leaderboards[league.id];
			await loadMyLeagues();
		} catch {
			actionError = "Couldn't leave the league. Try again.";
		} finally {
			actionBusyId = null;
		}
	}

	onMount(() => {
		void loadMyLeagues();
		return () => {
			if (searchTimer) clearTimeout(searchTimer);
		};
	});
</script>

<div class="space-y-6">
	<!-- MY LEAGUES -->
	<section class="space-y-3">
		<h2 class="section-title">My leagues</h2>

		{#if loadingLeagues}
			<div class="card py-6 text-center text-sm text-brown-500">Loading leagues… 💩</div>
		{:else if leaguesError}
			<p class="rounded-xl bg-butter-200 px-3 py-2 text-sm font-medium text-brown-800" role="alert">
				{leaguesError}
			</p>
		{:else if myLeagues.length === 0}
			<div class="card py-8 text-center">
				<p class="text-5xl">🏜️</p>
				<p class="mt-3 text-sm text-brown-500">
					No leagues yet — create one below or search for your friends' league!
				</p>
			</div>
		{:else}
			{#each myLeagues as league (league.id)}
				{@const isOpen = openLeagueId === league.id}
				{@const count = memberIds(league).length}
				<div class="card">
					<button
						type="button"
						class="flex min-h-11 w-full items-center justify-between gap-3 text-left"
						aria-expanded={isOpen}
						onclick={() => toggleLeague(league)}
					>
						<div class="min-w-0">
							<p class="truncate font-bold text-brown-900">{league.name}</p>
							<p class="text-sm text-brown-500">
								{count}
								{count === 1 ? 'member' : 'members'} · owned by
								{league.owner === myId ? 'you' : displayName(league.expand?.owner)}
							</p>
						</div>
						<span
							class="shrink-0 text-lg text-brown-400 transition-transform duration-200 {isOpen
								? 'rotate-180'
								: ''}"
							aria-hidden="true"
						>
							▾
						</span>
					</button>

					{#if isOpen}
						{@const rows = leaderboards[league.id]}
						<div class="mt-3 border-t border-brown-100 pt-3">
							{#if crunchingId === league.id}
								<p class="py-3 text-center text-sm text-brown-500">Crunching numbers… 🧮</p>
							{:else if leaderboardError}
								<p
									class="rounded-xl bg-butter-200 px-3 py-2 text-sm font-medium text-brown-800"
									role="alert"
								>
									{leaderboardError}
								</p>
							{:else if rows}
								<ol class="space-y-1">
									{#each rows as row, i (row.userId)}
										<li
											class="flex items-center gap-2 px-2 py-2 {row.userId === myId
												? 'rounded-xl bg-butter-200'
												: ''}"
										>
											<span class="w-7 shrink-0 text-center text-sm">{rankLabel(i)}</span>
											<span
												class="h-2.5 w-2.5 shrink-0 rounded-full"
												style="background-color: {userColor(row.userId)}"
												aria-hidden="true"
											></span>
											<span class="min-w-0 flex-1 truncate text-sm font-medium text-brown-800">
												{row.name}
											</span>
											<span class="shrink-0 text-right">
												<span class="block font-bold text-brown-900">
													{row.total}
													{row.total === 1 ? 'log' : 'logs'}
												</span>
												<span class="block text-xs text-brown-500">
													★ avg {row.avg !== null ? row.avg.toFixed(1) : '—'} 💩
												</span>
											</span>
										</li>
									{/each}
								</ol>
							{/if}

							{#if actionError}
								<p
									class="mt-3 rounded-xl bg-butter-200 px-3 py-2 text-sm font-medium text-brown-800"
									role="alert"
								>
									{actionError}
								</p>
							{/if}

							<div class="mt-3 border-t border-brown-100 pt-2">
								{#if league.owner === myId}
									<button
										type="button"
										class="w-full rounded-xl py-2.5 text-center text-sm font-semibold text-brown-500 active:bg-butter-100"
										onclick={() => deleteLeague(league)}
										disabled={actionBusyId === league.id}
									>
										{actionBusyId === league.id ? 'Deleting…' : 'Delete league 🗑️'}
									</button>
								{:else}
									<button
										type="button"
										class="w-full rounded-xl py-2.5 text-center text-sm font-semibold text-brown-500 active:bg-butter-100"
										onclick={() => leaveLeague(league)}
										disabled={actionBusyId === league.id}
									>
										{actionBusyId === league.id ? 'Leaving…' : 'Leave league 👋'}
									</button>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</section>

	<!-- CREATE -->
	<section class="space-y-3">
		<h2 class="section-title">Create a league</h2>
		<form
			class="card space-y-3"
			onsubmit={(e) => {
				e.preventDefault();
				void createLeague();
			}}
		>
			<input
				type="text"
				class="input-field"
				placeholder="League name"
				aria-label="League name"
				bind:value={newName}
				disabled={creating}
			/>
			{#if createError}
				<p class="rounded-xl bg-butter-200 px-3 py-2 text-sm font-medium text-brown-800" role="alert">
					{createError}
				</p>
			{/if}
			<button type="submit" class="btn-primary w-full" disabled={creating}>
				{creating ? 'Creating…' : 'Create 🏆'}
			</button>
		</form>
	</section>

	<!-- JOIN -->
	<section class="space-y-3">
		<h2 class="section-title">Find a league</h2>
		<div class="card space-y-3">
			<input
				type="search"
				class="input-field"
				placeholder="Search by name…"
				aria-label="Search leagues by name"
				bind:value={searchQuery}
				oninput={onSearchInput}
			/>

			{#if searching}
				<p class="py-2 text-center text-sm text-brown-500">Searching… 🔍</p>
			{:else if searchError}
				<p class="rounded-xl bg-butter-200 px-3 py-2 text-sm font-medium text-brown-800" role="alert">
					{searchError}
				</p>
			{:else if searched && searchResults.length === 0}
				<p class="py-3 text-center text-sm text-brown-500">
					{hiddenMatches > 0
						? "You're already in every league that matches. 😎"
						: 'No leagues found — start your own! 👑'}
				</p>
			{:else}
				{#each searchResults as league (league.id)}
					{@const count = memberIds(league).length}
					<div
						class="flex items-center justify-between gap-3 border-t border-brown-100 pt-3 first:border-t-0 first:pt-0"
					>
						<div class="min-w-0">
							<p class="truncate font-bold text-brown-900">{league.name}</p>
							<p class="text-sm text-brown-500">
								{count}
								{count === 1 ? 'member' : 'members'}
							</p>
						</div>
						<button
							type="button"
							class="btn-secondary shrink-0"
							onclick={() => joinLeague(league)}
							disabled={joiningId !== null}
						>
							{joiningId === league.id ? 'Joining…' : 'Join'}
						</button>
					</div>
				{/each}
			{/if}
		</div>
	</section>
</div>
