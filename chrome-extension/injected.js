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
    let realtimeChart = null; // Chart instance
    let tabRole = null; // Will be set from content script data
    let shouldConnect = null; // Will be set from content script data
    
    // Subscription tracking to prevent leaks
    let quoteSubscription = null;
    let pushtableSubscription = null;
    
    // Trading Event Handler
    class TradingEventHandler {
        constructor() {
            this.name = "TradingEventHandler";
            this.version = "1.0.0";
        }

        handleQuoteUpdate(bid, ask, timestamp, instrument) {
            const price = ask || bid; // Use ask price primarily, fallback to bid
            
            if (price && instrument) {
                console.log(`📈 Quote update: ${instrument.name} = €${price} at ${timestamp}`);
                console.log(`🕐 Timestamp type: ${typeof timestamp}, value: ${timestamp}`);
                console.log(`🕐 Current local time: ${new Date().toISOString()}`);
                console.log(`🕐 Parsed timestamp: ${new Date(timestamp).toISOString()}`);
                
                // Update real-time chart ONLY if this is the current page's instrument
                if (realtimeChart && realtimeChart.instrumentInfo.isin === instrument.isin) {
                    const priceTimestamp = new Date(timestamp).getTime();
                    realtimeChart.addPriceData(price, priceTimestamp);
                    console.log(`📊 Chart updated for current page instrument: ${instrument.name}`);
                }
                
                // Show quote notification for ALL instruments
                this.showQuoteNotification(bid, ask, timestamp, instrument);
            }
        }
        
        handleTrade(price, size, timestamp, direction, instrument) {
            console.log(`🔥 Trade execution: ${instrument?.name || 'Unknown'} ${direction} ${size} × €${price} at ${timestamp}`);
            console.log(`🕐 Trade timestamp type: ${typeof timestamp}, value: ${timestamp}`);
            console.log(`🕐 Trade parsed timestamp: ${new Date(timestamp).toISOString()}`);
            
            // Update real-time chart ONLY if this is the current page's instrument
            if (realtimeChart && instrument && realtimeChart.instrumentInfo.isin === instrument.isin) {
                const tradeTimestamp = new Date(timestamp).getTime();
                const tradeSide = direction.toLowerCase();
                realtimeChart.addTradeData(price, size, tradeSide, tradeTimestamp);
                console.log(`📊 Chart trade data updated for current page instrument: ${instrument.name}`);
            }
            
            // Show notification for ALL instruments (not just current page)
            this.showNotification(price, size, timestamp, direction, instrument);
        }
        
        showQuoteNotification(bid, ask, timestamp, instrument) {
            if (!instrument) {
                console.log('⚠️ No instrument info for quote notification');
                return;
            }
            
            console.log(`[BROWSER LOG]: `);
            console.log(`[BROWSER LOG]: 📈 QUOTE UPDATE:`);
            console.log(`[BROWSER LOG]: 💰 Bid: €${bid || 'N/A'}`);
            console.log(`[BROWSER LOG]: 💰 Ask: €${ask || 'N/A'}`);
            console.log(`[BROWSER LOG]: ⏰ Time: ${timestamp}`);
            console.log(`[BROWSER LOG]: 📈 Instrument: ${instrument.name} (${instrument.wkn})`);
            console.log(`[BROWSER LOG]: `);
            
            // Dispatch to extension for popup display (ALL instruments)
            dispatchEvent('QUOTE', {
                kind: 'QUOTE',
                bid: bid ? parseFloat(bid) : null,
                ask: ask ? parseFloat(ask) : null,
                ts: new Date(timestamp).getTime(),
                // Include instrument information for popup display
                name: instrument.name,
                wkn: instrument.wkn,
                isin: instrument.isin,
                price: ask || bid // Primary price for display
            });
        }
        
        showNotification(price, size, timestamp, direction, instrument) {
            if (!instrument) {
                console.log('⚠️ No instrument info for notification');
                return;
            }
            
            const directionIcon = direction === 'BUY' ? '🟢' : direction === 'SELL' ? '🔴' : '🟡';
            const directionText = direction === 'BUY' ? 'BUY' : direction === 'SELL' ? 'SELL' : 'UNKNOWN';
            
            console.log(`[BROWSER LOG]: `);
            console.log(`[BROWSER LOG]: 🔥 TRADE EXECUTED:`);
            console.log(`[BROWSER LOG]: 💰 Price: €${price}`);
            console.log(`[BROWSER LOG]: 📊 Size: ${size} shares`);
            console.log(`[BROWSER LOG]: ⏰ Time: ${timestamp}`);
            console.log(`[BROWSER LOG]: 🎯 Direction: ${directionText} ${directionIcon}`);
            console.log(`[BROWSER LOG]: 📈 Instrument: ${instrument.name} (${instrument.wkn})`);
            console.log(`[BROWSER LOG]: `);
            
            // Dispatch to extension for popup display (ALL instruments)
            dispatchEvent('TRADE', {
                kind: 'TRADE',
                price: parseFloat(price),
                size: parseInt(size) || parseFloat(size),
                side: direction.toLowerCase(),
                ts: new Date(timestamp).getTime(),
                // Include instrument information for popup display
                name: instrument.name,
                wkn: instrument.wkn,
                isin: instrument.isin,
                direction: direction
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
    
    // Real-time Chart Renderer using LightweightCharts
    class RealtimeChart {
        constructor(containerId, instrumentInfo) {
            this.containerId = containerId;
            this.instrumentInfo = instrumentInfo;
            this.chart = null;
            this.lineSeries = null;
            this.volumeSeries = null; // For trade volume bars
            this.emaSeries = null; // EMA line series
            this.smaSeries = null; // SMA line series
            this.priceData = []; // Array of {time, value}
            this.candleData = []; // Array of {time, open, high, low, close} for moving averages
            this.volumeData = []; // Array of {time, value, color}
            this.emaData = []; // Array of {time, value} for EMA
            this.smaData = []; // Array of {time, value} for SMA
            this.isLibraryLoaded = false;
            this.tradeTooltipData = new Map(); // Store trade data for tooltips
            
            // Moving average periods
            this.emaPeriod = 20;
            this.smaPeriod = 50;
            
            // Clean up any existing chart with the same ID before creating new one
            this.cleanupExistingChart();
            
            this.init();
        }
        
        /**
         * Calculate Simple Moving Average (SMA)
         * @param {Array} data - Array of candle objects {time, open, high, low, close}
         * @param {number} period - Number of periods for SMA calculation
         * @returns {Array} Array of {time, value} objects
         */
        calculateSMA(data, period) {
            const result = [];
            
            if (data.length < period) {
                return result; // Not enough data
            }
            
            for (let i = period - 1; i < data.length; i++) {
                let sum = 0;
                
                // Sum the closing prices for the period
                for (let j = i - period + 1; j <= i; j++) {
                    sum += data[j].close;
                }
                
                const average = sum / period;
                result.push({
                    time: data[i].time,
                    value: average
                });
            }
            
            return result;
        }
        
        /**
         * Calculate Exponential Moving Average (EMA)
         * @param {Array} data - Array of candle objects {time, open, high, low, close}
         * @param {number} period - Number of periods for EMA calculation
         * @returns {Array} Array of {time, value} objects
         */
        calculateEMA(data, period) {
            const result = [];
            
            if (data.length < period) {
                return result; // Not enough data
            }
            
            // Calculate smoothing factor (alpha)
            const alpha = 2 / (period + 1);
            
            // Start with SMA for the first EMA value
            let sum = 0;
            for (let i = 0; i < period; i++) {
                sum += data[i].close;
            }
            
            let ema = sum / period;
            result.push({
                time: data[period - 1].time,
                value: ema
            });
            
            // Calculate EMA for remaining data points
            for (let i = period; i < data.length; i++) {
                ema = (data[i].close * alpha) + (ema * (1 - alpha));
                result.push({
                    time: data[i].time,
                    value: ema
                });
            }
            
            return result;
        }
        
        /**
         * Efficiently update moving averages for streaming data
         * @param {Object} newCandle - New candle data {time, open, high, low, close}
         */
        updateMovingAverages(newCandle) {
            // Add new candle to data
            this.candleData.push(newCandle);
            
            // Keep only necessary data for calculations (twice the longest period for safety)
            const maxDataPoints = Math.max(this.smaPeriod, this.emaPeriod) * 2;
            if (this.candleData.length > maxDataPoints) {
                this.candleData = this.candleData.slice(-maxDataPoints);
            }
            
            // Update SMA efficiently
            if (this.candleData.length >= this.smaPeriod) {
                const latestSmaData = this.candleData.slice(-this.smaPeriod);
                const sum = latestSmaData.reduce((acc, candle) => acc + candle.close, 0);
                const smaValue = sum / this.smaPeriod;
                
                const smaPoint = {
                    time: newCandle.time,
                    value: smaValue
                };
                
                this.smaData.push(smaPoint);
                
                // Keep SMA data manageable
                if (this.smaData.length > 3600) { // Keep last hour of data
                    this.smaData.shift();
                }
                
                // Update SMA series
                if (this.smaSeries) {
                    this.smaSeries.update(smaPoint);
                }
            }
            
            // Update EMA efficiently
            if (this.candleData.length >= this.emaPeriod) {
                const alpha = 2 / (this.emaPeriod + 1);
                let emaValue;
                
                if (this.emaData.length === 0) {
                    // First EMA calculation - use SMA as starting point
                    const initialData = this.candleData.slice(-this.emaPeriod);
                    const sum = initialData.reduce((acc, candle) => acc + candle.close, 0);
                    emaValue = sum / this.emaPeriod;
                } else {
                    // Incremental EMA calculation
                    const previousEma = this.emaData[this.emaData.length - 1].value;
                    emaValue = (newCandle.close * alpha) + (previousEma * (1 - alpha));
                }
                
                const emaPoint = {
                    time: newCandle.time,
                    value: emaValue
                };
                
                this.emaData.push(emaPoint);
                
                // Keep EMA data manageable
                if (this.emaData.length > 3600) { // Keep last hour of data
                    this.emaData.shift();
                }
                
                // Update EMA series
                if (this.emaSeries) {
                    this.emaSeries.update(emaPoint);
                }
            }
        }
        
        cleanupExistingChart() {
            const existingContainer = document.getElementById(this.containerId);
            if (existingContainer) {
                console.log('🧹 Removing existing chart container:', this.containerId);
                existingContainer.remove();
            }
        }
        
        async init() {
            await this.loadLibrary();
            this.createChartContainer();
            this.initializeChart();
        }
        
        async loadLibrary() {
            // Check if library is already loaded
            if (window.LightweightCharts) {
                this.isLibraryLoaded = true;
                return;
            }
            
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js';
                script.onload = () => {
                    this.isLibraryLoaded = true;
                    console.log('📊 LightweightCharts library loaded successfully');
                    resolve();
                };
                script.onerror = () => {
                    console.error('❌ Failed to load LightweightCharts library');
                    reject(new Error('Failed to load LightweightCharts library'));
                };
                document.head.appendChild(script);
            });
        }
        
        createChartContainer() {
            // Find the chart container with class "chart"
            const chartContainers = document.querySelectorAll('.chart');
            let targetContainer = null;
            
            // Look for a chart container that has a highcharts-container inside it
            for (const container of chartContainers) {
                const highchartsContainer = container.querySelector('.highcharts-container');
                if (highchartsContainer) {
                    targetContainer = container;
                    break;
                }
            }
            
            if (!targetContainer) {
                console.log('⚠️ Could not find chart container with .highcharts-container for chart placement');
                return;
            }
            
            // Create chart container
            const chartContainer = document.createElement('div');
            chartContainer.id = this.containerId;
            chartContainer.style.cssText = `
                width: 100%;
                background: #ffffff;
                border: 1px solid #ddd;
                border-radius: 8px;
                margin: 20px 0;
                padding: 15px;
                position: relative;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;
            
            // Chart div
            const chartDiv = document.createElement('div');
            chartDiv.id = `${this.containerId}-chart`;
            chartDiv.style.cssText = `
                width: 100%;
                height: 400px;
                background: #ffffff;
                border-radius: 4px;
            `;
            chartContainer.appendChild(chartDiv);
            
            // Chart controls
            const controls = document.createElement('div');
            controls.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 10px;
                color: #666;
                font-size: 12px;
            `;
            
            const info = document.createElement('span');
            info.textContent = `ISIN: ${this.instrumentInfo.isin} | WKN: ${this.instrumentInfo.wkn}`;
            
            const legend = document.createElement('span');
            legend.innerHTML = `
                <span style="color: #00ff88;">📈 Price Line</span> | 
                <span style="color: #2196F3;">📊 EMA(${this.emaPeriod})</span> |
                <span style="color: #FF9800;">📊 SMA(${this.smaPeriod})</span> |
                <span style="color: #00ff00;">🟢 Buy</span> | 
                <span style="color: #ff0000;">🔴 Sell</span> | 
                <span style="color: #808080;">⬜ Unknown</span>
            `;
            
            controls.appendChild(info);
            controls.appendChild(legend);
            chartContainer.appendChild(controls);
            
            // Insert chart after the .highcharts-container div
            const highchartsContainer = targetContainer.querySelector('.highcharts-container');
            highchartsContainer.insertAdjacentElement('afterend', chartContainer);
            
            this.chartDiv = chartDiv;
            console.log('📊 Chart container created for LightweightCharts inside existing chart div');
        }
        
        initializeChart() {
            if (!this.isLibraryLoaded || !this.chartDiv) {
                console.log('⚠️ LightweightCharts library or chart div not ready');
                return;
            }
            
            // Check if LightweightCharts is available
            if (typeof LightweightCharts === 'undefined') {
                console.error('❌ LightweightCharts library not available');
                return;
            }
            
            try {
                // Create the chart
                this.chart = LightweightCharts.createChart(this.chartDiv, {
                    width: this.chartDiv.offsetWidth,
                    height: 400,
                    layout: {
                        backgroundColor: '#ffffff',
                        textColor: '#333333',
                        fontSize: 12,
                    },
                    grid: {
                        vertLines: {
                            color: 'transparent',
                            visible: false,
                        },
                        horzLines: {
                            color: 'transparent', 
                            visible: false,
                        },
                    },
                    crosshair: {
                        mode: LightweightCharts.CrosshairMode.Normal,
                    },
                    rightPriceScale: {
                        borderColor: '#dddddd',
                        textColor: '#333333',
                    },
                    leftPriceScale: {
                        borderColor: '#dddddd',
                        textColor: '#333333',
                    },
                    timeScale: {
                        borderColor: '#dddddd',
                        timeVisible: true,
                        secondsVisible: true,
                        textColor: '#333333',
                    },
                });
                
                // Add line series for price data (main chart)
                this.lineSeries = this.chart.addLineSeries({
                    color: '#ff00ff',
                    lineWidth: 2,
                    priceFormat: {
                        type: 'price',
                        precision: 2,
                        minMove: 0.01,
                    },
                });
                
                // Add EMA line series (20-period, blue)
                this.emaSeries = this.chart.addLineSeries({
                    color: '#2196F3', // Blue
                    lineWidth: 2,
                    lineStyle: 0, // Solid line
                    priceFormat: {
                        type: 'price',
                        precision: 2,
                        minMove: 0.01,
                    },
                });
                
                // Add SMA line series (50-period, orange)
                this.smaSeries = this.chart.addLineSeries({
                    color: '#FF9800', // Orange
                    lineWidth: 2,
                    lineStyle: 0, // Solid line
                    priceFormat: {
                        type: 'price',
                        precision: 2,
                        minMove: 0.01,
                    },
                });
                
                // Add histogram series for trade volume bars (bottom of chart)
                this.volumeSeries = this.chart.addHistogramSeries({
                    color: '#26a69a',
                    priceFormat: {
                        type: 'volume',
                        precision: 0,
                        minMove: 1,
                    },
                    priceScaleId: 'volume',
                    scaleMargins: {
                        top: 0.8, // Volume bars take bottom 20% of chart
                        bottom: 0,
                    },
                    base: 0, // Bars start from zero
                });
                
                // Configure volume price scale to show actual trade sizes
                this.chart.priceScale('volume').applyOptions({
                    scaleMargins: {
                        top: 0.8,
                        bottom: 0,
                    },
                    // Ensure the right price scale shows actual trade sizes, not normalized values
                    visible: true,
                    alignLabels: true,
                });
                
                // Handle window resize
                const resizeObserver = new ResizeObserver(entries => {
                    if (this.chart && this.chartDiv) {
                        this.chart.applyOptions({
                            width: this.chartDiv.offsetWidth,
                        });
                    }
                });
                resizeObserver.observe(this.chartDiv);
                
                // Add tooltip functionality
                this.addLegendOverlay();
                
                console.log('📊 LightweightCharts initialized successfully with volume bars');
            } catch (error) {
                console.error('❌ Error initializing LightweightCharts:', error);
                console.error('❌ Available methods on LightweightCharts:', Object.keys(LightweightCharts || {}));
            }
        }
        
        addPriceData(price, timestamp) {
            if (!this.chart || !this.lineSeries) {
                console.log('⚠️ Chart not initialized, skipping price data');
                return;
            }
            
            // Convert timestamp to LightweightCharts format
            // LightweightCharts interprets all timestamps as UTC and displays them in local timezone
            // So we need to adjust our local timestamps to display correctly
            let time;
            let originalDate;
            
            if (typeof timestamp === 'string') {
                originalDate = new Date(timestamp);
            } else if (typeof timestamp === 'number') {
                // If timestamp is already a number, check if it's in milliseconds or seconds
                if (timestamp > 1e10) {
                    originalDate = new Date(timestamp);
                } else {
                    originalDate = new Date(timestamp * 1000);
                }
            } else {
                originalDate = new Date();
            }
            
            // For LightweightCharts: subtract timezone offset so it displays correctly in local time
            const timezoneOffsetMs = originalDate.getTimezoneOffset() * 60 * 1000;
            const adjustedTimestamp = originalDate.getTime() - timezoneOffsetMs;
            time = Math.floor(adjustedTimestamp / 1000);
            
            console.log(`🕐 Price timestamp conversion:`);
            console.log(`  Input: ${timestamp}`);
            console.log(`  Original Date: ${originalDate.toISOString()}`);
            console.log(`  Timezone Offset: ${originalDate.getTimezoneOffset()} minutes`);
            console.log(`  Adjusted Timestamp: ${adjustedTimestamp}`);
            console.log(`  Chart Time: ${time}`);
            console.log(`  Will Display As: ${new Date(time * 1000).toUTCString()}`);
            
            const priceValue = parseFloat(price);
            
            const dataPoint = {
                time: time,
                value: priceValue
            };
            
            // Add to our data array
            this.priceData.push(dataPoint);
            
            // Keep only last hour of data (3600 seconds)
            const cutoffTime = Math.floor((Date.now() - timezoneOffsetMs) / 1000) - 3600;
            this.priceData = this.priceData.filter(d => d.time > cutoffTime);
            
            // Sort by time and remove duplicates
            this.priceData.sort((a, b) => a.time - b.time);
            const uniqueData = this.priceData.filter((item, index, arr) => 
                index === 0 || item.time !== arr[index - 1].time
            );
            
            // Update the price series
            this.lineSeries.setData(uniqueData);
            
            // Create or update candle data for moving averages
            // For simplicity, we'll use the price as open, high, low, and close
            // We dont have OHLC data from L&S
            const candleData = {
                time: time,
                open: priceValue,
                high: priceValue,
                low: priceValue,
                close: priceValue
            };
            
            // Update moving averages with new candle data
            this.updateMovingAverages(candleData);
            
            console.log(`📊 Price data updated: €${price} at ${originalDate.toLocaleTimeString()}`);
        }
        
        addLegendOverlay() {
            if (!this.chart || !this.chartDiv) return;
            
            // Create legend container
            const legend = document.createElement('div');
            legend.style.cssText = `
                position: absolute;
                left: 12px;
                top: 12px;
                z-index: 1;
                font-size: 14px;
                font-family: sans-serif;
                line-height: 18px;
                font-weight: 300;
                pointer-events: none;
                background: rgba(255, 255, 255, 0.9);
                padding: 8px 12px;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            `;
            this.chartDiv.appendChild(legend);
            
            // Create price row
            const priceRow = document.createElement('div');
            priceRow.innerHTML = `${this.instrumentInfo.name} <strong>--</strong>`;
            priceRow.style.color = '#ff00ff';
            priceRow.style.fontWeight = '500';
            legend.appendChild(priceRow);
            
            // Create EMA row
            const emaRow = document.createElement('div');
            emaRow.innerHTML = `EMA(${this.emaPeriod}) <strong>--</strong>`;
            emaRow.style.color = '#2196F3';
            emaRow.style.fontSize = '12px';
            emaRow.style.marginTop = '2px';
            legend.appendChild(emaRow);
            
            // Create SMA row
            const smaRow = document.createElement('div');
            smaRow.innerHTML = `SMA(${this.smaPeriod}) <strong>--</strong>`;
            smaRow.style.color = '#FF9800';
            smaRow.style.fontSize = '12px';
            smaRow.style.marginTop = '2px';
            legend.appendChild(smaRow);
            
            // Create volume row
            const volumeRow = document.createElement('div');
            volumeRow.innerHTML = `Volume <strong>--</strong>`;
            volumeRow.style.color = '#666';
            volumeRow.style.fontSize = '12px';
            volumeRow.style.marginTop = '4px';
            legend.appendChild(volumeRow);
            
            // Subscribe to crosshair move events
            this.chart.subscribeCrosshairMove(param => {
                if (param.time) {
                    // Get price data
                    const priceData = param.seriesData.get(this.lineSeries);
                    let priceFormatted = '--';
                    if (priceData && priceData.value !== undefined) {
                        priceFormatted = `€${priceData.value.toFixed(2)}`;
                    }
                    
                    // Get EMA data
                    const emaData = param.seriesData.get(this.emaSeries);
                    let emaFormatted = '--';
                    if (emaData && emaData.value !== undefined) {
                        emaFormatted = `€${emaData.value.toFixed(2)}`;
                    }
                    
                    // Get SMA data
                    const smaData = param.seriesData.get(this.smaSeries);
                    let smaFormatted = '--';
                    if (smaData && smaData.value !== undefined) {
                        smaFormatted = `€${smaData.value.toFixed(2)}`;
                    }
                    
                    // Get volume data and trade information
                    const volumeData = param.seriesData.get(this.volumeSeries);
                    let volumeFormatted = '--';
                    let volumeColor = '#666';
                    
                    if (volumeData && volumeData.value !== undefined) {
                        // Look up trade data for this specific time
                        const tradeData = this.tradeTooltipData.get(param.time);
                        console.log(`🔍 Legend hover - Time: ${param.time}, Trade data:`, tradeData);
                        console.log(`🔍 Legend hover - Volume data value: ${volumeData.value}`);
                        
                        if (tradeData) {
                            // Always show actual trade size, not the normalized volume
                            // Convert the chart time back to local time for display
                            const chartTimeMs = param.time * 1000;
                            const localTime = new Date(chartTimeMs + (new Date().getTimezoneOffset() * 60 * 1000));
                            const timeString = localTime.toLocaleTimeString();
                            
                            volumeFormatted = `${tradeData.size.toLocaleString()} @ €${tradeData.price.toFixed(2)} (${timeString})`;
                            volumeColor = tradeData.side === 'buy' ? '#00ff00' : 
                                         tradeData.side === 'sell' ? '#ff0000' : '#666';
                            
                            const sideText = tradeData.side.toUpperCase();
                            volumeFormatted = `${sideText} ${volumeFormatted}`;
                            
                            // Also update price to show trade price when hovering volume
                            priceFormatted = `€${tradeData.price.toFixed(2)}`;
                            
                            console.log(`✅ Legend showing: ${volumeFormatted} (actual size: ${tradeData.size})`);
                        } else {
                            // Show message when no trade data available
                            volumeFormatted = `No trade data`;
                            console.log(`❌ No trade data found for time ${param.time}`);
                            console.log(`❌ Available trade data times:`, Array.from(this.tradeTooltipData.keys()));
                        }
                    }
                    
                    // Update legend
                    priceRow.innerHTML = `${this.instrumentInfo.name} <strong>${priceFormatted}</strong>`;
                    emaRow.innerHTML = `EMA(${this.emaPeriod}) <strong>${emaFormatted}</strong>`;
                    smaRow.innerHTML = `SMA(${this.smaPeriod}) <strong>${smaFormatted}</strong>`;
                    volumeRow.innerHTML = `Volume <strong style="color: ${volumeColor}">${volumeFormatted}</strong>`;
                } else {
                    // Reset to default when not hovering
                    priceRow.innerHTML = `${this.instrumentInfo.name} <strong>--</strong>`;
                    emaRow.innerHTML = `EMA(${this.emaPeriod}) <strong>--</strong>`;
                    smaRow.innerHTML = `SMA(${this.smaPeriod}) <strong>--</strong>`;
                    volumeRow.innerHTML = `Volume <strong>--</strong>`;
                }
            });
        }
        
        addTradeData(price, size, side, timestamp) {
            if (!this.chart || !this.volumeSeries) {
                console.log('⚠️ Chart not initialized, skipping trade data');
                return;
            }
            
            // Convert timestamp to LightweightCharts format
            // LightweightCharts interprets all timestamps as UTC and displays them in local timezone
            // So we need to adjust our local timestamps to display correctly
            let time;
            let originalDate;
            
            if (typeof timestamp === 'string') {
                originalDate = new Date(timestamp);
            } else if (typeof timestamp === 'number') {
                // If timestamp is already a number, check if it's in milliseconds or seconds
                if (timestamp > 1e10) {
                    originalDate = new Date(timestamp);
                } else {
                    originalDate = new Date(timestamp * 1000);
                }
            } else {
                originalDate = new Date();
            }
            
            // For LightweightCharts: subtract timezone offset so it displays correctly in local time
            const timezoneOffsetMs = originalDate.getTimezoneOffset() * 60 * 1000;
            const adjustedTimestamp = originalDate.getTime() - timezoneOffsetMs;
            time = Math.floor(adjustedTimestamp / 1000);
            
            console.log(`🕐 Trade timestamp conversion:`);
            console.log(`  Input: ${timestamp}`);
            console.log(`  Original Date: ${originalDate.toISOString()}`);
            console.log(`  Timezone Offset: ${originalDate.getTimezoneOffset()} minutes`);
            console.log(`  Adjusted Timestamp: ${adjustedTimestamp}`);
            console.log(`  Chart Time: ${time}`);
            
            // Determine bar color based on trade side
            let color = '#808080'; // N/A (gray)
            
            if (side === 'buy') {
                color = '#00ff00'; // Buy (green)
            } else if (side === 'sell') {
                color = '#ff0000'; // Sell (red)
            }
            
            // Use actual trade size for the chart (no normalization)
            // The chart should display the real trade volumes
            const actualSize = parseFloat(size);
            
            // Create volume bar data point with actual trade size
            const volumePoint = {
                time: time,
                value: actualSize, // Use actual size, not normalized
                color: color
            };
            
            // Store trade data for tooltip lookup
            this.tradeTooltipData.set(time, {
                price: parseFloat(price),
                size: parseFloat(size),
                side: side,
                timestamp: timestamp
            });
            
            console.log(`💾 Storing trade data - Time: ${time}, Size: ${parseFloat(size)}, Price: ${parseFloat(price)}, Side: ${side}`);
            console.log(`💾 Chart will display actual size: ${actualSize} (no normalization applied)`);
            
            // Add to volume data array
            this.volumeData.push(volumePoint);
            
            // Keep only last hour of volume data
            const cutoffTime = Math.floor((Date.now() - timezoneOffsetMs) / 1000) - 3600;
            this.volumeData = this.volumeData.filter(v => v.time > cutoffTime);
            
            // Clean up old tooltip data
            for (const [time, data] of this.tradeTooltipData) {
                if (time <= cutoffTime) {
                    this.tradeTooltipData.delete(time);
                }
            }
            
            // Sort volume data by time
            this.volumeData.sort((a, b) => a.time - b.time);
            
            // Update volume series with all data
            this.volumeSeries.setData(this.volumeData);
            
            console.log(`📊 Volume bar added: ${side} ${size} shares at €${price} (actual size: ${actualSize}, ${originalDate.toLocaleTimeString()})`);
        }
        
        destroy() {
            if (this.chart) {
                this.chart.remove();
                this.chart = null;
                this.lineSeries = null;
                this.volumeSeries = null;
                this.emaSeries = null;
                this.smaSeries = null;
            }
            
            const container = document.getElementById(this.containerId);
            if (container) {
                container.remove();
            }
            
            // Clear data arrays
            this.priceData = [];
            this.candleData = [];
            this.volumeData = [];
            this.emaData = [];
            this.smaData = [];
            this.tradeTooltipData.clear();
            
            console.log('📊 Chart destroyed with moving averages cleanup');
        }
    }
    
    // Price tracking and trade direction analysis (per instrument)
    const instrumentPriceDict = {}; // { instrumentItem: { timestamp: { bid: value, ask: value } } }
    const instrumentLastKnownBidAsk = {}; // { instrumentItem: { bid: value, ask: value } }
    tradingHandler = new TradingEventHandler();
    
    function getBuyOrSellBefore(price, timestamp, instrumentItem) {
        // Get price history for this specific instrument
        const priceDict = instrumentPriceDict[instrumentItem] || {};
        const lastKnownBidAsk = instrumentLastKnownBidAsk[instrumentItem] || { bid: null, ask: null };
        
        const sortedTimestamps = Object.keys(priceDict).sort().reverse();
        
        console.log(`🔍 ANALYZING: Trade ${price} at ${timestamp} for instrument ${instrumentItem}`);
        console.log(`🔍 SEARCHING: ${sortedTimestamps.length} price records + last known bid/ask for ${instrumentItem}`);
        
        for (const ts of sortedTimestamps) {
            if (ts < timestamp) {
                const priceData = priceDict[ts];
                
                if (priceData.ask && Math.abs(priceData.ask - price) < 0.0001) {
                    console.log(`🔍 MATCH: Trade ${price} matched ASK ${priceData.ask} at ${ts} → BUY`);
                    cleanPriceHistory(ts, instrumentItem);
                    return "BUY";
                }
                
                if (priceData.bid && Math.abs(priceData.bid - price) < 0.0001) {
                    console.log(`🔍 MATCH: Trade ${price} matched BID ${priceData.bid} at ${ts} → SELL`);
                    cleanPriceHistory(ts, instrumentItem);
                    return "SELL";
                }
            }
        }
        
        // Check against last known bid/ask for this instrument
        if (lastKnownBidAsk.ask && Math.abs(lastKnownBidAsk.ask - price) < 0.0001) {
            console.log(`🔍 MATCH: Trade ${price} matched LAST KNOWN ASK ${lastKnownBidAsk.ask} → BUY`);
            return "BUY";
        }
        
        if (lastKnownBidAsk.bid && Math.abs(lastKnownBidAsk.bid - price) < 0.0001) {
            console.log(`🔍 MATCH: Trade ${price} matched LAST KNOWN BID ${lastKnownBidAsk.bid} → SELL`);
            return "SELL";
        }
        
        console.log(`🔍 NO MATCH: Trade ${price} at ${timestamp} - no matching bid/ask found for ${instrumentItem}`);
        return "N/A";
    }
    
    function cleanPriceHistory(afterTimestamp, instrumentItem) {
        const priceDict = instrumentPriceDict[instrumentItem] || {};
        const timestamps = Object.keys(priceDict);
        let removedCount = 0;
        
        // Ensure lastKnownBidAsk exists for this instrument
        if (!instrumentLastKnownBidAsk[instrumentItem]) {
            instrumentLastKnownBidAsk[instrumentItem] = { bid: null, ask: null };
        }
        
        for (const ts of timestamps) {
            if (ts <= afterTimestamp) {
                if (priceDict[ts].bid) instrumentLastKnownBidAsk[instrumentItem].bid = priceDict[ts].bid;
                if (priceDict[ts].ask) instrumentLastKnownBidAsk[instrumentItem].ask = priceDict[ts].ask;
                delete priceDict[ts];
                removedCount++;
            }
        }
        
        if (removedCount > 0) {
            console.log(`🧹 CLEANED: Removed ${removedCount} old price records for ${instrumentItem} after ${afterTimestamp}`);
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
        
        // Read tab role information FIRST before making any decisions
        const dataElement = document.getElementById('ls-watchlist-data');
        if (dataElement) {
            const roleAttr = dataElement.getAttribute('data-tab-role');
            const shouldConnectAttr = dataElement.getAttribute('data-should-connect');
            
            console.log('🔍 Raw attributes:', {
                'data-tab-role': roleAttr,
                'data-should-connect': shouldConnectAttr
            });
            
            tabRole = roleAttr || 'primary';
            shouldConnect = shouldConnectAttr === 'true';
            
            console.log(`📋 Tab role: ${tabRole}, should connect: ${shouldConnect}`);
        } else {
            console.warn('⚠️ No watchlist data element found - using defaults');
            tabRole = 'primary';
            shouldConnect = true;
        }
        
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
            // Additional safety check: look for existing LightstreamerClient connections
            const existingClients = Object.keys(window).filter(key => 
                window[key] && 
                typeof window[key] === 'object' && 
                window[key].constructor && 
                window[key].constructor.name === 'LightstreamerClient' &&
                window[key].getStatus && 
                window[key].getStatus().includes('CONNECT')
            );
            
            if (existingClients.length > 0) {
                console.log('⚠️ Found existing LightstreamerClient connection, becoming secondary tab');
                tabRole = 'secondary';
                shouldConnect = false;
                setupSubscriptions(null);
                return;
            }
            
            // Only create/connect client for primary tabs
            console.log(`🔍 Checking LightstreamerClient creation conditions...`);
            console.log(`🔍 tabRole: "${tabRole}", shouldConnect: ${shouldConnect}`);
            console.log(`🔍 Condition check: tabRole === 'primary' && shouldConnect = ${tabRole === 'primary' && shouldConnect}`);
            
            if (tabRole === 'primary' && shouldConnect) {
                // Additional validation: ensure role was explicitly set
                const dataElement = document.getElementById('ls-watchlist-data');
                const explicitRole = dataElement?.getAttribute('data-tab-role');
                const explicitConnect = dataElement?.getAttribute('data-should-connect');
                
                console.log(`🔍 Explicit validation - role: "${explicitRole}", connect: "${explicitConnect}"`);
                console.log(`🔍 Validation check: !explicitRole || !explicitConnect = ${!explicitRole || !explicitConnect}`);
                
                if (!explicitRole || !explicitConnect) {
                    console.error('❌ Role attributes not properly set by content script!');
                    console.error('❌ This suggests a timing issue or content script failure');
                    console.error('❌ Refusing to create LightstreamerClient to prevent duplicates');
                    setupSubscriptions(null);
                    return;
                }
                
                console.log('🔧 Creating new LightstreamerClient (PRIMARY TAB)...');
                console.log('🔧 Validated role attributes:', { explicitRole, explicitConnect });
                
                // Double-check no other tab has created a client in the meantime
                if (window.lsClient) {
                    console.log('⚠️ LightstreamerClient already exists, becoming secondary');
                    tabRole = 'secondary';
                    shouldConnect = false;
                    setupSubscriptions(window.lsClient);
                    return;
                }
                
                // Disconnect any existing client to prevent connection leaks
                if (window.lsClient && window.lsClient.disconnect) {
                    console.log('🔌 Disconnecting existing LightstreamerClient to prevent leaks');
                    window.lsClient.disconnect();
                }
                
                client = new LightstreamerClient("https://push.ls-tc.de:443", "WALLSTREETONLINE");
                
                // Store reference for future use
                window.lsClient = client;
                
                // Connect the client
                if (client.connect) {
                    client.connect();
                    console.log('🔌 LightstreamerClient connecting...');
                }
            } else {
                console.log('📱 Secondary tab or waiting for promotion - not creating LightstreamerClient');
                // Still setup subscriptions for chart display
                setupSubscriptions(null);
                return;
            }
        }
        
        console.log(`🎯 LightstreamerClient integration starting (${tabRole} tab)...`);
        setupSubscriptions(client);
    }
    
    function setupSubscriptions(client) {
        // Get instrument info from page - will throw exception if not found
        try {
            const instrumentInfo = extractInstrumentInfo();
            console.log('📋 Instrument data:', instrumentInfo);
            
            // Register this tab with background script based on its role
            if (tabRole === 'primary' && instrumentInfo.currentPageInstrument) {
                console.log('👑 Registering primary tab with background script:', instrumentInfo.currentPageInstrument);
                window.postMessage({
                    type: 'LS_TICKER_PRIMARY_REGISTER',
                    instrumentInfo: instrumentInfo.currentPageInstrument
                }, '*');
            }
            
            // Always initialize chart for current page instrument (both primary and secondary)
            if (instrumentInfo.currentPageInstrument && !realtimeChart) {
                const chartId = `realtime-chart-${instrumentInfo.currentPageInstrument.isin}`;
                realtimeChart = new RealtimeChart(chartId, instrumentInfo.currentPageInstrument);
                console.log(`📊 Real-time chart initialized for current page (${tabRole} tab):`, instrumentInfo.currentPageInstrument.name);
            } else if (realtimeChart) {
                console.log('📊 Real-time chart already exists, skipping creation');
            } else {
                console.log('📊 No chart created - current page instrument not in watchlist');
            }
            
            if (tabRole === 'secondary' || !client) {
                console.log('📱 Secondary tab or no client - listening for events from primary tab via background script');
                setupSecondaryTabListeners(instrumentInfo);
                return; // Don't connect to LightStream
            }
            
            if (!shouldConnect) {
                console.log('⚠️ Primary tab but shouldConnect is false - waiting for promotion');
                setupSecondaryTabListeners(instrumentInfo); // Listen for promotion messages
                return;
            }
            
            console.log('� Primary tab - connecting to LightStream...');
            
            // Wait for client to be connected (PRIMARY TAB ONLY)
            const checkConnection = () => {
                const status = client.getStatus();
                console.log('📊 Client status:', status);
                
                if (status.includes('CONNECTED') && (status.includes('STREAMING') || status.includes('POLLING'))) {
                    console.log('🎉 Connected! Setting up our subscriptions...');
                    initializeLightstreamerSubscriptions(client, instrumentInfo);
                } else if (status === 'DISCONNECTED') {
                    console.log('🔄 Client disconnected, will retry...');
                    setTimeout(checkConnection, 2000);
                } else {
                    console.log('⏳ Waiting for connection...');
                    setTimeout(checkConnection, 1000);
                }
            };
            
            checkConnection();
        } catch (error) {
            console.error('❌ FATAL: Could not extract instrument information:', error.message);
            console.error('💡 SOLUTION: Please configure instruments in the extension options page and ensure you are on a supported ls-tc.de page');
            throw error; // Re-throw to stop initialization
        }
    }
    
    function extractInstrumentInfo() {
        // Try to get watchlist info from the DOM element created by content script
        const dataElement = document.getElementById('ls-watchlist-data');
        if (dataElement) {
            try {
                const watchlistData = JSON.parse(dataElement.getAttribute('data-watchlist'));
                console.log('📋 Using watchlist info from content script:', watchlistData);
                
                if (!watchlistData || Object.keys(watchlistData).length === 0) {
                    throw new Error('Watchlist data is empty - no instruments configured');
                }
                
                // Get current page's ISIN to filter instruments
                const currentPageIsin = getCurrentPageIsin();
                console.log('🔍 Current page ISIN:', currentPageIsin);
                
                // Convert watchlist to array of instrument info for subscriptions
                const instruments = Object.entries(watchlistData).map(([wkn, instrument]) => ({
                    id: instrument.id,
                    item: `${instrument.id}@1`,
                    name: instrument.name,
                    wkn: wkn,
                    isin: instrument.isin
                }));
                
                // Find the current page's instrument for chart display
                let currentPageInstrument = null;
                if (currentPageIsin) {
                    currentPageInstrument = instruments.find(inst => inst.isin === currentPageIsin);
                    if (currentPageInstrument) {
                        console.log('📊 Found current page instrument:', currentPageInstrument.name);
                    } else {
                        console.log('⚠️ Current page ISIN not found in watchlist - chart will not be displayed');
                    }
                }
                
                console.log(`📊 Found ${instruments.length} instruments in watchlist:`, 
                    instruments.map(i => `${i.name} (${i.wkn})`));
                
                return { 
                    instruments, 
                    currentPageInstrument,
                    currentPageIsin,
                    isWatchlist: true 
                };
            } catch (e) {
                throw new Error(`Failed to parse watchlist data from DOM element: ${e.message}`);
            }
        }

        // If no watchlist data element found, throw an exception
        throw new Error('No instrument data found - content script must provide ls-watchlist-data element. Please ensure the extension is properly configured with instruments.');
    }
    
    function getCurrentPageIsin() {
        // Look for ISIN in .informerhead elements only
        const informerHeads = document.querySelectorAll('.informerhead');
        for (const element of informerHeads) {
            const text = element.textContent;
            const isinMatch = text.match(/ISIN[:\s]*([A-Z]{2}[A-Z0-9]{10})/i);
            if (isinMatch) {
                return isinMatch[1].toUpperCase();
            }
        }
        
        console.log('⚠️ Could not find ISIN in .informerhead elements - chart will not be injected');
        return null;
    }
    
    function initializeLightstreamerSubscriptions(client, instrumentInfo) {
        console.log('📊 Initializing Lightstreamer subscriptions for multi-instrument monitoring...');
        
        // Create item list from all instruments
        const itemList = instrumentInfo.instruments.map(inst => inst.item);
        console.log('📋 Subscribing to items:', itemList);
        
        // Exact field lists from original index.js
        const quoteFieldList = ["instrumentId", "isin", "displayName", "trade", "bid", "ask", "tradeTime", "bidTime", "askTime", "tradeSize", "bidSize", "askSize", "categoryId", "currencySymbol", "currencyISO"];
        const pushtableFieldList = ["ask", "askTime", "askSize", "bid", "bidTime", "bidSize", "trade", "tradeTime", "tradeSize", "currencySymbol", "categoryId"];
        
        // Clean up existing subscriptions to prevent leaks
        if (quoteSubscription && client.unsubscribe) {
            console.log('🧹 Unsubscribing existing QUOTES subscription to prevent leaks');
            client.unsubscribe(quoteSubscription);
            quoteSubscription = null;
        }
        
        if (pushtableSubscription && client.unsubscribe) {
            console.log('🧹 Unsubscribing existing PUSHTABLE subscription to prevent leaks');
            client.unsubscribe(pushtableSubscription);
            pushtableSubscription = null;
        }
        
        // QUOTES subscription (for price tracking)
        quoteSubscription = new Subscription("MERGE", itemList, quoteFieldList);
        
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
                
                // Update price dictionary per instrument
                if (bid || ask) {
                    // Initialize price dict for this instrument if needed
                    if (!instrumentPriceDict[itemName]) {
                        instrumentPriceDict[itemName] = {};
                    }
                    
                    if (!instrumentPriceDict[itemName][latestTimestamp]) {
                        instrumentPriceDict[itemName][latestTimestamp] = {};
                    }
                    
                    // Only populate bid and ask (NOT trade) like original
                    if (bid) instrumentPriceDict[itemName][latestTimestamp].bid = parseFloat(bid);
                    if (ask) instrumentPriceDict[itemName][latestTimestamp].ask = parseFloat(ask);
                    
                    console.log(`📈 PRICE DICT for ${instrumentName}: ${Object.keys(instrumentPriceDict[itemName]).length} entries, latest: ${latestTimestamp}`);
                    console.log(`📈 LATEST PRICES for ${instrumentName}: ${JSON.stringify(instrumentPriceDict[itemName][latestTimestamp], null, 2)}`);
                    
                    // Call quote handler with instrument info
                    tradingHandler.handleQuoteUpdate(bid, ask, latestTimestamp, instrument);
                }
            }
        });
        
        quoteSubscription.setDataAdapter("QUOTE");
        quoteSubscription.setRequestedSnapshot("no");
        client.subscribe(quoteSubscription);
        
        // PUSHTABLE subscription (for trade executions only - quotes handled by QUOTE subscription)
        pushtableSubscription = new Subscription("MERGE", itemList, pushtableFieldList);
        
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
                        const decision = getBuyOrSellBefore(parseFloat(trade), tradeTime, itemName);
                        
                        console.log(`🔥 TRADE EXECUTION for ${instrumentName}: ${trade} × ${tradeSize} at ${tradeTime} (${decision})`);
                        
                        // Use exact same handler call as original with instrument info
                        tradingHandler.handleTrade(trade, tradeSize, tradeTime, decision, instrument);
                    } else {
                        console.log(`⚠️ INCOMPLETE TRADE DATA for ${instrumentName}: trade=${trade}, tradeTime=${tradeTime}, tradeSize=${tradeSize}`);
                    }
                } else if (currentTradeTime) {
                    console.log('⏭️ TRADETIME UNCHANGED - Skipping duplicate trade data');
                } else {
                    console.log('⚠️ NO TRADETIME - Not a trade execution update');
                }
            }
        });
        
        pushtableSubscription.setDataAdapter("QUOTE");
        pushtableSubscription.setRequestedSnapshot("no");
        client.subscribe(pushtableSubscription);
        
        console.log('✅ Lightstreamer subscriptions initialized successfully!');
    }
    
    // Setup listeners for secondary tabs to receive events from primary tab
    function setupSecondaryTabListeners(instrumentInfo) {
        console.log('📱 Setting up secondary tab event listeners...');
        
        // Register this secondary tab with the background script, including instrument info
        if (instrumentInfo && instrumentInfo.currentPageInstrument) {
            console.log('📱 Registering secondary tab with background script:', instrumentInfo.currentPageInstrument);
            window.postMessage({
                type: 'LS_TICKER_SECONDARY_REGISTER',
                instrumentInfo: instrumentInfo.currentPageInstrument
            }, '*');
        } else {
            console.warn('⚠️ Cannot register secondary tab - no instrument info available');
        }
        
        // Listen for events from content script (broadcasted from background)
        window.addEventListener('message', (event) => {
            if (event.source !== window) return;
            
            if (event.data.type === 'LS_TICKER_SECONDARY_EVENT') {
                const eventData = event.data.data;
                console.log('📱 Secondary tab received event:', eventData);
                
                // Process the event for chart updates only
                if (eventData.eventType === 'TRADE' && realtimeChart) {
                    const tradeData = eventData.event;
                    if (realtimeChart.instrumentInfo.isin === tradeData.isin) {
                        console.log('📊 Updating chart with trade data from primary tab');
                        realtimeChart.addTradeData(tradeData.price, tradeData.size, tradeData.direction.toLowerCase(), tradeData.ts);
                    }
                } else if (eventData.eventType === 'QUOTE' && realtimeChart) {
                    const quoteData = eventData.event;
                    if (realtimeChart.instrumentInfo.isin === quoteData.isin) {
                        console.log('📊 Updating chart with quote data from primary tab');
                        realtimeChart.addPriceData(quoteData.price, quoteData.ts);
                    }
                }
            } else if (event.data.type === 'LS_TICKER_START_CONNECTION') {
                console.log('👑 Secondary tab promoted to primary - starting LightStream connection');
                tabRole = 'primary';
                shouldConnect = true;
                
                // Restart the initialization process as primary
                setTimeout(() => {
                    initializeLightstreamerIntegration();
                }, 1000);
            }
        });
    }
    
    // Start initialization
    initializeLightstreamerIntegration();
    
    // Cleanup function to prevent connection leaks
    function cleanup() {
        console.log('🧹 Cleaning up LightStreamer connections...');
        
        // Unsubscribe from existing subscriptions
        if (window.lsClient && window.lsClient.unsubscribe) {
            if (quoteSubscription) {
                console.log('🧹 Unsubscribing from QUOTES subscription');
                window.lsClient.unsubscribe(quoteSubscription);
                quoteSubscription = null;
            }
            
            if (pushtableSubscription) {
                console.log('🧹 Unsubscribing from PUSHTABLE subscription');
                window.lsClient.unsubscribe(pushtableSubscription);
                pushtableSubscription = null;
            }
        }
        
        if (window.lsClient && window.lsClient.disconnect) {
            console.log('🔌 Disconnecting LightstreamerClient');
            window.lsClient.disconnect();
            window.lsClient = null;
        }
        
        if (realtimeChart) {
            console.log('📊 Destroying real-time chart');
            realtimeChart.destroy();
            realtimeChart = null;
        }
        
        console.log('✅ Cleanup completed');
    }
    
    // Register cleanup handlers for page unload
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide', cleanup);
    
    // Also cleanup when the extension context is invalidated
    window.addEventListener('unload', cleanup);
    
})();
