// Webhook Manager for LS Stock Ticker Extension

export class WebhookManager {
    constructor() {
        this.rateLimits = new Map(); // URL -> { lastSent, count }
        this.maxRequestsPerMinute = 30;
    }

    async sendEvent(event, config) {
        if (!config.enabled || !config.url) {
            return false;
        }

        // Check rate limits
        if (!this.checkRateLimit(config.url)) {
            console.warn('🚫 Webhook rate limit exceeded');
            return false;
        }

        try {
            const payload = this.formatPayload(event, config);
            const response = await this.sendWebhook(config, payload);
            
            console.log('📤 Webhook sent successfully:', response.status);
            return true;
        } catch (error) {
            console.error('❌ Webhook failed:', error);
            return false;
        }
    }

    formatPayload(event, config) {
        const basePayload = {
            timestamp: new Date().toISOString(),
            wkn: event.wkn,
            instrument: event.name,
            item: event.item,
            event: event.event
        };

        switch (config.type) {
            case 'discord':
                return this.formatDiscordPayload(basePayload, event, config);
            case 'telegram':
                return this.formatTelegramPayload(basePayload, event, config);
            default:
                return basePayload;
        }
    }

    formatDiscordPayload(basePayload, event, config) {
        const { kind, price, size, bid, ask, side } = event.event;
        
        let color = 0x808080; // Gray default
        let title = `📊 ${event.name || event.wkn}`;
        let description = '';

        if (kind === 'TRADE') {
            color = side === 'buy' ? 0x00ff00 : side === 'sell' ? 0xff0000 : 0xffff00;
            title = `🔥 Trade: ${event.name || event.wkn}`;
            description = `**Price:** €${price?.toFixed(2) || 'N/A'}\n**Size:** ${size || 'N/A'} shares\n**Side:** ${side || 'Unknown'}`;
            
            if (size && price) {
                const notional = price * size;
                description += `\n**Notional:** €${notional.toLocaleString()}`;
            }
        } else if (kind === 'QUOTE') {
            color = 0x0099ff;
            title = `📋 Quote: ${event.name || event.wkn}`;
            description = `**Bid:** €${bid?.toFixed(2) || 'N/A'}\n**Ask:** €${ask?.toFixed(2) || 'N/A'}`;
            
            if (bid && ask) {
                const spread = ask - bid;
                const spreadPercent = (spread / bid) * 100;
                description += `\n**Spread:** €${spread.toFixed(2)} (${spreadPercent.toFixed(2)}%)`;
            }
        }

        return {
            embeds: [{
                title: title,
                description: description,
                color: color,
                timestamp: basePayload.timestamp,
                footer: {
                    text: `WKN: ${event.wkn} | Item: ${event.item}`
                }
            }]
        };
    }

    formatTelegramPayload(basePayload, event, config) {
        const { kind, price, size, bid, ask, side } = event.event;
        
        let text = `📊 *${event.name || event.wkn}*\n`;
        
        if (kind === 'TRADE') {
            const sideEmoji = side === 'buy' ? '🟢' : side === 'sell' ? '🔴' : '🟡';
            text += `🔥 *Trade Executed* ${sideEmoji}\n`;
            text += `💰 Price: €${price?.toFixed(2) || 'N/A'}\n`;
            text += `📊 Size: ${size || 'N/A'} shares\n`;
            
            if (size && price) {
                const notional = price * size;
                text += `💵 Notional: €${notional.toLocaleString()}\n`;
            }
        } else if (kind === 'QUOTE') {
            text += `📋 *Quote Update*\n`;
            text += `🟢 Bid: €${bid?.toFixed(2) || 'N/A'}\n`;
            text += `🔴 Ask: €${ask?.toFixed(2) || 'N/A'}\n`;
            
            if (bid && ask) {
                const spread = ask - bid;
                const spreadPercent = (spread / bid) * 100;
                text += `📏 Spread: €${spread.toFixed(2)} (${spreadPercent.toFixed(2)}%)\n`;
            }
        }
        
        text += `\n🏷️ WKN: \`${event.wkn}\``;
        text += `\n⏰ ${new Date().toLocaleTimeString()}`;

        return {
            text: text,
            parse_mode: 'Markdown'
        };
    }

    async sendWebhook(config, payload) {
        let url = config.url;
        let options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        };

        // Add authentication for different platforms
        if (config.type === 'telegram' && config.token) {
            url = `https://api.telegram.org/bot${config.token}/sendMessage`;
            payload.chat_id = config.channels.trades || config.channels.alerts;
            options.body = JSON.stringify(payload);
        } else if (config.type === 'discord' && config.token) {
            options.headers['Authorization'] = `Bot ${config.token}`;
        }

        const response = await fetch(url, options);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return response;
    }

    checkRateLimit(url) {
        const now = Date.now();
        const limit = this.rateLimits.get(url);
        
        if (!limit) {
            this.rateLimits.set(url, { lastSent: now, count: 1 });
            return true;
        }
        
        // Reset counter if more than a minute has passed
        if (now - limit.lastSent > 60000) {
            this.rateLimits.set(url, { lastSent: now, count: 1 });
            return true;
        }
        
        // Check if under rate limit
        if (limit.count < this.maxRequestsPerMinute) {
            limit.count++;
            limit.lastSent = now;
            return true;
        }
        
        return false;
    }

    clearRateLimits() {
        this.rateLimits.clear();
    }

    // Test webhook connectivity
    async testWebhook(config) {
        const testPayload = this.formatPayload({
            wkn: 'TEST',
            name: 'Test Instrument',
            item: 'test@1',
            event: {
                kind: 'TRADE',
                price: 100.00,
                size: 10,
                side: 'buy',
                ts: Date.now()
            }
        }, config);

        try {
            const response = await this.sendWebhook(config, testPayload);
            return { success: true, status: response.status };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}
