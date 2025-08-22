# Lightstreamer Multi-Stock Ticker Logger

A real-time multi-stock data logger that replicates the exact behavior of the original `lightstreamer-push.js` from ls-tc.de, but instead of manipulating DOM elements, it logs all HTML changes to the console for analysis and monitoring of multiple stocks simultaneously.

## 🏗️ Project Structure

```
ls-stock-ticker/
└── node-app/            # Node.js standalone application
    ├── index.js         # Main application using Puppeteer
    ├── lib.js           # Standalone library version
    ├── package.json
    └── tradingEventHandler.js
```

## 🏗️ Architecture & Design

### Core Components

1. **`node-app/index.js`** - Main application file using Puppeteer to run in browser context
2. **`node-app/lib.js`** - Standalone library version of the modified lightstreamer-push logic

### Stock Watchlist Configuration

The system supports monitoring multiple stocks through a simple configuration:

```javascript
const STOCK_WATCHLIST = {
    '554550': { id: '43763', name: 'NVIDIA CORP.' },        // NVIDIA
    '865985': { id: 'XXXXX', name: 'APPLE INC.' },          // Apple  
    '906866': { id: 'XXXXX', name: 'TESLA INC.' },          // Tesla
    '870450': { id: 'XXXXX', name: 'ALPHABET INC.' },       // Google
};
```

**WKN Mapping**: Each stock is identified by its WKN (Wertpapierkennnummer) which maps to the internal ls-tc.de instrument ID.

### Design Philosophy

The project follows a **reverse-engineering approach**:
- ✅ Preserves exact original logic from `lightstreamer-push.js`
- ✅ Maintains all three subscription types (QUOTES, PUSHTABLE, REALTIME)
- ✅ Replicates field filtering and change detection algorithms
- ✅ Handles multiple table types ("trades" and "quotes") correctly
- ✅ Supports multiple stocks in a single session
- ✅ Replaces DOM manipulation with detailed console logging

### Lightstreamer Integration

The logger connects to `https://push.ls-tc.de:443` using three distinct subscriptions:

| Subscription | Adapter | Mode | Fields | Purpose |
|-------------|---------|------|---------|----------|
| **QUOTES** | QUOTE | MERGE | 15 fields | Real-time quote updates |
| **PUSHTABLE** | QUOTE | COMMAND | 11 fields | Push table with trades/quotes |
| **REALTIME** | REALTIME | MERGE | 9 fields | Real-time trade updates |

### Field Processing Logic

The system only logs fields that:
- ✅ Have changed from their previous value
- ✅ Are not null or empty
- ✅ Match specific field names in switch statements
- ✅ Are properly processed by table type (trades vs quotes)

## 🚀 Usage

### Quick Start

```bash
# Install dependencies
npm install

# Run the main logger
node index.js

# Or use the standalone library (for embedding in other projects)
node lib.js
```

### Output Format

The logger produces structured output with visual indicators for each stock:

#### Connection Status
```
🚀 Starting Multi-Stock Lightstreamer Logger...
📊 Watching 2 stock(s): NVIDIA CORP., APPLE INC.
📋 Stock mappings:
   📈 WKN 554550 -> 43763@1 (NVIDIA CORP.)
   📈 WKN 865985 -> XXXXXXX@1 (APPLE INC.)
🌐 Loading stock page...
📊 Connected to: https://push.ls-tc.de:443
📊 Client status: CONNECTED:WS-STREAMING
✅ QUOTES subscribed with 15 fields for 2 stocks
✅ PUSHTABLE subscribed with 11 fields for 2 stocks
✅ REALTIME subscribed with 9 fields for 2 stocks
```

#### Real-time Data Updates

**QUOTES Subscription:**
```
📊 ===== QUOTES UPDATE (NVIDIA CORP.) =====
🎯 Item: 43763@1
📊 BID: 151.02  🟢 ↗️ [43763@1] 20.8.2025, 12:32:50
📊 HTML UPDATE: [item="43763@1"][field="bid"][table="quotes"] = "151.02" (background: #005D42) [trend: pos]
📊 ASK: 151.06  🟢 ↗️ [43763@1] 20.8.2025, 12:32:50  
📊 HTML UPDATE: [item="43763@1"][field="ask"][table="quotes"] = "151.06" (background: #005D42) [trend: pos]
```

