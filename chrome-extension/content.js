// Content Script for LS Stock Ticker
// Injects LightstreamerClient script to reuse page origin
// Monitors ALL configured instruments from watchlist
// Only works on https://www.ls-tc.de/ domain and prevents duplicate injection

class LSContentScript {
    constructor() {
        this.watchlistData = null;
        this.isInjected = false;
        this.tabRole = null; // 'primary' or 'secondary'
        this.shouldConnect = false;
    }

    // Helper method for robust messaging with retry logic
    async sendMessageWithRetry(message, retryCount = 0) {
        return new Promise((resolve, reject) => {
            try {
                if (!chrome.runtime?.id) {
                    console.log('⚠️ Extension context invalidated');
                    reject(new Error('Extension context invalidated'));
                    return;
                }

                chrome.runtime.sendMessage(message, (response) => {
                    if (chrome.runtime.lastError) {
                        if (chrome.runtime.lastError.message?.includes('Extension context invalidated')) {
                            console.log('⚠️ Extension context invalidated');
                            reject(new Error('Extension context invalidated'));
                        } else if (chrome.runtime.lastError.message?.includes('receiving end does not exist')) {
                            if (retryCount < 2) {
                                console.log(`🔄 Service worker appears suspended, retrying... (attempt ${retryCount + 1})`);
                                setTimeout(() => {
                                    this.sendMessageWithRetry(message, retryCount + 1).then(resolve).catch(reject);
                                }, 500);
                                return;
                            } else {
                                console.log('🔌 Service worker unavailable after retries');
                                reject(new Error('Service worker unavailable'));
                            }
                        } else {
                            console.error('❌ Runtime error:', chrome.runtime.lastError.message || chrome.runtime.lastError);
                            reject(chrome.runtime.lastError);
                        }
                    } else {
                        resolve(response);
                    }
                });
            } catch (error) {
                console.error('❌ Failed to send message:', error.message || error);
                reject(error);
            }
        });
    }

