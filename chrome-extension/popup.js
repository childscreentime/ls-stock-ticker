// Popup script for LS Stock Ticker Extension

class PopupController {
    constructor() {
        this.events = [];
        this.tabStatus = {};
        this.alertControls = {};
        this.connectionStatus = 'connecting'; // connecting, connected, disconnected
        
        this.init();
    }

    updateConnectionStatus(status, text = null) {
        this.connectionStatus = status;
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.className = `connection-status ${status}`;
            
            const indicator = statusElement.querySelector('.status-indicator');
            const textElement = statusElement.querySelector('.status-text');
            
            switch (status) {
                case 'connected':
                    if (indicator) indicator.textContent = '🟢';
                    if (textElement) textElement.textContent = text || 'Connected';
                    break;
                case 'connecting':
                    if (indicator) indicator.textContent = '🟡';
                    if (textElement) textElement.textContent = text || 'Connecting...';
                    break;
                case 'disconnected':
                    if (indicator) indicator.textContent = '🔴';
                    if (textElement) textElement.textContent = text || 'Disconnected';
                    break;
            }
        }
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
            this.forceRefresh();
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

    async forceRefresh() {
        console.log('🔄 Force refresh requested - resetting connection status...');
        
        const refreshBtn = document.getElementById('refreshBtn');
        refreshBtn.style.animation = 'spin 1s linear';
        refreshBtn.disabled = true;
        
        // Reset connection status
        this.updateConnectionStatus('connecting', 'Force refreshing...');
        
        try {
            // Clear any cached state
            this.events = [];
            this.tabStatus = {};
            this.alertControls = {};
            
            // Force reload everything
            await this.loadData();
            console.log('✅ Force refresh completed successfully');
        } catch (error) {
            console.error('❌ Force refresh failed:', error);
            this.updateConnectionStatus('disconnected', 'Refresh failed');
        } finally {
            refreshBtn.disabled = false;
            setTimeout(() => {
                refreshBtn.style.animation = '';
            }, 1000);
        }
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
            container.innerHTML = '<div class="empty">No recent events</div>';
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
            await this.sendMessageWithRetry({
                type: 'TOGGLE_ALERTS',
                wkn: wkn,
                enabled: enabled
            });
            
            this.alertControls[wkn].enabled = enabled;
            console.log(`🔔 Alerts ${enabled ? 'enabled' : 'disabled'} for ${wkn}`);
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

    async checkBackgroundHealth() {
        try {
            this.updateConnectionStatus('connecting', 'Checking...');
            const response = await chrome.runtime.sendMessage({ type: 'HEALTH_CHECK' });
            const isHealthy = response && response.status === 'ok';
            
            if (isHealthy) {
                this.updateConnectionStatus('connected', 'Connected');
            } else {
                this.updateConnectionStatus('disconnected', 'No response');
            }
            
            return isHealthy;
        } catch (error) {
            console.warn('🏥 Background script health check failed:', error.message);
            this.updateConnectionStatus('disconnected', 'Failed');
            return false;
        }
    }

    async sendMessageWithRetry(message, maxRetries = 3, delay = 500) {
        // First, check if the background script is responsive
        if (message.type !== 'HEALTH_CHECK') {
            const isHealthy = await this.checkBackgroundHealth();
            if (!isHealthy) {
                console.warn('⚠️ Background script appears unresponsive, attempting message anyway...');
            }
        }

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this.updateConnectionStatus('connecting', `Attempt ${attempt}/${maxRetries}...`);
                console.log(`🔄 Sending message (attempt ${attempt}/${maxRetries}):`, message);
                const response = await chrome.runtime.sendMessage(message);
                console.log('✅ Message sent successfully:', response);
                
                // Update connection status on success
                this.updateConnectionStatus('connected', 'Connected');
                return response;
            } catch (error) {
                console.warn(`⚠️ Message attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ All message attempts failed');
                    this.updateConnectionStatus('disconnected', 'Failed');
                    throw new Error(`Background script unreachable after ${maxRetries} attempts: ${error.message}`);
                }
                
                // Update status for retry
                this.updateConnectionStatus('connecting', `Retrying... (${attempt + 1}/${maxRetries})`);
                
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            }
        }
    }

    async loadData() {
        try {
            console.log('🔄 Loading popup data...');
            this.updateConnectionStatus('connecting', 'Loading data...');
            
            // Load recent trades and quotes
            console.log('📋 Requesting recent events...');
            const eventsResponse = await this.sendMessageWithRetry({ type: 'GET_RECENT_EVENTS' });
            console.log('📋 Events response:', eventsResponse);
            
            if (eventsResponse?.trades) {
                this.events = eventsResponse.trades; // Only trades for recent events
                console.log(`📋 Loaded ${this.events.length} trade events`);
            } else {
                console.warn('⚠️ No trades in response or invalid response');
                this.events = [];
            }

            // Load tab status
            console.log('📊 Requesting tab status...');
            const statusResponse = await this.sendMessageWithRetry({ type: 'GET_TAB_STATUS' });
            console.log('📊 Status response:', statusResponse);
            
            if (statusResponse?.error) {
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
            this.updateConnectionStatus('connected', 'Ready');
            this.render();
        } catch (error) {
            console.error('❌ Failed to load data:', error);
            this.updateConnectionStatus('disconnected', 'Error');
            this.showError(`Failed to load data: ${error.message}`);
            
            // Show minimal UI even when background script is unreachable
            this.renderFallbackUI();
        }
    }

    renderFallbackUI() {
        console.log('🎨 Rendering fallback UI due to connection failure...');
        
        // Show empty states for all sections
        const tabStatusElement = document.getElementById('tabStatus');
        if (tabStatusElement) {
            tabStatusElement.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">📡</div>
                    <div class="error-message">Background script unreachable</div>
                    <div class="error-hint">Try reloading the extension</div>
                </div>
            `;
        }
        
        const alertControlsElement = document.getElementById('alertControls');
        if (alertControlsElement) {
            alertControlsElement.innerHTML = `
                <div class="error-state">
                    <div class="error-message">Alert controls unavailable</div>
                </div>
            `;
        }
        
        const eventsListElement = document.getElementById('eventsList');
        if (eventsListElement) {
            eventsListElement.innerHTML = `
                <div class="error-state">
                    <div class="error-message">Event history unavailable</div>
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
        if (message.includes('Receiving end does not exist')) {
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
