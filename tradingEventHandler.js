/**
 * Trading Event Handler Module
 * Handles trade executions and quote updates with clean, formatted output
 */

class TradingEventHandler {
    constructor() {
        this.name = "TradingEventHandler";
        this.version = "1.0.0";
    }

    /**
     * Handle trade execution events
     * @param {number} tradePrice - The price at which the trade was executed
     * @param {number} tradeSize - The size/volume of the trade in shares
     * @param {string} tradeTime - The timestamp when the trade occurred
     * @param {string} direction - The trade direction: "BUY", "SELL", or "N/A"
     */
    handleTrade(tradePrice, tradeSize, tradeTime, direction) {
        const directionIcon = direction === 'BUY' ? '🟢' : direction === 'SELL' ? '🔴' : '🟡';
        const directionText = direction === 'BUY' ? 'BUY' : direction === 'SELL' ? 'SELL' : 'UNKNOWN';
        
        console.log(`[BROWSER LOG]: `);
        console.log(`[BROWSER LOG]: 🔥 TRADE EXECUTED:`);
        console.log(`[BROWSER LOG]: 💰 Price: ${tradePrice}`);
        console.log(`[BROWSER LOG]: 📊 Size: ${tradeSize} shares`);
        console.log(`[BROWSER LOG]: ⏰ Time: ${tradeTime}`);
        console.log(`[BROWSER LOG]: 🎯 Direction: ${directionText} ${directionIcon}`);
        console.log(`[BROWSER LOG]: `);
    }

    /**
     * Handle quote update events (bid/ask price changes)
     * @param {number} bid - The current bid price
     * @param {number} ask - The current ask price  
     * @param {string} time - The timestamp of the quote update
     */
    handleQuoteUpdate(bid, ask, time) {
        console.log(`[BROWSER LOG]: `);
        console.log(`[BROWSER LOG]: 📋 QUOTE UPDATE:`);
        if (bid !== null && bid !== undefined) {
            console.log(`[BROWSER LOG]: 🟢 BID: ${bid}`);
        }
        if (ask !== null && ask !== undefined) {
            console.log(`[BROWSER LOG]: 🔴 ASK: ${ask}`);
        }
        if (time) {
            console.log(`[BROWSER LOG]: ⏰ Time: ${time}`);
        }
        console.log(`[BROWSER LOG]: `);
    }

    /**
     * Handle market summary information
     * @param {object} summary - Market summary data
     */
    handleMarketSummary(summary) {
        if (summary.spread !== undefined) {
            console.log(`[BROWSER LOG]: 📈 Spread: ${summary.spread}`);
        }
        if (summary.midPrice !== undefined) {
            console.log(`[BROWSER LOG]: 📊 Mid Price: ${summary.midPrice}`);
        }
    }

    /**
     * Log debug information (can be toggled on/off)
     * @param {string} message - Debug message
     * @param {boolean} enabled - Whether debug logging is enabled
     */
    debug(message, enabled = false) {
        if (enabled) {
            console.log(`[DEBUG]: ${message}`);
        }
    }
}

// Export for Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TradingEventHandler;
}

// Make available in browser environments
if (typeof window !== 'undefined') {
    window.TradingEventHandler = TradingEventHandler;
}