    async init() {
        // Check if we're on the correct domain
        if (!this.isValidDomain()) {
            console.log('⚠️ LS Stock Ticker: Not on ls-tc.de domain, skipping initialization');
            return;
        }

        // Check if already injected locally on this page
        if (this.isAlreadyInjected()) {
            console.log('⚠️ LS Stock Ticker: Already injected on this page, skipping');
            return;
        }

        console.log('🔍 LS Stock Ticker content script loaded on ls-tc.de');
        
        // Check extension context validity
        if (!chrome.runtime?.id) {
            console.log('⚠️ Extension context already invalidated');
            return;
        }
        
        // Request tab role assignment from background script
        const roleAssignment = await this.requestTabRole();
        this.tabRole = roleAssignment.role;
        this.shouldConnect = roleAssignment.shouldConnect;
        
        console.log(`📋 Tab assigned role: ${this.tabRole} (shouldConnect: ${this.shouldConnect})`);
        
        // Load watchlist configuration
        await this.loadWatchlistConfig();
        
        // Inject the LightstreamerClient integration script
        await this.injectIntegrationScript();
        
        // Listen for events from the injected script
        window.addEventListener('LS_TICKER_EVENT', (event) => {
            // Only primary tab should process and forward events
            if (this.tabRole === 'primary') {
                this.handleLightstreamerEvent(event.detail);
            }
        });
        
        // Listen for secondary tab registration from injected script
        window.addEventListener('message', (event) => {
            if (event.source !== window) return;
            
            if (event.data.type === 'LS_TICKER_SECONDARY_REGISTER') {
                console.log('📱 Secondary tab requesting registration with instrument:', event.data.instrumentInfo);
                this.registerSecondaryTab(event.data.instrumentInfo);
            } else if (event.data.type === 'LS_TICKER_PRIMARY_REGISTER') {
                console.log('👑 Primary tab requesting registration with instrument:', event.data.instrumentInfo);
                this.registerPrimaryTab(event.data.instrumentInfo);
            }
        });
        
        // Listen for events from background script (for secondary tabs)
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleBackgroundMessage(message, sender, sendResponse);
        });
        
        // Monitor extension context validity
        this.monitorExtensionContext();
    }

    async hasOtherLsTcTabs() {
        try {
            // Ask background script to check for other ls-tc.de tabs
            const response = await this.sendMessageWithRetry({
                action: 'checkOtherLsTcTabs',
                currentUrl: window.location.href
            });
            
            if (response && response.hasOtherTabs) {
                console.log(`⚠️ Found ${response.otherTabsCount} other ls-tc.de tab(s)`);
                return true;
            } else {
                return false;
            }
        } catch (error) {
            console.error('❌ Failed to check other tabs:', error);
            return false; // Allow injection if we can't check
        }
    }

    async requestTabRole() {
        try {
            console.log('📋 Requesting tab role from background script...');
            
            const response = await this.sendMessageWithRetry({ action: 'requestTabRole' });
            console.log('📋 Received tab role response:', response);
            
            if (!response) {
                console.warn('⚠️ Received undefined response from background script, using fallback');
                return { role: 'primary', shouldConnect: true };
            }
            
            return response;
        } catch (error) {
            console.error('❌ Failed to request tab role:', error);
            // Use fallback role to prevent blocking
            return { role: 'primary', shouldConnect: true };
        }
    }

    handleBackgroundMessage(message, sender, sendResponse) {
        if (message.type === 'LS_EVENT_BROADCAST') {
            // Forward the event to the injected script for chart updates
            window.postMessage({
                type: 'LS_TICKER_SECONDARY_EVENT',
                data: message.eventData
            }, '*');
            sendResponse({ status: 'forwarded' });
        } else if (message.type === 'PROMOTED_TO_PRIMARY') {
            console.log('👑 Tab promoted to PRIMARY, starting LightStream connection...');
            this.tabRole = 'primary';
            this.shouldConnect = true;
            
            // Notify injected script to start connecting
            window.postMessage({
                type: 'LS_TICKER_START_CONNECTION',
                shouldConnect: true
            }, '*');
            sendResponse({ status: 'promoted' });
        }
        return true;
    }

    isValidDomain() {
        // Only allow https://www.ls-tc.de/
        const allowedDomain = 'www.ls-tc.de';
        const currentDomain = window.location.hostname;
        const isHttps = window.location.protocol === 'https:';
        
        return isHttps && currentDomain === allowedDomain;
    }

    isAlreadyInjected() {
        // Check if we've already injected our script
        const existingElement = document.getElementById('ls-watchlist-data');
        if (existingElement) {
            return true;
        }

        // Also check if there's a marker in the window object
        if (window.LS_TICKER_INJECTED) {
            return true;
        }

        return false;
    }

    monitorExtensionContext() {
        // Periodic check for extension context validity
        this.contextCheckInterval = setInterval(() => {
            if (!chrome.runtime?.id) {
                console.log('⚠️ Extension context invalidated during runtime');
                console.log('💡 Content script will stop processing events');
                clearInterval(this.contextCheckInterval);
            }
        }, 10000); // Check every 10 seconds
    }

    async loadWatchlistConfig() {
        try {
            const result = await chrome.storage.local.get(['watchlist']);
            this.watchlistData = result.watchlist || {};
            
            if (Object.keys(this.watchlistData).length === 0) {
                console.log('⚠️ No instruments configured in watchlist. Please add instruments via ISIN in the options page.');
                return;
            }

            console.log(`✅ Loaded ${Object.keys(this.watchlistData).length} instruments from watchlist:`, 
                Object.values(this.watchlistData).map(inst => `${inst.name} (${inst.isin})`));
                
        } catch (error) {
            console.error('❌ Failed to load watchlist config:', error);
        }
    }

    async injectIntegrationScript() {
        // Always inject script to monitor ALL configured instruments
        if (!this.watchlistData || Object.keys(this.watchlistData).length === 0) {
            console.log('⚠️ No watchlist data available. Skipping LightstreamerClient injection.');
            console.log('💡 Please configure instruments via ISIN in the options page.');
            return;
        }

        // Mark injection to prevent duplicates locally
        window.LS_TICKER_INJECTED = true;

        // Pass entire watchlist and role information to injected script
        const dataElement = document.createElement('div');
        dataElement.id = 'ls-watchlist-data';
        dataElement.style.display = 'none';
        dataElement.setAttribute('data-watchlist', JSON.stringify(this.watchlistData));
        dataElement.setAttribute('data-tab-role', this.tabRole);
        dataElement.setAttribute('data-should-connect', this.shouldConnect.toString());
        document.body.appendChild(dataElement);
        
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('injected.js');
        script.onload = () => {
            console.log(`✅ LightstreamerClient integration script injected on ls-tc.de (${this.tabRole.toUpperCase()} TAB)`);
            console.log(`📊 Monitoring ${Object.keys(this.watchlistData).length} instruments`);
            console.log(`🔌 Should connect to LightStream: ${this.shouldConnect}`);
            this.isInjected = true;
            script.remove();
        };
        script.onerror = () => {
            console.error('❌ Failed to inject LightstreamerClient integration script');
            // Reset injection markers on failure
            window.LS_TICKER_INJECTED = false;
        };
        
        (document.head || document.documentElement).appendChild(script);
    }

    handleLightstreamerEvent(eventData) {
        console.log('📊 Received LS event:', eventData);
        
        // Forward event to background script with the correct structure
        // eventData has structure: { type: 'TRADE'|'QUOTE', event: { actual data } }
        const enhancedEvent = {
            type: 'LS_EVENT',
            eventType: eventData.type, // TRADE or QUOTE
            event: eventData.event,    // The actual event data with wkn, price, etc.
            timestamp: Date.now()
        };

        // Send to background script with robust error handling
        this.sendToBackground(enhancedEvent);
    }

    async sendToBackground(eventData, retryCount = 0) {
        return new Promise((resolve) => {
            try {
                // Check if extension context is still valid
                if (!chrome.runtime?.id) {
                    console.log('⚠️ Extension context invalidated, skipping event send');
                    resolve();
                    return;
                }

                chrome.runtime.sendMessage(eventData, (response) => {
                    if (chrome.runtime.lastError) {
                        if (chrome.runtime.lastError.message?.includes('Extension context invalidated')) {
                            console.log('⚠️ Extension context invalidated - please reload the page after extension updates');
                        } else if (chrome.runtime.lastError.message?.includes('receiving end does not exist')) {
                            if (retryCount < 2) {
                                console.log(`🔄 Service worker appears suspended, retrying event send... (attempt ${retryCount + 1})`);
                                setTimeout(() => {
                                    this.sendToBackground(eventData, retryCount + 1).then(resolve);
                                }, 500);
                                return;
                            } else {
                                console.log('� Service worker unavailable after retries - event will be lost');
                            }
                        } else {
                            console.error('❌ Failed to send event to background:', chrome.runtime.lastError.message || chrome.runtime.lastError);
                        }
                    } else {
                        console.log('✅ Event sent to background script');
                    }
                    resolve();
                });
            } catch (error) {
                console.error('❌ Failed to send event to background:', error.message || error);
                resolve();
            }
        });
    }

    async registerSecondaryTab(instrumentInfo) {
        try {
            console.log('📱 Registering secondary tab with background script...');
            
            const response = await this.sendMessageWithRetry({
                action: 'registerSecondaryTab',
                instrumentInfo: instrumentInfo
            });
            
            if (!response) {
                console.warn('⚠️ Received undefined response from background script');
                return { status: 'unknown' };
            }
            
            console.log('✅ Secondary tab registered successfully:', response);
            return response;
        } catch (error) {
            console.error('❌ Error registering secondary tab:', error.message || error);
            throw error;
        }
    }

    async registerPrimaryTab(instrumentInfo) {
        try {
            console.log('👑 Registering primary tab with background script...');
            
            const response = await this.sendMessageWithRetry({
                action: 'registerPrimaryTab',
                instrumentInfo: instrumentInfo
            });
            
            if (!response) {
                console.warn('⚠️ Received undefined response from background script');
                return { status: 'unknown' };
            }
            
            console.log('✅ Primary tab registered successfully:', response);
            return response;
        } catch (error) {
            console.error('❌ Error registering primary tab:', error.message || error);
            throw error;
        }
    }
}

