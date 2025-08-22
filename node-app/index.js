const puppeteer = require('puppeteer');
const TradingEventHandler = require('./tradingEventHandler');

// Use built-in fetch for Node.js 18+ or import node-fetch
const fetch = global.fetch || require('node-fetch');

// Mock jQuery with numberFormat and dateFormat functions
const mockJQuery = {
    each: function(obj, callback) {
        if (Array.isArray(obj)) {
            obj.forEach((item, index) => callback(index, item));
        } else if (obj && typeof obj === 'object') {
            Object.keys(obj).forEach(key => callback(key, obj[key]));
        }
    },
    inArray: function(elem, arr) {
        return arr.indexOf(elem);
    },
    numberFormat: function(number, decimals, decPoint, thousandsSep, showSign) {
        if (number === null || number === undefined || isNaN(number)) return "-";
        
        const num = parseFloat(number);
        const dec = decimals || 0;
        const dp = decPoint || '.';
        const ts = thousandsSep || ',';
        
        const sign = showSign && num > 0 ? '+' : '';
        const formatted = Math.abs(num).toFixed(dec);
        const parts = formatted.split('.');
        
        // Add thousands separator
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ts);
        
        return sign + (num < 0 ? '-' : '') + parts.join(dp);
    },
    dateFormat: function(format, timestamp) {
        const date = new Date(timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
        
        if (format === "%H:%M:%S.%L") {
            return `${hours}:${minutes}:${seconds},${milliseconds}`;
        } else if (format === "%H:%M:%S") {
            return `${hours}:${minutes}:${seconds}`;
        } else if (format === "%Y%m%d") {
            return date.getFullYear().toString() + 
                   (date.getMonth() + 1).toString().padStart(2, '0') + 
                   date.getDate().toString().padStart(2, '0');
        } else if (format === "%d.%m. %H:%M:%S.%L") {
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            return `${day}.${month}. ${hours}:${minutes}:${seconds},${milliseconds}`;
        }
        return date.toString();
    }
};

// Configuration: List of ISINs to watch (International Securities Identification Numbers)
const ISIN_WATCHLIST = [
    'US67066G1040',  // NVIDIA CORP.
    // Add more ISINs here:
    // 'US0378331005',  // Apple Inc.
    // 'US88160R1014',  // Tesla Inc.
    // 'US02079K3059',  // Alphabet Inc. (Google)
];

// Function to fetch instrument data from ls-tc.de API
async function fetchInstrumentData(isin) {
    try {
        console.log(`🔍 Fetching instrument data for ISIN: ${isin}`);
        const response = await fetch(`https://www.ls-tc.de/_rpc/json/.lstc/instrument/search/main?q=${isin}&localeId=2`);
        const data = await response.json();
        
        if (data && data.length > 0) {
            const instrument = data[0]; // Take the first result
            const instrumentInfo = {
                isin: isin,
                id: instrument.instrumentId.toString(),
                name: instrument.displayname,
                wkn: instrument.wkn,
                symbol: instrument.symbol
            };
            console.log(`✅ Found: ${instrumentInfo.name} (ID: ${instrumentInfo.id}, WKN: ${instrumentInfo.wkn})`);
            return instrumentInfo;
        } else {
            console.error(`❌ No instrument found for ISIN: ${isin}`);
            return null;
        }
    } catch (error) {
        console.error(`❌ Error fetching instrument data for ISIN ${isin}:`, error.message);
        return null;
    }
}

// Function to build stock watchlist from ISINs
async function buildStockWatchlist(isinList) {
    console.log('🏗️ Building stock watchlist from ISINs...');
    const stockWatchlist = {};
    
    for (const isin of isinList) {
        const instrumentData = await fetchInstrumentData(isin);
        if (instrumentData) {
            stockWatchlist[instrumentData.wkn] = {
                id: instrumentData.id,
                name: instrumentData.name,
                isin: instrumentData.isin,
                symbol: instrumentData.symbol
            };
        }
    }
    
    return stockWatchlist;
}

