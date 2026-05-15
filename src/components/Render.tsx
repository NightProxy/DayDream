import { useEffect } from 'react';
import {
	ArrowLeft,
	ArrowRight,
	FolderHeart,
	History,
	House,
	Joystick,
	Lock,
	MessageSquare,
	Plus,
	Puzzle,
	RotateCw,
	Settings,
	Sparkles,
	Users,
	Star,
	Menu,
	EyeOff,
	Maximize,
	Bookmark,
	Dices,
	SquareMousePointer,
	PanelLeft,
	Brain,
	Music
} from 'lucide-react';
import { resolvePath } from '@utils/basepath';

interface RenderProps {
	onReady?: () => void;
}

export function Render({ onReady }: RenderProps) {
	useEffect(() => {
		onReady?.();
	}, [onReady]);
	return (
		<>
			<div className="flex h-full">
				<aside
					className="w-12 bg-[var(--bg-1)] border-r border-[var(--white-05)] flex flex-col h-screen flex-none p-2 list-none"
					data-component="navbar"
				>
					<div
						className="flex flex-col gap-2"
						data-component="navbar-top"
					>
						<li>
							<a
								href="/"
								className="relative flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text)]/90 hover:bg-[var(--white-05)]"
								data-tooltip="DaydreamX Home"
								data-side="right"
								data-align="center"
							>
								<i className="text-[var(--main)] text-[10px] font-semibold tracking-wide">
									<div className="stack h-6 w-6">
										<div
											className="masked-shape"
											style={{
												width: '100%',
												height: '100%',
												background: 'var(--main)',
												maskImage: `url(${resolvePath('res/logo/overlay.png')})`,
												maskRepeat: 'no-repeat',
												maskPosition: 'center center',
												maskSize: 'cover',
												maskMode: 'luminance'
											}}
										>
											<img
												className="overlay"
												src={resolvePath(
													'res/logo/overlay.png'
												)}
												alt="overlay gradient"
												style={{
													width: '100%',
													height: '100%',
													mixBlendMode: 'multiply',
													pointerEvents: 'none'
												}}
											/>
										</div>
									</div>
								</i>
							</a>
						</li>
						<div
							className="hidden"
							data-component="navbar-top-portal"
						></div>
						<div
							className="hidden"
							data-component="navbar-tab-portal"
						></div>
					</div>
					<div className="hidden" data-component="navbar-tab-space">
						<div
							className="hidden"
							data-component="navbar-tab-header"
						></div>
					</div>
					<div
						className="flex flex-col flex-1 justify-center gap-2"
						id="extensions-sidebar"
						data-component="navbar-middle"
					>
						<li className="self-center">
							<button
								className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]"
								data-tooltip="Bookmarks"
								data-side="right"
								data-align="center"
								onClick={async () => {
									await window.tabs.createTab(
										'ddx://bookmarks/'
									);
								}}
							>
								<FolderHeart className="h-4 w-4" />
							</button>
						</li>
						<li className="self-center">
							<button
								className="relative flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]"
								data-tooltip="History"
								data-side="right"
								data-align="center"
								onClick={async () => {
									await window.tabs.createTab(
										'ddx://history/'
									);
								}}
							>
								<History className="h-4 w-4" />
							</button>
						</li>
						<li className="self-center">
							<button
								className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]"
								data-tooltip="Extensions"
								data-side="right"
								data-align="center"
								onClick={async () => {
									await window.tabs.createTab(
										'ddx://extensions/'
									);
								}}
							>
								<Puzzle className="h-4 w-4" />
							</button>
						</li>
						<li className="self-center">
							<button
								className="relative flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]"
								data-tooltip="Games"
								data-side="right"
								data-align="center"
								onClick={async () => {
									await window.tabs.createTab('ddx://games/');
								}}
							>
								<Joystick className="h-4 w-4" />
							</button>
						</li>
						<li className="self-center">
							<button
								className="relative flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]"
								data-tooltip="AI"
								data-side="right"
								data-align="center"
								onClick={async () => {
									await window.tabs.createTab('ddx://ai/');
								}}
							>
								<Brain className="h-4 w-4" />
							</button>
						</li>
						<li className="self-center">
							<button
								className="relative flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]"
								data-tooltip="Music"
								data-side="right"
								data-align="center"
								onClick={async () => {
									await window.tabs.createTab('ddx://music/');
								}}
							>
								<Music className="h-4 w-4" />
							</button>
						</li>
					</div>
					<div
						className="flex flex-col gap-2"
						data-component="navbar-bottom"
					>
						<li className="self-center">
							<button
								className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]"
								data-tooltip="What's New"
								data-side="right"
								data-align="center"
								onClick={async () => {
									await window.tabs.createTab(
										'ddx://updates/'
									);
								}}
							>
								<Sparkles className="h-4 w-4" />
							</button>
						</li>
						<li className="self-center">
							<button
								className="relative flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]"
								data-tooltip="Discord"
								data-side="right"
								data-align="center"
								onClick={async () => {
									await window.tabs.createTab(
										'https://discord.night-x.com/'
									);
								}}
							>
								<MessageSquare className="h-4 w-4" />
							</button>
						</li>
						<li className="self-center">
							<button
								className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]"
								data-tooltip="Settings"
								data-side="right"
								data-align="center"
								onClick={async () => {
									await window.tabs.createTab(
										'ddx://settings/'
									);
								}}
							>
								<Settings className="h-4 w-4" />
							</button>
						</li>
					</div>
				</aside>
				<div className="flex flex-col h-full  min-w-0 flex-1">
					<div className="w-full border-b border-[var(--white-05)] bg-[var(--bg-2)] relative overflow-visible">
						<div
							className="flex h-12 items-center gap-1"
							data-component="top-bar"
						>
							<div className="flex items-center gap-1 rounded-xl bg-[var(--bg-2)] p-1 ring-1 ml-2 ring-inset ring-[var(--main-35a)] cursor-pointer">
								<div data-component="top-bar-profiles-slot">
									<div
										data-vertical-move="profiles"
										data-vertical-target="navbar-top-portal"
										data-vertical-home="top-bar-profiles-slot"
									>
										<button
											data-component="profiles"
											className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--main-20a)] cursor-pointer"
											aria-label="Profiles"
										>
											<span className="text-xs font-semibold tracking-wide text-[var(--main)]">
												<Users className="h-4 w-4" />
											</span>
										</button>
									</div>
								</div>
							</div>
							<div
								data-component="top-bar-tab-bar-slot"
								className="flex flex-1 min-w-0"
							>
								<div
									data-component="tab-bar-container"
									data-vertical-move="tab-bar"
									data-vertical-target="navbar-tab-space"
									data-vertical-home="top-bar-tab-bar-slot"
									className="flex items-center flex-1 overflow-x-hidden"
								>
									<div
										data-component="tab-bar"
										className="flex items-center gap-2 flex-1"
									></div>
								</div>
							</div>
							<div className="flex items-center gap-1 rounded-xl bg-[var(--bg-2)] p-1 ring-1 ring-[var(--white-10)] mr-2">
								<div data-component="top-bar-new-tab-slot">
									<div
										data-vertical-move="new-tab"
										data-vertical-target="navbar-tab-header"
										data-vertical-home="top-bar-new-tab-slot"
									>
										<button
											data-component="new-tab"
											className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]"
											aria-label="Open new tab"
										>
											<Plus className="h-4 w-4" />
										</button>
									</div>
								</div>
							</div>
						</div>
					</div>
					<div className="w-full border-b border-[var(--white-05)] bg-[var(--bg-1)] relative overflow-visible">
						<div
							className="flex h-12 items-center gap-2 px-2"
							data-component="utility-bar"
						>
							<div className="flex items-center gap-1 rounded-xl bg-[var(--bg-2)] p-1 ring-1 ring-[var(--white-10)]">
								<button
									className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]"
									aria-label="Vertical Tabs"
									data-component="vertical-tabs"
								>
									<PanelLeft className="h-4 w-4" />
								</button>
								<button
									className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]"
									aria-label="Back"
									data-component="back"
								>
									<ArrowLeft className="h-4 w-4" />
								</button>
								<button
									className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]"
									aria-label="Reload"
									data-component="reload"
								>
									<RotateCw className="h-4 w-4" />
								</button>
								<button
									className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]"
									aria-label="Forward"
									data-component="forward"
								>
									<ArrowRight className="h-4 w-4" />
								</button>
								<button
									className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]"
									aria-label="Home"
									data-component="home"
									onClick={() => {
										window.protocols.navigate('home');
									}}
								>
									<House className="h-4 w-4" />
								</button>
							</div>
							<div className="relative w-full flex-1 urlbar-ring">
								<div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1">
									<Lock className="h-4 w-4 text-[var(--success)]" />
								</div>
								<input
									type="text"
									data-component="address-bar"
									className="w-full rounded-xl bg-[var(--bg-2)] pl-[2.5rem] py-2 text-sm text-[var(--text)] ring-1 ring-inset ring-[var(--main-35a)] outline-none placeholder:text-[var(--text)]/40 focus:ring-2 focus:ring-[var(--main)] shadow-[0_0_0_1px_var(--shadow-outer),inset_0_0_0_1px_var(--shadow-inner)]"
									placeholder="Search or enter website name"
								/>
							</div>
							<button
								className="absolute right-[3.5rem] inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]"
								aria-label="Bookmark current page"
								data-component="bookmark"
							>
								<Star className="h-4 w-4" />
							</button>
							<div className="flex items-center gap-1 rounded-xl bg-[var(--bg-2)] p-1 ring-1 ring-[var(--white-10)] z-[10000000]">
								<div className="relative">
									<button
										id="menu-btn"
										className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text)]/80 hover:bg-[var(--white-05)]"
										aria-label="Open menu"
										data-component="menu"
									>
										<Menu className="h-4 w-4" />
									</button>
									<div
										id="menu-popup"
										className="absolute right-0 mt-2 w-40 rounded-md bg-[var(--bg-2)] shadow-lg border border-[var(--white-10)] opacity-0 scale-95 pointer-events-none transition-all duration-150 tooltip"
										data-component="menu-content"
									>
										<ul className="py-1 text-sm text-[var(--text)]">
											<li
												className="px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center"
												onClick={async () => {
													await window.tabs.createTab(
														'ddx://newtab/'
													);
												}}
											>
												<Plus className="h-4 w-4" />
												<span>New Tab</span>
											</li>
											<li
												className="px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center"
												onClick={() => {
													window.windowing.newWindow();
												}}
											>
												<Joystick className="h-4 w-4" />
												<span>New Window</span>
											</li>
											<li
												className="px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center"
												onClick={() => {
													window.windowing.aboutBlankWindow();
												}}
											>
												<EyeOff className="h-4 w-4" />
												<span>A:B Window</span>
											</li>
											<li
												className="px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center"
												onClick={() => {
													window.functions.goFullscreen();
												}}
											>
												<Maximize className="h-4 w-4" />
												<span>Fullscreen</span>
											</li>
											<li
												className="px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center"
												onClick={() => {
													window.tabs.createTab(
														'ddx://bookmarks'
													);
												}}
											>
												<Bookmark className="h-4 w-4" />
												<span>Bookmarks</span>
											</li>
											<li
												className="px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center"
												onClick={() => {
													window.tabs.createTab(
														'ddx://history'
													);
												}}
											>
												<History className="h-4 w-4" />
												<span>History</span>
											</li>
											<li
												className="px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center"
												onClick={() => {
													window.tabs.createTab(
														'ddx://games'
													);
												}}
											>
												<Dices className="h-4 w-4" />
												<span>Games</span>
											</li>
											<li
												className="px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center"
												onClick={() => {
													window.tabs.createTab(
														'ddx://extensions'
													);
												}}
											>
												<Puzzle className="h-4 w-4" />
												<span>Extensions</span>
											</li>
											<li
												className="px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center"
												onClick={async () => {
													const settings =
														window.settings;
													const devtoolsPreference =
														(await settings.getItem(
															'devtools'
														)) || 'eruda';
													if (
														devtoolsPreference ===
														'eruda'
													) {
														await window.functions.inspectElement();
													} else {
														window.functions.toggleChiiInspect();
													}
												}}
											>
												<SquareMousePointer className="h-4 w-4" />
												<span>Devtools</span>
											</li>
											<li
												className="px-4 py-2 hover:bg-[var(--white-10)] cursor-pointer flex gap-1 items-center"
												onClick={() => {
													window.tabs.createTab(
														'ddx://settings/'
													);
												}}
											>
												<Settings className="h-4 w-4" />
												<span>Settings</span>
											</li>
										</ul>
									</div>
								</div>
							</div>
						</div>
					</div>
					<div
						className="flex-1 min-h-0 w-full bg-[var(--bg-2)]"
						data-component="frame-container"
						style={{
							border: 'none',
							outline: 'none',
							willChange: 'filter, transform, opacity'
						}}
					></div>
					<div
						aria-hidden="true"
						className="h-full w-full bg-[var(--bg-2)]"
						style={{
							position: 'absolute',
							inset: '0px',
							background: 'var(--bg-2)',
							mixBlendMode: 'lighten',
							pointerEvents: 'none'
						}}
					></div>
				</div>
			</div>
		</>
	);
}
