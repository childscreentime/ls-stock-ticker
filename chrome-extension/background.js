// Background Service Worker for LS Stock Ticker
// Handles tab management, event processing, and alerting

import { StockConfig } from './utils/config.js';
import { AlertManager } from './utils/alerts.js';
import { WebhookManager } from './utils/webhooks.js';

class BackgroundService {
    constructor() {
        this.config = new StockConfig();
        this.alertManager = new AlertManager();
        this.webhookManager = new WebhookManager();
        this.activeTabs = new Map(); // WKN -> tabId mapping
        this.recentEvents = []; // Store last 100 events for popup
        this.maxEvents = 100;
        
        this.init();
    }

    async init() {
        console.log('🚀 LS Stock Ticker Background Service starting...');
        
        // Listen for extension installation/startup
        chrome.runtime.onInstalled.addListener(() => this.onInstalled());
        chrome.runtime.onStartup.addListener(() => this.onStartup());
        
        // Listen for messages from content scripts
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => 
            this.handleMessage(message, sender, sendResponse)
        );
        
        // Set up periodic tab health check
        chrome.alarms.onAlarm.addListener((alarm) => this.handleAlarm(alarm));
        chrome.alarms.create('tabHealthCheck', { periodInMinutes: 15 });
        
        // Handle tab removal
        chrome.tabs.onRemoved.addListener((tabId) => this.onTabRemoved(tabId));
        
