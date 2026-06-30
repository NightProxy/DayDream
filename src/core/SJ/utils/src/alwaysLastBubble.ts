// @ts-nocheck
import type { ScramjetClient } from "@mercuryworkshop/scramjet";

export function setupAlwaysLastBubble(
	client: ScramjetClient,
	whatToCapture: string[]
) {

	type EvtDesc = {
		originalcb: ((e: Event) => void) | EventListenerObject;
		injectafter?: (e: Event) => void;
		type: string;
	};
	let currentlyExecutingDesc: EvtDesc | null = null;
	const eventListeners: Map<EventTarget, EvtDesc[]> = new Map();

	client.Proxy("EventTarget.prototype.addEventListener", {
		apply(ctx) {
			const eventName = ctx.args[0] as string;
			const cb = ctx.args[1] as ((e: Event) => void) | EventListenerObject;
			const options = ctx.args[2] as AddEventListenerOptions;
			const target = ctx.this as EventTarget;
			if (!whatToCapture.includes(eventName)) return;
			if (
				(typeof options === "boolean" && options) ||
				(typeof options === "object" && options.capture)
			)
				return;

			ctx.args[1] = function (...args: any) {
				const descs = eventListeners.get(target)!;
				const desc = descs.find((d) => d.originalcb === cb)!;

				currentlyExecutingDesc = desc;
				if (typeof cb === "function") {
					Reflect.apply(cb, this, args);
				} else if (typeof cb === "object" && cb !== null && cb.handleEvent) {
					Reflect.apply(cb.handleEvent, cb, args);
				}

				if (desc.injectafter) {
					desc.injectafter(args[0]);
					delete desc.injectafter;
				}
				currentlyExecutingDesc = null;
			};

			const desc: EvtDesc = {
				originalcb: cb,
				type: eventName,
			};

			if (eventListeners.has(target)) {
				eventListeners.get(target)!.push(desc);
			} else {
				eventListeners.set(target, [desc]);
			}
		},
	});

	return function addAlwaysLastEventListener<T extends Event>(
		target: EventTarget,
		eventName: string,
		listener: (e: T) => void
	) {
		// TODO fix those cases

		const callListener = (e: T) => {
			// TODO: we probably shouldnt do it like this
			e.stopPropagation =
				client.natives.store["Event.prototype.stopPropagation"];
			e.stopImmediatePropagation =
				client.natives.store["Event.prototype.stopImmediatePropagation"];
			listener(e);
		};

		client.natives.call(
			"EventTarget.prototype.addEventListener",
			target,
			eventName,
			(e: T) => {
				let lastlistener;
				const path = e.composedPath();

				for (const elm of path) {
					let descriptors = eventListeners.get(elm);
					if (descriptors) {
						descriptors = descriptors.filter((d) => d.type === eventName);
						lastlistener = descriptors[descriptors.length - 1];
					}
				}

				// TODO: if a listener is added to a lower level of the dom inside the listener of a higher level, our lastlistener will not be correct
				if (!lastlistener) {
					callListener(e);
				} else {
					lastlistener.injectafter = (e) => {
						callListener(e);
					};
				}

				client.RawProxy(e, "stopImmediatePropagation", {
					apply() {
						if (!currentlyExecutingDesc)
							throw new Error(
								"stopImmediatePropagation called but no desc found?"
							);
						currentlyExecutingDesc.injectafter = (e) => {
							callListener(e as T);
						};
					},
				});
				client.RawProxy(e, "stopPropagation", {
					apply(ctx) {
						if (!currentlyExecutingDesc)
							throw new Error("stopPropagation called but no desc found?");

						const ev = ctx.this as Event;
						if (!ev.target) throw new Error("no target");
						const descs = eventListeners.get(ev.target);
						if (!descs) throw new Error("no descs found in stopPropagation()");
						const idx = descs.indexOf(currentlyExecutingDesc);
						if (idx == -1)
							throw new Error("couldn't find currentlyExecutingDesc");
						const remaining = descs.slice(idx + 1, descs.length);
						if (remaining.length > 0) {
							const last = remaining[remaining.length - 1];
							last.injectafter = (e) => {
								callListener(e as T);
							};
						}
					},
				});
			}
		);
	};
}

export type AddAlwaysLastEventListener = ReturnType<
	typeof setupAlwaysLastBubble
>;