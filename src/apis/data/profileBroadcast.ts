export type ProfileBroadcastMessage =
	| { type: 'active-changed'; id: string | null; source: string }
	| { type: 'profile-created'; id: string; source: string }
	| { type: 'profile-destroyed'; id: string; source: string }
	| { type: 'profile-updated'; id: string; source: string };

export type ProfileBroadcastListener = (
	message: ProfileBroadcastMessage
) => void;

const CHANNEL_NAME = 'daydream-profiles';

let sourceId: string | undefined;
function getSourceId(): string {
	if (sourceId) return sourceId;
	try {
		sourceId = `${Date.now().toString(36)}-${Math.random()
			.toString(36)
			.slice(2, 10)}`;
	} catch {
		sourceId = 'anon';
	}
	return sourceId;
}

export class ProfileBroadcast {
	private readonly channel: BroadcastChannel | null;
	private readonly listeners = new Set<ProfileBroadcastListener>();

	constructor(channel: BroadcastChannel | null = createChannel()) {
		this.channel = channel;
		if (this.channel) {
			this.channel.addEventListener('message', event => {
				const data = event.data as ProfileBroadcastMessage | undefined;
				if (!data || typeof data !== 'object') return;
				if (data.source === getSourceId()) return;
				for (const listener of this.listeners) {
					try {
						listener(data);
					} catch (error) {
						console.error(
							'[profileBroadcast] listener threw',
							error
						);
					}
				}
			});
		}
	}

	publish(message: Omit<ProfileBroadcastMessage, 'source'>): void {
		const payload = { ...message, source: getSourceId() } as ProfileBroadcastMessage;
		if (this.channel) {
			try {
				this.channel.postMessage(payload);
			} catch (error) {
				console.warn('[profileBroadcast] postMessage failed', error);
			}
		}
	}

	subscribe(listener: ProfileBroadcastListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	close(): void {
		this.listeners.clear();
		this.channel?.close();
	}
}

function createChannel(): BroadcastChannel | null {
	try {
		if (typeof BroadcastChannel === 'undefined') return null;
		return new BroadcastChannel(CHANNEL_NAME);
	} catch {
		return null;
	}
}

let shared: ProfileBroadcast | undefined;
export function getProfileBroadcast(): ProfileBroadcast {
	shared ??= new ProfileBroadcast();
	return shared;
}
