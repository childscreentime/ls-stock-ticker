// Configuration Manager for LS Stock Ticker Extension

export class StockConfig {
    constructor() {
        this.defaults = {
            watchlist: {
                '918422': { // NVIDIA WKN
                    id: '43763',
                    name: 'NVIDIA CORP. DL-,001',
                    locale: 'de',
                    isin: 'US67066G1040'
                }
            },
            alertRules: {
                '918422': {
                    enabled: true,
                    minNotionalEUR: 1000,
                    highlightAggressive: true,
                    priceThresholds: {
                        upper: null,
                        lower: null
                    },
                    volumeThreshold: 100,
                    notifications: {
                        trades: true,
                        quotes: false,
                        thresholds: true
                    }
                }
            },
            webhookConfig: {
                enabled: false,
                url: '',
                type: 'discord', // 'discord' | 'telegram' | 'generic'
                token: '',
                channels: {
                    trades: '',
                    alerts: ''
                }
            }
        };
    }

    async initializeDefaults() {
        const stored = await chrome.storage.local.get(['watchlist', 'alertRules', 'webhookConfig']);
        
        if (!stored.watchlist) {
            await chrome.storage.local.set({ watchlist: this.defaults.watchlist });
        }
        
        if (!stored.alertRules) {
            await chrome.storage.local.set({ alertRules: this.defaults.alertRules });
        }
        
        if (!stored.webhookConfig) {
            await chrome.storage.local.set({ webhookConfig: this.defaults.webhookConfig });
        }
        
        console.log('✅ Configuration initialized');
    }

    async getWatchlist() {
        const result = await chrome.storage.local.get('watchlist');
        return result.watchlist || this.defaults.watchlist;
    }

    async setWatchlist(watchlist) {
        await chrome.storage.local.set({ watchlist });
    }

    async addWatchlistItem(wkn, instrument) {
        const watchlist = await this.getWatchlist();
        watchlist[wkn] = instrument;
        await this.setWatchlist(watchlist);
    }

    async removeWatchlistItem(wkn) {
        const watchlist = await this.getWatchlist();
        delete watchlist[wkn];
        await this.setWatchlist(watchlist);
    }

    async getAlertRules(wkn = null) {
        const result = await chrome.storage.local.get('alertRules');
        const alertRules = result.alertRules || this.defaults.alertRules;
        
        if (wkn) {
            return alertRules[wkn] || null;
        }
        
        return alertRules;
    }

    async setAlertRules(alertRules) {
        await chrome.storage.local.set({ alertRules });
    }

    async updateAlertRule(wkn, updates) {
        const alertRules = await this.getAlertRules();
        
        if (!alertRules[wkn]) {
            alertRules[wkn] = { ...this.defaults.alertRules['918422'] };
        }
        
        alertRules[wkn] = { ...alertRules[wkn], ...updates };
        await this.setAlertRules(alertRules);
    }

    async getWebhookConfig() {
        const result = await chrome.storage.local.get('webhookConfig');
        return result.webhookConfig || this.defaults.webhookConfig;
    }

    async setWebhookConfig(config) {
        await chrome.storage.local.set({ webhookConfig: config });
    }

    // Instrument lookup utilities
    async lookupInstrumentByIsin(isin) {
        try {
            const response = await fetch(`https://www.ls-tc.de/_rpc/json/.lstc/instrument/search/main?q=${isin}&localeId=2`);
            const data = await response.json();
            
            if (data && data.length > 0) {
                const instrument = data[0];
                return {
                    id: instrument.instrumentId.toString(),
                    name: instrument.displayname,
                    wkn: instrument.wkn,
                    symbol: instrument.symbol,
                    isin: isin
                };
            }
        } catch (error) {
            console.error('Failed to lookup instrument:', error);
        }
        
        return null;
    }

    async addInstrumentByIsin(isin) {
        const instrument = await this.lookupInstrumentByIsin(isin);
        if (instrument) {
            await this.addWatchlistItem(instrument.wkn, instrument);
            return instrument;
        }
        return null;
    }
}
