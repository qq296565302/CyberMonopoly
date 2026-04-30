"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateManager = void 0;
const KEY_WATCHLIST = 'cyberMonopoly.watchlist';
const KEY_NEWS_CACHE = 'cyberMonopoly.newsCache';
const KEY_SETTINGS = 'cyberMonopoly.settings';
class StateManager {
    constructor(globalState) {
        this.globalState = globalState;
    }
    getWatchlist() {
        return this.globalState.get(KEY_WATCHLIST, []);
    }
    saveWatchlist(stocks) {
        return this.globalState.update(KEY_WATCHLIST, stocks);
    }
    getNewsCache() {
        return this.globalState.get(KEY_NEWS_CACHE, []);
    }
    saveNewsCache(news) {
        return this.globalState.update(KEY_NEWS_CACHE, news);
    }
    getSetting(key, defaultValue) {
        const settings = this.globalState.get(KEY_SETTINGS, {});
        return settings[key] ?? defaultValue;
    }
    setSetting(key, value) {
        const settings = this.globalState.get(KEY_SETTINGS, {});
        settings[key] = value;
        return this.globalState.update(KEY_SETTINGS, settings);
    }
}
exports.StateManager = StateManager;
//# sourceMappingURL=stateManager.js.map