import type { UserRecord } from './types';

/**
 * Deterministic per-user color, used to color-code map markers and
 * leaderboard entries. Hue is derived from the record id; saturation and
 * lightness are fixed so every color stays legible on butter backgrounds.
 */
export function userColor(id: string): string {
	let h = 0;
	for (let i = 0; i < id.length; i++) {
		h = (h * 31 + id.charCodeAt(i)) % 360;
	}
	return `hsl(${h}, 55%, 40%)`;
}

export function displayName(u: UserRecord | null | undefined): string {
	if (!u) return 'Unknown';
	return u.name || u.email?.split('@')[0] || `User ${u.id.slice(0, 5)}`;
}

/**
 * PocketBase returns datetimes as "YYYY-MM-DD HH:mm:ss.SSSZ" — Safari's Date
 * parser rejects the space-separated form, so normalize it to ISO 8601.
 */
export function parseDate(iso: string): Date {
	return new Date(iso.includes(' ') ? iso.replace(' ', 'T') : iso);
}

export function fmtDateTime(iso: string): string {
	const d = parseDate(iso);
	return d.toLocaleString(undefined, {
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit'
	});
}

export function fmtDate(iso: string): string {
	const d = parseDate(iso);
	return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function poopEmojis(rating: number): string {
	return '💩'.repeat(Math.max(0, Math.min(5, Math.round(rating))));
}
