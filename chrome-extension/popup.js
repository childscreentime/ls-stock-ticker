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

    async loadData() {
        try {
            // Load recent events
            const eventsResponse = await chrome.runtime.sendMessage({ type: 'GET_RECENT_EVENTS' });
            if (eventsResponse?.events) {
                this.events = eventsResponse.events;
            }

            // Load tab status
            const statusResponse = await chrome.runtime.sendMessage({ type: 'GET_TAB_STATUS' });
            if (statusResponse?.status) {
                this.tabStatus = statusResponse.status;
            }

            // Load alert controls
            await this.loadAlertControls();

            this.render();
        } catch (error) {
            console.error('❌ Failed to load data:', error);
            this.showError('Failed to load data');
        }
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

        const html = Object.entries(this.tabStatus).map(([wkn, status]) => {
            const statusIcon = this.getStatusIcon(status.status);
            const statusClass = `status-${status.status}`;
            
            return `
                <div class="status-item ${statusClass}">
                    <div class="status-info">
                        <span class="instrument-name">${status.name}</span>
                        <span class="wkn">WKN: ${wkn}</span>
                    </div>
                    <div class="status-indicator">
                        ${statusIcon}
                        <span class="status-text">${status.status}</span>
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
            const timeStr = new Date(event.timestamp).toLocaleTimeString();
            const eventData = event.event;
            
            let eventHtml = '';
            if (eventData.kind === 'TRADE') {
                const sideIcon = eventData.side === 'buy' ? '🟢' : eventData.side === 'sell' ? '🔴' : '🟡';
                eventHtml = `
                    <div class="event-item trade">
                        <div class="event-header">
                            <span class="event-type">🔥 TRADE ${sideIcon}</span>
                            <span class="event-time">${timeStr}</span>
                        </div>
                        <div class="event-details">
                            <strong>${event.name || event.wkn}</strong><br>
                            €${eventData.price?.toFixed(2) || 'N/A'} × ${eventData.size || 'N/A'} shares
                            ${eventData.price && eventData.size ? 
                                `<br><small>Notional: €${(eventData.price * eventData.size).toLocaleString()}</small>` : 
                                ''
                            }
                        </div>
                    </div>
                `;
            } else if (eventData.kind === 'QUOTE') {
                eventHtml = `
                    <div class="event-item quote">
                        <div class="event-header">
                            <span class="event-type">📋 QUOTE</span>
                            <span class="event-time">${timeStr}</span>
                        </div>
                        <div class="event-details">
                            <strong>${event.name || event.wkn}</strong><br>
                            Bid: €${eventData.bid?.toFixed(2) || 'N/A'} | Ask: €${eventData.ask?.toFixed(2) || 'N/A'}
                            ${eventData.bid && eventData.ask ? 
                                `<br><small>Spread: €${(eventData.ask - eventData.bid).toFixed(2)}</small>` : 
                                ''
                            }
                        </div>
                    </div>
                `;
            }
            
            return eventHtml;
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
