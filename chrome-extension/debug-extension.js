// Debug script to check extension state
// Run this in the browser console on the extension's service worker

console.log('🔍 Debug: Checking extension state...');

// Check if storage has been initialized
chrome.storage.local.get(null, (result) => {
    console.log('📦 Storage contents:', result);
    
    if (result.watchlist) {
        console.log('✅ Watchlist found:', Object.keys(result.watchlist));
    } else {
        console.log('❌ No watchlist in storage');
    }
    
    if (result.alertRules) {
        console.log('✅ Alert rules found:', Object.keys(result.alertRules));
    } else {
        console.log('❌ No alert rules in storage');
    }
});

// Test messaging
chrome.runtime.sendMessage({ type: 'GET_TAB_STATUS' }, (response) => {
    console.log('📡 Tab status response:', response);
});

chrome.runtime.sendMessage({ type: 'GET_RECENT_EVENTS' }, (response) => {
    console.log('📡 Recent events response:', response);
});
