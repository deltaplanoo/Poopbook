<script lang="ts">
	import { onMount } from 'svelte';
	import { pb } from '$lib/pb';
	import { auth } from '$lib/auth.svelte';
	import { parseDate } from '$lib/utils';
	import type { Poop } from '$lib/types';
	import {
		Chart,
		LineController,
		BarController,
		CategoryScale,
		LinearScale,
		PointElement,
		LineElement,
		BarElement,
		Tooltip,
		Filler
	} from 'chart.js';
	import type { Plugin } from 'chart.js';

	Chart.register(
		LineController,
		BarController,
		CategoryScale,
		LinearScale,
		PointElement,
		LineElement,
		BarElement,
		Tooltip,
		Filler
	);
	Chart.defaults.font.family = 'system-ui, -apple-system, sans-serif';
	Chart.defaults.color = '#86675a';

	// Design-system chart tokens
	const BROWN = '#6a5248';
	const INK = '#362a26';
	const GRID = '#ece4e0';
	const AXIS = '#d9c9c2';
	const TICK = '#86675a';

	const tooltipStyle = {
		backgroundColor: '#362a26',
		titleColor: '#f8edc5',
		bodyColor: '#fbf5e0',
		cornerRadius: 8,
		displayColors: false
	};

	// ——— data ———
	let poops = $state<Poop[]>([]);
	let loading = $state(true);
	let error = $state('');

	onMount(async () => {
		try {
			poops = await pb.collection('poops').getFullList<Poop>({
				filter: pb.filter('user = {:id}', { id: auth.user!.id }),
				sort: '-timestamp'
			});
		} catch {
			error = 'Could not load your stats. Check your connection and try again.';
		} finally {
			loading = false;
		}
	});

	// ——— date helpers ———

	/** Local midnight of the Monday starting the week that contains `d`. */
	function startOfWeek(d: Date): Date {
		const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
		out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
		return out;
	}

	function dayKey(d: Date): string {
		return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
	}

	function truncate(s: string, max = 18): string {
		return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
	}

	// ——— KPIs ———
	const total = $derived(poops.length);

	const thisWeek = $derived.by(() => {
		const monday = startOfWeek(new Date()).getTime();
		return poops.filter((p) => parseDate(p.timestamp).getTime() >= monday).length;
	});

	const avgRating = $derived.by(() => {
		const rated = poops.filter((p) => p.rating >= 1 && p.rating <= 5);
		if (rated.length === 0) return null;
		return rated.reduce((sum, p) => sum + p.rating, 0) / rated.length;
	});

	const streak = $derived.by(() => {
		const days = new Set(poops.map((p) => dayKey(parseDate(p.timestamp))));
		const cursor = new Date();
		// No log today doesn't break the streak yet — it may start from yesterday.
		if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
		let n = 0;
		while (days.has(dayKey(cursor))) {
			n++;
			cursor.setDate(cursor.getDate() - 1);
		}
		return n;
	});

	// ——— chart datasets ———
	const weekly = $derived.by(() => {
		const current = startOfWeek(new Date());
		const starts: Date[] = [];
		for (let i = 11; i >= 0; i--) {
			const d = new Date(current);
			d.setDate(d.getDate() - i * 7);
			starts.push(d);
		}
		const index = new Map(starts.map((d, i) => [d.getTime(), i]));
		const counts = new Array<number>(12).fill(0);
		for (const p of poops) {
			const i = index.get(startOfWeek(parseDate(p.timestamp)).getTime());
			if (i !== undefined) counts[i]++;
		}
		return {
			labels: starts.map((d) =>
				d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
			),
			counts
		};
	});

	const topPlaces = $derived.by(() => {
		const groups = new Map<string, { count: number; variants: Map<string, number> }>();
		for (const p of poops) {
			const raw = p.place.trim();
			const key = raw.toLowerCase(); // '' groups all placeless drops together
			const variant = raw === '' ? 'Unknown 🕳️' : raw;
			let g = groups.get(key);
			if (!g) {
				g = { count: 0, variants: new Map() };
				groups.set(key, g);
			}
			g.count++;
			g.variants.set(variant, (g.variants.get(variant) ?? 0) + 1);
		}
		return [...groups.values()]
			.sort((a, b) => b.count - a.count)
			.slice(0, 7)
			.map((g) => {
				// Label the row with the most common original casing.
				const label = [...g.variants.entries()].sort((a, b) => b[1] - a[1])[0][0];
				return { label: truncate(label), count: g.count };
			});
	});

	const ratingCounts = $derived.by(() => {
		const counts = [0, 0, 0, 0, 0];
		for (const p of poops) {
			const r = Math.round(p.rating);
			if (r >= 1 && r <= 5) counts[r - 1]++;
		}
		return counts;
	});

	// ——— value labels plugin (bar charts only) ———
	// The light steps of the rating ramp sit low-contrast on white, so every
	// bar carries its value directly.
	const valueLabels: Plugin<'bar'> = {
		id: 'valueLabels',
		afterDatasetsDraw(chart) {
			const { ctx } = chart;
			const horizontal = chart.options.indexAxis === 'y';
			ctx.save();
			ctx.font = '600 11px system-ui, -apple-system, sans-serif';
			ctx.fillStyle = INK;
			chart.data.datasets.forEach((dataset, di) => {
				const meta = chart.getDatasetMeta(di);
				meta.data.forEach((bar, i) => {
					const value = dataset.data[i];
					if (typeof value !== 'number' || value === 0) return;
					if (horizontal) {
						ctx.textAlign = 'left';
						ctx.textBaseline = 'middle';
						ctx.fillText(String(value), bar.x + 6, bar.y);
					} else {
						ctx.textAlign = 'center';
						ctx.textBaseline = 'bottom';
						ctx.fillText(String(value), bar.x, bar.y - 4);
					}
				});
			});
			ctx.restore();
		}
	};

	// ——— chart lifecycle ———
	let weeklyCanvas = $state<HTMLCanvasElement | null>(null);
	let placesCanvas = $state<HTMLCanvasElement | null>(null);
	let ratingCanvas = $state<HTMLCanvasElement | null>(null);

	let charts: Chart[] = [];

	$effect(() => {
		if (loading || poops.length === 0) return;
		if (!weeklyCanvas || !placesCanvas || !ratingCanvas) return;
		if (charts.length > 0) return; // never double-create

		charts = [
			new Chart(weeklyCanvas, {
				type: 'line',
				data: {
					labels: weekly.labels,
					datasets: [
						{
							data: weekly.counts,
							borderColor: BROWN,
							borderWidth: 2,
							pointRadius: 3,
							pointHoverRadius: 6,
							pointBackgroundColor: BROWN,
							fill: true,
							backgroundColor: 'rgba(245, 229, 170, 0.45)',
							tension: 0.3
						}
					]
				},
				options: {
					maintainAspectRatio: false,
					plugins: { tooltip: tooltipStyle },
					scales: {
						x: {
							grid: { display: false },
							border: { color: AXIS },
							ticks: { color: TICK, maxRotation: 0, autoSkipPadding: 12 }
						},
						y: {
							beginAtZero: true,
							grid: { color: GRID },
							border: { color: AXIS },
							ticks: { color: TICK, precision: 0 }
						}
					}
				}
			}),

			new Chart(placesCanvas, {
				type: 'bar',
				data: {
					labels: topPlaces.map((p) => p.label),
					datasets: [
						{
							data: topPlaces.map((p) => p.count),
							backgroundColor: BROWN,
							borderRadius: 4,
							barThickness: 16
						}
					]
				},
				options: {
					indexAxis: 'y',
					maintainAspectRatio: false,
					layout: { padding: { right: 24 } },
					plugins: { tooltip: tooltipStyle },
					scales: {
						x: {
							beginAtZero: true,
							grid: { color: GRID },
							border: { color: AXIS },
							ticks: { color: TICK, precision: 0 }
						},
						y: {
							grid: { display: false },
							border: { color: AXIS },
							ticks: { color: TICK, autoSkip: false }
						}
					}
				},
				plugins: [valueLabels]
			}),

			new Chart(ratingCanvas, {
				type: 'bar',
				data: {
					labels: ['1', '2', '3', '4', '5'],
					datasets: [
						{
							data: ratingCounts,
							// Sequential brown ramp, light → dark (ordinal magnitude).
							backgroundColor: ['#c0a89d', '#a58878', '#86675a', '#6a5248', '#57443c'],
							borderRadius: 4,
							barThickness: 28
						}
					]
				},
				options: {
					maintainAspectRatio: false,
					layout: { padding: { top: 16 } },
					plugins: { tooltip: tooltipStyle },
					scales: {
						x: {
							title: {
								display: true,
								text: 'rating 💩',
								color: TICK,
								font: { size: 11, weight: 600 }
							},
							grid: { display: false },
							border: { color: AXIS },
							ticks: { color: TICK }
						},
						y: {
							beginAtZero: true,
							grid: { color: GRID },
							border: { color: AXIS },
							ticks: { color: TICK, precision: 0 }
						}
					}
				},
				plugins: [valueLabels]
			})
		];

		return () => {
			for (const c of charts) c.destroy();
			charts = [];
		};
	});
