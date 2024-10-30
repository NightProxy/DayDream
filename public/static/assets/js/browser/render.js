class Render {
	constructor(container, nightmare, dataApi) {
		this.container = container;
		this.nightmare = nightmare;
		this.dataApi = dataApi;
		this.HTMLcode = this.nightmare.createElement("div", { class: "surface" }, [
				this.nightmare.createElement("div", { class: "tabs", style: "--tab-content-margin: 9px" }, [
					this.nightmare.createElement("div", { class: "tabs-content", id: "tab-groups" }),
					this.nightmare.createElement("div", { class: "browser-button", id: "create-tab" }, [
						this.nightmare.createElement("span", { class: "material-symbols-outlined" }, ["add"]),
					]),
				]),
				this.nightmare.createElement("div", { class: "under-tabs" }, [
					this.nightmare.createElement("div", { class: "tabs-bottom-bar" }),
					this.nightmare.createElement("ul", { class: "utility" }, [
						this.nightmare.createElement("li", {}, [
							this.nightmare.createElement("div", { class: "utilityIcon", id: "home" }, [
								this.nightmare.createElement("span", { class: "material-symbols-outlined" }, ["home"]),
							]),
						]),
						this.nightmare.createElement("li", {}, [
							this.nightmare.createElement("div", { class: "utilityIcon", id: "backward" }, [
								this.nightmare.createElement("span", { class: "material-symbols-outlined backButton" }, ["arrow_back"]),
							]),
						]),
						this.nightmare.createElement("li", {}, [
							this.nightmare.createElement("div", { class: "utilityIcon", id: "reload" }, [
								this.nightmare.createElement("span", { class: "material-symbols-outlined refreshButton" }, ["refresh"]),
							]),
						]),
						this.nightmare.createElement("li", {}, [
							this.nightmare.createElement("div", { class: "utilityIcon", id: "forward" }, [
								this.nightmare.createElement("span", { class: "material-symbols-outlined forwardButton" }, ["arrow_forward"]),
							]),
						]),
						this.nightmare.createElement("div", { class: "search-header", style: "flex-grow: 1; margin-left: 8px; margin-right: 8px" }, [
							this.nightmare.createElement("input", {
								placeholder: "Enter search or web address",
								class: "search-header__input",
								id: "uv-address",
								type: "text",
								autocomplete: "off",
							}),
							this.nightmare.createElement("div", { class: "webSecurityIcon" }),
							this.nightmare.createElement("button", {
								"aria-label": "search",
								style: "user-select: none; cursor: default; position: absolute; margin-left: 7px; margin-bottom: -2px", type: "submit", class: "search-header__button"
							}, [
								this.nightmare.createElement("svg", { fill: "none", viewBox: "0 0 18 18", height: "18", width: "18", class: "search-header__icon" }, [
									this.nightmare.createElement("path", { fill: "#3A3A3A", d: "M7.132 0C3.197 0 0 3.124 0 6.97c0 3.844 3.197 6.969 7.132 6.969 1.557 0 2.995-.49 4.169-1.32L16.82 18 18 16.847l-5.454-5.342a6.846 6.846 0 0 0 1.718-4.536C14.264 3.124 11.067 0 7.132 0zm0 .82c3.48 0 6.293 2.748 6.293 6.15 0 3.4-2.813 6.149-6.293 6.149S.839 10.37.839 6.969C.839 3.568 3.651.82 7.132.82z" })
								])
							])
						]),
						this.nightmare.createElement("div", { class: "right" }, [
							this.nightmare.createElement("li", {}, [
								this.nightmare.createElement("div", { class: "utilityIcon", id: "bookmark" }, [
									this.nightmare.createElement("span", { class: "material-symbols-outlined bookmarkButton" }, ["star"]),
								]),
							]),
							this.nightmare.createElement("li", {}, [
								this.nightmare.createElement("div", { class: "utilityIcon", id: "inspect" }, [
									this.nightmare.createElement("span", { class: "material-symbols-outlined erudaButton" }, ["code"]),
								]),
							]),
							this.nightmare.createElement("li", {}, [
								this.nightmare.createElement("div", { class: "utilityIcon", id: "more-options" }, [
									this.nightmare.createElement("span", { class: "material-symbols-outlined erudaButton" }, ["more_horiz"]),
								]),
							]),
						]),
					]),
				]),
				this.nightmare.createElement("div", { class: "viewport" }, [
					this.nightmare.createElement("div", { class: "iframe-container", id: "iframe-container" }),
				])
		]);

		this.navbar = this.nightmare.createElement("ul", { class: "navbar" }, [
			this.nightmare.createElement("img", { class: "logo", src: "/assets/imgs/logo.png" }),
			this.nightmare.createElement("br"),
			this.nightmare.createElement("li", {}, [
				this.nightmare.createElement("a", { href: "/~" }, [
					this.nightmare.createElement("span", { style: "margin-top: 0", class: "material-symbols-outlined" }, ["tune"]),
				]),
			]),
		]);
		this.container.appendChild(this.HTMLcode);
		this.container.appendChild(this.navbar);
		const sidebar = document.querySelector('.navbar');
		const browser = document.querySelector('.surface');
		const tabs = document.querySelector('.tabs');
		const bar = document.querySelector('.under-tabs');
		const IFcontainer = document.querySelector(".viewport");

		const isDisabled = localStorage.getItem('verticalTabs') === 'true';
		if (isDisabled) {
			sidebar.classList.add('autohide');
			browser.classList.add('autohide');
			tabs.classList.add('vertical');
			bar.classList.add('vertical');
			IFcontainer.classList.add('vertical')
		}
		this.dataApi.logger.createLog("Rendered Browser");
	}
}