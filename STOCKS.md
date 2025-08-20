# Stock Configuration Guide - ISIN-Based System

## Overview

The stock ticker now uses a simple **ISIN-based configuration system** that automatically fetches all required information from the ls-tc.de API. You just need to provide ISINs (International Securities Identification Numbers) and the system handles everything else automatically.

## How It Works

1. **Simple Configuration**: Add ISINs to a simple array
2. **Automatic API Calls**: System calls `https://www.ls-tc.de/_rpc/json/.lstc/instrument/search/main?q={ISIN}&localeId=2`
3. **Dynamic Mapping**: Automatically gets instrument IDs, WKNs, company names, and symbols
4. **Real-time Monitoring**: Subscribes to live data using the fetched information

## Adding New Stocks

### Step 1: Find the ISIN

ISINs are standardized 12-character identifiers for securities. You can find them on:
- **Financial websites**: Yahoo Finance, Google Finance, Bloomberg
- **Your broker's platform**: Most trading platforms display ISINs
- **Company investor relations**: Annual reports and official documents
- **Stock exchanges**: Official listings show ISINs

### Step 2: Add to Configuration

Simply edit the `ISIN_WATCHLIST` array in `index.js`:

```javascript
const ISIN_WATCHLIST = [
    'US67066G1040',  // NVIDIA CORP.
    'US0378331005',  // Apple Inc.
    'US88160R1014',  // Tesla Inc.
    'US02079K3059',  // Alphabet Inc. (Google)
    // Add more ISINs here:
    'YOUR_ISIN_HERE',
];
```

### Step 3: Test

Run the system and watch the startup output:
```bash
node index.js
```

The system will automatically:
- Fetch instrument data for each ISIN
- Display the discovered information (company name, instrument ID, WKN)
- Start monitoring real-time data

## Popular Stock ISINs

Here are ISINs for commonly traded stocks:

### US Tech Stocks
| Company | ISIN | Symbol | Notes |
|---------|------|---------|--------|
| NVIDIA Corp. | US67066G1040 | NVDA | ✅ Confirmed working |
| Apple Inc. | US0378331005 | AAPL | Add to test |
| Microsoft Corp. | US5949181045 | MSFT | Add to test |
| Tesla Inc. | US88160R1014 | TSLA | Add to test |
| Alphabet Inc. (Google) | US02079K3059 | GOOGL | Add to test |
| Amazon.com Inc. | US0231351067 | AMZN | Add to test |
| Meta Platforms | US30303M1027 | META | Add to test |

### German DAX Stocks
| Company | ISIN | Symbol | Notes |
|---------|------|---------|--------|
| SAP SE | DE0007164600 | SAP | Add to test |
| Siemens AG | DE0007236101 | SIE | Add to test |
| BMW AG | DE0005190003 | BMW | Add to test |
| Mercedes-Benz Group | DE0007100000 | MBG | Add to test |
| Deutsche Bank AG | DE0005140008 | DBK | Add to test |
| Allianz SE | DE0008404005 | ALV | Add to test |

### Other Popular Stocks
| Company | ISIN | Symbol | Notes |
|---------|------|---------|--------|
| Toyota Motor Corp. | JP3633400001 | TM | Add to test |
| ASML Holding | NL0010273215 | ASML | Add to test |
| TSMC | US8740391003 | TSM | Add to test |

## Configuration Examples

### Minimal Setup (Single Stock)
```javascript
const ISIN_WATCHLIST = [
    'US67066G1040',  // NVIDIA only
];
```

### Multi-Stock Setup
```javascript
const ISIN_WATCHLIST = [
    'US67066G1040',  // NVIDIA CORP.
    'US0378331005',  // Apple Inc.
    'US88160R1014',  // Tesla Inc.
    'DE0007164600',  // SAP SE
    'DE0007236101',  // Siemens AG
];
```

### Large Portfolio
```javascript
const ISIN_WATCHLIST = [
    // US Tech Giants
    'US67066G1040',  // NVIDIA
    'US0378331005',  // Apple
    'US5949181045',  // Microsoft
    'US88160R1014',  // Tesla
    'US02079K3059',  // Alphabet
    'US0231351067',  // Amazon
    
    // German Blue Chips
    'DE0007164600',  // SAP
    'DE0007236101',  // Siemens
    'DE0005190003',  // BMW
    'DE0007100000',  // Mercedes-Benz
    
    // Add more as needed...
];
```

## System Output Example

When you start the system, you'll see automatic discovery:

```
🚀 Starting Multi-Stock Lightstreamer Logger...
📋 ISINs to watch: US67066G1040, US0378331005, US88160R1014
🏗️ Building stock watchlist from ISINs...
🔍 Fetching instrument data for ISIN: US67066G1040
✅ Found: NVIDIA CORP. DL-,001 (ID: 43763, WKN: 918422)
🔍 Fetching instrument data for ISIN: US0378331005
✅ Found: APPLE INC. DL-,001 (ID: 12345, WKN: 865985)
🔍 Fetching instrument data for ISIN: US88160R1014
✅ Found: TESLA INC. DL-,001 (ID: 67890, WKN: 906866)
📊 Successfully configured 3 stock(s): NVIDIA CORP. DL-,001, APPLE INC. DL-,001, TESLA INC. DL-,001
📋 Stock mappings:
   📈 US67066G1040 -> WKN 918422 -> 43763@1 (NVIDIA CORP. DL-,001)
   📈 US0378331005 -> WKN 865985 -> 12345@1 (APPLE INC. DL-,001)
   📈 US88160R1014 -> WKN 906866 -> 67890@1 (TESLA INC. DL-,001)
```

## Troubleshooting

### No Data for a Stock

If an ISIN doesn't work:

1. **Verify ISIN**: Double-check the 12-character code
2. **Check ls-tc.de Coverage**: Not all stocks may be available
3. **Market Hours**: Data only flows during trading hours
4. **Regional Restrictions**: Some stocks may not be accessible

### System Shows "No valid instruments found"

- Check internet connection
- Verify ISINs are correctly formatted
- Ensure ls-tc.de API is accessible

### Finding ISINs

If you can't find an ISIN:
- Search "[Company Name] ISIN" on Google
- Check the company's investor relations page
- Look up the stock on financial data websites
- Use your broker's stock information pages

## Benefits of ISIN-Based System

### ✅ **Zero Manual Maintenance**
- No need to find instrument IDs manually
- No WKN lookups required
- Automatic company name discovery

### ✅ **Reliable Data Source**
- Uses official ls-tc.de API
- Always gets the most current information
- Handles changes in underlying data automatically

### ✅ **Easy Expansion**
- Just add ISINs to the array
- System handles all the complex mapping
- Immediate validation during startup

### ✅ **International Support**
- Works with stocks from any country
- Standardized ISIN format worldwide
- No country-specific configuration needed

This new system eliminates all the complexity of manual instrument ID discovery while providing the same real-time stock monitoring capabilities!