</script>

<div class="space-y-6">
	<div>
		<h2 class="text-xl font-bold text-brown-900">Your stats 📊</h2>
		<p class="text-sm text-brown-500">The numbers behind your movements.</p>
	</div>

	{#if loading}
		<div class="card py-8 text-center text-sm font-medium text-brown-500">
			Crunching the numbers… 💩
		</div>
	{:else if error}
		<p class="rounded-xl bg-butter-200 px-3 py-2 text-sm font-medium text-brown-800" role="alert">
			{error}
		</p>
	{:else if poops.length === 0}
		<div class="card flex flex-col items-center gap-3 py-10 text-center">
			<span class="text-6xl">📊</span>
			<p class="font-semibold text-brown-900">No data yet — the charts are hungry 📊💩</p>
			<p class="text-sm text-brown-500">Log your first drop and come back.</p>
		</div>
	{:else}
		<div class="grid grid-cols-2 gap-3">
			<div class="card">
				<p class="text-2xl font-extrabold text-brown-900">{total}</p>
				<p class="text-xs font-semibold tracking-wide text-brown-500 uppercase">Total drops</p>
			</div>
			<div class="card">
				<p class="text-2xl font-extrabold text-brown-900">{thisWeek}</p>
				<p class="text-xs font-semibold tracking-wide text-brown-500 uppercase">This week</p>
			</div>
			<div class="card">
				<p class="text-2xl font-extrabold text-brown-900">
					{avgRating === null ? '–' : `${avgRating.toFixed(1)} 💩`}
				</p>
				<p class="text-xs font-semibold tracking-wide text-brown-500 uppercase">Avg rating</p>
			</div>
			<div class="card">
				<p class="text-2xl font-extrabold text-brown-900">
					{streak}
					{streak === 1 ? 'day' : 'days'} 🔥
				</p>
				<p class="text-xs font-semibold tracking-wide text-brown-500 uppercase">Streak</p>
			</div>
		</div>

		<div class="card space-y-3">
			<div>
				<h3 class="text-sm font-bold text-brown-900">Logs per week</h3>
				<p class="text-xs text-brown-500">Drops per calendar week, last 12 weeks</p>
			</div>
			<div class="h-56">
				<canvas
					bind:this={weeklyCanvas}
					aria-label="Line chart: your logs per calendar week over the last 12 weeks"
				></canvas>
			</div>
		</div>

		<div class="card space-y-3">
			<div>
				<h3 class="text-sm font-bold text-brown-900">Top places</h3>
				<p class="text-xs text-brown-500">Your most-visited thrones</p>
			</div>
			<div class="h-56">
				<canvas
					bind:this={placesCanvas}
					aria-label="Bar chart: your most-logged places, with counts labeled on each bar"
				></canvas>
			</div>
		</div>

		<div class="card space-y-3">
			<div>
				<h3 class="text-sm font-bold text-brown-900">Rating distribution</h3>
				<p class="text-xs text-brown-500">How your drops rate, 1 to 5</p>
			</div>
			<div class="h-56">
				<canvas
					bind:this={ratingCanvas}
					aria-label="Bar chart: number of logs per rating from 1 to 5, with counts labeled on each bar"
				></canvas>
			</div>
		</div>
	{/if}
</div>
