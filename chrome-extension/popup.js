// Popup script for LS Stock Ticker Extension

class PopupController {
    constructor() {
        this.events = [];
        this.quotes = {};
        this.tabStatus = {};
        this.alertControls = {};
        
        this.init();
    }

    async init() {
        console.log('🔧 Initializing popup...');
        
        // Bind event listeners
        this.bindEvents();
        
        // Load initial data
        await this.loadData();
        
        // Set up auto-refresh
        setInterval(() => this.refreshData(), 5000);
    }

    bindEvents() {
        document.getElementById('optionsBtn').addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
        });

        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshData();
        });

        document.getElementById('clearEventsBtn').addEventListener('click', () => {
            this.clearEvents();
        });
    }

    async loadAlertControls() {
        try {
            const result = await chrome.storage.local.get(['watchlist', 'alertRules']);
            const watchlist = result.watchlist || {};
            const alertRules = result.alertRules || {};

            this.alertControls = {};
            for (const [wkn, instrument] of Object.entries(watchlist)) {
                this.alertControls[wkn] = {
                    name: instrument.name,
                    enabled: alertRules[wkn]?.enabled || false
                };
            }
        } catch (error) {
            console.error('❌ Failed to load alert controls:', error);
        }
    }

    async refreshData() {
        const refreshBtn = document.getElementById('refreshBtn');
        refreshBtn.style.animation = 'spin 1s linear';
        
        await this.loadData();
        
        setTimeout(() => {
            refreshBtn.style.animation = '';
        }, 1000);
    }

    render() {
        this.renderTabStatus();
        this.renderAlertControls();
        this.renderEvents();
        this.renderFooter();
    }

    renderTabStatus() {
        const container = document.getElementById('tabStatus');
        
        if (Object.keys(this.tabStatus).length === 0) {
            container.innerHTML = '<div class="empty">No instruments configured</div>';
            return;
        }

        // Separate summary from instrument data
        const debug = this.tabStatus._debug;
        const instruments = Object.fromEntries(
            Object.entries(this.tabStatus).filter(([key]) => !key.startsWith('_'))
        );

        let html = '';
        

        // Show instrument status
        html += Object.entries(instruments).map(([wkn, status]) => {
            const statusIcon = this.getStatusIcon(status.status);
            const statusClass = `status-${status.status}`;
            const roleIcon = this.getRoleIcon(status.role);
            const roleText = status.role ? ` (${status.role})` : '';
            
            // Format latest quote if available
            let quoteHtml = '';
            if (status.latestQuote) {
                const quote = status.latestQuote;
                const timeStr = new Date(quote.timestamp).toLocaleTimeString();
                const priceFormatted = quote.price ? `€${parseFloat(quote.price).toFixed(4)}` : 'N/A';
                quoteHtml = `<div class="latest-quote">Latest: ${priceFormatted} (${timeStr})</div>`;
            }
            
            return `
                <div class="status-item ${statusClass}">
                    <div class="status-info">
                        <span class="instrument-name">${status.name}</span>
                        <span class="wkn">WKN: ${wkn}</span>
                        ${quoteHtml}
                    </div>
                    <div class="status-indicator">
                        ${roleIcon}${statusIcon}
                        <span class="status-text">${status.status}${roleText}</span>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    renderAlertControls() {
        const container = document.getElementById('alertControls');
        
        if (Object.keys(this.alertControls).length === 0) {
            container.innerHTML = '<div class="empty">No alerts configured</div>';
            return;
        }

        const html = Object.entries(this.alertControls).map(([wkn, control]) => `
            <div class="alert-control">
                <div class="control-info">
                    <span class="instrument-name">${control.name}</span>
                    <span class="wkn">WKN: ${wkn}</span>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" data-wkn="${wkn}" ${control.enabled ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
        `).join('');

        container.innerHTML = html;

        // Bind toggle events
        container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.toggleAlerts(e.target.dataset.wkn, e.target.checked);
            });
        });
    }

    renderEvents() {
        const container = document.getElementById('eventsList');
        
        if (this.events.length === 0) {
            container.innerHTML = '<div class="empty">No recent trades available<br><small>Trades will appear here when the primary tab receives LightStreamer events</small></div>';
            return;
        }

        const html = this.events.slice(-20).reverse().map(event => {
            try {
                const timeStr = new Date(event.timestamp).toLocaleTimeString();
                
                // Handle both old nested structure and new flattened structure
                const eventData = event.event || event; // Fallback to event itself if no nested .event
                const eventType = event.type || eventData.kind; // Use .type or fallback to .kind
                
                console.log('🔍 Rendering event:', { event, eventData, eventType });
                
                // Validate we have minimum required data
                if (!eventData || (!eventType && !eventData.kind)) {
                    console.warn('⚠️ Invalid event data:', event);
                    return `
                        <div class="event-item error">
                            <div class="event-header">
                                <span class="event-type">❌ INVALID EVENT</span>
                                <span class="event-time">${timeStr}</span>
                            </div>
                            <div class="event-details">
                                <small>Invalid event data structure</small>
                            </div>
                        </div>
                    `;
                }
                
                let eventHtml = '';
                if (eventType === 'TRADE' || eventData.kind === 'TRADE') {
                const sideIcon = eventData.side === 'buy' ? '🟢' : eventData.side === 'sell' ? '🔴' : '🟡';
                eventHtml = `
                    <div class="event-item trade">
                        <div class="event-header">
                            <span class="event-type">🔥 TRADE ${sideIcon}</span>
                            <span class="event-time">${timeStr}</span>
                        </div>
                        <div class="event-details">
                            <strong>${eventData.name || eventData.wkn || 'Unknown Instrument'}</strong><br>
                            €${eventData.price?.toFixed(2) || 'N/A'} × ${eventData.size || 'N/A'} shares
                            ${eventData.price && eventData.size ? 
                                `<br><small>Notional: €${(eventData.price * eventData.size).toLocaleString()}</small>` : 
                                ''
                            }
                        </div>
                    </div>
                `;
            } else if (eventType === 'QUOTE' || eventData.kind === 'QUOTE') {
                eventHtml = `
                    <div class="event-item quote">
                        <div class="event-header">
                            <span class="event-type">📋 QUOTE</span>
                            <span class="event-time">${timeStr}</span>
                        </div>
                        <div class="event-details">
                            <strong>${eventData.name || eventData.wkn || 'Unknown Instrument'}</strong><br>
                            Bid: €${eventData.bid?.toFixed(2) || 'N/A'} | Ask: €${eventData.ask?.toFixed(2) || 'N/A'}
                            ${eventData.bid && eventData.ask ? 
                                `<br><small>Spread: €${(eventData.ask - eventData.bid).toFixed(2)}</small>` : 
                                ''
                            }
                        </div>
                    </div>
                `;
            } else {
                // Unknown event type
                eventHtml = `
                    <div class="event-item unknown">
                        <div class="event-header">
                            <span class="event-type">❓ UNKNOWN</span>
                            <span class="event-time">${timeStr}</span>
                        </div>
                        <div class="event-details">
                            <strong>Unknown event type: ${eventType || 'N/A'}</strong><br>
                            <small>${JSON.stringify(eventData, null, 2)}</small>
                        </div>
                    </div>
                `;
            }
            
            return eventHtml;
            } catch (error) {
                console.error('❌ Error rendering event:', error, event);
                return `
                    <div class="event-item error">
                        <div class="event-header">
                            <span class="event-type">❌ ERROR</span>
                            <span class="event-time">${new Date().toLocaleTimeString()}</span>
                        </div>
                        <div class="event-details">
                            <small>Error rendering event: ${error.message}</small>
                        </div>
                    </div>
                `;
            }
        }).join('');

        container.innerHTML = html;
    }

    renderFooter() {
        const eventCount = document.getElementById('eventCount');
        const lastUpdate = document.getElementById('lastUpdate');
        
        eventCount.textContent = `${this.events.length} events`;
        
        if (this.events.length > 0) {
            const lastEvent = this.events[this.events.length - 1];
            lastUpdate.textContent = `Last: ${new Date(lastEvent.timestamp).toLocaleTimeString()}`;
        } else {
            lastUpdate.textContent = 'No events';
        }
    }

    async toggleAlerts(wkn, enabled) {
        try {
            const response = await this.sendMessage({
                type: 'TOGGLE_ALERTS',
                wkn: wkn,
                enabled: enabled
            });
            
            if (response !== null) {
                this.alertControls[wkn].enabled = enabled;
                console.log(`🔔 Alerts ${enabled ? 'enabled' : 'disabled'} for ${wkn}`);
            } else {
                console.warn('⚠️ Unable to toggle alerts - service worker unavailable');
                this.showError('Unable to update alerts - extension service unavailable');
            }
        } catch (error) {
            console.error('❌ Failed to toggle alerts:', error);
            this.showError('Failed to update alerts');
        }
    }

    clearEvents() {
        this.events = [];
        this.renderEvents();
        this.renderFooter();
    }

    getStatusIcon(status) {
        switch (status) {
            case 'active': return '🟢';
            case 'discarded': return '🟡';
            case 'missing': return '🔴';
            default: return '⚫';
        }
    }

    getRoleIcon(role) {
        switch (role) {
            case 'primary': return '👑';
            case 'secondary': return '📱';
            default: return '';
        }
    }

    async sendMessage(message, retryCount = 0) {
        try {
            const response = await chrome.runtime.sendMessage(message);
            return response;
        } catch (error) {
            if (error.message?.includes('receiving end does not exist')) {
                if (retryCount < 2) {
                    // Service worker might be suspended, try to wake it up
                    console.log(`🔄 Service worker appears suspended, retrying... (attempt ${retryCount + 1})`);
                    
                    // Show temporary status on first retry
                    if (retryCount === 0) {
                        const existingErrors = document.querySelectorAll('.error-message');
                        existingErrors.forEach(error => error.remove());
                        
                        const statusDiv = document.createElement('div');
                        statusDiv.className = 'error-message temp-status';
                        statusDiv.style.cssText = `
                            background-color: #fff3cd;
                            border: 1px solid #ffeaa7;
                            border-radius: 4px;
                            padding: 8px;
                            margin: 8px 0;
                            color: #856404;
                            font-size: 12px;
                            line-height: 1.4;
                        `;
                        statusDiv.innerHTML = `⏳ <strong>Waking up extension service...</strong><br><small>This may take a moment</small>`;
                        document.body.insertBefore(statusDiv, document.body.firstChild);
                        
                        // Remove status message after retry
                        setTimeout(() => statusDiv.remove(), 2000);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
                    return this.sendMessage(message, retryCount + 1);
                } else {
                    // Max retries reached
                    console.warn('🔌 Service worker unavailable after retries - popup will show cached data');
                    this.showError('Extension service temporarily unavailable');
                    return null;
                }
            } else if (error.message?.includes('Extension context invalidated')) {
                console.warn('⚠️ Extension context invalidated');
                this.showError('Extension needs to be reloaded');
                return null;
            } else {
                console.error('❌ Failed to send message:', error.message);
                throw error;
            }
        }
    }

    async loadData() {
        try {
            console.log('🔄 Loading popup data...');
            
            // Wake up service worker with a health check first
            let serviceWorkerAvailable = true;
            try {
                const healthResponse = await this.sendMessage({ type: 'HEALTH_CHECK' });
                if (healthResponse === null) {
                    serviceWorkerAvailable = false;
                    console.log('🔌 Service worker unavailable - using cached/fallback data');
                } else {
                    console.log('💓 Service worker is awake');
                }
            } catch (error) {
                serviceWorkerAvailable = false;
                console.log('� Service worker wake-up failed - using cached/fallback data');
            }
            
            if (!serviceWorkerAvailable) {
                // Skip background communication and show fallback UI
                this.events = [];
                this.quotes = {};
                this.tabStatus = {};
                console.log('📋 Using fallback data due to service worker unavailability');
                this.render();
                return;
            }
            
            // Load recent trades and quotes
            const eventsResponse = await this.sendMessage({ type: 'GET_RECENT_EVENTS' });
            if (eventsResponse?.trades) {
                this.events = eventsResponse.trades;
                console.log(`📋 Loaded ${this.events.length} trade events`);
            } else if (eventsResponse === null) {
                // Service worker communication failed
                this.events = [];
                console.log('📋 Unable to load trade events - service worker unavailable');
            } else {
                this.events = [];
                console.log('📋 No trade events available');
            }
            
            // Store quotes for display
            if (eventsResponse?.quotes) {
                this.quotes = eventsResponse.quotes;
                console.log(`💰 Loaded ${Object.keys(this.quotes).length} latest quotes`);
            } else if (eventsResponse === null) {
                // Service worker communication failed
                this.quotes = {};
                console.log('💰 Unable to load quotes - service worker unavailable');
            } else {
                this.quotes = {};
                console.log('💰 No quotes available');
            }

            // Load tab status
            const statusResponse = await this.sendMessage({ type: 'GET_TAB_STATUS' });
            if (statusResponse === null) {
                // Service worker communication failed
                console.warn('⚠️ Unable to load tab status - service worker unavailable');
                this.tabStatus = {};
            } else if (statusResponse?.error) {
                console.error('❌ Background script error:', statusResponse.error);
                this.tabStatus = {};
            } else if (statusResponse?.status) {
                this.tabStatus = statusResponse.status;
                console.log(`📊 Loaded tab status with ${Object.keys(this.tabStatus).length} entries`);
            } else {
                console.warn('⚠️ No status in response or invalid response');
                this.tabStatus = {};
            }

            // Load alert controls
            console.log('🔔 Loading alert controls...');
            await this.loadAlertControls();

            console.log('✅ All data loaded successfully');
            this.render();
        } catch (error) {
            // Don't show error for service worker communication issues - those are handled in sendMessage
            if (!error.message?.includes('Could not establish connection') && 
                !error.message?.includes('receiving end does not exist')) {
                console.error('❌ Failed to load data:', error);
                this.showError(`Failed to load data: ${error.message}`);
            } else {
                console.log('🔌 Data loading failed due to service worker unavailability - showing cached/fallback data');
            }
            
            // Show minimal UI even when background script is unreachable
            this.renderFallbackUI();
        }
    }

    renderFallbackUI() {
        console.log('🎨 Rendering fallback UI due to service worker unavailability...');
        
        // Show informative states for all sections
        const tabStatusElement = document.getElementById('tabStatus');
        if (tabStatusElement) {
            tabStatusElement.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">⏸️</div>
                    <div class="error-message">Extension service paused</div>
                    <div class="error-hint">Chrome has temporarily suspended the background service to save memory.<br>Data will refresh when you visit stock pages.</div>
                </div>
            `;
        }
        
        const alertControlsElement = document.getElementById('alertControls');
        if (alertControlsElement) {
            alertControlsElement.innerHTML = `
                <div class="error-state">
                    <div class="error-message">Alert controls temporarily unavailable</div>
                    <div class="error-hint">Controls will be available when the service resumes</div>
                </div>
            `;
        }
        
        const eventsListElement = document.getElementById('eventsList');
        if (eventsListElement) {
            eventsListElement.innerHTML = `
                <div class="error-state">
                    <div class="error-message">Trade history temporarily unavailable</div>
                    <div class="error-hint">Recent trades will appear when the service resumes</div>
                </div>
            `;
        }
        
        this.renderFooter();
    }

    showError(message) {
        console.error('💢 Showing error:', message);
        
        // Remove any existing error messages
        const existingErrors = document.querySelectorAll('.error-message');
        existingErrors.forEach(error => error.remove());
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.cssText = `
            background-color: #fee;
            border: 1px solid #fcc;
            border-radius: 4px;
            padding: 8px;
            margin: 8px 0;
            color: #c33;
            font-size: 12px;
            line-height: 1.4;
        `;
        
        // Show connection-specific error messages
        if (message.includes('service temporarily unavailable')) {
            errorDiv.innerHTML = `
                <strong>⏸️ Extension Service Paused</strong><br>
                Chrome has temporarily paused the extension background service.<br>
                This is normal behavior to save memory.<br>
                <br>
                The popup will show cached data. Fresh data will load when you<br>
                interact with stock pages or reopen this popup.
            `;
        } else if (message.includes('Receiving end does not exist')) {
            errorDiv.innerHTML = `
                <strong>🔗 Connection Error</strong><br>
                The background script is not responding. This can happen when:<br>
                • The extension was recently updated or reloaded<br>
                • Chrome is managing extension resources<br>
                <br>
                Try: Close and reopen this popup, or reload the extension.
            `;
        } else if (message.includes('unreachable')) {
            errorDiv.innerHTML = `
                <strong>📡 Background Script Unreachable</strong><br>
                Unable to communicate with the extension background process.<br>
                Please reload the extension or restart Chrome.
            `;
        } else {
            errorDiv.textContent = message;
        }
        
        document.body.insertBefore(errorDiv, document.body.firstChild);
        
        // Auto-remove after longer time for connection errors
        const timeout = message.includes('Connection') || message.includes('unreachable') ? 8000 : 3000;
        setTimeout(() => {
            errorDiv.remove();
        }, timeout);
    }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});
