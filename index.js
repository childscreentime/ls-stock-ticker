const puppeteer = require('puppeteer');

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

    await page.evaluate((stockWatchlist) => {
        console.log('[BROWSER LOG]: 📊 Setting up Lightstreamer-Push Logger...');
        
        // Check if LightstreamerClient exists
        if (typeof LightstreamerClient === 'undefined') {
            console.log('[BROWSER LOG]: ❌ LightstreamerClient not found!');
            return;
        }
        
        console.log('[BROWSER LOG]: ✅ LightstreamerClient found!');
        
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
                console.log(`[BROWSER LOG]: 🔍 Found client via: ${possibleClients[0]}`);
            }
        }
        
        // If still not found, create a new client
        if (!client) {
            console.log('[BROWSER LOG]: 🔧 Creating new LightstreamerClient...');
            client = new LightstreamerClient("https://push.ls-tc.de:443", "WALLSTREETONLINE");
        }
        
        console.log(`[BROWSER LOG]: 🔗 Connected to: https://push.ls-tc.de:443`);
        console.log(`[BROWSER LOG]: 🔗 Adapter: WALLSTREETONLINE`);
        
        // Wait for client to be connected
        function waitForConnection() {
            const status = client.getStatus ? client.getStatus() : 'CONNECTING';
            console.log(`[BROWSER LOG]: 📊 Client status: ${status}`);
            
            if (status.includes('CONNECTED') && (status.includes('STREAMING') || status.includes('POLLING'))) {
                console.log('[BROWSER LOG]: 🎉 Connected! Setting up subscriptions...');
                setupLightstreamerPush();
            } else if (status === 'DISCONNECTED') {
                console.log('[BROWSER LOG]: 🔄 Client disconnected, connecting...');
                if (client.connect) client.connect();
                setTimeout(waitForConnection, 1000);
            } else {
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
            
            // Initialize the modified lightstreamer-push
            const lightstreamerPush = (function(a) {
                function n(b, d, f, g, c, n) {
                    // Instead of b.html(d), log the HTML change
                    console.log(`[BROWSER LOG]: 📊 HTML UPDATE: ${b.selector} = "${d}" ${f ? `(${f}: ${c})` : ''} ${n ? `[trend: ${n}]` : ''}`);
                    
                    var k;
                    a.push.animation || "background" != f || (f = !1);
                    a.each(b, function(d, b) {
                        b = a(b);
                        k = b.data("updating");
                        if (!1 !== f && !0 !== k) {
                            // Log the animation/styling that would be applied
                            switch (f) {
                            case "background":
                                console.log(`[BROWSER LOG]: 🎨 BACKGROUND ANIMATION: ${b.selector} - color: ${g}, bg: ${c}, trend: ${n}`);
                                break;
                            case "color":
                                console.log(`[BROWSER LOG]: 🎨 COLOR CHANGE: ${b.selector} - color: ${c}`);
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
                    console.log("[BROWSER LOG]: 📊 Setting up QUOTES subscription...");
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
                                console.log(`[BROWSER LOG]: SUBSCRIPTION ERROR: ${code} - ${message}`);
                            },
                            onItemUpdate: function(b) {
                                const itemName = b.getItemName();
                                const stockInfo = Object.values(stockWatchlist).find(s => itemName === `${s.id}@1`);
                                const stockName = stockInfo ? stockInfo.name : itemName;
                                
                                console.log("[BROWSER LOG]: ");
                                console.log(`[BROWSER LOG]: 📊 ===== QUOTES UPDATE (${stockName}) =====`);
                                console.log(`[BROWSER LOG]: 🎯 Item: ${itemName}`);
                                a.push.updateItems(b);
                                console.log("[BROWSER LOG]: 📊 =============================");
                                console.log("[BROWSER LOG]: ");
                            }
                        });
                        a.push.quoteSubscription.setDataAdapter("QUOTE");
                        a.push.quoteSubscription.setRequestedSnapshot("no");
                        a.push.client.subscribe(a.push.quoteSubscription);
                        console.log(`[BROWSER LOG]: ✅ QUOTES subscribed with ${a.push.quoteFieldList.length} fields for ${a.push.quoteItemList.length} stocks`);
                    }
                };

                a.push.pushtable = function() {
                    console.log("[BROWSER LOG]: 📊 Setting up PUSHTABLE subscription...");
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
                                const itemName = b.getItemName();
                                const stockInfo = Object.values(stockWatchlist).find(s => itemName === `${s.id}@1`);
                                const stockName = stockInfo ? stockInfo.name : itemName;
                                
                                console.log("[BROWSER LOG]: ");
                                console.log(`[BROWSER LOG]: 📊 ===== PUSHTABLE UPDATE (${stockName}) =====`);
                                console.log(`[BROWSER LOG]: 🎯 Item: ${itemName}`);
                                a.push.appendItems(b);
                                console.log("[BROWSER LOG]: 📊 =============================");
                                console.log("[BROWSER LOG]: ");
                            }
                        });
                        a.push.pushtableSubscription.setDataAdapter("QUOTE");
                        a.push.pushtableSubscription.setRequestedSnapshot("no");
                        a.push.client.subscribe(a.push.pushtableSubscription);
                        console.log(`[BROWSER LOG]: ✅ PUSHTABLE subscribed with ${a.push.pushtableFieldList.length} fields for ${a.push.pushtableItemList.length} stocks`);
                    }
                };

                a.push.realtime = function() {
                    console.log("[BROWSER LOG]: 💹 Setting up REALTIME subscription...");
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
                                const itemName = b.getItemName();
                                const stockInfo = Object.values(stockWatchlist).find(s => itemName === `${s.id}@1`);
                                const stockName = stockInfo ? stockInfo.name : itemName;
                                
                                console.log("[BROWSER LOG]: ");
                                console.log(`[BROWSER LOG]: 💹 ===== REALTIME UPDATE (${stockName}) =====`);
                                console.log(`[BROWSER LOG]: 🎯 Item: ${itemName}`);
                                a.push.appendItemsRT(b);
                                console.log("[BROWSER LOG]: 💹 =============================");
                                console.log("[BROWSER LOG]: ");
                            }
                        });
                        a.push.realtimeSubscription.setDataAdapter("REALTIME");
                        a.push.realtimeSubscription.setRequestedSnapshot("no");
                        a.push.client.subscribe(a.push.realtimeSubscription);
                        console.log(`[BROWSER LOG]: ✅ REALTIME subscribed with ${a.push.realtimeFieldList.length} fields for ${a.push.realtimeItemList.length} stocks`);
                    }
                };

                a.push.appendItems = function(b) {
                    if (null !== b) {
                        var d = b.getItemName(), f = mockSelector(`[source='lightstreamer'][table='pushtable'][item='${d}']`), g, c, k;
                        
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
                            
                            b.forEachField(function(b, f, e) {
                                f = a.push.oldValues["appendItems" + p + d + b];
                                a.push.oldValues["appendItems" + p + d + b] = e;
                                if (null !== e && -1 < t)
                                    switch (b) {
                                    case "trade":
                                    case "bid":
                                    case "ask":
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
                                            console.log(`[BROWSER LOG]: 📊 ${b.toUpperCase()}: ${formatted}  ${k === '<div class="pos"></div>' ? '🟢 ↗️' : k === '<div class="neg"></div>' ? '🔴 ↘️' : '🟡 ➡️'} [${d}] [${p}] ${new Date().toLocaleString('de-DE')}`);
                                            console.log(`[BROWSER LOG]: 📊 ${b.toUpperCase()}WITHCURRENCY: ${formatted} € € ${k === '<div class="pos"></div>' ? '🟢 ↗️' : k === '<div class="neg"></div>' ? '🔴 ↘️' : '🟡 ➡️'} [${d}] [${p}] ${new Date().toLocaleString('de-DE')}`);
                                            console.log(`[BROWSER LOG]: 📈 ${b.toUpperCase()}Trend: ${k === '<div class="pos"></div>' ? 'pos' : k === '<div class="neg"></div>' ? 'neg' : 'eq'} for ${d} [${p}]`);
                                            
                                            n(mockSelector(`[field='${b}']`), formatted, "background", c, g);
                                            n(mockSelector(`[field='${b}WithCurrencySymbol']`), formatted + m, "background", c, g);
                                            n(mockSelector(`[field='#${b}Trend']`), k, null, c, g);
                                        }
                                        break;
                                    case "bidSize":
                                    case "askSize":
                                    case "tradeSize":
                                    case "tradeCumulativeSize":
                                        if (null !== e) {
                                            var formatted = 0 == e ? "-" : a.numberFormat(e, 0, '.', ',', !1);
                                            console.log(`[BROWSER LOG]: 📊 ${b.toUpperCase()}: ${formatted} shares   [${d}] [${p}] ${new Date().toLocaleString('de-DE')}`);
                                            n(mockSelector(`[field='${b}']`), formatted, void 0, c, g);
                                        }
                                        break;
                                    case "tradeTime":
                                    case "bidTime":
                                    case "askTime":
                                        "tradeTime" == b && "trades" == p && f == e ? t = -1E3 : "bidTime" == b && "quotes" == p && f == e ? t = -1E3 : null !== e && f != e && (
                                            console.log(`[BROWSER LOG]: 📊 ${b.toUpperCase()}: ${e}   [${d}] [${p}] ${new Date().toLocaleString('de-DE')}`),
                                            t += n(mockSelector(`[field='${b}']`), e, void 0, c, g)
                                        );
                                    }
                            });
                            
                            if (0 < t) {
                                console.log(`[BROWSER LOG]: 📊 Table ${p}: ${t} fields updated for ${d}`);
                            }
                        });
                    }
                };

                a.push.appendItemsRT = function(b) {
                    if (null !== b) {
                        var d = b.getItemName();
                        var f = mockSelector(`[source='lightstreamer'][table='realtime'][item*='${d}']`);
                        var g = ["5"]; // mock categoryids
                        
                        if (0 < g.length && "" != g[0]) {
                            var c = parseInt(b.getValue("categoryId"));
                            if (0 > g.indexOf(c.toString()))
                                return
                        }
                        
                        var k = mockSelector("tr[rel='template']");
                        var r = -1 == a.inArray(c, a.push.options.categoriesWithHiddenCurrencySymbol) ? "&nbsp;" + b.getValue("currencySymbol") : "&nbsp;&nbsp;";
                        var g = 50; // mock limit
                        
                        b.forEachField(function(c, g, h) {
                            a.push.oldValues["appendItems" + d + c] = h;
                            if (null !== h)
                                switch (c) {
                                case "instrumentId":
                                    console.log(`[BROWSER LOG]: 💹 INSTRUMENTID: ${h} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    break;
                                case "instName":
                                case "displayName":
                                    h || (h = b.getValue("isin"));
                                    var link = '<a href="">' + h + "</a>";
                                    console.log(`[BROWSER LOG]: 💹 DISPLAYNAME: ${h} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    n(mockSelector("[field='linkedDisplayName']"), link, void 0, void 0, void 0);
                                    break;
                                case "trade":
                                    var formatted = a.numberFormat(h, 4, '.', ',', !1);
                                    console.log(`[BROWSER LOG]: 💹 TRADE: ${formatted} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    console.log(`[BROWSER LOG]: 💹 TRADEWITHCURRENCY: ${formatted}${r} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    n(mockSelector(`[field='${c}']`), formatted, "background", void 0, void 0);
                                    n(mockSelector(`[field='${c}WithCurrencySymbol']`), formatted + r, "background", void 0, void 0);
                                    break;
                                case "tradeSize":
                                    if (null !== h) {
                                        var formatted = 0 == h ? "-" : a.numberFormat(h, 0, '.', ',', !1);
                                        console.log(`[BROWSER LOG]: 💹 TRADESIZE: ${formatted} shares [${d}] ${new Date().toLocaleString('de-DE')}`);
                                        n(mockSelector(`[field='${c}']`), formatted, void 0, void 0, void 0);
                                    }
                                    break;
                                case "tradeTime":
                                    console.log(`[BROWSER LOG]: 💹 TRADETIME: ${h} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    n(mockSelector(`[field='${c}']`), h, void 0, void 0, void 0);
                                    break;
                                case "isin":
                                    console.log(`[BROWSER LOG]: 💹 ISIN: ${h} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    break;
                                case "currencySymbol":
                                    console.log(`[BROWSER LOG]: 💹 CURRENCYSYMBOL: ${h} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    break;
                                case "categoryId":
                                    console.log(`[BROWSER LOG]: 💹 CATEGORYID: ${h} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    break;
                                }
                        });
                    }
                };

                a.push.updateItems = function(b) {
                    if (null !== b) {
                        var d = b.getItemName(), f, g, c, k = parseInt(b.getValue("categoryId")), r = -1 == a.inArray(k, a.push.options.categoriesWithHiddenCurrencySymbol) ? "&nbsp;" + b.getValue("currencySymbol") : "&nbsp;&nbsp;&nbsp;", q = b.getValue("currencyISO"), p = 4;
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
                                switch (b) {
                                case "trade":
                                case "bid":
                                case "ask":
                                case "mid":
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
                                        var formatted = a.numberFormat(l, p, '.', ',', !1);
                                        console.log(`[BROWSER LOG]: 📊 ${b.toUpperCase()}: ${formatted}  ${h === 'pos' ? '🟢 ↗️' : h === 'neg' ? '🔴 ↘️' : '🟡 ➡️'} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                        console.log(`[BROWSER LOG]: 📊 ${b.toUpperCase()}WITHCURRENCY: ${formatted}${r} ${h === 'pos' ? '🟢 ↗️' : h === 'neg' ? '🔴 ↘️' : '🟡 ➡️'} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                        console.log(`[BROWSER LOG]: 📈 ${b.toUpperCase()}Trend: ${h} for ${d}`);
                                        
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
                                    p = 0;
                                    var formatted = a.numberFormat(l, p, '.', ',', !1);
                                    console.log(`[BROWSER LOG]: 📊 ${b.toUpperCase()}: ${formatted} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    n(e, formatted, k, g, f);
                                    break;
                                case "bidSize":
                                case "askSize":
                                case "tradeSize":
                                case "tradeCumulativeSize":
                                    if (null !== l) {
                                        var formatted = 0 == l ? "-" : a.numberFormat(l, 0, '.', ',', !1);
                                        console.log(`[BROWSER LOG]: 📊 ${b.toUpperCase()}: ${formatted} shares [${d}] ${new Date().toLocaleString('de-DE')}`);
                                        n(e, formatted, k, g, f);
                                    }
                                    break;
                                case "tradeTime":
                                case "bidTime":
                                case "askTime":
                                case "midTime":
                                    if (null !== l) {
                                        console.log(`[BROWSER LOG]: 📊 ${b.toUpperCase()}: ${l} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                        n(e, l, k, g, f);
                                    }
                                    break;
                                case "tradePerf1dRel":
                                case "bidPerf1dRel":
                                case "askPerf1dRel":
                                case "midPerf1dRel":
                                    f = 0 > l ? a.push.options.bgNegative : 0 < l ? a.push.options.bgPositive : !1;
                                    var formatted = isFinite(l) && null != l ? a.numberFormat(l, 2, '.', ',', 0 != l) : "-";
                                    console.log(`[BROWSER LOG]: 📊 ${b.toUpperCase()}: ${formatted}% [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    k = "color";
                                    n(e, formatted, k, g, f);
                                    break;
                                case "tradePerf1d":
                                case "midPerf1d":
                                case "bidPerf1d":
                                case "askPerf1d":
                                    f = 0 > l ? a.push.options.bgNegative : 0 < l ? a.push.options.bgPositive : !1;
                                    var formatted = isFinite(l) && null !== l ? a.numberFormat(l, p, '.', ',', 0 != l) : "-";
                                    console.log(`[BROWSER LOG]: 📊 ${b.toUpperCase()}: ${formatted} [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    k = "color";
                                    n(e, formatted, k, g, f);
                                    break;
                                case "instrumentId":
                                    console.log(`[BROWSER LOG]: 📊 ${b.toUpperCase()}: ${l}   [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    break;
                                case "isin":
                                    console.log(`[BROWSER LOG]: 📊 ${b.toUpperCase()}: ${l}   [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    break;
                                case "displayName":
                                    console.log(`[BROWSER LOG]: 📊 ${b.toUpperCase()}: ${l}   [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    break;
                                case "currencySymbol":
                                    console.log(`[BROWSER LOG]: 📊 ${b.toUpperCase()}: ${l}   [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    break;
                                case "categoryId":
                                    console.log(`[BROWSER LOG]: 📊 ${b.toUpperCase()}: ${l}   [${d}] ${new Date().toLocaleString('de-DE')}`);
                                    break;
                                }
                            }
                        })
                    }
                };
                
                return a.push;
            })(mockJQuery);
            
            // Start the subscriptions using the original lightstreamer-push logic
            lightstreamerPush.quotes();
            lightstreamerPush.pushtable(); 
            lightstreamerPush.realtime();
        }
        
        console.log('[BROWSER LOG]: 🚀 Connecting client...');
        if (client.getStatus && client.getStatus() === 'DISCONNECTED') {
            if (client.connect) client.connect();
        }
        waitForConnection();
    }, STOCK_WATCHLIST);

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
