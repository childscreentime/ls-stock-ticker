// Options page script for LS Stock Ticker Extension

import { StockConfig } from './utils/config.js';
import { WebhookManager } from './utils/webhooks.js';

class OptionsController {
    constructor() {
        this.config = new StockConfig();
        this.webhookManager = new WebhookManager();
        this.watchlist = {};
        this.alertRules = {};
        this.webhookConfig = {};
        
        this.init();
    }

    async init() {
        console.log('⚙️ Initializing options page...');
        
        // Bind event listeners
        this.bindEvents();
        
        // Load current configuration
        await this.loadConfiguration();
        
        // Render the interface
        this.render();
    }

    bindEvents() {
        // Add instrument
        document.getElementById('addInstrumentBtn').addEventListener('click', () => {
            this.addInstrument();
        });

        document.getElementById('isinInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addInstrument();
            }
        });

        // Webhook configuration
        document.getElementById('webhookType').addEventListener('change', (e) => {
            this.updateWebhookFields(e.target.value);
        });

        document.getElementById('testWebhookBtn').addEventListener('click', () => {
            this.testWebhook();
        });

        // Save and reset
        document.getElementById('saveBtn').addEventListener('click', () => {
            this.saveConfiguration();
        });

        document.getElementById('resetBtn').addEventListener('click', () => {
            this.resetConfiguration();
        });
    }

    async loadConfiguration() {
        try {
            this.watchlist = await this.config.getWatchlist();
            this.alertRules = await this.config.getAlertRules();
            this.webhookConfig = await this.config.getWebhookConfig();
            
            console.log('✅ Configuration loaded');
        } catch (error) {
            console.error('❌ Failed to load configuration:', error);
            this.showStatus('saveStatus', 'Failed to load configuration', 'error');
        }
    }

    render() {
        this.renderWatchlist();
        this.renderAlertRules();
        this.renderWebhookConfig();
    }

    renderWatchlist() {
        const tbody = document.getElementById('watchlistBody');
        
        if (Object.keys(this.watchlist).length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty">No instruments configured</td></tr>';
            return;
        }

        const html = Object.entries(this.watchlist).map(([wkn, instrument]) => `
            <tr data-wkn="${wkn}">
                <td><strong>${wkn}</strong></td>
                <td>${instrument.name}</td>
                <td>${instrument.isin || 'N/A'}</td>
                <td>${instrument.id}</td>
                <td>
                    <button class="btn btn-small btn-danger" onclick="optionsController.removeInstrument('${wkn}')">
                        Remove
                    </button>
                </td>
            </tr>
        `).join('');

        tbody.innerHTML = html;
    }

    renderAlertRules() {
        const container = document.getElementById('alertRulesContainer');
        
        if (Object.keys(this.watchlist).length === 0) {
            container.innerHTML = '<div class="empty">Configure instruments first to set up alerts</div>';
            return;
        }

        const html = Object.entries(this.watchlist).map(([wkn, instrument]) => {
            const rules = this.alertRules[wkn] || {};
            
            return `
                <div class="alert-rule-card" data-wkn="${wkn}">
                    <h3>${instrument.name} <span class="wkn">(${wkn})</span></h3>
                    
                    <div class="rule-section">
                        <label>
                            <input type="checkbox" class="rule-enabled" ${rules.enabled ? 'checked' : ''}>
                            Enable alerts for this instrument
                        </label>
                    </div>

                    <div class="rule-section">
                        <h4>Trade Alerts</h4>
                        <div class="form-row">
                            <label>
                                <input type="checkbox" class="trade-alerts" ${rules.notifications?.trades ? 'checked' : ''}>
                                Enable trade notifications
                            </label>
                        </div>
                        <div class="form-row">
                            <label for="volumeThreshold-${wkn}">Volume threshold (shares):</label>
                            <input type="number" id="volumeThreshold-${wkn}" class="volume-threshold" 
                                   value="${rules.volumeThreshold || ''}" placeholder="100" step="10">
                        </div>
                        <div class="form-row">
                            <label>
                                <input type="checkbox" class="aggressive-trades" ${rules.highlightAggressive ? 'checked' : ''}>
                                Highlight aggressive trades
                            </label>
                        </div>
                    </div>

                    <div class="rule-section">
                        <h4>Quote Alerts</h4>
                        <div class="form-row">
                            <label>
                                <input type="checkbox" class="quote-alerts" ${rules.notifications?.quotes ? 'checked' : ''}>
                                Enable quote notifications
                            </label>
                        </div>
                    </div>

                    <div class="rule-section">
                        <h4>Price Thresholds</h4>
                        <div class="form-row">
                            <label>
                                <input type="checkbox" class="threshold-alerts" ${rules.notifications?.thresholds ? 'checked' : ''}>
                                Enable threshold notifications
                            </label>
                        </div>
                        <div class="form-row">
                            <label for="upperThreshold-${wkn}">Upper threshold (EUR):</label>
                            <input type="number" id="upperThreshold-${wkn}" class="upper-threshold" 
                                   value="${rules.priceThresholds?.upper || ''}" placeholder="200.00" step="0.01">
                        </div>
                        <div class="form-row">
                            <label for="lowerThreshold-${wkn}">Lower threshold (EUR):</label>
                            <input type="number" id="lowerThreshold-${wkn}" class="lower-threshold" 
                                   value="${rules.priceThresholds?.lower || ''}" placeholder="100.00" step="0.01">
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    renderWebhookConfig() {
        document.getElementById('webhookEnabled').checked = this.webhookConfig.enabled || false;
        document.getElementById('webhookType').value = this.webhookConfig.type || 'generic';
        document.getElementById('webhookUrl').value = this.webhookConfig.url || '';
        document.getElementById('webhookToken').value = this.webhookConfig.token || '';
        document.getElementById('tradeChannel').value = this.webhookConfig.channels?.trades || '';
        document.getElementById('alertChannel').value = this.webhookConfig.channels?.alerts || '';

        this.updateWebhookFields(this.webhookConfig.type || 'generic');
    }

    updateWebhookFields(type) {
        const tokenField = document.querySelector('.webhook-token');
        const channelsField = document.querySelector('.webhook-channels');
        
        if (type === 'discord' || type === 'telegram') {
            tokenField.style.display = 'block';
            channelsField.style.display = type === 'telegram' ? 'block' : 'none';
        } else {
            tokenField.style.display = 'none';
            channelsField.style.display = 'none';
        }
    }

    async addInstrument() {
        const isinInput = document.getElementById('isinInput');
        const isin = isinInput.value.trim().toUpperCase();
        
        if (!isin) {
            this.showStatus('addInstrumentStatus', 'Please enter an ISIN', 'error');
            return;
        }

        this.showStatus('addInstrumentStatus', 'Looking up instrument...', 'info');
        
        try {
            const instrument = await this.config.lookupInstrumentByIsin(isin);
            
            if (instrument) {
                this.watchlist[instrument.wkn] = instrument;
                
                // Initialize default alert rules
                this.alertRules[instrument.wkn] = {
                    enabled: true,
                    highlightAggressive: true,
                    volumeThreshold: 100,
                    priceThresholds: { upper: null, lower: null },
                    notifications: { trades: true, quotes: false, thresholds: true }
                };
                
                isinInput.value = '';
                this.render();
                this.showStatus('addInstrumentStatus', `Added ${instrument.name}`, 'success');
            } else {
                this.showStatus('addInstrumentStatus', 'Instrument not found', 'error');
            }
        } catch (error) {
            console.error('❌ Failed to add instrument:', error);
            this.showStatus('addInstrumentStatus', 'Failed to lookup instrument', 'error');
        }
    }

    removeInstrument(wkn) {
        if (confirm(`Remove ${this.watchlist[wkn]?.name || wkn} from watchlist?`)) {
            delete this.watchlist[wkn];
            delete this.alertRules[wkn];
            this.render();
        }
    }

    async testWebhook() {
        const webhookConfig = this.collectWebhookConfig();
        
        if (!webhookConfig.enabled || !webhookConfig.url) {
            this.showStatus('webhookStatus', 'Configure webhook URL first', 'error');
            return;
        }

        this.showStatus('webhookStatus', 'Testing webhook...', 'info');
        
        try {
            const result = await this.webhookManager.testWebhook(webhookConfig);
            
            if (result.success) {
                this.showStatus('webhookStatus', 'Webhook test successful!', 'success');
            } else {
                this.showStatus('webhookStatus', `Webhook test failed: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showStatus('webhookStatus', 'Webhook test failed', 'error');
        }
    }

    collectWebhookConfig() {
        return {
            enabled: document.getElementById('webhookEnabled').checked,
            type: document.getElementById('webhookType').value,
            url: document.getElementById('webhookUrl').value,
            token: document.getElementById('webhookToken').value,
            channels: {
                trades: document.getElementById('tradeChannel').value,
                alerts: document.getElementById('alertChannel').value
            }
        };
    }

    collectAlertRules() {
        const rules = {};
        
        document.querySelectorAll('.alert-rule-card').forEach(card => {
            const wkn = card.dataset.wkn;
            
            rules[wkn] = {
                enabled: card.querySelector('.rule-enabled').checked,
                highlightAggressive: card.querySelector('.aggressive-trades').checked,
                volumeThreshold: parseInt(card.querySelector('.volume-threshold').value) || null,
                priceThresholds: {
                    upper: parseFloat(card.querySelector('.upper-threshold').value) || null,
                    lower: parseFloat(card.querySelector('.lower-threshold').value) || null
                },
                notifications: {
                    trades: card.querySelector('.trade-alerts').checked,
                    quotes: card.querySelector('.quote-alerts').checked,
                    thresholds: card.querySelector('.threshold-alerts').checked
                }
            };
        });
        
        return rules;
    }

    async saveConfiguration() {
        this.showStatus('saveStatus', 'Saving configuration...', 'info');
        
        try {
            // Collect alert rules from form
            this.alertRules = this.collectAlertRules();
            this.webhookConfig = this.collectWebhookConfig();
            
            // Save to storage
            await this.config.setWatchlist(this.watchlist);
            await this.config.setAlertRules(this.alertRules);
            await this.config.setWebhookConfig(this.webhookConfig);
            
            this.showStatus('saveStatus', 'Configuration saved successfully!', 'success');
            
            // Notify background script to refresh tabs
            chrome.runtime.sendMessage({ type: 'CONFIG_UPDATED' });
            
        } catch (error) {
            console.error('❌ Failed to save configuration:', error);
            this.showStatus('saveStatus', 'Failed to save configuration', 'error');
        }
    }

    async resetConfiguration() {
        if (confirm('Reset all configuration to defaults? This cannot be undone.')) {
            try {
                await chrome.storage.local.clear();
                await this.config.initializeDefaults();
                await this.loadConfiguration();
                this.render();
                this.showStatus('saveStatus', 'Configuration reset to defaults', 'success');
            } catch (error) {
                console.error('❌ Failed to reset configuration:', error);
                this.showStatus('saveStatus', 'Failed to reset configuration', 'error');
            }
        }
    }

    showStatus(elementId, message, type) {
        const element = document.getElementById(elementId);
        element.textContent = message;
        element.className = `status-message ${type}`;
        
        // Clear status after 5 seconds
        setTimeout(() => {
            element.textContent = '';
            element.className = 'status-message';
        }, 5000);
    }
}

// Initialize options controller
const optionsController = new OptionsController();

// Make it globally available for onclick handlers
window.optionsController = optionsController;
