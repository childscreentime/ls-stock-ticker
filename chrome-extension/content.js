// Content Script for LS Stock Ticker
// Injects LightstreamerClient script to reuse page origin
// Monitors ALL configured instruments from watchlist
// Only works on https://www.ls-tc.de/ domain and prevents duplicate injection

class LSContentScript {
    constructor() {
        this.watchlistData = null;
        this.isInjected = false;
    }

    async init() {
        // Check if we're on the correct domain
        if (!this.isValidDomain()) {
            console.log('⚠️ LS Stock Ticker: Not on ls-tc.de domain, skipping initialization');
            return;
        }

        // Check if already injected globally (check if other ls-tc.de tabs exist)
        if (await this.hasOtherLsTcTabs()) {
            console.log('⚠️ LS Stock Ticker: Another ls-tc.de tab is already open, skipping this tab');
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
        
        // Load watchlist configuration
        await this.loadWatchlistConfig();
        
        // Inject the LightstreamerClient integration script
        await this.injectIntegrationScript();
        
        // Listen for events from the injected script
        window.addEventListener('LS_TICKER_EVENT', (event) => {
            this.handleLightstreamerEvent(event.detail);
        });
        
        // Monitor extension context validity
        this.monitorExtensionContext();
    }

    async hasOtherLsTcTabs() {
        try {
            // Ask background script to check for other ls-tc.de tabs
            const response = await chrome.runtime.sendMessage({
                action: 'checkOtherLsTcTabs',
                currentUrl: window.location.href
            });
            
            if (response && response.hasOtherTabs) {
                console.log(`⚠️ Found ${response.otherTabsCount} other ls-tc.de tab(s)`);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('❌ Failed to check other tabs:', error);
            return false; // Allow injection if we can't check
        }
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

        // Pass entire watchlist to injected script for monitoring all instruments
        const dataElement = document.createElement('div');
        dataElement.id = 'ls-watchlist-data';
        dataElement.style.display = 'none';
        dataElement.setAttribute('data-watchlist', JSON.stringify(this.watchlistData));
        document.body.appendChild(dataElement);
        
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('injected.js');
        script.onload = () => {
            console.log('✅ LightstreamerClient integration script injected on ls-tc.de (PRIMARY TAB)');
            console.log(`📊 Monitoring ${Object.keys(this.watchlistData).length} instruments`);
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
        
        // Forward event to background script with minimal processing
        const enhancedEvent = {
            type: 'LS_EVENT',
            event: eventData.event,
            timestamp: Date.now()
        };

        // Send to background script with robust error handling
        this.sendToBackground(enhancedEvent);
    }

    async sendToBackground(eventData) {
        try {
            // Check if extension context is still valid
            if (!chrome.runtime?.id) {
                console.log('⚠️ Extension context invalidated, skipping event send');
                return;
            }

            await chrome.runtime.sendMessage(eventData);
            console.log('✅ Event sent to background script');
        } catch (error) {
            if (error.message?.includes('Extension context invalidated') || 
                error.message?.includes('receiving end does not exist')) {
                console.log('⚠️ Extension context invalidated or background script unavailable');
                console.log('💡 Please reload the page after extension updates');
            } else {
                console.error('❌ Failed to send event to background:', error);
            }
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