**Multi-Stock Processing:**
```
📊 ===== QUOTES UPDATE (NVIDIA CORP.) =====
🎯 Item: 43763@1
📊 BID: 151.02  🟢 ↗️ [43763@1] 20.8.2025, 12:32:50

📊 ===== QUOTES UPDATE (APPLE INC.) =====
🎯 Item: XXXXXXX@1
📊 BID: 189.50  🔴 ↘️ [XXXXXXX@1] 20.8.2025, 12:32:51
```

**PUSHTABLE Subscription (Dual Table Processing):**
```
📊 ===== PUSHTABLE UPDATE =====
🎯 Item: 43763@1
📊 ASK: 151.06  🟢 ↗️ [43763@1] [trades] 20.8.2025, 12:32:50
📊 HTML UPDATE: [field='ask'] = "151.06" (background: #005D42)
📊 ASK: 151.06  🟢 ↗️ [43763@1] [quotes] 20.8.2025, 12:32:50  
📊 HTML UPDATE: [field='ask'] = "151.06" (background: #005D42)
```

### Visual Indicators

| Symbol | Meaning | Background Color |
|--------|---------|------------------|
| 🟢 ↗️ | Positive trend | `#005D42` (Green) |
| 🔴 ↘️ | Negative trend | `#BE2D36` (Red) |
| 🟡 ➡️ | Equal/No change | `#CCCCCC` (Gray) |

## 📊 Output Analysis

### Data Fields Logged

**Core Price Fields:**
- `trade`, `bid`, `ask` - Current prices with trend indicators
- `tradeTime`, `bidTime`, `askTime` - Microsecond precision timestamps
- `tradeSize`, `bidSize`, `askSize` - Volume information

**Formatted Fields:**
- `tradeWithCurrency`, `bidWithCurrency`, `askWithCurrency` - Price + currency
- `displayName`, `isin`, `instrumentId` - Security identification

### Table Type Processing

The PUSHTABLE subscription processes both table types:
- **[trades]** - Trade-specific data and logic
- **[quotes]** - Quote-specific data and logic

This dual processing replicates the original behavior where different DOM elements had different `data("type")` attributes.

## 🔧 Technical Details

### Dependencies
```json
{
  "puppeteer": "^22.12.1"
}
```

### Browser Requirements
- Runs in headless Chrome via Puppeteer
- Loads the actual NVIDIA stock page from ls-tc.de
- Executes embedded lightstreamer-push logic in browser context

### Performance
- Real-time WebSocket streaming
- Efficient field filtering (only changed, non-null values)
- Minimal memory footprint with proper cleanup

## 🎯 Use Cases

1. **Multi-Stock Portfolio Analysis** - Monitor multiple stocks simultaneously in real-time
2. **Cross-Stock Market Research** - Compare price movements and volume patterns across different securities
3. **Algorithm Development** - Use logged data for trading algorithm backtesting across multiple assets
4. **Market Surveillance** - Monitor specific stock watchlists for unusual activity  
5. **System Integration** - Embed the logger in larger financial applications for multi-stock tracking
6. **Debugging** - Understand how original lightstreamer-push.js processes data for multiple stocks

## 📝 Example Session Output

```
🚀 Starting Multi-Stock Lightstreamer Logger...
📊 Watching 2 stock(s): NVIDIA CORP., APPLE INC.

📊 ===== QUOTES UPDATE (NVIDIA CORP.) =====
📊 BID: 150.98  🔴 ↘️ [43763@1] 20.8.2025, 12:33:17
📊 HTML UPDATE: [item="43763@1"][field="bid"][table="quotes"] = "150.98" (background: #BE2D36) [trend: neg]

📊 ===== QUOTES UPDATE (APPLE INC.) =====  
📊 ASK: 189.45  � ↗️ [XXXXXXX@1] 20.8.2025, 12:33:18
📊 HTML UPDATE: [item="XXXXXXX@1"][field="ask"][table="quotes"] = "189.45" (background: #005D42) [trend: pos]

📊 ===== PUSHTABLE UPDATE (NVIDIA CORP.) =====
📊 ASK: 151.00  🔴 ↘️ [43763@1] [trades] 20.8.2025, 12:33:18
📊 HTML UPDATE: [field='ask'] = "151.00" (background: #BE2D36)
```

This shows simultaneous monitoring with NVIDIA declining and Apple gaining, with proper stock identification in each update.
