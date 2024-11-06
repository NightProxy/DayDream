class ProfilesAPI {
    constructor() {
        this.PROFILE_STORE_NAME = 'profiles';
        this.DATA_STORE_NAME = 'data';
        this.localForage = localforage;
        this.Cookies = Cookies;
    }

    async createProfile(profileName) {
        const profile = {
            name: profileName,
            cookies: '',
            LS: '',
            IDB: '',
            date: new Date().toISOString(),
        };
        await this.localForage.setItem(`${this.PROFILE_STORE_NAME}:${profileName}`, profile);
        return profile;
    }

    async getProfile(profileName) {
        return await this.localForage.getItem(`${this.PROFILE_STORE_NAME}:${profileName}`);
    }

    async getAllProfiles() {
        const profiles = await this.localForage.keys(`${this.PROFILE_STORE_NAME}:*`);
        return Promise.all(profiles.map((profileName) => this.getProfile(profileName)));
    }

    async setActiveProfile(profileName) {
        await this.saveCurrentProfileData();

        const newProfile = await this.getProfile(profileName);

        await this.clearAllData();

        await this._rewriteData(newProfile);
    }

    async saveCurrentProfileData() {
        const activeProfile = await this.getActiveProfile();
        if (activeProfile) {
            activeProfile.LS = btoa(JSON.stringify(localStorage));

            const idbData = {};
            await Promise.all((await this.localForage.keys(`${this.DATA_STORE_NAME}:*`)).map(async (key) => {
                idbData[key] = await this.localForage.getItem(key);
            }));
            activeProfile.IDB = btoa(JSON.stringify(idbData));

            activeProfile.cookies = btoa(JSON.stringify(this.Cookies.get()));

            await this.localForage.setItem(`${this.PROFILE_STORE_NAME}:${activeProfile.name}`, activeProfile);
        }
    }

    async clearAllData() {
        localStorage.clear();
        await this.localForage.clear(`${this.DATA_STORE_NAME}:*`);
        this.Cookies.remove();
    }

    async _rewriteData(profile) {
        const lsData = JSON.parse(atob(profile.LS));
        Object.keys(lsData).forEach((key) => {
            localStorage.setItem(key, lsData[key]);
        });

        const idbData = JSON.parse(atob(profile.IDB));
        Object.keys(idbData).forEach((key) => {
            this.localForage.setItem(key, idbData[key]);
        });

        const cookiesData = JSON.parse(atob(profile.cookies));
        Object.keys(cookiesData).forEach((key) => {
            this.Cookies.set(key, cookiesData[key]);
        });
    }

    async getActiveProfile() {
        const activeProfileName = await this.localForage.getItem('activeProfile');
        return this.getProfile(activeProfileName);
    }
}