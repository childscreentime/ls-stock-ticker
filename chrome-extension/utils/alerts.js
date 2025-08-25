// Alert Manager for LS Stock Ticker Extension

export class AlertManager {
    constructor() {
        this.lastAlerts = new Map(); // Prevent spam
        this.alertCooldown = 60000; // 1 minute cooldown per alert type
    }

    evaluateEvent(event, rules) {
        const alerts = [];
        const now = Date.now();
        
        if (!rules.enabled) {
            return alerts;
        }

        // Trade alerts - check for trade events
        if (event.kind === 'TRADE' && rules.notifications.trades) {
            const tradeAlerts = this.evaluateTradeEvent(event, rules);
            alerts.push(...tradeAlerts);
        }

        // Quote alerts - check for quote events  
        if (event.kind === 'QUOTE' && rules.notifications.quotes) {
            const quoteAlerts = this.evaluateQuoteEvent(event, rules);
            alerts.push(...quoteAlerts);
        }

        // Threshold alerts
        if (rules.notifications.thresholds) {
            const thresholdAlerts = this.evaluateThresholds(event, rules);
            alerts.push(...thresholdAlerts);
        }

        // Filter alerts by cooldown
        return alerts.filter(alert => this.checkCooldown(alert, now));
    }

    evaluateTradeEvent(event, rules) {
        const alerts = [];
        const { price, size, side } = event; // Event data is now directly accessible
        
        if (!price || !size) return alerts;

        // Calculate notional value (assuming EUR)
        const notionalValue = price * size;
        
        // Large trade alert
        if (rules.minNotionalEUR && notionalValue >= rules.minNotionalEUR) {
            alerts.push({
                type: 'large_trade',
                wkn: event.wkn,
                instrumentName: event.name,
                message: `Large trade: ${size} shares at €${price.toFixed(2)} (€${notionalValue.toLocaleString()})`,
                priority: 2,
                data: { price, size, notionalValue, side }
            });
        }

        // Aggressive trade alert
        if (rules.highlightAggressive && (side === 'buy' || side === 'sell')) {
            alerts.push({
                type: 'aggressive_trade',
                wkn: event.wkn,
                instrumentName: event.name,
                message: `${side.toUpperCase()} trade: ${size} shares at €${price.toFixed(2)}`,
                priority: 1,
                data: { price, size, side }
            });
        }

        // Volume threshold alert
        if (rules.volumeThreshold && size >= rules.volumeThreshold) {
            alerts.push({
                type: 'volume_threshold',
                wkn: event.wkn,
                instrumentName: event.name,
                message: `High volume trade: ${size} shares (threshold: ${rules.volumeThreshold})`,
                priority: 1,
                data: { price, size, threshold: rules.volumeThreshold }
            });
        }

        return alerts;
    }

    evaluateQuoteEvent(event, rules) {
        const alerts = [];
        const { bid, ask } = event; // Event data is now directly accessible
        
        // Spread analysis
        if (bid && ask) {
            const spread = ask - bid;
            const spreadPercent = (spread / bid) * 100;
            
            // Wide spread alert (configurable threshold)
            if (spreadPercent > 1.0) { // 1% spread
                alerts.push({
                    type: 'wide_spread',
                    wkn: event.wkn,
                    instrumentName: event.name,
                    message: `Wide spread: ${spreadPercent.toFixed(2)}% (€${bid.toFixed(2)} - €${ask.toFixed(2)})`,
                    priority: 0,
                    data: { bid, ask, spread, spreadPercent }
                });
            }
        }

        return alerts;
    }

    evaluateThresholds(event, rules) {
        const alerts = [];
        const { price, bid, ask } = event; // Event data is now directly accessible
        
        // Use trade price or mid-price for threshold checks
        const checkPrice = price || (bid && ask ? (bid + ask) / 2 : bid || ask);
        
        if (!checkPrice || !rules.priceThresholds) return alerts;

        // Upper threshold
        if (rules.priceThresholds.upper && checkPrice >= rules.priceThresholds.upper) {
            alerts.push({
                type: 'price_upper_threshold',
                wkn: event.wkn,
                instrumentName: event.name,
                message: `Price above threshold: €${checkPrice.toFixed(2)} >= €${rules.priceThresholds.upper}`,
                priority: 2,
                data: { price: checkPrice, threshold: rules.priceThresholds.upper }
            });
        }

        // Lower threshold
        if (rules.priceThresholds.lower && checkPrice <= rules.priceThresholds.lower) {
            alerts.push({
                type: 'price_lower_threshold',
                wkn: event.wkn,
                instrumentName: event.name,
                message: `Price below threshold: €${checkPrice.toFixed(2)} <= €${rules.priceThresholds.lower}`,
                priority: 2,
                data: { price: checkPrice, threshold: rules.priceThresholds.lower }
            });
        }

        return alerts;
    }

    checkCooldown(alert, now) {
        const alertKey = `${alert.wkn}_${alert.type}`;
        const lastAlert = this.lastAlerts.get(alertKey);
        
        if (lastAlert && (now - lastAlert) < this.alertCooldown) {
            return false; // Still in cooldown
        }
        
        this.lastAlerts.set(alertKey, now);
        return true;
    }

    // Utility methods for alert management
    setCooldown(alertType, wkn, cooldownMs) {
        const alertKey = `${wkn}_${alertType}`;
        this.lastAlerts.set(alertKey, Date.now() + cooldownMs);
    }

    clearCooldowns() {
        this.lastAlerts.clear();
    }

    getCooldownStatus(alertType, wkn) {
        const alertKey = `${wkn}_${alertType}`;
        const lastAlert = this.lastAlerts.get(alertKey);
        
        if (!lastAlert) return { active: false, remaining: 0 };
        
        const remaining = Math.max(0, this.alertCooldown - (Date.now() - lastAlert));
        return {
            active: remaining > 0,
            remaining: remaining
        };
    }
}