        // Handle new tab creation to detect when users open ls-tc.de pages
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => this.onTabUpdated(tabId, changeInfo, tab));
        
        await this.setupWatchlistTabs();
    }

    async onInstalled() {
        console.log('📦 Extension installed, setting up initial configuration...');
        await this.config.initializeDefaults();
        await this.setupWatchlistTabs();
    }

    async onStartup() {
        console.log('🔄 Extension startup, verifying tabs...');
        await this.setupWatchlistTabs();
    }

    async handleMessage(message, sender, sendResponse) {
        if (message.type === 'LS_EVENT') {
            await this.processLightstreamerEvent(message, sender.tab);
            sendResponse({ status: 'received' });
        } else if (message.type === 'GET_RECENT_EVENTS') {
            sendResponse({ events: this.recentEvents.slice(-50) });
        } else if (message.type === 'TOGGLE_ALERTS') {
            await this.toggleAlerts(message.wkn, message.enabled);
            sendResponse({ status: 'updated' });
        } else if (message.type === 'GET_TAB_STATUS') {
            const status = await this.getTabStatus();
            sendResponse({ status });
        } else if (message.type === 'CONFIG_UPDATED') {
            console.log('🔄 Configuration updated, refreshing tabs...');
            await this.setupWatchlistTabs();
            sendResponse({ status: 'refreshed' });
        } else if (message.action === 'checkOtherLsTcTabs') {
            const result = await this.checkOtherLsTcTabs(message.currentUrl);
            sendResponse(result);
        }
        return true; // Keep message channel open for async response
    }

    async handleAlarm(alarm) {
        if (alarm.name === 'tabHealthCheck') {
            console.log('🏥 Running tab health check...');
            await this.ensureWatchlistTabs();
        }
    }

    onTabRemoved(tabId) {
        // Remove tab from our tracking
        for (const [wkn, id] of this.activeTabs.entries()) {
            if (id === tabId) {
                console.log(`🗑️ Tab removed for ${wkn}, will scan for other ls-tc.de tabs`);
                this.activeTabs.delete(wkn);
                break;
            }
        }

        // Check if the removed tab was the injected tab and clean up
        this.cleanupInjectedTabIfRemoved(tabId);
    }

    async cleanupInjectedTabIfRemoved(removedTabId) {
        try {
            // Since we're now using a simpler lock system, we don't need to track specific tab IDs
            // The lock will naturally expire or be cleaned up by the content script logic
            console.log(`🧹 Tab ${removedTabId} removed - injection lock will be cleaned up automatically if stale`);
        } catch (error) {
            console.error('❌ Failed to cleanup injection lock:', error);
        }
    }

    async checkOtherLsTcTabs(currentUrl) {
        try {
            // Query all tabs to find other ls-tc.de tabs
            const allTabs = await chrome.tabs.query({});
            const lsTcTabs = allTabs.filter(tab => 
                tab.url && 
                tab.url.includes('ls-tc.de') && 
                tab.url !== currentUrl
            );

            return {
                hasOtherTabs: lsTcTabs.length > 0,
                otherTabsCount: lsTcTabs.length,
                otherTabUrls: lsTcTabs.map(tab => tab.url)
            };
        } catch (error) {
            console.error('❌ Failed to check other ls-tc.de tabs:', error);
            return { hasOtherTabs: false, otherTabsCount: 0 };
        }
    }

    onTabUpdated(tabId, changeInfo, tab) {
        // Check if this is a newly loaded ls-tc.de page
        if (changeInfo.status === 'complete' && tab.url && tab.url.includes('ls-tc.de/de/aktie/')) {
            const instrumentInfo = this.extractInstrumentFromTabUrl(tab.url);
            if (instrumentInfo) {
                const key = instrumentInfo.wkn || instrumentInfo.id || tabId.toString();
                if (!this.activeTabs.has(key)) {
                    console.log(`🆕 Detected new ls-tc.de tab: ${tab.url}`);
                    this.activeTabs.set(key, tabId);
                }
            }
        }
    }

    async setupWatchlistTabs() {
        console.log('🔍 Scanning for existing ls-tc.de tabs...');
        await this.findExistingLSTabs();
    }

    async findExistingLSTabs() {
        try {
            // Query all open tabs for ls-tc.de
            const tabs = await chrome.tabs.query({ url: "https://www.ls-tc.de/*" });
            console.log(`🔍 Found ${tabs.length} existing ls-tc.de tabs`);
            
            for (const tab of tabs) {
                const instrumentInfo = this.extractInstrumentFromTabUrl(tab.url);
                if (instrumentInfo) {
                    console.log(`✅ Tracking existing tab ${tab.id}: ${instrumentInfo.name || instrumentInfo.id}`);
                    this.activeTabs.set(instrumentInfo.wkn || instrumentInfo.id, tab.id);
                }
            }
        } catch (error) {
            console.error('❌ Failed to scan existing tabs:', error);
        }
    }

    extractInstrumentFromTabUrl(url) {
        // Extract instrument info from ls-tc.de URL
        // Examples: 
        // https://www.ls-tc.de/de/aktie/nvidia-dl-01-aktie
        // https://www.ls-tc.de/de/aktie/43763
        
        const urlObj = new URL(url);
        const pathMatch = urlObj.pathname.match(/\/aktie\/([^\/]+)/);
        
        if (pathMatch) {
            const slugOrId = pathMatch[1];
            
            // If it's a numeric ID, use it directly
            if (/^\d+$/.test(slugOrId)) {
                return {
                    id: slugOrId,
                    wkn: null,
                    name: null
                };
            }
            
            // For slug-based URLs, try to map to known instruments
            // This is a simplified mapping - in practice you'd need more comprehensive mapping
            const knownMappings = {
                'nvidia-dl-01-aktie': { id: '43763', wkn: '918422', name: 'NVIDIA CORP. DL-,001' }
                // Add more mappings as needed
            };
            
            return knownMappings[slugOrId] || {
                id: null,
                wkn: null,
                name: slugOrId
            };
        }
        
        return null;
    }

    // Remove the old tab creation method and replace with tracking only
    async trackExistingTab(tabId, instrumentInfo) {
        try {
            const tab = await chrome.tabs.get(tabId);
            if (tab && tab.url.includes('ls-tc.de')) {
                const key = instrumentInfo.wkn || instrumentInfo.id || tabId.toString();
                this.activeTabs.set(key, tabId);
                console.log(`✅ Now tracking tab ${tabId} for instrument ${key}`);
                return tabId;
            }
        } catch (error) {
            console.error(`❌ Failed to track tab ${tabId}:`, error);
        }
        return null;
    }

    async ensureWatchlistTabs() {
        console.log('🏥 Health check: Scanning for ls-tc.de tabs...');
        await this.findExistingLSTabs();
    }

    async processLightstreamerEvent(event, tab) {
        console.log('📊 Processing LS event:', event);
        
        // Add to recent events for popup
        const eventWithTimestamp = {
            ...event,
            timestamp: Date.now(),
            tabId: tab?.id
        };
        
        this.recentEvents.push(eventWithTimestamp);
        if (this.recentEvents.length > this.maxEvents) {
            this.recentEvents.shift();
        }

        // Check alert rules
        const alertRules = await this.config.getAlertRules(event.wkn);
        if (alertRules && alertRules.enabled) {
            await this.checkAlerts(event, alertRules);
        }

        // Send to webhook if configured
        const webhookConfig = await this.config.getWebhookConfig();
        if (webhookConfig && webhookConfig.enabled) {
            await this.webhookManager.sendEvent(event, webhookConfig);
        }
    }

    async checkAlerts(event, rules) {
        const alerts = this.alertManager.evaluateEvent(event, rules);
        
        for (const alert of alerts) {
            await this.showNotification(alert);
        }
    }

    async showNotification(alert) {
        const options = {
            type: 'basic',
            iconUrl: 'icons/icon-48.png',
            title: `📈 ${alert.instrumentName || alert.wkn}`,
            message: alert.message,
            priority: alert.priority || 1
        };

        try {
            await chrome.notifications.create(`alert_${Date.now()}`, options);
            console.log('🔔 Notification sent:', alert.message);
        } catch (error) {
            console.error('❌ Failed to send notification:', error);
        }
    }

    async toggleAlerts(wkn, enabled) {
        await this.config.updateAlertRule(wkn, { enabled });
        console.log(`🔔 Alerts ${enabled ? 'enabled' : 'disabled'} for ${wkn}`);
    }

    async getTabStatus() {
        const watchlist = await this.config.getWatchlist();
        const status = {};
        
        for (const [wkn, instrument] of Object.entries(watchlist)) {
            const tabId = this.activeTabs.get(wkn);
            let tabStatus = 'missing';
            
            if (tabId) {
                try {
                    const tab = await chrome.tabs.get(tabId);
                    tabStatus = tab.discarded ? 'discarded' : 'active';
                } catch {
                    tabStatus = 'missing';
                }
            }
            
            status[wkn] = {
                name: instrument.name,
                tabId,
                status: tabStatus
            };
        }
        
        return status;
    }

}

// Initialize the background service
new BackgroundService();