async function main() {
    console.log('🚀 Starting Multi-Stock Lightstreamer Logger...');
    console.log(`📋 ISINs to watch: ${ISIN_WATCHLIST.join(', ')}`);
    
    // Build stock watchlist dynamically from ISINs
    const STOCK_WATCHLIST = await buildStockWatchlist(ISIN_WATCHLIST);
    
    const watchedStocks = Object.keys(STOCK_WATCHLIST);
    const stockNames = Object.values(STOCK_WATCHLIST).map(s => s.name).join(', ');
    
    if (watchedStocks.length === 0) {
        console.error('❌ No valid instruments found. Please check your ISINs.');
        return;
    }
    
    console.log(`📊 Successfully configured ${watchedStocks.length} stock(s): ${stockNames}`);
    console.log('📋 Stock mappings:');
    Object.entries(STOCK_WATCHLIST).forEach(([wkn, stock]) => {
        console.log(`   📈 ${stock.isin} -> WKN ${wkn} -> ${stock.id}@1 (${stock.name})`);
    });

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Listen to console logs from the browser
    page.on('console', (msg) => {
        if (msg.text().includes('[BROWSER LOG]:')) {
            console.log(msg.text());
        }
    });

    console.log('🌐 Loading stock page...');
    await page.goto('https://www.ls-tc.de/', { waitUntil: 'networkidle2' });

    console.log('⏳ Waiting for page to fully load and establish connections...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('📊 Setting up Multi-Stock Lightstreamer Logger...');

    // Read the TradingEventHandler code to inject into browser
    const fs = require('fs');
    const path = require('path');
    const tradingEventHandlerCode = fs.readFileSync(path.join(__dirname, 'tradingEventHandler.js'), 'utf8');

    // Debug configuration
    const DEBUG_MODE = process.env.DEBUG === 'true' || false; // Set to true to enable debug logging

    await page.evaluate((stockWatchlist, TradingEventHandlerCode, debugMode) => {
        // Debug logging helper
        function debugLog(message) {
            if (debugMode) {
                console.log(`[BROWSER LOG]: ${message}`);
            }
        }
        
        debugLog('📊 Setting up Lightstreamer-Push Logger...');
        
        // Initialize the TradingEventHandler in browser context
        eval(TradingEventHandlerCode);
        const tradingHandler = new TradingEventHandler();
        
        // Check if LightstreamerClient exists
        if (typeof LightstreamerClient === 'undefined') {
            debugLog('❌ LightstreamerClient not found!');
            return;
        }
        
        debugLog('✅ LightstreamerClient found!');
        
        // Get the existing client - try multiple ways to find it
        let client = window.lsClient || window.lightstreamerClient || window.client;
        
        // If not found, try to find it in the global scope
        if (!client) {
            // Look for any LightstreamerClient instances
            const possibleClients = Object.keys(window).filter(key => 
                window[key] && 
                typeof window[key] === 'object' && 
                window[key].constructor && 
                window[key].constructor.name === 'LightstreamerClient'
            );
            
            if (possibleClients.length > 0) {
                client = window[possibleClients[0]];
                debugLog(`🔍 Found client via: ${possibleClients[0]}`);
            }
        }
        
        // If still not found, create a new client
        if (!client) {
            debugLog('🔧 Creating new LightstreamerClient...');
            client = new LightstreamerClient("https://push.ls-tc.de:443", "WALLSTREETONLINE");
        }
        
        debugLog(`🔗 Connected to: https://push.ls-tc.de:443`);
        debugLog(`🔗 Adapter: WALLSTREETONLINE`);
        
        // Add connection status listener for monitoring
        if (client.addListener) {
            client.addListener({
                onStatusChange: function(status) {
                    debugLog(`📊 Connection status changed: ${status}`);
                    
                    // Handle connection loss
                    if (status.includes('DISCONNECTED') && !status.includes('WILL-RETRY')) {
                        debugLog('⚠️ Connection lost, attempting to reconnect...');
                        setTimeout(() => {
                            if (client.connect) client.connect();
                        }, 2000);
                    }
                },
                onServerError: function(errorCode, errorMessage) {
                    debugLog(`❌ Server error: ${errorCode} - ${errorMessage}`);
                }
            });
        }
        
        // Wait for client to be connected
        function waitForConnection() {
            const status = client.getStatus ? client.getStatus() : 'UNKNOWN';
            debugLog(`📊 Client status: ${status}`);
            
            if (status.includes('CONNECTED') && (status.includes('STREAMING') || status.includes('POLLING'))) {
                debugLog('🎉 Connected! Setting up subscriptions...');
                try {
                    setupLightstreamerPush();
                    debugLog('✅ Subscription setup completed successfully!');
                } catch (error) {
                    debugLog(`❌ Error during subscription setup: ${error.message}`);
                    debugLog(`❌ Error stack: ${error.stack}`);
                }
            } else if (status === 'DISCONNECTED') {
                debugLog('🔄 Client disconnected, connecting...');
                if (client.connect) client.connect();
                setTimeout(waitForConnection, 1000);
            } else if (status.includes('DISCONNECTED:WILL-RETRY')) {
                debugLog('⏳ Client will retry connection...');
                setTimeout(waitForConnection, 2000);
            } else if (status.includes('DISCONNECTED:TRYING-RECOVERY')) {
                debugLog('🔄 Client trying to recover connection...');
                setTimeout(waitForConnection, 2000);
            } else if (status.includes('STALLED')) {
                debugLog('⚠️ Connection stalled, forcing reconnect...');
                if (client.disconnect) client.disconnect();
                setTimeout(() => {
                    if (client.connect) client.connect();
                }, 1000);
                setTimeout(waitForConnection, 3000);
            } else {
                debugLog(`⏳ Waiting for connection... Status: ${status}`);
                setTimeout(waitForConnection, 1000);
            }
        }
        
        function setupLightstreamerPush() {
            // Load our modified lightstreamer-push logic
            const mockJQuery = {
                each: function(obj, callback) {
                    if (Array.isArray(obj)) {
                        obj.forEach((item, index) => callback(index, item));
                    } else if (obj && typeof obj === 'object') {
                        Object.keys(obj).forEach(key => callback(key, obj[key]));
                    }
                },
                inArray: function(elem, arr) {
                    return arr.indexOf(elem);
                },
                numberFormat: function(number, decimals, decPoint, thousandsSep, showSign) {
                    if (number === null || number === undefined || isNaN(number)) return "-";
                    
                    const num = parseFloat(number);
                    const dec = decimals || 0;
                    const dp = decPoint || '.';
                    const ts = thousandsSep || ',';
                    
                    const sign = showSign && num > 0 ? '+' : '';
                    const formatted = Math.abs(num).toFixed(dec);
                    const parts = formatted.split('.');
                    
                    // Add thousands separator
                    parts[0] = parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ts);
                    
                    return sign + (num < 0 ? '-' : '') + parts.join(dp);
                },
                dateFormat: function(format, timestamp) {
                    const date = new Date(timestamp);
                    const hours = date.getHours().toString().padStart(2, '0');
                    const minutes = date.getMinutes().toString().padStart(2, '0');
                    const seconds = date.getSeconds().toString().padStart(2, '0');
                    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
                    
                    if (format === "%H:%M:%S.%L") {
                        return `${hours}:${minutes}:${seconds},${milliseconds}`;
                    } else if (format === "%H:%M:%S") {
                        return `${hours}:${minutes}:${seconds}`;
                    } else if (format === "%Y%m%d") {
                        return date.getFullYear().toString() + 
                               (date.getMonth() + 1).toString().padStart(2, '0') + 
                               date.getDate().toString().padStart(2, '0');
                    } else if (format === "%d.%m. %H:%M:%S.%L") {
                        const day = date.getDate().toString().padStart(2, '0');
                        const month = (date.getMonth() + 1).toString().padStart(2, '0');
                        return `${day}.${month}. ${hours}:${minutes}:${seconds},${milliseconds}`;
                    }
                    return date.toString();
                }
            };
            
            // Mock the localeconv object
            window.localeconv = {
                decimal_point: '.',
                thousands_sep: ','
            };
            
            // Mock Date.parse to handle the timezone format
            const originalDateParse = Date.parse;
            Date.parse = function(dateString) {
                if (typeof dateString === 'string' && dateString.includes('+00:00')) {
                    return originalDateParse(dateString);
                }
                return originalDateParse(dateString);
            };
            
            // Initialize price tracking dictionary and trade history management
            const priceDict = {}; // { timestamp: { bid: value, ask: value } }
            let lastAnalyzedTradeTimestamp = null; // Track last processed trade timestamp
            let lastKnownBidAsk = { bid: null, ask: null }; // Keep last known bid/ask for reference
            
            // Heartbeat mechanism to detect when data stops flowing
            let lastDataReceived = Date.now();
            let heartbeatInterval;
            
            function startHeartbeat() {
                if (heartbeatInterval) clearInterval(heartbeatInterval);
                
                heartbeatInterval = setInterval(() => {
                    const timeSinceLastData = Date.now() - lastDataReceived;
                    const minutes = Math.floor(timeSinceLastData / 60000);
                    
                    if (timeSinceLastData > 300000) { // 5 minutes
                        checkMarketStatus(); // Check if this is expected
                        debugLog(`⚠️ No data received for ${minutes} minutes. Connection may be stale.`);
                        
                        // Try to reconnect after 5 minutes of no data
                        if (timeSinceLastData > 300000) {
                            debugLog('🔄 Forcing reconnection due to stale data...');
                            if (client.disconnect) client.disconnect();
                            setTimeout(() => {
                                if (client.connect) client.connect();
                            }, 2000);
                        }
                    }
                }, 60000); // Check every minute
            }
            
            function updateHeartbeat() {
                lastDataReceived = Date.now();
            }
            
            // Check if we're in market hours (rough approximation for European markets)
            function isMarketHours() {
                const now = new Date();
                const hour = now.getHours();
                const day = now.getDay(); // 0 = Sunday, 6 = Saturday
                
                // Skip weekends
                if (day === 0 || day === 6) return false;
                
                // European market hours (roughly 8:00 - 18:00 CET)
                return hour >= 8 && hour <= 18;
            }
            
            function checkMarketStatus() {
                if (!isMarketHours()) {
                    debugLog('ℹ️ Outside market hours - reduced data flow is normal');
                }
            }
            
            // Function to clean up old price history after trade analysis
            function cleanPriceHistory(afterTimestamp) {
                const timestamps = Object.keys(priceDict);
                let removedCount = 0;
                
                for (const ts of timestamps) {
                    if (ts <= afterTimestamp) {
                        // Keep the last known bid/ask before removing
                        if (priceDict[ts].bid) lastKnownBidAsk.bid = priceDict[ts].bid;
                        if (priceDict[ts].ask) lastKnownBidAsk.ask = priceDict[ts].ask;
                        
                        delete priceDict[ts];
                        removedCount++;
                    }
                }
                
                if (removedCount > 0) {
                    debugLog(`🧹 CLEANED: Removed ${removedCount} old price records after ${afterTimestamp}`);
                    debugLog(`🧹 KEPT: Last known BID ${lastKnownBidAsk.bid}, ASK ${lastKnownBidAsk.ask}`);
                    debugLog(`🧹 REMAINING: ${Object.keys(priceDict).length} active price records`);
                }
            }
            
            // Function to determine if a price was a buy or sell before given timestamp
            function getBuyOrSellBefore(price, timestamp) {
                const sortedTimestamps = Object.keys(priceDict).sort().reverse(); // Latest first
                
                debugLog(`🔍 ANALYZING: Trade ${price} at ${timestamp}`);
                debugLog(`🔍 SEARCHING: ${sortedTimestamps.length} price records + last known bid/ask`);
                
                // Check all historical price data before the trade timestamp
                for (const ts of sortedTimestamps) {
                    if (ts < timestamp) {
                        const priceData = priceDict[ts];
                        
                        debugLog(`🔍 CHECKING: Trade ${price} vs BID ${priceData.bid} ASK ${priceData.ask} at ${ts}`);
                        
                        // Check if price matches ask (BUY - someone bought at ask price)
                        if (priceData.ask && Math.abs(priceData.ask - price) < 0.0001) {
                            debugLog(`🔍 MATCH: Trade ${price} matched ASK ${priceData.ask} at ${ts} → BUY`);
                            
                            // Update last analyzed trade timestamp and clean history
                            lastAnalyzedTradeTimestamp = timestamp;
                            cleanPriceHistory(ts);
                            
                            return "BUY";
                        }
                        
                        // Check if price matches bid (SELL - someone sold at bid price)
                        if (priceData.bid && Math.abs(priceData.bid - price) < 0.0001) {
                            debugLog(`🔍 MATCH: Trade ${price} matched BID ${priceData.bid} at ${ts} → SELL`);
                            
                            // Update last analyzed trade timestamp and clean history
                            lastAnalyzedTradeTimestamp = timestamp;
                            cleanPriceHistory(ts);
                            
                            return "SELL";
                        }
                    }
                }
                
                // Also check against last known bid/ask if no match found in active records
                if (lastKnownBidAsk.ask && Math.abs(lastKnownBidAsk.ask - price) < 0.0001) {
                    debugLog(`🔍 MATCH: Trade ${price} matched LAST KNOWN ASK ${lastKnownBidAsk.ask} → BUY`);
                    lastAnalyzedTradeTimestamp = timestamp;
                    return "BUY";
                }
                
                if (lastKnownBidAsk.bid && Math.abs(lastKnownBidAsk.bid - price) < 0.0001) {
                    debugLog(`🔍 MATCH: Trade ${price} matched LAST KNOWN BID ${lastKnownBidAsk.bid} → SELL`);
                    lastAnalyzedTradeTimestamp = timestamp;
                    return "SELL";
                }
                
                debugLog(`🔍 NO MATCH: Trade ${price} at ${timestamp} - no matching bid/ask found`);
                lastAnalyzedTradeTimestamp = timestamp;
                return "N/A";
            }
            
            // Initialize the modified lightstreamer-push
            const lightstreamerPush = (function(a) {
                function n(b, d, f, g, c, n) {
                    // Instead of b.html(d), log the HTML change
                    debugLog(`📊 HTML UPDATE: ${b.selector} = "${d}" ${f ? `(${f}: ${c})` : ''} ${n ? `[trend: ${n}]` : ''}`);
                    
                    var k;
                    a.push.animation || "background" != f || (f = !1);
                    a.each(b, function(d, b) {
                        b = a(b);
                        k = b.data("updating");
                        if (!1 !== f && !0 !== k) {
                            // Log the animation/styling that would be applied
                            switch (f) {
                            case "background":
                                debugLog(`🎨 BACKGROUND ANIMATION: ${b.selector} - color: ${g}, bg: ${c}, trend: ${n}`);
                                break;
                            case "color":
                                debugLog(`🎨 COLOR CHANGE: ${b.selector} - color: ${c}`);
                            }
                        }
                    });
                    return b ? b.length : 0;
                }

                function v(a) {
                    a = ("" + a).split(".");
                    a = 1 === a.length ? 0 : a[1].length;
                    return 2 > a ? 2 : 4 < a ? 4 : a
                }

                // Mock jQuery selectors for logging
                function mockSelector(selector) {
                    return {
                        selector: selector,
                        html: function() { return this; },
                        data: function() { return false; },
                        each: function(fn) { fn(0, this); return this; },
                        length: 1,
                        attr: function() { return ""; },
                        removeAttr: function() { return this; },
                        after: function() { return this; },
                        remove: function() { return this; },
                        clone: function() { return this; },
                        css: function() { return this; },
                        addClass: function() { return this; },
                        removeClass: function() { return this; },
                        delay: function() { return this; },
                        queue: function() { return this; },
                        dequeue: function() { return this; },
                        trigger: function() { return this; }
                    };
                }

                a.push = a.push || {};
                a.push.options = {
                    port: 443,
                    protocol: "http:",
                    bgNegative: "#BE2D36",
                    colorNegative: "#FFF",
                    bgPositive: "#005D42",
                    colorPositive: "#FFF",
                    bgNeutral: "#CCCCCC",
                    colorNeutral: "#222",
                    timezoneOffsetToGMT: 0,
                    categoriesWithHiddenCurrencySymbol: []
                };
                a.push.client = client;
                a.push.enabled = !1;
                a.push.animation = !0;
                a.push.selectorCache = {};
                a.push.quoteSubscription = null;
                a.push.pushtableSubscription = null;
                a.push.realtimeSubscription = null;
                a.push.oldValues = {};
                a.push.quoteFieldList = [];
                a.push.realtimeFieldList = "instrumentId isin displayName instName trade tradeTime tradeSize currencySymbol categoryId".split(" ");
                a.push.pushtableFieldList = "ask askTime askSize bid bidTime bidSize trade tradeTime tradeSize currencySymbol categoryId".split(" ");
                a.push.quoteItemList = [];
                a.push.realtimeItemList = [];
                a.push.pushtableItemList = [];

                // Override the $ function to return mock selectors for logging
                window.$ = function(selector) {
                    return mockSelector(selector);
                };

                a.push.init = function(b, d) {
                    // This function is now handled in index.js
                };

                a.push.unsubscribe = function() {
                    a.push.enabled = !1;
                    a.push.client.unsubscribe(a.push.quoteSubscription);
                    a.push.quoteSubscription = null;
                    a.each(a.push.realtimeItemList, function(b, d) {
                        a.push.client.unsubscribe(d)
                    });
                    a.each(a.push.pushtableItemList, function(b, d) {
                        a.push.client.unsubscribe(d)
                    })
                };

                a.push.quotes = function() {
                    debugLog("📊 Setting up QUOTES subscription...");
                    a.push.enabled = !0;
                    a.push.selectorCache = {};
                    a.push.oldValues = {};
                    null !== a.push.quoteSubscription && a.push.client.unsubscribe(a.push.quoteSubscription);
                    a.push.quoteItemList = [];
                    
                    // Build item list from stock watchlist
                    Object.values(stockWatchlist).forEach(stock => {
                        a.push.quoteItemList.push(`${stock.id}@1`);
                    });
                    
                    a.push.quoteFieldList = ["instrumentId", "isin", "displayName", "trade", "bid", "ask", "tradeTime", "bidTime", "askTime", "tradeSize", "bidSize", "askSize", "categoryId", "currencySymbol", "currencyISO"];

                    if (a.push.quoteItemList.length !== 0) {
                        a.push.quoteSubscription = new Subscription("MERGE", a.push.quoteItemList, a.push.quoteFieldList);
                        a.push.quoteSubscription.addListener({
                            onSubscriptionError: function(code, message) {
                                debugLog(`SUBSCRIPTION ERROR: ${code} - ${message}`);
                            },
                            onSubscription: function() {
                                debugLog('✅ QUOTES subscription active');
                            },
                            onUnsubscription: function() {
                                debugLog('⚠️ QUOTES subscription ended');
                            },
                            onItemUpdate: function(b) {
                                updateHeartbeat(); // Mark that we received data
                                
                                const itemName = b.getItemName();
                                const stockInfo = Object.values(stockWatchlist).find(s => itemName === `${s.id}@1`);
                                const stockName = stockInfo ? stockInfo.name : itemName;
                                
                                debugLog("");
                                debugLog(`📊 ===== QUOTES UPDATE (${stockName}) =====`);
                                debugLog(`🎯 Item: ${itemName}`);
                                
                                // Get structured data from updateItems
                                const updateData = a.push.updateItems(b);
                                
                                // Use analytics data to populate price dictionary
                                if (updateData && updateData.fields) {
                                    // Get the latest timestamp from time fields
                                    const timeFields = Object.keys(updateData.fields).filter(k => 
                                        updateData.fields[k].type === 'time'
                                    );
                                    
                                    let latestTimestamp = updateData.timestamp;
                                    if (timeFields.length > 0) {
                                        // Use bidTime as primary timestamp, fallback to others
                                        if (updateData.fields.bidTime && updateData.fields.bidTime.value) {
                                            latestTimestamp = updateData.fields.bidTime.value;
                                        } else if (updateData.fields.askTime && updateData.fields.askTime.value) {
                                            latestTimestamp = updateData.fields.askTime.value;
                                        } else if (updateData.fields.tradeTime && updateData.fields.tradeTime.value) {
                                            latestTimestamp = updateData.fields.tradeTime.value;
                                        }
                                    }
                                    
                                    // Create price entry for this timestamp
                                    if (!priceDict[latestTimestamp]) {
                                        priceDict[latestTimestamp] = {};
                                    }
                                    
                                    // Populate price fields (only bid and ask, NOT trade)
                                    Object.keys(updateData.fields).forEach(k => {
                                        if (updateData.fields[k].type === 'price' && (k === 'bid' || k === 'ask')) {
                                            priceDict[latestTimestamp][k] = updateData.fields[k].value;
                                        }
                                    });
                                    
                                    // Log current price dictionary size and latest entry
                                    debugLog(`📈 PRICE DICT: ${Object.keys(priceDict).length} entries, latest: ${latestTimestamp}`);
                                    debugLog(`📈 LATEST PRICES: ${JSON.stringify(priceDict[latestTimestamp], null, 2)}`);
                                }
                                
                                debugLog("📊 =============================");
                                debugLog("");
                            }
                        });
                        a.push.quoteSubscription.setDataAdapter("QUOTE");
                        a.push.quoteSubscription.setRequestedSnapshot("no");
                        a.push.client.subscribe(a.push.quoteSubscription);
                        debugLog(`✅ QUOTES subscribed with ${a.push.quoteFieldList.length} fields for ${a.push.quoteItemList.length} stocks`);
                    }
                };

                a.push.pushtable = function() {
                    debugLog("📊 Setting up PUSHTABLE subscription...");
                    a.push.pushtableSubscription && a.push.client.unsubscribe(a.push.pushtableSubscription);
                    a.push.pushtableItemList = [];
                    
                    // Build item list from stock watchlist
                    Object.values(stockWatchlist).forEach(stock => {
                        a.push.pushtableItemList.push(`${stock.id}@1`);
                    });
                    
                    if (a.push.pushtableItemList.length === 0) {
                        a.push.pushtableSubscription = null;
                    } else {
                        a.push.pushtableSubscription = new Subscription("MERGE", a.push.pushtableItemList, a.push.pushtableFieldList);
                        a.push.pushtableSubscription.addListener({
                            onItemUpdate: function(b) {
                                updateHeartbeat(); // Mark that we received data
                                
                                const itemName = b.getItemName();
                                const stockInfo = Object.values(stockWatchlist).find(s => itemName === `${s.id}@1`);
                                const stockName = stockInfo ? stockInfo.name : itemName;
                                
                                debugLog("");
                                debugLog(`📊 ===== PUSHTABLE UPDATE (${stockName}) =====`);
                                debugLog(`🎯 Item: ${itemName}`);
                                
                                // Get structured data from appendItems
                                const appendData = a.push.appendItems(b);
                                
                                // Use structured data to show trades that happened
                                if (appendData && appendData.fields) {
                                    // Check trades table for trade data (ONLY source for trade executions)
                                    if (appendData.fields.table_trades && appendData.fields.table_trades.trade) {
                                        const tradeData = appendData.fields.table_trades.trade;
                                        const tradeSize = appendData.fields.table_trades.tradeSize;
                                        const tradeTime = appendData.fields.table_trades.tradeTime;
                                        
                                        if (tradeData && tradeData.value && tradeTime && tradeTime.value) {
                                            // Only log if we have valid trade size (not zero or unknown)
                                            const hasValidSize = tradeSize && tradeSize.value && tradeSize.value > 0;
                                            
                                            if (hasValidSize) {
                                                const decision = getBuyOrSellBefore(tradeData.value, tradeTime.value);
                                                const priceText = tradeData.formattedValue || tradeData.value;
                                                const sizeText = tradeSize.formattedValue || tradeSize.value;
                                            
                                                // Use trading event handler for clean trade logging
                                                tradingHandler.handleTrade(priceText, sizeText, tradeTime.value, decision);
                                            }
                                        }
                                    }
                                    
                                    // Check quotes table for bid/ask updates
                                    if (appendData.fields.table_quotes) {
                                        const quotesTable = appendData.fields.table_quotes;
                                        if (quotesTable.bid || quotesTable.ask) {
                                            const bidPrice = quotesTable.bid ? (quotesTable.bid.formattedValue || quotesTable.bid.value) : null;
                                            const askPrice = quotesTable.ask ? (quotesTable.ask.formattedValue || quotesTable.ask.value) : null;
                                            const quoteTime = quotesTable.bidTime ? quotesTable.bidTime.value : 
                                                            (quotesTable.askTime ? quotesTable.askTime.value : null);
                                            
                                            // Use trading event handler for clean quote logging
                                            tradingHandler.handleQuoteUpdate(bidPrice, askPrice, quoteTime);
                                        }
                                    }
                                }
                                
                                debugLog("📊 =============================");
                                debugLog("");
                            }
                        });
                        a.push.pushtableSubscription.setDataAdapter("QUOTE");
                        a.push.pushtableSubscription.setRequestedSnapshot("no");
                        a.push.client.subscribe(a.push.pushtableSubscription);
                        debugLog(`✅ PUSHTABLE subscribed with ${a.push.pushtableFieldList.length} fields for ${a.push.pushtableItemList.length} stocks`);
                    }
                };

                a.push.realtime = function() {
                    debugLog("💹 Setting up REALTIME subscription...");
                    a.push.realtimeSubscription && a.push.client.unsubscribe(a.push.realtimeSubscription);
                    a.push.realtimeItemList = [];
                    
                    // Build item list from stock watchlist
                    Object.values(stockWatchlist).forEach(stock => {
                        a.push.realtimeItemList.push(`${stock.id}@1`);
                    });
                    
                    if (a.push.realtimeItemList.length === 0) {
                        a.push.realtimeSubscription = null;
                    } else {
                        a.push.realtimeSubscription = new Subscription("MERGE", a.push.realtimeItemList, a.push.realtimeFieldList);
                        a.push.realtimeSubscription.addListener({
                            onItemUpdate: function(b) {
                                updateHeartbeat(); // Mark that we received data
                                
                                const itemName = b.getItemName();
                                const stockInfo = Object.values(stockWatchlist).find(s => itemName === `${s.id}@1`);
                                const stockName = stockInfo ? stockInfo.name : itemName;
                                
                                debugLog("");
                                debugLog(`💹 ===== REALTIME UPDATE (${stockName}) =====`);
                                debugLog(`🎯 Item: ${itemName}`);
                                
                                // Get structured data from appendItemsRT
                                const realtimeData = a.push.appendItemsRT(b);
                                
                                // Log structured realtime data for analytics
                                if (realtimeData && realtimeData.fields) {
                                    debugLog(`📈 REALTIME DATA: ${JSON.stringify({
                                        instrument: realtimeData.itemName,
                                        timestamp: realtimeData.timestamp,
                                        tableType: realtimeData.tableType,
                                        priceFields: Object.keys(realtimeData.fields).filter(k => 
                                            realtimeData.fields[k].type === 'price'
                                        ).reduce((obj, k) => {
                                            obj[k] = {
                                                value: realtimeData.fields[k].value,
                                                formatted: realtimeData.fields[k].formattedValue
                                            };
                                            return obj;
                                        }, {}),
                                        sizeFields: Object.keys(realtimeData.fields).filter(k => 
                                            realtimeData.fields[k].type === 'size'
                                        ).reduce((obj, k) => {
                                            obj[k] = {
                                                value: realtimeData.fields[k].value,
                                                formatted: realtimeData.fields[k].formattedValue
                                            };
                                            return obj;
                                        }, {}),
                                        timeFields: Object.keys(realtimeData.fields).filter(k => 
                                            realtimeData.fields[k].type === 'time'
                                        ).reduce((obj, k) => {
                                            obj[k] = realtimeData.fields[k].value;
                                            return obj;
                                        }, {}),
                                        metadataFields: Object.keys(realtimeData.fields).filter(k => 
                                            realtimeData.fields[k].type === 'metadata'
                                        ).reduce((obj, k) => {
                                            obj[k] = realtimeData.fields[k].value;
                                            return obj;
                                        }, {})
                                    }, null, 2)}`);
                                }
                                
                                debugLog("💹 =============================");
                                debugLog("");
                            }
                        });
                        a.push.realtimeSubscription.setDataAdapter("REALTIME");
                        a.push.realtimeSubscription.setRequestedSnapshot("no");
                                        a.push.client.subscribe(a.push.realtimeSubscription);
                        debugLog(`✅ REALTIME subscribed with ${a.push.realtimeFieldList.length} fields for ${a.push.realtimeItemList.length} stocks`);
                    }
                };

                a.push.appendItems = function(b) {
                    var appendData = {
                        itemName: null,
                        fields: {},
                        timestamp: new Date().toISOString(),
                        tableType: "pushtable"
                    };
                    
                    if (null !== b) {
                        var d = b.getItemName(), f = mockSelector(`[source='lightstreamer'][table='pushtable'][item='${d}']`), g, c, k;
                        
                        appendData.itemName = d;
                        appendData.fields.categoryId = parseInt(b.getValue("categoryId"));
                        appendData.fields.currencySymbol = b.getValue("currencySymbol");
                        
                        // Mock the each function behavior - original has multiple tables with different types
                        var tables = [
                            { type: "trades", limit: 50 },
                            { type: "quotes", limit: 50 }
                        ];
                        
                        tables.forEach(function(table) {
                            var q = mockSelector(`[source='lightstreamer'][table='pushtable'][item='${d}'][data-type='${table.type}']`);
                            var p = table.type; // "trades" or "quotes" 
                            var h = mockSelector("tr[rel='template']"); // mock template
                            var e = table.limit; // mock data("limit")
                            var l = parseInt(b.getValue("categoryId"));
                            var m = -1 == a.inArray(l, a.push.options.categoriesWithHiddenCurrencySymbol) ? "&nbsp;" + b.getValue("currencySymbol") : "&nbsp;&nbsp;";
                            var t = 0;
                            
                            appendData.fields[`table_${p}`] = {};
                            
                            b.forEachField(function(b, f, e) {
                                f = a.push.oldValues["appendItems" + p + d + b];
                                a.push.oldValues["appendItems" + p + d + b] = e;
                                
                                if (null !== e && -1 < t) {
                                    // Store field data in appendData object
                                    if (!appendData.fields[`table_${p}`][b]) {
                                        appendData.fields[`table_${p}`][b] = {
                                            value: e,
                                            formattedValue: null,
                                            previousValue: f,
                                            trend: null,
                                            type: null,
                                            tableType: p
                                        };
                                    }
                                    
                                    switch (b) {
                                    case "trade":
                                    case "bid":
                                    case "ask":
                                        appendData.fields[`table_${p}`][b].type = "price";
                                        if ("undefined" !== typeof f || null !== f) {
                                            var l = v(e);
                                            f > e ? (g = a.push.options.bgNegative,
                                            c = a.push.options.colorNegative,
                                            k = "neg") : f < e ? (g = a.push.options.bgPositive,
                                            c = a.push.options.colorPositive,
                                            k = "pos") : (g = a.push.options.bgNeutral,
                                            c = a.push.options.colorNeutral,
                                            k = "eq");
                                            k = '<div class="' + k + '"></div>';
                                            var formatted = a.numberFormat(e, l, '.', ',', !1);
                                            appendData.fields[`table_${p}`][b].formattedValue = formatted;
                                            appendData.fields[`table_${p}`][b].trend = k === '<div class="pos"></div>' ? 'pos' : k === '<div class="neg"></div>' ? 'neg' : 'eq';
                                            
                                            debugLog(`📊 ${b.toUpperCase()}: ${formatted}  ${k === '<div class="pos"></div>' ? '🟢 ↗️' : k === '<div class="neg"></div>' ? '🔴 ↘️' : '🟡 ➡️'} [${d}] [${p}] ${new Date().toLocaleString('de-DE')}`);
                                            debugLog(`📊 ${b.toUpperCase()}WITHCURRENCY: ${formatted} € € ${k === '<div class="pos"></div>' ? '🟢 ↗️' : k === '<div class="neg"></div>' ? '🔴 ↘️' : '🟡 ➡️'} [${d}] [${p}] ${new Date().toLocaleString('de-DE')}`);
                                            debugLog(`📈 ${b.toUpperCase()}Trend: ${k === '<div class="pos"></div>' ? 'pos' : k === '<div class="neg"></div>' ? 'neg' : 'eq'} for ${d} [${p}]`);
                                            
                                            n(mockSelector(`[field='${b}']`), formatted, "background", c, g);
                                            n(mockSelector(`[field='${b}WithCurrencySymbol']`), formatted + m, "background", c, g);
                                            n(mockSelector(`[field='#${b}Trend']`), k, null, c, g);
                                        }
                                        break;
                                    case "bidSize":
                                    case "askSize":
                                    case "tradeSize":
                                    case "tradeCumulativeSize":
                                        appendData.fields[`table_${p}`][b].type = "size";
                                        if (null !== e) {
                                            var formatted = 0 == e ? "-" : a.numberFormat(e, 0, '.', ',', !1);
                                            appendData.fields[`table_${p}`][b].formattedValue = formatted;
                                            debugLog(`📊 ${b.toUpperCase()}: ${formatted} shares   [${d}] [${p}] ${new Date().toLocaleString('de-DE')}`);
                                            n(mockSelector(`[field='${b}']`), formatted, void 0, c, g);
                                        }
                                        break;
                                    case "tradeTime":
                                    case "bidTime":
                                    case "askTime":
                                        appendData.fields[`table_${p}`][b].type = "time";
                                        "tradeTime" == b && "trades" == p && f == e ? t = -1E3 : "bidTime" == b && "quotes" == p && f == e ? t = -1E3 : null !== e && f != e && (
                                            appendData.fields[`table_${p}`][b].formattedValue = e,
                                            debugLog(`📊 ${b.toUpperCase()}: ${e}   [${d}] [${p}] ${new Date().toLocaleString('de-DE')}`),
                                            t += n(mockSelector(`[field='${b}']`), e, void 0, c, g)
                                        );
                                    }
                                }
                            });
                            
                            if (0 < t) {
                                debugLog(`📊 Table ${p}: ${t} fields updated for ${d}`);
                            }
                        });
                    }
                    
                    return appendData;
                };

                a.push.appendItemsRT = function(b) {
                    var realtimeData = {
                        itemName: null,
                        fields: {},
                        timestamp: new Date().toISOString(),
                        tableType: "realtime"
                    };
                    
                    if (null !== b) {
                        var d = b.getItemName();
                        var f = mockSelector(`[source='lightstreamer'][table='realtime'][item*='${d}']`);
                        var g = ["5"]; // mock categoryids
                        
                        realtimeData.itemName = d;
                        realtimeData.fields.categoryId = parseInt(b.getValue("categoryId"));
                        realtimeData.fields.currencySymbol = b.getValue("currencySymbol");
                        
                        if (0 < g.length && "" != g[0]) {
                            var c = parseInt(b.getValue("categoryId"));
                            if (0 > g.indexOf(c.toString()))
                                return realtimeData;
                        }
                        
                        var k = mockSelector("tr[rel='template']");
                        var r = -1 == a.inArray(c, a.push.options.categoriesWithHiddenCurrencySymbol) ? "&nbsp;" + b.getValue("currencySymbol") : "&nbsp;&nbsp;";
                        var g = 50; // mock limit
                        
                        b.forEachField(function(c, g, h) {
                            a.push.oldValues["appendItems" + d + c] = h;
                            
                            if (null !== h) {
                                // Store field data in realtimeData object
                                realtimeData.fields[c] = {
                                    value: h,
                                    formattedValue: null,
                                    type: null,
                                    tableType: "realtime"
                                };
                                
                                switch (c) {
                                case "instrumentId":
                                    realtimeData.fields[c].type = "metadata";
                                    realtimeData.fields[c].formattedValue = h;
                                    debugLog(`💹 INSTRUMENTID: ${h} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    break;
                                case "instName":
                                case "displayName":
                                    realtimeData.fields[c].type = "metadata";
                                    h || (h = b.getValue("isin"));
                                    realtimeData.fields[c].value = h;
                                    realtimeData.fields[c].formattedValue = h;
                                    var link = '<a href="">' + h + "</a>";
                                    debugLog(`💹 DISPLAYNAME: ${h} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    n(mockSelector("[field='linkedDisplayName']"), link, void 0, void 0, void 0);
                                    break;
                                case "trade":
                                    realtimeData.fields[c].type = "price";
                                    var formatted = a.numberFormat(h, 4, '.', ',', !1);
                                    realtimeData.fields[c].formattedValue = formatted;
                                    debugLog(`💹 TRADE: ${formatted} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    debugLog(`💹 TRADEWITHCURRENCY: ${formatted}${r} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    n(mockSelector(`[field='${c}']`), formatted, "background", void 0, void 0);
                                    n(mockSelector(`[field='${c}WithCurrencySymbol']`), formatted + r, "background", void 0, void 0);
                                    break;
                                case "tradeSize":
                                    realtimeData.fields[c].type = "size";
                                    if (null !== h) {
                                        var formatted = 0 == h ? "-" : a.numberFormat(h, 0, '.', ',', !1);
                                        realtimeData.fields[c].formattedValue = formatted;
                                        debugLog(`💹 TRADESIZE: ${formatted} shares [${d}] ${new Date().toLocaleString('de-DE')}`);
                                        n(mockSelector(`[field='${c}']`), formatted, void 0, void 0, void 0);
                                    }
                                    break;
                                case "tradeTime":
                                    realtimeData.fields[c].type = "time";
                                    realtimeData.fields[c].formattedValue = h;
                                    debugLog(`💹 TRADETIME: ${h} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    n(mockSelector(`[field='${c}']`), h, void 0, void 0, void 0);
                                    break;
                                case "isin":
                                    realtimeData.fields[c].type = "metadata";
                                    realtimeData.fields[c].formattedValue = h;
                                    debugLog(`💹 ISIN: ${h} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    break;
                                case "currencySymbol":
                                    realtimeData.fields[c].type = "metadata";
                                    realtimeData.fields[c].formattedValue = h;
                                    debugLog(`💹 CURRENCYSYMBOL: ${h} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    break;
                                case "categoryId":
                                    realtimeData.fields[c].type = "metadata";
                                    realtimeData.fields[c].formattedValue = h;
                                    debugLog(`💹 CATEGORYID: ${h} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    break;
                                }
                            }
                        });
                    }
                    
                    return realtimeData;
                };

                a.push.updateItems = function(b) {
                    var updateData = {
                        itemName: null,
                        fields: {},
                        timestamp: new Date().toISOString()
                    };
                    
                    if (null !== b) {
                        var d = b.getItemName(), f, g, c, k = parseInt(b.getValue("categoryId")), r = -1 == a.inArray(k, a.push.options.categoriesWithHiddenCurrencySymbol) ? "&nbsp;" + b.getValue("currencySymbol") : "&nbsp;&nbsp;&nbsp;", q = b.getValue("currencyISO"), p = 4;
                        
                        updateData.itemName = d;
                        updateData.fields.categoryId = k;
                        updateData.fields.currencySymbol = b.getValue("currencySymbol");
                        updateData.fields.currencyISO = q;
                        
                        b.forEachChangedField(function(b, e, l) {
                            p = 4;
                            if (null !== l) {
                                c = `[item="${d}"][field="${b}"][table="quotes"]`;
                                "undefined" === typeof a.push.selectorCache[c] && (a.push.selectorCache[c] = mockSelector(c));
                                e = a.push.selectorCache[c];
                                var m = 4; // mock decimals
                                p = v(l);
                                m = a.push.oldValues["updateItems" + d + b];
                                a.push.oldValues["updateItems" + d + b] = l;
                                
                                // Store field data in updateData object
                                updateData.fields[b] = {
                                    value: l,
                                    formattedValue: null,
                                    previousValue: m,
                                    trend: null,
                                    type: null
                                };
                                
                                switch (b) {
                                case "trade":
                                case "bid":
                                case "ask":
                                case "mid":
                                    updateData.fields[b].type = "price";
                                    if (("undefined" !== typeof m || null !== m) && m !== l) {
                                        if (m > l) {
                                            f = a.push.options.bgNegative;
                                            g = a.push.options.colorNegative;
                                            var h = "neg"
                                        } else
                                            m < l ? (f = a.push.options.bgPositive,
                                            g = a.push.options.colorPositive,
                                            h = "pos") : (f = a.push.options.bgNeutral,
                                            g = a.push.options.colorNeutral,
                                            h = "eq");
                                        
                                        updateData.fields[b].trend = h;
                                        var formatted = a.numberFormat(l, p, '.', ',', !1);
                                        updateData.fields[b].formattedValue = formatted;
                                        
                                        debugLog(`📊 ${b.toUpperCase()}: ${formatted}  ${h === 'pos' ? '🟢 ↗️' : h === 'neg' ? '🔴 ↘️' : '🟡 ➡️'} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                        debugLog(`📊 ${b.toUpperCase()}WITHCURRENCY: ${formatted}${r} ${h === 'pos' ? '🟢 ↗️' : h === 'neg' ? '🔴 ↘️' : '🟡 ➡️'} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                        debugLog(`📈 ${b.toUpperCase()}Trend: ${h} for ${d}`);
                                        
                                        var k = "background";
                                        n(e, formatted, k, g, f, h);
                                        
                                        // Handle WithCurrencySymbol and WithCurrencyISO variants
                                        var currencySelector = `[item="${d}"][field="${b}WithCurrencySymbol"][table="quotes"]`;
                                        n(mockSelector(currencySelector), formatted + r, k, g, f, h);
                                        
                                        var isoSelector = `[item="${d}"][field="${b}WithCurrencyISO"][table="quotes"]`;
                                        n(mockSelector(isoSelector), formatted + "&nbsp;" + q, k, g, f, h);
                                    }
                                    break;
                                case "tradeCumulativeTurnover":
                                    updateData.fields[b].type = "turnover";
                                    p = 0;
                                    var formatted = a.numberFormat(l, p, '.', ',', !1);
                                    updateData.fields[b].formattedValue = formatted;
                                    debugLog(`📊 ${b.toUpperCase()}: ${formatted} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    n(e, formatted, k, g, f);
                                    break;
                                case "bidSize":
                                case "askSize":
                                case "tradeSize":
                                case "tradeCumulativeSize":
                                    updateData.fields[b].type = "size";
                                    if (null !== l) {
                                        var formatted = 0 == l ? "-" : a.numberFormat(l, 0, '.', ',', !1);
                                        updateData.fields[b].formattedValue = formatted;
                                        debugLog(`📊 ${b.toUpperCase()}: ${formatted} shares [${d}] ${new Date().toLocaleString('de-DE')}`);
                                        n(e, formatted, k, g, f);
                                    }
                                    break;
                                case "tradeTime":
                                case "bidTime":
                                case "askTime":
                                case "midTime":
                                    updateData.fields[b].type = "time";
                                    if (null !== l) {
                                        updateData.fields[b].formattedValue = l;
                                        debugLog(`📊 ${b.toUpperCase()}: ${l} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                        n(e, l, k, g, f);
                                    }
                                    break;
                                case "tradePerf1dRel":
                                case "bidPerf1dRel":
                                case "askPerf1dRel":
                                case "midPerf1dRel":
                                    updateData.fields[b].type = "performance_relative";
                                    f = 0 > l ? a.push.options.bgNegative : 0 < l ? a.push.options.bgPositive : !1;
                                    var formatted = isFinite(l) && null != l ? a.numberFormat(l, 2, '.', ',', 0 != l) : "-";
                                    updateData.fields[b].formattedValue = formatted;
                                    updateData.fields[b].trend = 0 > l ? 'neg' : 0 < l ? 'pos' : 'eq';
                                    debugLog(`📊 ${b.toUpperCase()}: ${formatted}% [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    k = "color";
                                    n(e, formatted, k, g, f);
                                    break;
                                case "tradePerf1d":
                                case "midPerf1d":
                                case "bidPerf1d":
                                case "askPerf1d":
                                    updateData.fields[b].type = "performance_absolute";
                                    f = 0 > l ? a.push.options.bgNegative : 0 < l ? a.push.options.bgPositive : !1;
                                    var formatted = isFinite(l) && null !== l ? a.numberFormat(l, p, '.', ',', 0 != l) : "-";
                                    updateData.fields[b].formattedValue = formatted;
                                    updateData.fields[b].trend = 0 > l ? 'neg' : 0 < l ? 'pos' : 'eq';
                                    debugLog(`📊 ${b.toUpperCase()}: ${formatted} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    k = "color";
                                    n(e, formatted, k, g, f);
                                    break;
                                case "instrumentId":
                                case "isin":
                                case "displayName":
                                case "currencySymbol":
                                case "categoryId":
                                    updateData.fields[b].type = "metadata";
                                    updateData.fields[b].formattedValue = l;
                                    debugLog(`📊 ${b.toUpperCase()}: ${l}   [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    break;
                                }
                            }
                        });
                    }
                    
                    return updateData;
                };
                
                return a.push;
            })(mockJQuery);
            
            // Start the subscriptions using the original lightstreamer-push logic
            debugLog('📊 Starting QUOTES subscription...');
            lightstreamerPush.quotes();
            debugLog('📊 QUOTES subscription started, starting PUSHTABLE...');
            lightstreamerPush.pushtable(); 
            debugLog('📊 PUSHTABLE subscription started, starting REALTIME...');
            lightstreamerPush.realtime();
            debugLog('📊 All subscriptions started successfully!');
            
            // Start heartbeat monitoring now that everything is set up
            startHeartbeat();
            debugLog('📊 Heartbeat monitoring started!');
        }
        
        debugLog('🚀 Connecting client...');
        if (client.connect) {
            client.connect();
        }
        
        // Start connection monitoring immediately
        waitForConnection();
    }, STOCK_WATCHLIST, tradingEventHandlerCode, DEBUG_MODE);

    console.log('✅ Multi-Stock Lightstreamer Logger setup complete!');
    console.log('📊 Using exact lightstreamer-push.js patterns:');
    console.log('   📊 PUSHTABLE: Same fields and logic as a.push.appendItems');
    console.log('   💹 REALTIME: Same fields and logic as a.push.appendItemsRT');
    console.log('   🔄 DOM manipulation replaced with console logging');

    // Keep the process running
    process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down...');
        await browser.close();
        process.exit(0);
    });

    // Keep the script running
    await new Promise(() => {});
}

main().catch(console.error);
