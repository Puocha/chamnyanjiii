// tradeLimiter.js
// Manages unique trade win locks by market and trade type

import { marketDetails } from "./config.js";
import { log } from "./ui.js";

// Map: key = `${market}__${tradeType}`, value = true if locked (won once)
const tradeLocks = new Map();

// Map: key = `${market}__${tradeType}`, value = true if paused at step 2
const pausedTrades = new Map();

// Set to track markets that are currently trading
const activeMarkets = new Set();

// Set to track markets that have attempted their third trade (step 2)
const marketsAttemptedThirdTrade = new Set();

// Map to track current step for each market
const marketSteps = new Map();

/**
 * Returns a unique key for a trade based on market and tradeType.
 */
export function getTradeKey(market, tradeType) {
    return `${market}__${tradeType}`;
}

/**
 * Checks if a trade is allowed (not locked by a first win).
 */
export function isTradeAllowed(market, tradeType) {
    const key = getTradeKey(market, tradeType);
    return !tradeLocks.get(key);
}

/**
 * Call this when a trade wins for the first time. Locks further trades of this type/market.
 */
export function recordTradeWin(market, tradeType) {
    const key = getTradeKey(market, tradeType);
    tradeLocks.set(key, true);
    // Add to markets that have attempted their third trade
    marketsAttemptedThirdTrade.add(market);
    // Check if we can resume paused trades
    checkAndResumePausedTrades();
}

/**
 * Resets the lock for a trade (if you want to allow it again).
 */
export function resetTradeLock(market, tradeType) {
    const key = getTradeKey(market, tradeType);
    tradeLocks.delete(key);
}

/**
 * For debugging: get all locked trades
 */
export function getLockedTrades() {
    return Array.from(tradeLocks.keys());
}

/**
 * Checks if all markets and trade types are locked. If so, logs and resets all locks.
 * tradeTypes should be an array of all trade types used in the bot (e.g., ['even', 'odd', ...]).
 */
export function checkAllMarketsLocked(tradeTypes) {
    const allSymbols = Object.keys(marketDetails);
    let allLocked = true;
    for (const symbol of allSymbols) {
        for (const tradeType of tradeTypes) {
            if (isTradeAllowed(symbol, tradeType)) {
                allLocked = false;
                break;
            }
        }
        if (!allLocked) break;
    }
    if (allLocked) {
        log("No market is available for trading. All have been locked. Starting again.");
        tradeLocks.clear();
    }
}

/**
 * Updates the current step for a market
 */
export function updateMarketStep(market, step) {
    marketSteps.set(market, step);
    // If market has completed its third trade (step 3), mark it as attempted
    if (step === 3) {
        marketsAttemptedThirdTrade.add(market);
        log(`Market ${marketDetails[market]?.name || market} has reached step 3`);
    }
}

/**
 * Pauses a trade when it reaches step 3
 */
export function pauseTradeAtStep2(market, tradeType) {
    const key = getTradeKey(market, tradeType);
    pausedTrades.set(key, true);
    log(`Trade ${tradeType} in ${marketDetails[market]?.name || market} paused after reaching step 3`);
}

/**
 * Checks if a trade is paused at step 2
 */
export function isTradePaused(market, tradeType) {
    const key = getTradeKey(market, tradeType);
    return pausedTrades.get(key) === true;
}

/**
 * Marks a market as active in trading
 */
export function markMarketActive(market) {
    activeMarkets.add(market);
}

/**
 * Marks a market as completed
 */
export function markMarketCompleted(market) {
    activeMarkets.delete(market);
    // Only check for resumption if there are no active markets
    if (activeMarkets.size === 0) {
        checkAndResumePausedTrades();
    }
}

/**
 * Checks if all markets have attempted their third trade
 */
function haveAllMarketsAttemptedThirdTrade() {
    const allMarkets = Object.keys(marketDetails);
    return allMarkets.every(market => marketsAttemptedThirdTrade.has(market));
}

/**
 * Checks if there are any active markets and resumes paused trades if conditions are met
 */
function checkAndResumePausedTrades() {
    // Only resume if there are no active markets AND all markets have attempted their third trade
    if (activeMarkets.size === 0 && haveAllMarketsAttemptedThirdTrade()) {
        const pausedCount = pausedTrades.size;
        if (pausedCount > 0) {
            log(`All markets have completed their third trade. Resuming ${pausedCount} paused trades for their final attempt.`);
            pausedTrades.clear();
            // Clear the attempted markets set after resuming
            marketsAttemptedThirdTrade.clear();
            marketSteps.clear();
        }
    }
}

/**
 * For debugging: get all paused trades
 */
export function getPausedTrades() {
    return Array.from(pausedTrades.keys());
}

/**
 * For debugging: get all active markets
 */
export function getActiveMarkets() {
    return Array.from(activeMarkets);
}

/**
 * For debugging: get all markets that have attempted their third trade
 */
export function getMarketsAttemptedThirdTrade() {
    return Array.from(marketsAttemptedThirdTrade);
}

/**
 * For debugging: get current step for all markets
 */
export function getMarketSteps() {
    return Object.fromEntries(marketSteps);
} 