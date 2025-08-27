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
        this.recentTrades = []; // Store last 20 trade events for popup
        this.latestQuotes = new Map(); // Store latest quote for each WKN
        this.maxTrades = 20;
        this.maxQuoteAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        this.persistEventsTimeout = null; // For debouncing persist operations
        
        // Primary/Secondary tab management
        this.primaryTabId = null; // The tab that maintains LightStream connection
        this.secondaryTabs = new Set(); // Tabs that only display charts
        this.lsTcTabs = new Map(); // tabId -> tab info mapping (includes instrumentInfo)
        this.stateRestored = false; // Flag to track if state restoration is complete
        this.roleAssignmentLock = false; // Prevent concurrent role assignments
        
        console.log('🚀 BackgroundService constructor called');
        console.log('🔍 Initial state - primaryTabId:', this.primaryTabId);
        console.log('🔍 Initial state - secondaryTabs:', Array.from(this.secondaryTabs));
        
        this.init();
    }

    async init() {
        console.log('🚀 LS Stock Ticker Background Service starting...');
        
        // Restore persisted tab state
        await this.restoreTabState();
        
        // Restore persisted events data
        await this.restoreEventsData();
        
        this.stateRestored = true;
        console.log('✅ Tab state restoration complete');
        
        // Validate tab role integrity after restoration
        await this.validateTabRoleIntegrity();
        
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
        
        // Handle notification clicks to navigate to relevant tab
        chrome.notifications.onClicked.addListener((notificationId) => this.onNotificationClicked(notificationId));
        
        // Ensure data is persisted on service worker suspension
        // Service workers can be suspended without warning, so we use debounced persistence
        
        await this.setupWatchlistTabs();
        
        // Ensure any existing data is persisted immediately after initialization
        if (this.recentTrades.length > 0 || this.latestQuotes.size > 0) {
            await this.persistEventsData();
        }
        
        console.log('✅ LS Stock Ticker Background Service initialized');
    }
    
    async restoreTabState() {
        try {
            console.log('🔄 Restoring tab state from storage...');
            const result = await chrome.storage.local.get(['primaryTabId', 'secondaryTabs', 'lsTcTabs']);
            console.log('🔍 Raw stored data:', result);
            
            let stateChanged = false;
            
            if (result.primaryTabId) {
                // Check if the primary tab is still active
                console.log(`🔍 Checking stored primary tab ${result.primaryTabId}...`);
                const isActive = await this.isTabActive(result.primaryTabId);
                if (isActive) {
                    this.primaryTabId = result.primaryTabId;
                    console.log(`✅ Restored primary tab: ${this.primaryTabId}`);
                } else {
                    console.log(`⚠️ Stored primary tab ${result.primaryTabId} is no longer active`);
                    this.primaryTabId = null;
                    stateChanged = true;
                }
            } else {
                console.log('🔍 No primary tab stored');
            }
            
            if (result.secondaryTabs && Array.isArray(result.secondaryTabs)) {
                console.log(`🔍 Checking ${result.secondaryTabs.length} stored secondary tabs...`);
                // Validate each secondary tab
                for (const tabId of result.secondaryTabs) {
                    console.log(`🔍 Checking stored secondary tab ${tabId}...`);
                    
                    // Defensive check: Don't restore primary tab as secondary
                    if (this.primaryTabId === tabId) {
                        console.log(`⚠️ Stored secondary tab ${tabId} is now the primary tab, skipping`);
                        stateChanged = true;
                        continue;
                    }
                    
                    const isActive = await this.isTabActive(tabId);
                    if (isActive) {
                        this.secondaryTabs.add(tabId);
                        console.log(`✅ Restored secondary tab: ${tabId}`);
                    } else {
                        console.log(`⚠️ Stored secondary tab ${tabId} is no longer active`);
                        stateChanged = true;
                    }
                }
            } else {
                console.log('🔍 No secondary tabs stored');
            }
            
            if (result.lsTcTabs) {
                // Only restore tab info for active tabs
                const activeTabIds = new Set([this.primaryTabId, ...this.secondaryTabs].filter(Boolean));
                const storedEntries = Object.entries(result.lsTcTabs);
                console.log(`🔍 Filtering ${storedEntries.length} stored tab info entries...`);
                
                for (const [tabIdStr, tabInfo] of storedEntries) {
                    const tabId = parseInt(tabIdStr);
                    if (activeTabIds.has(tabId)) {
                        this.lsTcTabs.set(tabId, tabInfo);
                    } else {
                        console.log(`🗑️ Removing stale tab info for inactive tab ${tabId}`);
                        stateChanged = true;
                    }
                }
                console.log(`✅ Restored ${this.lsTcTabs.size} active tab info entries`);
            } else {
                console.log('🔍 No tab info stored');
            }
            
            console.log(`🔍 Final state - primaryTabId: ${this.primaryTabId}`);
            console.log(`🔍 Final state - secondaryTabs: ${Array.from(this.secondaryTabs)}`);
            console.log(`🔍 Final state - lsTcTabs size: ${this.lsTcTabs.size}`);
            
            // Persist cleaned up state if changes were made
            if (stateChanged) {
                await this.persistTabState();
                console.log('💾 Persisted cleaned up tab state');
            }
        } catch (error) {
            console.error('❌ Failed to restore tab state:', error);
        }
    }
    
    async persistTabState() {
        try {
            await chrome.storage.local.set({
                primaryTabId: this.primaryTabId,
                secondaryTabs: Array.from(this.secondaryTabs),
                lsTcTabs: Object.fromEntries(this.lsTcTabs)
            });
            console.log('💾 Tab state persisted to storage');
        } catch (error) {
            console.error('❌ Failed to persist tab state:', error);
        }
    }

    async restoreEventsData() {
        try {
            console.log('🔄 Restoring events data from storage...');
            const result = await chrome.storage.local.get(['recentTrades', 'latestQuotes']);
            
            if (result.recentTrades && Array.isArray(result.recentTrades)) {
                this.recentTrades = result.recentTrades;
                console.log(`📋 Restored ${this.recentTrades.length} recent trades`);
            } else {
                console.log('🔍 No recent trades stored');
            }
            
            if (result.latestQuotes && typeof result.latestQuotes === 'object') {
                this.latestQuotes = new Map(Object.entries(result.latestQuotes));
                console.log(`💰 Restored ${this.latestQuotes.size} latest quotes`);
                
                // Clean up old quotes
                this.cleanupOldQuotes();
            } else {
                console.log('🔍 No latest quotes stored');
            }
        } catch (error) {
            console.error('❌ Failed to restore events data:', error);
        }
    }

    cleanupOldQuotes() {
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [wkn, quote] of this.latestQuotes.entries()) {
            if (quote.timestamp && (now - quote.timestamp > this.maxQuoteAge)) {
                this.latestQuotes.delete(wkn);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} old quotes`);
        }
    }

    async persistEventsData() {
        try {
            await chrome.storage.local.set({
                recentTrades: this.recentTrades,
                latestQuotes: Object.fromEntries(this.latestQuotes)
            });
            console.log('💾 Events data persisted to storage');
        } catch (error) {
            console.error('❌ Failed to persist events data:', error);
        }
    }

    // Debounced version to avoid too frequent storage writes
    persistEventsDataDebounced() {
        if (this.persistEventsTimeout) {
            clearTimeout(this.persistEventsTimeout);
        }
        this.persistEventsTimeout = setTimeout(() => {
            this.persistEventsData();
        }, 1000); // Wait 1 second before persisting
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

    handleMessage(message, sender, sendResponse) {
        console.log('📨 Received message:', message.type || message.action, 'from tab:', sender.tab?.id);
        
        try {
            if (message.type === 'LS_EVENT') {
                // Handle async without await in main function
                this.processLightstreamerEvent(message, sender.tab)
                    .then(() => this.broadcastToSecondaryTabs(message))
                    .then(() => sendResponse({ status: 'received' }))
                    .catch(error => {
                        console.error('❌ Error handling LS_EVENT:', error);
                        sendResponse({ error: error.message });
                    });
                return true; // Keep channel open
                
            } else if (message.type === 'GET_RECENT_EVENTS') {
                sendResponse({ trades: this.recentTrades, quotes: Object.fromEntries(this.latestQuotes) });
                
            } else if (message.type === 'TOGGLE_ALERTS') {
                this.toggleAlerts(message.wkn, message.enabled)
                    .then(() => sendResponse({ status: 'updated' }))
                    .catch(error => {
                        console.error('❌ Error toggling alerts:', error);
                        sendResponse({ error: error.message });
                    });
                return true; // Keep channel open
                
            } else if (message.type === 'GET_TAB_STATUS') {
                console.log('📊 Processing GET_TAB_STATUS request...');
                this.getTabStatus()
                    .then(status => {
                        console.log('📊 getTabStatus() returned:', status);
                        const response = { status };
                        console.log('📊 Sending response:', response);
                        sendResponse(response);
                    })
                    .catch(error => {
                        console.error('❌ Error in GET_TAB_STATUS:', error);
                        sendResponse({ error: error.message });
                    });
                return true; // Keep channel open
                
            } else if (message.type === 'CONFIG_UPDATED') {
                console.log('🔄 Configuration updated, refreshing tabs...');
                this.setupWatchlistTabs()
                    .then(() => sendResponse({ status: 'refreshed' }))
                    .catch(error => {
                        console.error('❌ Error refreshing tabs:', error);
                        sendResponse({ error: error.message });
                    });
                return true; // Keep channel open
                
            } else if (message.action === 'requestTabRole') {
                console.log(`📋 Processing requestTabRole for tab ${sender.tab.id}...`);
                this.assignTabRole(sender.tab.id)
                    .then(role => {
                        console.log(`📋 Sending role response:`, role);
                        sendResponse(role);
                    })
                    .catch(error => {
                        console.error('❌ Error in assignTabRole:', error);
                        sendResponse({ role: 'primary', shouldConnect: true, error: error.message });
                    });
                return true; // Keep channel open
                
            } else if (message.action === 'registerSecondaryTab') {
                this.registerSecondaryTab(sender.tab.id, message.instrumentInfo)
                    .then(() => sendResponse({ status: 'registered' }))
                    .catch(error => {
                        console.error('❌ Error registering secondary tab:', error);
                        sendResponse({ error: error.message });
                    });
                return true; // Keep channel open
                
            } else if (message.action === 'registerPrimaryTab') {
                this.registerPrimaryTab(sender.tab.id, message.instrumentInfo)
                    .then(() => sendResponse({ status: 'registered' }))
                    .catch(error => {
                        console.error('❌ Error registering primary tab:', error);
                        sendResponse({ error: error.message });
                    });
                return true; // Keep channel open
                
            } else if (message.action === 'checkOtherLsTcTabs') {
                this.checkOtherLsTcTabs(message.currentUrl)
                    .then(result => sendResponse(result))
                    .catch(error => {
                        console.error('❌ Error checking other tabs:', error);
                        sendResponse({ error: error.message });
                    });
                return true; // Keep channel open
                
            } else if (message.type === 'HEALTH_CHECK') {
                sendResponse({ status: 'ok', timestamp: Date.now() });
                
            } else {
                console.warn('⚠️ Unknown message type/action:', message);
                sendResponse({ error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('❌ Error handling message:', error);
            sendResponse({ error: error.message });
        }
        
        return false; // Synchronous response for unknown messages
    }

    async handleAlarm(alarm) {
        if (alarm.name === 'tabHealthCheck') {
            console.log('🏥 Running tab health check...');
            await this.ensureWatchlistTabs();
        }
    }

    onTabRemoved(tabId) {
        console.log(`🗑️ Tab ${tabId} removed`);

        // Handle primary/secondary tab cleanup
        if (tabId === this.primaryTabId) {
            console.log(`🔄 Primary tab ${tabId} removed, promoting secondary tab...`);
            this.promotePrimaryTab();
        } else {
            this.secondaryTabs.delete(tabId);
        }
        
        this.lsTcTabs.delete(tabId);
        
        // Persist the updated state
        this.persistTabState();

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
        // Tab detection is now handled through tab registration
        // when content script injects and secondary tabs register
        if (changeInfo.status === 'complete' && tab.url && tab.url.includes('ls-tc.de/de/aktie/')) {
            console.log(`🆕 Detected ls-tc.de tab: ${tab.url} - waiting for tab registration`);
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
            console.log(`🔍 Found ${tabs.length} existing ls-tc.de tabs - waiting for them to register`);
            
            // No longer extract instrument info from URLs
            // Tabs will register themselves when content script loads
        } catch (error) {
            console.error('❌ Failed to scan existing tabs:', error);
        }
    }

    async ensureWatchlistTabs() {
        console.log('🏥 Health check: Scanning for ls-tc.de tabs...');
        await this.findExistingLSTabs();
    }

    async processLightstreamerEvent(message, tab) {
        console.log('📊 Processing LS event:', message);
        
        // Extract the actual event data from the message structure
        const eventData = message.event; // This contains the actual trade/quote data
        const eventType = message.eventType; // TRADE or QUOTE
        
        console.log('📊 Event type:', eventType);
        console.log('📊 Event data:', eventData);
        
        // Handle trades and quotes separately
        const eventWithTimestamp = {
            ...eventData,
            type: eventType,
            timestamp: eventData.ts || Date.now(), // Use original trade timestamp, fallback to current time
            tabId: tab?.id
        };
        
        if (eventType === 'TRADE') {
            // Store trades in recent trades list
            this.recentTrades.push(eventWithTimestamp);
            if (this.recentTrades.length > this.maxTrades) {
                this.recentTrades.shift();
            }
            console.log(`📈 Trade event stored (${this.recentTrades.length}/${this.maxTrades})`);
            // Persist trades data (debounced)
            this.persistEventsDataDebounced();
        } else if (eventType === 'QUOTE' && eventData.wkn) {
            // Store latest quote for each instrument
            this.latestQuotes.set(eventData.wkn, eventWithTimestamp);
            console.log(`💰 Quote updated for WKN ${eventData.wkn}: ${eventData.price}`);
            // Persist quotes data (debounced)
            this.persistEventsDataDebounced();
        }

        // Check alert rules using the actual event data
        if (eventData && eventData.wkn) {
            console.log('📊 Checking alerts for WKN:', eventData.wkn);
            const alertRules = await this.config.getAlertRules(eventData.wkn);
            if (alertRules && alertRules.enabled) {
                console.log('📊 Alert rules found, checking conditions...');
                await this.checkAlerts(eventData, alertRules);
            } else {
                console.log('📊 No alert rules or disabled for WKN:', eventData.wkn);
            }
        } else {
            console.log('📊 No WKN found in event data:', eventData);
        }

        // Send to webhook if configured
        const webhookConfig = await this.config.getWebhookConfig();
        if (webhookConfig && webhookConfig.enabled) {
            await this.webhookManager.sendEvent(eventData, webhookConfig);
        }
    }

    async checkAlerts(event, rules) {
        const alerts = this.alertManager.evaluateEvent(event, rules);
        
        for (const alert of alerts) {
            await this.showNotification(alert);
        }
    }

    async showNotification(alert) {
        // Encode ISIN in notification ID for easy lookup
        const notificationId = `${alert.isin}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const options = {
            type: 'basic',
            iconUrl: 'icons/icon-48.png',
            title: `📈 ${alert.instrumentName || alert.wkn}`,
            message: alert.message,
            priority: alert.priority || 1
        };

        try {
            await chrome.notifications.create(notificationId, options);
            console.log('🔔 Notification sent:', alert.message);
        } catch (error) {
            console.error('❌ Failed to send notification:', error);
        }
    }

    async toggleAlerts(wkn, enabled) {
        await this.config.updateAlertRule(wkn, { enabled });
        console.log(`🔔 Alerts ${enabled ? 'enabled' : 'disabled'} for ${wkn}`);
    }

    async onNotificationClicked(notificationId) {
        console.log('🔔 Notification clicked:', notificationId);
        
        // Extract ISIN/WKN from notification ID (format: "ISIN_timestamp_random")
        const instrumentIdentifier = notificationId.split('_')[0];
        if (!instrumentIdentifier) {
            console.warn('⚠️ Could not extract instrument identifier from notification ID:', notificationId);
            return;
        }
        
        console.log('🔍 Looking for tabs with instrument identifier:', instrumentIdentifier);
        
        // Find a tab that matches this instrument (by ISIN or WKN)
        let targetTabId = null;
        let instrumentInfo = null;
        
        // Search through registered tabs for exact matches
        for (const [tabId, tabInfo] of this.lsTcTabs) {
            if (tabInfo.instrumentInfo && 
                (tabInfo.instrumentInfo.isin === instrumentIdentifier)) {
                targetTabId = tabId;
                instrumentInfo = tabInfo.instrumentInfo;
                console.log(`✅ Found exact match in registered tab ${tabId}: ${instrumentInfo.name}`);
                break;
            }
        }
        
        if (targetTabId) {
            try {
                // Activate the tab and bring it to focus
                await chrome.tabs.update(targetTabId, { active: true });
                
                // Also bring the window to focus
                const tab = await chrome.tabs.get(targetTabId);
                if (tab.windowId) {
                    await chrome.windows.update(tab.windowId, { focused: true });
                }
                
                console.log(`✅ Navigated to tab ${targetTabId} for instrument ${instrumentIdentifier}`);
            } catch (error) {
                console.error('❌ Failed to navigate to tab:', error);
            }
        } else {
            console.warn(`⚠️ No tab found for instrument ${instrumentIdentifier}`);
        }
    }

    async getTabStatus() {
        console.log('📊 getTabStatus() called');
        
        try {
            const watchlist = await this.config.getWatchlist();
            console.log('📊 Watchlist loaded:', watchlist);
            const status = {};
            
            // Get all ls-tc.de tabs
            let allLsTabs = [];
            try {
                const tabs = await chrome.tabs.query({ url: "https://www.ls-tc.de/*" });
                allLsTabs = tabs;
                console.log(`📊 Found ${allLsTabs.length} ls-tc.de tabs`);
            } catch (error) {
                console.error('❌ Failed to query tabs:', error);
            }
            
            // Build status for each watchlist instrument
        for (const [wkn, instrument] of Object.entries(watchlist)) {
            // Check if any registered tab is viewing this instrument
            let matchingTabId = null;
            let tabRole = null;
            let tabStatus = 'missing';
            
            // Look through registered tabs for this instrument
            for (const [tabId, tabInfo] of this.lsTcTabs.entries()) {
                if (tabInfo.instrumentInfo && tabInfo.instrumentInfo.wkn === wkn) {
                    matchingTabId = tabId;
                    tabRole = tabInfo.role;
                    // Check if tab is still active
                    const matchingTab = allLsTabs.find(tab => tab.id === tabId);
                    if (matchingTab) {
                        tabStatus = matchingTab.discarded ? 'discarded' : 'active';
                    } else {
                        tabStatus = 'missing';
                    }
                    break;
                }
            }
            
            status[wkn] = {
                name: instrument.name,
                tabId: matchingTabId,
                status: tabStatus,
                role: tabRole, // 'primary', 'secondary', or null
                isin: instrument.isin,
                latestQuote: this.latestQuotes.get(wkn) || null
            };
        }
        
        // Add summary information
        status._summary = {
            primaryTabId: this.primaryTabId,
            secondaryTabCount: this.secondaryTabs.size,
            totalLsTabs: allLsTabs.length,
            watchlistInstruments: Object.keys(watchlist).length
        };
        
        // Add debug information
        status._debug = {
            registeredTabs: Array.from(this.lsTcTabs.entries()).map(([tabId, tabInfo]) => ({
                tabId,
                role: tabInfo.role,
                instrumentWkn: tabInfo.instrumentInfo?.wkn,
                instrumentName: tabInfo.instrumentInfo?.name,
                timestamp: tabInfo.timestamp
            })),
            openLsTabs: allLsTabs.map(tab => ({
                id: tab.id,
                url: tab.url,
                discarded: tab.discarded,
                status: tab.status
            }))
        };
        
        console.log('📊 getTabStatus() returning:', status);
        return status;
        
        } catch (error) {
            console.error('❌ Error in getTabStatus():', error);
            return {
                _error: error.message,
                _summary: {
                    primaryTabId: this.primaryTabId,
                    secondaryTabCount: this.secondaryTabs.size,
                    totalLsTabs: 0,
                    watchlistInstruments: 0
                }
            };
        }
    }

    // Primary/Secondary Tab Management
    async assignTabRole(tabId) {
        console.log(`🔍 Tab ${tabId} requesting role assignment...`);
        
        // Wait for any ongoing role assignment to complete with timeout
        let lockWaitCount = 0;
        while (this.roleAssignmentLock && lockWaitCount < 100) { // 5 second timeout
            console.log(`⏳ Tab ${tabId} waiting for role assignment lock... (${lockWaitCount})`);
            await new Promise(resolve => setTimeout(resolve, 50));
            lockWaitCount++;
        }
        
        if (this.roleAssignmentLock) {
            console.error(`❌ Role assignment lock timeout for tab ${tabId}`);
            return { role: 'primary', shouldConnect: true, error: 'Lock timeout' };
        }
        
        // Acquire lock
        this.roleAssignmentLock = true;
        console.log(`🔒 Tab ${tabId} acquired role assignment lock`);
        
        try {
            // Wait for state restoration to complete
            if (!this.stateRestored) {
                console.log('⏳ Waiting for state restoration to complete...');
                let waitCount = 0;
                while (!this.stateRestored && waitCount < 50) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    waitCount++;
                }
                if (!this.stateRestored) {
                    console.warn('⚠️ State restoration timed out, proceeding anyway');
                } else {
                    console.log('✅ State restoration complete, proceeding with role assignment');
                }
            }
            
            console.log(`🔍 Current primary tab ID: ${this.primaryTabId}`);
            console.log(`🔍 Current secondary tabs:`, Array.from(this.secondaryTabs));
            
            // If no primary tab exists, make this tab primary
            if (!this.primaryTabId) {
                this.primaryTabId = tabId;
                this.lsTcTabs.set(tabId, { role: 'primary', timestamp: Date.now() });
                console.log(`👑 Tab ${tabId} assigned as PRIMARY tab (first tab)`);
                await this.persistTabState();
                return { role: 'primary', shouldConnect: true };
            }
            
            // Check if primary tab is still active
            console.log(`🔍 Checking if primary tab ${this.primaryTabId} is still active...`);
            const isPrimaryActive = await this.isTabActive(this.primaryTabId);
            console.log(`🔍 Primary tab ${this.primaryTabId} active: ${isPrimaryActive}`);
            
            if (!isPrimaryActive) {
                // Primary tab is gone, promote this tab
                console.log(`⚠️ Primary tab ${this.primaryTabId} is no longer active, promoting tab ${tabId}`);
                this.primaryTabId = tabId;
                this.secondaryTabs.clear(); // Clear old secondary tabs
                this.lsTcTabs.set(tabId, { role: 'primary', timestamp: Date.now() });
                console.log(`👑 Tab ${tabId} promoted to PRIMARY tab (old primary inactive)`);
                await this.persistTabState();
                return { role: 'primary', shouldConnect: true };
            }
            
            // Make this tab secondary
            // Defensive check: Ensure we're not adding primary tab to secondary tabs
            if (this.primaryTabId === tabId) {
                console.log(`⚠️ Critical error: Attempted to add primary tab ${tabId} to secondary tabs!`);
                await this.persistTabState();
                return { role: 'primary', shouldConnect: true };
            }
            
            this.secondaryTabs.add(tabId);
            this.lsTcTabs.set(tabId, { role: 'secondary', timestamp: Date.now() });
            console.log(`📱 Tab ${tabId} assigned as SECONDARY tab`);
            await this.persistTabState();
            return { role: 'secondary', shouldConnect: false };
            
        } finally {
            // Always release lock
            this.roleAssignmentLock = false;
            console.log(`🔓 Tab ${tabId} released role assignment lock`);
            
            // Validate integrity after role assignment
            setTimeout(() => this.validateTabRoleIntegrity(), 100);
        }
    }

    async registerSecondaryTab(tabId, instrumentInfo) {
        // Defensive check: Don't add primary tab to secondary tabs
        if (this.primaryTabId === tabId) {
            console.log(`⚠️ Cannot register primary tab ${tabId} as secondary tab`);
            return;
        }
        
        this.secondaryTabs.add(tabId);
        this.lsTcTabs.set(tabId, { 
            role: 'secondary', 
            timestamp: Date.now(),
            instrumentInfo 
        });
        console.log(`📱 Secondary tab ${tabId} registered for ${instrumentInfo?.name || 'unknown instrument'}`);
        await this.persistTabState();
    }

    async registerPrimaryTab(tabId, instrumentInfo) {
        // Update the primary tab registration with instrument info
        if (this.primaryTabId === tabId) {
            this.lsTcTabs.set(tabId, { 
                role: 'primary', 
                timestamp: Date.now(),
                instrumentInfo 
            });
            console.log(`👑 Primary tab ${tabId} registered for ${instrumentInfo?.name || 'unknown instrument'}`);
            await this.persistTabState();
        } else {
            console.log(`⚠️ Tab ${tabId} tried to register as primary, but primary tab is ${this.primaryTabId}`);
        }
    }

    async promotePrimaryTab() {
        // Find the oldest secondary tab to promote
        let oldestTabId = null;
        let oldestTimestamp = Date.now();
        
        for (const tabId of this.secondaryTabs) {
            const tabInfo = this.lsTcTabs.get(tabId);
            const isActive = await this.isTabActive(tabId);
            
            if (isActive && tabInfo && tabInfo.timestamp < oldestTimestamp) {
                oldestTimestamp = tabInfo.timestamp;
                oldestTabId = tabId;
            }
        }
        
        if (oldestTabId) {
            // Promote the oldest secondary tab
            this.primaryTabId = oldestTabId;
            this.secondaryTabs.delete(oldestTabId);
            this.lsTcTabs.set(oldestTabId, { role: 'primary', timestamp: Date.now() });
            
            console.log(`👑 Tab ${oldestTabId} promoted from secondary to PRIMARY`);
            
            // Notify the promoted tab to start connecting
            try {
                await chrome.tabs.sendMessage(oldestTabId, {
                    type: 'PROMOTED_TO_PRIMARY',
                    shouldConnect: true
                });
            } catch (error) {
                const isConnectionError = this.isTabConnectionError(error, oldestTabId, 'notify promoted tab');
                if (isConnectionError) {
                    // Clean up the failed promotion
                    this.primaryTabId = null;
                    this.lsTcTabs.delete(oldestTabId);
                }
            }
        } else {
            console.log(`⚠️ No secondary tab available for promotion`);
            this.primaryTabId = null;
        }
    }

    async broadcastToSecondaryTabs(eventMessage) {
        // Extract instrument identifier from the event
        const eventData = eventMessage.event;
        const eventInstrumentWkn = eventData?.wkn;
        
        if (!eventInstrumentWkn) {
            console.log('⚠️ No WKN found in event, skipping secondary tab broadcast');
            return;
        }
        
        console.log(`📡 Broadcasting event for WKN ${eventInstrumentWkn} to matching secondary tabs...`);
        
        const secondaryTabIds = Array.from(this.secondaryTabs);
        let stateChanged = false;
        let sentCount = 0;
        
        for (const tabId of secondaryTabIds) {
            try {
                const isActive = await this.isTabActive(tabId);
                if (!isActive) {
                    console.log(`🗑️ Removing inactive secondary tab ${tabId}`);
                    this.secondaryTabs.delete(tabId);
                    this.lsTcTabs.delete(tabId);
                    stateChanged = true;
                    continue;
                }
                
                // Check if this tab is viewing the same instrument
                const tabInfo = this.lsTcTabs.get(tabId);
                const tabInstrumentWkn = tabInfo?.instrumentInfo?.wkn;
                
                if (tabInstrumentWkn === eventInstrumentWkn) {
                    console.log(`� Sending event to secondary tab ${tabId} (WKN: ${tabInstrumentWkn})`);
                    await chrome.tabs.sendMessage(tabId, {
                        type: 'LS_EVENT_BROADCAST',
                        eventData: eventMessage
                    });
                    sentCount++;
                } else {
                    console.log(`⏭️ Skipping secondary tab ${tabId} (different instrument: ${tabInstrumentWkn} vs ${eventInstrumentWkn})`);
                }
                
            } catch (error) {
                const isConnectionError = this.isTabConnectionError(error, tabId, 'broadcast event');
                if (isConnectionError) {
                    // Connection error - just clean up the tab
                } else {
                    // Other error - already logged by utility method
                }
                console.log(`🗑️ Removing failed secondary tab ${tabId}`);
                this.secondaryTabs.delete(tabId);
                this.lsTcTabs.delete(tabId);
                stateChanged = true;
            }
        }
        
        console.log(`📡 Event broadcast complete: sent to ${sentCount} matching secondary tabs`);
        
        // Persist state if any tabs were removed
        if (stateChanged) {
            await this.persistTabState();
            console.log(`💾 Updated tab state after cleaning up inactive secondary tabs`);
        }
    }

    async isTabActive(tabId) {
        try {
            console.log(`🔍 Checking if tab ${tabId} is active...`);
            const tab = await chrome.tabs.get(tabId);
            console.log(`🔍 Tab ${tabId} info:`, { url: tab.url, discarded: tab.discarded, status: tab.status });
            const isActive = !tab.discarded;
            console.log(`🔍 Tab ${tabId} is ${isActive ? 'active' : 'inactive'}`);
            return isActive;
        } catch (error) {
            console.log(`🔍 Tab ${tabId} check failed:`, error.message);
            return false;
        }
    }

    async validateTabRoleIntegrity() {
        console.log('🔍 Validating tab role integrity...');
        let hasErrors = false;
        
        // Check if primary tab is in secondary tabs
        if (this.primaryTabId && this.secondaryTabs.has(this.primaryTabId)) {
            console.error(`❌ CRITICAL ERROR: Primary tab ${this.primaryTabId} is in secondary tabs!`);
            this.secondaryTabs.delete(this.primaryTabId);
            hasErrors = true;
        }
        
        // Check if any secondary tab is set as primary
        for (const tabId of this.secondaryTabs) {
            if (tabId === this.primaryTabId) {
                console.error(`❌ CRITICAL ERROR: Secondary tab ${tabId} is also the primary tab!`);
                this.secondaryTabs.delete(tabId);
                hasErrors = true;
            }
        }
        
        if (hasErrors) {
            console.log('🔧 Fixed tab role integrity errors, persisting corrected state...');
            await this.persistTabState();
        } else {
            console.log('✅ Tab role integrity validation passed');
        }
        
        return !hasErrors;
    }

    /**
     * Utility method to handle tab messaging errors consistently
     * @param {Error} error - The error that occurred during tab messaging
     * @param {number} tabId - The tab ID that failed
     * @param {string} operation - Description of the operation that failed
     * @returns {boolean} - True if the error is a connection error (tab closed/navigated)
     */
    isTabConnectionError(error, tabId, operation) {
        if (error.message?.includes('Could not establish connection') || 
            error.message?.includes('Receiving end does not exist')) {
            console.log(`🔌 Tab ${tabId} connection lost during ${operation} (tab closed or navigated away)`);
            return true;
        } else {
            console.error(`❌ Failed to ${operation} for tab ${tabId}:`, error);
            return false;
        }
    }

}

// Initialize the background service
new BackgroundService();
