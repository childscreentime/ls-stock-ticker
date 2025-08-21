// Content Script for LS Stock Ticker
// Injects LightstreamerClient integration and extracts page context

class LSContentScript {
    constructor() {
        this.wkn = null;
        this.instrumentName = null;
        this.instrumentId = null;
        this.item = null;
        
        this.init();
    }

    async init() {
        console.log('🔍 LS Stock Ticker content script loaded');
        
        // Check extension context validity
        if (!chrome.runtime?.id) {
            console.log('⚠️ Extension context already invalidated');
            return;
        }
        
        // Extract instrument info from page
        this.extractInstrumentInfo();
        
        // Inject the LightstreamerClient integration script
        this.injectIntegrationScript();
        
        // Listen for events from the injected script
        window.addEventListener('LS_TICKER_EVENT', (event) => {
            this.handleLightstreamerEvent(event.detail);
        });
        
        // Monitor extension context validity
        this.monitorExtensionContext();
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

    extractInstrumentInfo() {
        // Extract instrument ID from URL path (e.g., /de/aktie/43763)
        const pathMatch = window.location.pathname.match(/\/aktie\/(\d+)/);
        if (pathMatch) {
            this.instrumentId = pathMatch[1];
            this.item = `${this.instrumentId}@1`;
        }

        // Try to extract instrument name from page title or content
        this.instrumentName = document.title;
        
        const nameSelectors = [
            'h1',
            '.instrument-name', 
            '.security-name',
            '[data-instrument-name]',
            '.stock-name',
            '.quote-header h1'
        ];
        
        for (const selector of nameSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
                this.instrumentName = element.textContent.trim();
                break;
            }
        }

        // Try to extract WKN from page content
        const wknSelectors = [
            '[data-wkn]',
            '.wkn',
            '[title*="WKN"]',
            '.instrument-details .wkn'
        ];
        
        for (const selector of wknSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                this.wkn = element.getAttribute('data-wkn') || 
                          element.textContent.match(/WKN[:\s]*([A-Z0-9]+)/i)?.[1];
                if (this.wkn) break;
            }
        }

        // Alternative: extract from meta tags
        if (!this.wkn) {
            const metaWkn = document.querySelector('meta[name="wkn"], meta[property="wkn"]');
            if (metaWkn) {
                this.wkn = metaWkn.getAttribute('content');
            }
        }

        // Try to extract WKN from page text as fallback
        if (!this.wkn) {
            const bodyText = document.body.textContent;
            const wknMatch = bodyText.match(/WKN[:\s]*([A-Z0-9]{6})/i);
            if (wknMatch) {
                this.wkn = wknMatch[1];
            }
        }

        console.log('📋 Extracted instrument info:', {
            id: this.instrumentId,
            wkn: this.wkn,
            name: this.instrumentName,
            item: this.item,
            url: window.location.href
        });
    }

    injectIntegrationScript() {
        // Store instrument info for the injected script to access
        const instrumentInfo = {
            id: this.instrumentId,
            wkn: this.wkn,
            name: this.instrumentName,
            item: this.item,
            url: window.location.href
        };
        
        // Pass instrument info to page context via DOM element data attribute
        // This avoids CSP issues with inline scripts
        const dataElement = document.createElement('div');
        dataElement.id = 'ls-instrument-data';
        dataElement.style.display = 'none';
        dataElement.setAttribute('data-instrument', JSON.stringify(instrumentInfo));
        document.body.appendChild(dataElement);
        
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('injected.js');
        script.onload = () => {
            console.log('✅ LightstreamerClient integration script injected');
            script.remove();
        };
        script.onerror = () => {
            console.error('❌ Failed to inject LightstreamerClient integration script');
        };
        
        (document.head || document.documentElement).appendChild(script);
    }

    handleLightstreamerEvent(eventData) {
        console.log('📊 Received LS event:', eventData);
        
        // Enhance event with page context
        const enhancedEvent = {
            type: 'LS_EVENT',
            wkn: this.wkn || this.instrumentId, // Use WKN if available, fallback to ID
            name: this.instrumentName,
            item: this.item,
            event: eventData.event,
            url: window.location.href,
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

function initializeContentScript() {
    try {
        // Check if extension context is valid before initializing
        if (!chrome.runtime?.id) {
            console.log('⚠️ Extension context invalidated, skipping content script initialization');
            console.log('💡 Please reload the page to reinitialize the extension');
            return;
        }
        
        new LSContentScript();
    } catch (error) {
        console.error('❌ Failed to initialize LS Content Script:', error);
        if (error.message?.includes('Extension context invalidated')) {
            console.log('💡 Extension was reloaded. Please refresh the page.');
        }
    }
}
