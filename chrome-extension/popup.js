// Popup script for LS Stock Ticker Extension

class PopupController {
    constructor() {
        this.events = [];
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
        const summary = this.tabStatus._summary;
        const instruments = Object.fromEntries(
            Object.entries(this.tabStatus).filter(([key]) => !key.startsWith('_'))
        );

        let html = '';
        
        // Show summary information if available
        if (summary) {
            html += `
                <div class="tab-summary">
                    <div class="summary-item">
                        <span class="label">Primary Tab:</span>
                        <span class="value">${summary.primaryTabId ? `#${summary.primaryTabId}` : 'None'}</span>
                    </div>
                    <div class="summary-item">
                        <span class="label">Secondary Tabs:</span>
                        <span class="value">${summary.secondaryTabCount || 0}</span>
                    </div>
                    <div class="summary-item">
                        <span class="label">Total LS Tabs:</span>
                        <span class="value">${summary.totalLsTabs || 0}</span>
                    </div>
                </div>
            `;
        }

        // Show instrument status
        html += Object.entries(instruments).map(([wkn, status]) => {
            const statusIcon = this.getStatusIcon(status.status);
            const statusClass = `status-${status.status}`;
            const roleIcon = this.getRoleIcon(status.role);
            const roleText = status.role ? ` (${status.role})` : '';
            
            return `
                <div class="status-item ${statusClass}">
                    <div class="status-info">
                        <span class="instrument-name">${status.name}</span>
                        <span class="wkn">WKN: ${wkn}</span>
                        ${status.tabId ? `<span class="tab-id">Tab: #${status.tabId}</span>` : ''}
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
            await chrome.runtime.sendMessage({
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

    async loadData() {
        try {
            console.log('🔄 Loading popup data...');
            
            // Load recent events
            console.log('📋 Requesting recent events...');
            const eventsResponse = await chrome.runtime.sendMessage({ type: 'GET_RECENT_EVENTS' });
            console.log('📋 Events response:', eventsResponse);
            
            if (eventsResponse?.events) {
                this.events = eventsResponse.events;
                console.log(`📋 Loaded ${this.events.length} events`);
            } else {
                console.warn('⚠️ No events in response or invalid response');
                this.events = [];
            }

            // Load tab status
            console.log('📊 Requesting tab status...');
            const statusResponse = await chrome.runtime.sendMessage({ type: 'GET_TAB_STATUS' });
            console.log('📊 Status response:', statusResponse);
            
            if (statusResponse?.error) {
                console.error('❌ Background script error:', statusResponse.error);
                this.tabStatus = {};
            } else if (statusResponse?.status) {
                this.tabStatus = statusResponse.status;
                console.log('📊 Tab status loaded:', this.tabStatus);
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
            console.error('❌ Failed to load data:', error);
            this.showError(`Failed to load data: ${error.message}`);
        }
    }

    showError(message) {
        // Simple error display - could be enhanced with a notification system
        console.error(message);
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        
        document.body.insertBefore(errorDiv, document.body.firstChild);
        
        setTimeout(() => {
            errorDiv.remove();
        }, 3000);
    }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});
