/** The non-standard `beforeinstallprompt` event Chromium browsers fire. */
interface BeforeInstallPromptEvent extends Event {
	readonly platforms: string[];
	readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
	prompt(): Promise<void>;
}

class InstallPromptState {
	private event = $state<BeforeInstallPromptEvent | null>(null);
	private installed = $state(false);

	/** True once the app is running as an installed/standalone PWA. */
	get isStandalone(): boolean {
		if (typeof window === 'undefined') return false;
		return (
			window.matchMedia('(display-mode: standalone)').matches ||
			// iOS Safari's own (non-standard) flag for "launched from home screen".
			(navigator as Navigator & { standalone?: boolean }).standalone === true
		);
	}

	private get isIos(): boolean {
		if (typeof navigator === 'undefined') return false;
		const ua = navigator.userAgent;
		return (
			/iPad|iPhone|iPod/.test(ua) ||
			// iPadOS 13+ identifies as "Macintosh" but exposes multi-touch.
			(ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
		);
	}

	/** Show the native "Install" button — we have a real deferred prompt to trigger. */
	get canInstall(): boolean {
		return !this.installed && !this.isStandalone && this.event !== null;
	}

	/** iOS/Safari never fires `beforeinstallprompt` — offer the manual instructions instead. */
	get showIosHint(): boolean {
		return !this.installed && !this.isStandalone && this.isIos;
	}

	/** Wire up the global listeners. Safe to call once from the root layout. */
	init() {
		if (typeof window === 'undefined') return;
		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			this.event = e as BeforeInstallPromptEvent;
		});
		window.addEventListener('appinstalled', () => {
			this.installed = true;
			this.event = null;
		});
	}

	/** Trigger the saved native prompt, if any. Each event can only be used once. */
	async prompt(): Promise<boolean> {
		const event = this.event;
		if (!event) return false;
		this.event = null;
		await event.prompt();
		const { outcome } = await event.userChoice;
		return outcome === 'accepted';
	}
}

export const installPrompt = new InstallPromptState();
