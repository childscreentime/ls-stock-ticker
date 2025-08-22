// Injected Script for LightstreamerClient Integration
// Runs in the page context to detect and integrate with existing LightstreamerClient

(function() {
    'use strict';
    
    // Only initialize once to prevent duplicate subscriptions
    if (window.lsStockTickerInjected) {
        console.log('⚠️ LS Stock Ticker already injected, skipping...');
        return;
    }
    window.lsStockTickerInjected = true;
    
    console.log('🔍 LS Stock Ticker injected script loaded');
    
    // Global variables
    let priceDict = {};
    let tradingHandler;
    let isInitialized = false;
    
    // Trading Event Handler (exact copy from original)
    class TradingEventHandler {
        constructor() {
            this.name = "TradingEventHandler";
            this.version = "1.0.0";
        }

        handleTrade(tradePrice, tradeSize, tradeTime, direction, instrument = null) {
            const directionIcon = direction === 'BUY' ? '🟢' : direction === 'SELL' ? '🔴' : '🟡';
            const directionText = direction === 'BUY' ? 'BUY' : direction === 'SELL' ? 'SELL' : 'UNKNOWN';
            
            console.log(`[BROWSER LOG]: `);
            console.log(`[BROWSER LOG]: 🔥 TRADE EXECUTED:`);
            console.log(`[BROWSER LOG]: 💰 Price: ${tradePrice}`);
            console.log(`[BROWSER LOG]: 📊 Size: ${tradeSize} shares`);
            console.log(`[BROWSER LOG]: ⏰ Time: ${tradeTime}`);
            console.log(`[BROWSER LOG]: 🎯 Direction: ${directionText} ${directionIcon}`);
            console.log(`[BROWSER LOG]: `);
            
            // Dispatch to extension with instrument info
            dispatchEvent('TRADE', {
                kind: 'TRADE',
                price: parseFloat(tradePrice),
                size: parseInt(tradeSize) || parseFloat(tradeSize),
                side: direction.toLowerCase(),
                ts: new Date(tradeTime).getTime(),
                // Include instrument information for popup display
                name: instrument?.name,
                wkn: instrument?.wkn,
                isin: instrument?.isin,
                item: instrument?.item
            });
        }

        handleQuoteUpdate(bid, ask, time, instrument = null) {
            // Use original logging format but include instrument info
            console.log(`[BROWSER LOG]: 📋 QUOTE UPDATE:`);
            if (bid) {
                console.log(`[BROWSER LOG]: � Bid: ${bid}`);
            }
            if (ask) {
                console.log(`[BROWSER LOG]: 🏷️ Ask: ${ask}`);
            }
            if (time) {
                console.log(`[BROWSER LOG]: ⏰ Time: ${time}`);
            }
            console.log(`[BROWSER LOG]: `);
            
            // Dispatch to extension with instrument info
            dispatchEvent('QUOTE', {
                kind: 'QUOTE',
                bid: bid ? parseFloat(bid) : null,
                ask: ask ? parseFloat(ask) : null,
                ts: time ? new Date(time).getTime() : Date.now(),
                // Include instrument information for popup display
                name: instrument?.name,
                wkn: instrument?.wkn,
                isin: instrument?.isin,
                item: instrument?.item
            });
        }

        handleMarketSummary(summary) {
            if (summary.spread !== undefined) {
                console.log(`[BROWSER LOG]: 📈 Spread: ${summary.spread}`);
            }
            if (summary.midPrice !== undefined) {
                console.log(`[BROWSER LOG]: 📊 Mid Price: ${summary.midPrice}`);
            }
        }

        debug(message, enabled = false) {
            if (enabled) {
                console.log(`[DEBUG]: ${message}`);
            }
        }
    }
    
    // Price tracking and trade direction analysis (from original app)
    priceDict = {}; // { timestamp: { bid: value, ask: value } }
    let lastKnownBidAsk = { bid: null, ask: null };
    tradingHandler = new TradingEventHandler();
    
    function getBuyOrSellBefore(price, timestamp) {
        const sortedTimestamps = Object.keys(priceDict).sort().reverse();
        
        console.log(`🔍 ANALYZING: Trade ${price} at ${timestamp}`);
        console.log(`🔍 SEARCHING: ${sortedTimestamps.length} price records + last known bid/ask`);
        
        for (const ts of sortedTimestamps) {
            if (ts < timestamp) {
                const priceData = priceDict[ts];
                
                if (priceData.ask && Math.abs(priceData.ask - price) < 0.0001) {
                    console.log(`🔍 MATCH: Trade ${price} matched ASK ${priceData.ask} at ${ts} → BUY`);
                    cleanPriceHistory(ts);
                    return "BUY";
                }
                
                if (priceData.bid && Math.abs(priceData.bid - price) < 0.0001) {
                    console.log(`🔍 MATCH: Trade ${price} matched BID ${priceData.bid} at ${ts} → SELL`);
                    cleanPriceHistory(ts);
                    return "SELL";
                }
            }
        }
        
        // Check against last known bid/ask
        if (lastKnownBidAsk.ask && Math.abs(lastKnownBidAsk.ask - price) < 0.0001) {
            console.log(`🔍 MATCH: Trade ${price} matched LAST KNOWN ASK ${lastKnownBidAsk.ask} → BUY`);
            return "BUY";
        }
        
        if (lastKnownBidAsk.bid && Math.abs(lastKnownBidAsk.bid - price) < 0.0001) {
            console.log(`🔍 MATCH: Trade ${price} matched LAST KNOWN BID ${lastKnownBidAsk.bid} → SELL`);
            return "SELL";
        }
        
        console.log(`🔍 NO MATCH: Trade ${price} at ${timestamp} - no matching bid/ask found`);
        return "N/A";
    }
    
    function cleanPriceHistory(afterTimestamp) {
        const timestamps = Object.keys(priceDict);
        let removedCount = 0;
        
        for (const ts of timestamps) {
            if (ts <= afterTimestamp) {
                if (priceDict[ts].bid) lastKnownBidAsk.bid = priceDict[ts].bid;
                if (priceDict[ts].ask) lastKnownBidAsk.ask = priceDict[ts].ask;
                delete priceDict[ts];
                removedCount++;
            }
        }
        
        if (removedCount > 0) {
            console.log(`🧹 CLEANED: Removed ${removedCount} old price records after ${afterTimestamp}`);
        }
    }
    
    // Track previous values for change detection (like original oldValues)
    const oldValues = {};
    
    function dispatchEvent(type, eventData) {
        window.dispatchEvent(new CustomEvent('LS_TICKER_EVENT', {
            detail: {
                type: type,
                event: eventData
            }
        }));
    }
    
    // Wait for LightstreamerClient to be available and set up subscriptions
    function initializeLightstreamerIntegration() {
        if (typeof LightstreamerClient === 'undefined') {
            console.log('⏳ Waiting for LightstreamerClient...');
            setTimeout(initializeLightstreamerIntegration, 1000);
            return;
        }
        
        console.log('✅ LightstreamerClient found! Setting up integration...');
        
        // Find existing client instance
        let client = window.lsClient || window.lightstreamerClient || window.client;
        
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
                console.log(`🔍 Found client via: ${possibleClients[0]}`);
            }
        }
        
        if (!client) {
            console.log('🔧 Creating new LightstreamerClient...');
            client = new LightstreamerClient("https://push.ls-tc.de:443", "WALLSTREETONLINE");
            
            // Store reference for future use
            window.lsClient = client;
            
            // Connect the client
            if (client.connect) {
                client.connect();
                console.log('🔌 LightstreamerClient connecting...');
            }
        }
        
        console.log('🎯 LightstreamerClient integration starting...');
        setupSubscriptions(client);
    }
    
    function setupSubscriptions(client) {
        // Get instrument info from page (extract WKN/ID from URL or page content)
        const instrumentInfo = extractInstrumentInfo();
        if (!instrumentInfo || !instrumentInfo.instruments || instrumentInfo.instruments.length === 0) {
            console.log('⚠️ Could not extract instrument info from page');
            return;
        }
        
        console.log('📋 Instrument data:', instrumentInfo);
        
        // Wait for client to be connected
        const checkConnection = () => {
            const status = client.getStatus();
            console.log('📊 Client status:', status);
            
            if (status.includes('CONNECTED') && (status.includes('STREAMING') || status.includes('POLLING'))) {
                console.log('🎉 Connected! Setting up our subscriptions...');
                createOurSubscriptions(client, instrumentInfo);
            } else if (status === 'DISCONNECTED') {
                console.log('🔄 Client disconnected, will retry...');
                setTimeout(checkConnection, 2000);
            } else {
                console.log('⏳ Waiting for connection...');
                setTimeout(checkConnection, 1000);
            }
        };
        
        checkConnection();
    }
    
    function extractInstrumentInfo() {
        // First try to get watchlist info from the DOM element created by content script
        const dataElement = document.getElementById('ls-watchlist-data');
        if (dataElement) {
            try {
                const watchlistData = JSON.parse(dataElement.getAttribute('data-watchlist'));
                console.log('📋 Using watchlist info from content script:', watchlistData);
                
                // Convert watchlist to array of instrument info for subscriptions
                const instruments = Object.entries(watchlistData).map(([wkn, instrument]) => ({
                    id: instrument.id,
                    item: `${instrument.id}@1`,
                    name: instrument.name,
                    wkn: wkn,
                    isin: instrument.isin
                }));
                
                console.log(`📊 Found ${instruments.length} instruments in watchlist:`, 
                    instruments.map(i => `${i.name} (${i.wkn})`));
                
                return { instruments, isWatchlist: true };
            } catch (e) {
                console.log('⚠️ Failed to parse watchlist data from DOM element:', e);
            }
        }

        // Fallback: Legacy single instrument data
        const legacyDataElement = document.getElementById('ls-instrument-data');
        if (legacyDataElement) {
            try {
                const instrumentData = JSON.parse(legacyDataElement.getAttribute('data-instrument'));
                console.log('📋 Using legacy single instrument info from content script:', instrumentData);
                return {
                    instruments: [{
                        id: instrumentData.id || '43763',
                        item: instrumentData.id ? `${instrumentData.id}@1` : '43763@1',
                        name: instrumentData.name || document.title,
                        wkn: instrumentData.wkn
                    }],
                    isWatchlist: false
                };
            } catch (e) {
                console.log('⚠️ Failed to parse legacy instrument data from DOM element:', e);
            }
        }
        
        // Fallback: Extract from URL: /de/aktie/43763 -> ID: 43763
        const pathMatch = window.location.pathname.match(/\/aktie\/(\d+)/);
        if (pathMatch) {
            const instrumentId = pathMatch[1];
            return {
                instruments: [{
                    id: instrumentId,
                    item: `${instrumentId}@1`,
                    name: document.title
                }],
                isWatchlist: false
            };
        }
        
        // Another fallback: look for data attributes or script tags
        const dataElements = document.querySelectorAll('[data-instrument-id], [data-id]');
        for (const elem of dataElements) {
            const id = elem.getAttribute('data-instrument-id') || elem.getAttribute('data-id');
            if (id && /^\d+$/.test(id)) {
                return {
                    instruments: [{
                        id: id,
                        item: `${id}@1`,
                        name: document.title
                    }],
                    isWatchlist: false
                };
            }
        }
        
        // Last resort: use NVIDIA default for testing
        console.log('⚠️ Could not extract instrument info, using NVIDIA default');
        return {
            instruments: [{
                id: '43763',
                item: '43763@1',
                name: 'NVIDIA CORP. DL-,001',
                wkn: '918422'
            }],
            isWatchlist: false
        };
    }
    
    function createOurSubscriptions(client, instrumentInfo) {
        console.log('📊 Creating subscriptions matching original index.js logic...');
        
        // Create item list from all instruments
        const itemList = instrumentInfo.instruments.map(inst => inst.item);
        console.log('📋 Subscribing to items:', itemList);
        
        // Exact field lists from original index.js
        const quoteFieldList = ["instrumentId", "isin", "displayName", "trade", "bid", "ask", "tradeTime", "bidTime", "askTime", "tradeSize", "bidSize", "askSize", "categoryId", "currencySymbol", "currencyISO"];
        const pushtableFieldList = ["ask", "askTime", "askSize", "bid", "bidTime", "bidSize", "trade", "tradeTime", "tradeSize", "currencySymbol", "categoryId"];
        
        // QUOTES subscription (for price tracking)
        const quoteSubscription = new Subscription("MERGE", itemList, quoteFieldList);
        
        quoteSubscription.addListener({
            onSubscription: function() {
                console.log('✅ QUOTES subscription active for items:', itemList);
            },
            onItemUpdate: function(update) {
                // Get the item name for this specific update
                const itemName = update.getItemName();
                
                // Find the corresponding instrument for better logging
                const instrument = instrumentInfo.instruments.find(inst => inst.item === itemName);
                const instrumentName = instrument ? instrument.name : itemName;
                
                console.log('📈 QUOTE update received for:', instrumentName, '(', itemName, ')');
                
                // Extract bid/ask data exactly like original
                const bid = update.getValue("bid");
                const ask = update.getValue("ask");
                const bidTime = update.getValue("bidTime");
                const askTime = update.getValue("askTime");
                const tradeTime = update.getValue("tradeTime");
                
                // Get latest timestamp (prioritize bidTime like original)
                let latestTimestamp = bidTime || askTime || tradeTime || new Date().toISOString();
                
                // Update price dictionary exactly like original
                if (bid || ask) {
                    if (!priceDict[latestTimestamp]) {
                        priceDict[latestTimestamp] = {};
                    }
                    
                    // Only populate bid and ask (NOT trade) like original
                    if (bid) priceDict[latestTimestamp].bid = parseFloat(bid);
                    if (ask) priceDict[latestTimestamp].ask = parseFloat(ask);
                    
                    console.log(`📈 PRICE DICT: ${Object.keys(priceDict).length} entries, latest: ${latestTimestamp}`);
                    console.log(`📈 LATEST PRICES: ${JSON.stringify(priceDict[latestTimestamp], null, 2)}`);
                    
                    // Call quote handler with instrument info
                    tradingHandler.handleQuoteUpdate(bid, ask, latestTimestamp, instrument);
                }
            }
        });
        
        quoteSubscription.setDataAdapter("QUOTE");
        quoteSubscription.setRequestedSnapshot("no");
        client.subscribe(quoteSubscription);
        
        // PUSHTABLE subscription (for trade executions)
        const pushtableSubscription = new Subscription("MERGE", itemList, pushtableFieldList);
        
        pushtableSubscription.addListener({
            onSubscription: function() {
                console.log('✅ PUSHTABLE subscription active for items:', itemList);
            },
            onItemUpdate: function(update) {
                // Get the item name for this specific update
                const itemName = update.getItemName();
                
                // Find the corresponding instrument for better logging
                const instrument = instrumentInfo.instruments.find(inst => inst.item === itemName);
                const instrumentName = instrument ? instrument.name : itemName;
                
                // Debug: Log ALL field values to see what's being received
                console.log('📊 PUSHTABLE update received for:', instrumentName, '(', itemName, ')');
                
                // Log all fields present in this update
                const allFields = {};
                pushtableFieldList.forEach(field => {
                    const value = update.getValue(field);
                    if (value !== null && value !== undefined) {
                        allFields[field] = value;
                    }
                });
                console.log('� ALL PUSHTABLE FIELDS:', allFields);
                
                // Check tradeTime change detection like original (for "trades" table type)
                const currentTradeTime = update.getValue("tradeTime");
                const oldTradeTimeKey = `appendItemstrades${itemName}tradeTime`;
                const previousTradeTime = oldValues[oldTradeTimeKey];
                
                console.log(`🕐 TRADETIME CHECK: current=${currentTradeTime}, previous=${previousTradeTime}`);
                
                // Update stored value
                oldValues[oldTradeTimeKey] = currentTradeTime;
                
                // Original logic: if tradeTime hasn't changed, skip trade processing (t = -1E3)
                // BUT: if this is the first time we see this item, process it even with no previous time
                const shouldProcessTrades = currentTradeTime && (
                    previousTradeTime === undefined || // First time seeing this item
                    previousTradeTime !== currentTradeTime // Or tradeTime has changed
                );
                
                if (shouldProcessTrades) {
                    console.log('✅ TRADETIME CHANGED (or first time) - Processing trade data');
                    
                    // Look for trade executions in PUSHTABLE data (like original)
                    const trade = update.getValue("trade");
                    const tradeSize = update.getValue("tradeSize");
                    const tradeTime = update.getValue("tradeTime");
                    
                    console.log(`🔍 TRADE FIELDS: trade=${trade}, tradeSize=${tradeSize}, tradeTime=${tradeTime}`);
                    
                    // Only process if we have valid trade data (like original validation)
                    if (trade && tradeTime && tradeSize && parseFloat(tradeSize) > 0) {
                        const decision = getBuyOrSellBefore(parseFloat(trade), tradeTime);
                        
                        console.log(`🔥 TRADE EXECUTION: ${trade} × ${tradeSize} at ${tradeTime} (${decision})`);
                        
                        // Use exact same handler call as original with instrument info
                        tradingHandler.handleTrade(trade, tradeSize, tradeTime, decision, instrument);
                    } else {
                        console.log(`⚠️ INCOMPLETE TRADE DATA: trade=${trade}, tradeTime=${tradeTime}, tradeSize=${tradeSize}`);
                    }
                } else if (currentTradeTime) {
                    console.log('⏭️ TRADETIME UNCHANGED - Skipping duplicate trade data');
                } else {
                    console.log('⚠️ NO TRADETIME - Not a trade execution update');
                }
                
                // Always process bid/ask updates (these use "quotes" table logic in original)
                const bid = update.getValue("bid");
                const ask = update.getValue("ask");
                const bidTime = update.getValue("bidTime");
                const askTime = update.getValue("askTime");
                
                if (bid || ask) {
                    const timestamp = bidTime || askTime || currentTradeTime || new Date().toISOString();
                    if (!priceDict[timestamp]) {
                        priceDict[timestamp] = {};
                    }
                    if (bid) priceDict[timestamp].bid = parseFloat(bid);
                    if (ask) priceDict[timestamp].ask = parseFloat(ask);
                    
                    // Call quote handler with instrument info
                    tradingHandler.handleQuoteUpdate(bid, ask, timestamp, instrument);
                }
            }
        });
        
        pushtableSubscription.setDataAdapter("QUOTE");
        pushtableSubscription.setRequestedSnapshot("no");
        client.subscribe(pushtableSubscription);
        
        console.log('🎯 Subscriptions created with exact original logic!');
    }
    
    // Start initialization
    initializeLightstreamerIntegration();
    
})();
