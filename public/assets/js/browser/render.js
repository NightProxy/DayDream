class Render {
  constructor(container) {
    this.container = container;
    this.container.innerHTML = `
        <div class="surface">
            <div class="mock-browser">
                <div class="tabs" style="--tab-content-margin: 9px">
                        <div class="tabs-content" id="tab-groups"></div>
                        <div class="browser-button" id="create-tab"><span class="material-symbols-outlined">add</span></div>
                </div>
                <div class="under-tabs">
                <div class="tabs-bottom-bar"></div>

			<ul class="utility">
      <li>
					<div class="utilityIcon" id="home">
						<span class="material-symbols-outlined"
							>home</span
						>
					</div>
				</li>
				<li>
					<div class="utilityIcon" id="backward">
						<span class="material-symbols-outlined backButton"
							>arrow_back</span
						>
					</div>
				</li>
				<li>
					<div class="utilityIcon" id="reload">
						<span class="material-symbols-outlined refreshButton"
							>refresh</span
						>
					</div>
				</li>
				<li>
					<div class="utilityIcon"id="forward">
						<span class="material-symbols-outlined forwardButton"
							>arrow_forward</span
						>
					</div>
				</li>
				<div
					class="search-header"
					style="flex-grow: 1; margin-left: 8px; margin-right: 8px"
				>
					<input
						placeholder="Enter search or web address"
						class="search-header__input"
						id="uv-address"
						type="text"
						autocomplete="off"
					/>
					<div class="webSecurityIcon"></div>
					<button
						aria-label="search"
						style="
							user-select: none;
							cursor: default;
							position: absolute;
							margin-left: 7px;
							margin-bottom: -2px;
						"
						type="submit"
						class="search-header__button"
					>
						<svg
							fill="none"
							viewBox="0 0 18 18"
							height="18"
							width="18"
							class="search-header__icon"
						>
							<path
								fill="#3A3A3A"
								d="M7.132 0C3.197 0 0 3.124 0 6.97c0 3.844 3.197 6.969 7.132 6.969 1.557 0 2.995-.49 4.169-1.32L16.82 18 18 16.847l-5.454-5.342a6.846 6.846 0 0 0 1.718-4.536C14.264 3.124 11.067 0 7.132 0zm0 .82c3.48 0 6.293 2.748 6.293 6.15 0 3.4-2.813 6.149-6.293 6.149S.839 10.37.839 6.969C.839 3.568 3.651.82 7.132.82z"
							></path>
						</svg>
					</button>
				</div>
        <div class="right">
				<li>
					<div class="utilityIcon" id="bookmark">
						<span class="material-symbols-outlined bookmarkButton"
							>star</span
						>
					</div>
				</li>
        <li>
					<div class="utilityIcon" id="inspect">
						<span class="material-symbols-outlined erudaButton"
							>code</span
						>
					</div>
				</li>
				<li>
					<div class="utilityIcon" id="more-options">
						<span class="material-symbols-outlined erudaButton"
							>more_horiz</span
						>
					</div>
				</li>
        </div>
			</ul>
                </div>
            </div>
            <div class="viewport">		
            <div class="iframe-container" id="iframe-container"></div>
            </div>
        </div>
		<ul class="navbar">
		<img class="logo" src="/assets/imgs/logo.png" />
		<br>
			<li>
				<a href="/~"
					><span
						style="margin-top: 0"
						class="material-symbols-outlined"
						>tune</span
					></a
				>
			</li>
			<li>
				<a target="_blank" href="https://discord.night-x.com">
					<div
						style="
							height: 40px !important;
							width: 40px !important;
							margin-top: 10px;
							margin-bottom: -6px;
						"
					>
						<i
							class="fa-brands fa-discord"
							style="transform: translateY(-6px)"
						></i>
					</div>
				</a>
			</li>
		</ul>
        `;
  }
}
