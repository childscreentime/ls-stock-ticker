// Modified version of lightstreamer-push.js that logs HTML changes instead of applying them to DOM
// This preserves the exact same logic and field filtering as the original

module.exports = function(a) {
    function n(b, d, f, g, c, n) {
        // Instead of b.html(d), log the HTML change
        console.log(`📊 HTML UPDATE: ${b.selector} = "${d}" ${f ? `(${f}: ${c})` : ''} ${n ? `[trend: ${n}]` : ''}`);
        
        var k;
        a.push.animation || "background" != f || (f = !1);
        a.each(b, function(d, b) {
            b = a(b);
            k = b.data("updating");
            if (!1 !== f && !0 !== k) {
                // Log the animation/styling that would be applied
                switch (f) {
                case "background":
                    console.log(`🎨 BACKGROUND ANIMATION: ${b.selector} - color: ${g}, bg: ${c}, trend: ${n}`);
                    break;
                case "color":
                    console.log(`🎨 COLOR CHANGE: ${b.selector} - color: ${c}`);
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
    a.push.client = null;
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
        console.log("📊 ===== SETTING UP QUOTES SUBSCRIPTION =====");
        a.push.enabled = !0;
        a.push.selectorCache = {};
        a.push.oldValues = {};
        null !== a.push.quoteSubscription && a.push.client.unsubscribe(a.push.quoteSubscription);
        a.push.quoteItemList = [];
        
        // Mock finding quote items - for NVIDIA we know it's 43763@1
        a.push.quoteItemList = ["43763@1"];
        a.push.quoteFieldList = ["instrumentId", "isin", "displayName", "trade", "bid", "ask", "tradeTime", "bidTime", "askTime", "tradeSize", "bidSize", "askSize", "categoryId", "currencySymbol", "currencyISO"];

        if (a.push.quoteItemList.length !== 0) {
            a.push.quoteSubscription = new Subscription("MERGE", a.push.quoteItemList, a.push.quoteFieldList);
            a.push.quoteSubscription.addListener({
                onSubscriptionError: function(code, message) {
                    console.error(`SUBSCRIPTION ERROR: ${code} - ${message}`);
                },
                onItemUpdate: function(b) {
                    console.log("\n📊 ===== QUOTES UPDATE =====");
                    console.log(`🎯 Item: ${b.getItemName()}`);
                    a.push.updateItems(b);
                    console.log("📊 =============================\n");
                }
            });
            a.push.quoteSubscription.setDataAdapter("QUOTE");
            a.push.quoteSubscription.setRequestedSnapshot("no");
            a.push.client.subscribe(a.push.quoteSubscription);
        }
    };

    a.push.addQuoteListener = function(b) {
        a.push.quoteSubscription.addListener({
            onItemUpdate: function(a) {
                console.log("addQuoteListener's onItemUpdate called with:", a);
                b(a)
            }
        })
    };

    a.push.pushtable = function() {
        console.log("📊 ===== SETTING UP PUSHTABLE SUBSCRIPTION =====");
        a.push.pushtableSubscription && a.push.client.unsubscribe(a.push.pushtableSubscription);
        a.push.pushtableItemList = [];
        
        // Mock finding pushtable items - for NVIDIA we know it's 43763@1
        a.push.pushtableItemList = ["43763@1"];
        
        if (a.push.pushtableItemList.length === 0) {
            a.push.pushtableSubscription = null;
        } else {
            a.push.pushtableSubscription = new Subscription("MERGE", a.push.pushtableItemList, a.push.pushtableFieldList);
            a.push.pushtableSubscription.addListener({
                onItemUpdate: function(b) {
                    console.log("\n📊 ===== PUSHTABLE UPDATE =====");
                    console.log(`🎯 Item: ${b.getItemName()}`);
                    a.push.appendItems(b);
                    console.log("📊 =============================\n");
                }
            });
            a.push.pushtableSubscription.setDataAdapter("QUOTE");
            a.push.pushtableSubscription.setRequestedSnapshot("no");
            a.push.client.subscribe(a.push.pushtableSubscription);
        }
    };

    a.push.realtime = function() {
        console.log("💹 ===== SETTING UP REALTIME SUBSCRIPTION =====");
        a.push.realtimeSubscription && a.push.client.unsubscribe(a.push.realtimeSubscription);
        a.push.realtimeItemList = [];
        
        // Mock finding realtime items - for NVIDIA we know it's 43763@1
        a.push.realtimeItemList = ["43763@1"];
        
        if (a.push.realtimeItemList.length === 0) {
            a.push.realtimeSubscription = null;
        } else {
            a.push.realtimeSubscription = new Subscription("MERGE", a.push.realtimeItemList, a.push.realtimeFieldList);
            a.push.realtimeSubscription.addListener({
                onItemUpdate: function(b) {
                    console.log("\n💹 ===== REALTIME UPDATE =====");
                    console.log(`🎯 Item: ${b.getItemName()}`);
                    a.push.appendItemsRT(b);
                    console.log("💹 =============================\n");
                }
            });
            a.push.realtimeSubscription.setDataAdapter("REALTIME");
            a.push.realtimeSubscription.setRequestedSnapshot("no");
            a.push.client.subscribe(a.push.realtimeSubscription);
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
                                console.log(`📊 ${b.toUpperCase()}: ${formatted}  ${k === '<div class="pos"></div>' ? '🟢 ↗️' : k === '<div class="neg"></div>' ? '🔴 ↘️' : '🟡 ➡️'} [${d}] [${p}] ${new Date().toLocaleString('de-DE')}`);
                                console.log(`📊 ${b.toUpperCase()}WITHCURRENCY: ${formatted} € € ${k === '<div class="pos"></div>' ? '🟢 ↗️' : k === '<div class="neg"></div>' ? '🔴 ↘️' : '🟡 ➡️'} [${d}] [${p}] ${new Date().toLocaleString('de-DE')}`);
                                console.log(`📈 ${b.toUpperCase()}Trend: ${k === '<div class="pos"></div>' ? 'pos' : k === '<div class="neg"></div>' ? 'neg' : 'eq'} for ${d} [${p}]`);
                                
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
                                console.log(`📊 ${b.toUpperCase()}: ${formatted} shares   [${d}] [${p}] ${new Date().toLocaleString('de-DE')}`);
                                n(mockSelector(`[field='${b}']`), formatted, void 0, c, g);
                            }
                            break;
                        case "tradeTime":
                        case "bidTime":
                        case "askTime":
                            "tradeTime" == b && "trades" == p && f == e ? t = -1E3 : "bidTime" == b && "quotes" == p && f == e ? t = -1E3 : null !== e && f != e && (
                                console.log(`📊 ${b.toUpperCase()}: ${e}   [${d}] [${p}] ${new Date().toLocaleString('de-DE')}`),
                                t += n(mockSelector(`[field='${b}']`), e, void 0, c, g)
                            );
                        }
                });
                
                if (0 < t) {
                    console.log(`📊 Table ${p}: ${t} fields updated for ${d}`);
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
                        console.log(`💹 INSTRUMENTID: ${h} [${d}] ${new Date().toLocaleString('de-DE')}`);
                        break;
                    case "instName":
                    case "displayName":
                        h || (h = b.getValue("isin"));
                        var link = '<a href="">' + h + "</a>";
                        console.log(`💹 DISPLAYNAME: ${h} [${d}] ${new Date().toLocaleString('de-DE')}`);
                        n(mockSelector("[field='linkedDisplayName']"), link, void 0, void 0, void 0);
                        break;
                    case "trade":
                        var formatted = a.numberFormat(h, 4, '.', ',', !1);
                        console.log(`💹 TRADE: ${formatted} [${d}] ${new Date().toLocaleString('de-DE')}`);
                        console.log(`💹 TRADEWITHCURRENCY: ${formatted}${r} [${d}] ${new Date().toLocaleString('de-DE')}`);
                        n(mockSelector(`[field='${c}']`), formatted, "background", void 0, void 0);
                        n(mockSelector(`[field='${c}WithCurrencySymbol']`), formatted + r, "background", void 0, void 0);
                        break;
                    case "tradeSize":
                        if (null !== h) {
                            var formatted = 0 == h ? "-" : a.numberFormat(h, 0, '.', ',', !1);
                            console.log(`💹 TRADESIZE: ${formatted} shares [${d}] ${new Date().toLocaleString('de-DE')}`);
                            n(mockSelector(`[field='${c}']`), formatted, void 0, void 0, void 0);
                        }
                        break;
                    case "tradeTime":
                        console.log(`💹 TRADETIME: ${h} [${d}] ${new Date().toLocaleString('de-DE')}`);
                        n(mockSelector(`[field='${c}']`), h, void 0, void 0, void 0);
                        break;
                    case "isin":
                        console.log(`💹 ISIN: ${h} [${d}] ${new Date().toLocaleString('de-DE')}`);
                        break;
                    case "currencySymbol":
                        console.log(`💹 CURRENCYSYMBOL: ${h} [${d}] ${new Date().toLocaleString('de-DE')}`);
                        break;
                    case "categoryId":
                        console.log(`💹 CATEGORYID: ${h} [${d}] ${new Date().toLocaleString('de-DE')}`);
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
                            console.log(`📊 ${b.toUpperCase()}: ${formatted}  ${h === 'pos' ? '🟢 ↗️' : h === 'neg' ? '🔴 ↘️' : '🟡 ➡️'} [${d}] ${new Date().toLocaleString('de-DE')}`);
                            console.log(`📊 ${b.toUpperCase()}WITHCURRENCY: ${formatted}${r} ${h === 'pos' ? '🟢 ↗️' : h === 'neg' ? '🔴 ↘️' : '🟡 ➡️'} [${d}] ${new Date().toLocaleString('de-DE')}`);
                            console.log(`📈 ${b.toUpperCase()}Trend: ${h} for ${d}`);
                            
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
                        console.log(`📊 ${b.toUpperCase()}: ${formatted} [${d}] ${new Date().toLocaleString('de-DE')}`);
                        n(e, formatted, k, g, f);
                        break;
                    case "bidSize":
                    case "askSize":
                    case "tradeSize":
                    case "tradeCumulativeSize":
                        if (null !== l) {
                            var formatted = 0 == l ? "-" : a.numberFormat(l, 0, '.', ',', !1);
                            console.log(`📊 ${b.toUpperCase()}: ${formatted} shares [${d}] ${new Date().toLocaleString('de-DE')}`);
                            n(e, formatted, k, g, f);
                        }
                        break;
                    case "tradeTime":
                    case "bidTime":
                    case "askTime":
                    case "midTime":
                        if (null !== l) {
                            console.log(`📊 ${b.toUpperCase()}: ${l} [${d}] ${new Date().toLocaleString('de-DE')}`);
                            n(e, l, k, g, f);
                        }
                        break;
                    case "tradePerf1dRel":
                    case "bidPerf1dRel":
                    case "askPerf1dRel":
                    case "midPerf1dRel":
                        f = 0 > l ? a.push.options.bgNegative : 0 < l ? a.push.options.bgPositive : !1;
                        var formatted = isFinite(l) && null != l ? a.numberFormat(l, 2, '.', ',', 0 != l) : "-";
                        console.log(`📊 ${b.toUpperCase()}: ${formatted}% [${d}] ${new Date().toLocaleString('de-DE')}`);
                        k = "color";
                        n(e, formatted, k, g, f);
                        break;
                    case "tradePerf1d":
                    case "midPerf1d":
                    case "bidPerf1d":
                    case "askPerf1d":
                        f = 0 > l ? a.push.options.bgNegative : 0 < l ? a.push.options.bgPositive : !1;
                        var formatted = isFinite(l) && null !== l ? a.numberFormat(l, p, '.', ',', 0 != l) : "-";
                        console.log(`📊 ${b.toUpperCase()}: ${formatted} [${d}] ${new Date().toLocaleString('de-DE')}`);
                        k = "color";
                        n(e, formatted, k, g, f);
                        break;
                    case "instrumentId":
                        console.log(`📊 ${b.toUpperCase()}: ${l}   [${d}] ${new Date().toLocaleString('de-DE')}`);
                        break;
                    case "isin":
                        console.log(`📊 ${b.toUpperCase()}: ${l}   [${d}] ${new Date().toLocaleString('de-DE')}`);
                        break;
                    case "displayName":
                        console.log(`📊 ${b.toUpperCase()}: ${l}   [${d}] ${new Date().toLocaleString('de-DE')}`);
                        break;
                    case "currencySymbol":
                        console.log(`📊 ${b.toUpperCase()}: ${l}   [${d}] ${new Date().toLocaleString('de-DE')}`);
                        break;
                    case "categoryId":
                        console.log(`📊 ${b.toUpperCase()}: ${l}   [${d}] ${new Date().toLocaleString('de-DE')}`);
                        break;
                    }
                }
            })
        }
    };
    
    return a.push;
};
