"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateManager = void 0;
const KEY_WATCHLIST = 'cyberMonopoly.watchlist';
const KEY_NEWS_CACHE = 'cyberMonopoly.newsCache';
const KEY_SETTINGS = 'cyberMonopoly.settings';
class StateManager {
    constructor(globalState) {
        this.globalState = globalState;
        this.dirty = false;
    }
    getWatchlist() {
        return this.globalState.get(KEY_WATCHLIST, []);
    }
    saveWatchlist(stocks) {
        this.dirty = true;
        this.pendingSave = this.globalState.update(KEY_WATCHLIST, stocks);
        this.pendingSave.then(() => { this.dirty = false; });
        return this.pendingSave;
    }
    getNewsCache() {
        return this.globalState.get(KEY_NEWS_CACHE, []);
    }
    saveNewsCache(news) {
        this.dirty = true;
        this.pendingSave = this.globalState.update(KEY_NEWS_CACHE, news);
        this.pendingSave.then(() => { this.dirty = false; });
        return this.pendingSave;
    }
    getSetting(key, defaultValue) {
        const settings = this.globalState.get(KEY_SETTINGS, {});
        return settings[key] ?? defaultValue;
    }
    setSetting(key, value) {
        this.dirty = true;
        const settings = this.globalState.get(KEY_SETTINGS, {});
        settings[key] = value;
        this.pendingSave = this.globalState.update(KEY_SETTINGS, settings);
        this.pendingSave.then(() => { this.dirty = false; });
        return this.pendingSave;
    }
    /**
     * 在扩展停用(deactivate)前调用，确保所有待保存的数据已写入。
     * VS Code 的 globalState.update 本身是同步写入内存映射并异步刷盘，
     * 此方法确保最后一个 Promise 被等待。
     */
    async flush() {
        if (this.pendingSave) {
            try {
                await this.pendingSave;
            }
            catch (e) {
                console.error('[StateManager] flush 失败:', e);
            }
        }
        this.dirty = false;
    }
    isDirty() {
        return this.dirty;
    }
}
exports.StateManager = StateManager;
//# sourceMappingURL=stateManager.js.map