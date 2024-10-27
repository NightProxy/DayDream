class Keys {
    constructor(tabs, functions) {
        this.keys = [];
        this.tabs = tabs;
        this.functions = functions;
    }

    init() {
        window.addEventListener('keydown', event => {
            if (event.altKey && event.key === 't') {
                this.tabs.createTab("daydream://newtab");
            } else if (event.ctrlKey && event.key === 't') {
                event.preventDefault();
                this.tabs.createTab("daydream://newtab");
            } else if (event.altKey && event.key === 'w') {
                this.tabs.closeCurrentTab();

            } else if (event.altKey && event.key === 'ArrowLeft') {
                const activeIframe = document.querySelector('.page.active');
                if (activeIframe) {
                    activeIframe.contentWindow.history.back();
                }
                // Go Next
            } else if (event.altKey && event.key === 'ArrowRight') {
                const activeIframe = document.querySelector('.page.active');
                if (activeIframe) {
                    activeIframe.contentWindow.history.forward();
                }
                // Reload page
            } else if (event.altKey && event.key === 'r') {
                const activeIframe = document.querySelector('.page.active');
                if (activeIframe) {
                    activeIframe.contentWindow.location.reload();
                }
            } else if (event.altKey && event.keyCode === 116) {
                const activeIframe = document.querySelector('.page.active');
                if (activeIframe) {
                    activeIframe.contentWindow.location.reload();
                }
            } else if (event.ctrlKey && event.shiftKey && event.key === 'i') {
                const activeIframe = document.querySelector('.page.active');
                if (activeIframe) {
                    this.functions.inspectElement();
                }
            } else if (event.altKey && event.metaKey && event.key === 'i') {
                const activeIframe = document.querySelector('.page.active');
                if (activeIframe) {
                    this.functions.inspectElement();
                }
            } else if (event.altKey && event.shiftKey && event.key === 'i') {
                const activeIframe = document.querySelector('.page.active');
                if (activeIframe) {
                    this.functions.inspectElement();
                }
                // Open Settings
            } else if (event.altKey && event.shiftKey && event.key === 'S') {
                const activeIframe = document.querySelector('.page.active');
                if (activeIframe) {
                    navigate(activeIframe, 'daydream://settings');
                }
                // Toggle Sidebar
            } else if (event.altKey && event.key === 's') {
                const sidebar = document.querySelector('.navbar');
                const browser = document.querySelector('.surface');
                const bar = document.querySelector('.tabs-bottom-bar');
                const container = document.querySelector(".iframe-container");
                const isDisabled = sidebar.classList.toggle('autohide');

                if (isDisabled) {
                    browser.classList.add('autohide');
                    bar.classList.add('autohide');
                    container.classList.add('autohide')
                } else {
                    browser.classList.remove('autohide');
                    bar.classList.remove('autohide');
                    container.classList.remove('autohide')

                }

                // Save the current state to localStorage
                localStorage.setItem('sidebarAutohide', isDisabled);
            }
        });
    }
}