// Initialize content script when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeContentScript();
    });
} else {
    initializeContentScript();
}

async function initializeContentScript() {
    try {
        // Double-check domain before any initialization
        const allowedDomain = 'www.ls-tc.de';
        const currentDomain = window.location.hostname;
        const isHttps = window.location.protocol === 'https:';
        
        if (!isHttps || currentDomain !== allowedDomain) {
            console.log(`⚠️ LS Stock Ticker: Wrong domain (${window.location.hostname}), extension only works on https://www.ls-tc.de/`);
            return;
        }

        // Check if extension context is valid before initializing
        if (!chrome.runtime?.id) {
            console.log('⚠️ Extension context invalidated, skipping content script initialization');
            console.log('💡 Please reload the page to reinitialize the extension');
            return;
        }

        // Check for duplicate initialization in this tab
        if (window.LS_TICKER_INITIALIZED) {
            console.log('⚠️ LS Stock Ticker: Already initialized in this tab, preventing duplicate initialization');
            return;
        }

        // Mark as initialized locally
        window.LS_TICKER_INITIALIZED = true;
        
        const contentScript = new LSContentScript();
        await contentScript.init();
    } catch (error) {
        console.error('❌ Failed to initialize LS Content Script:', error);
        if (error.message?.includes('Extension context invalidated')) {
            console.log('💡 Extension was reloaded. Please refresh the page.');
        }
        // Reset initialization flag on error
        window.LS_TICKER_INITIALIZED = false;
    }
}
