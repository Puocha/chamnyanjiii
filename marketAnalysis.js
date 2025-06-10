import { marketDetails } from "./config.js";
import { log, getTickCount, getMartingaleMultiplier } from "./ui.js";
import { placeTrade, currentTrade, getCurrentStake, isTradingSequenceActive, prepareForNextTrade, resetTradingSequenceState, getWaitingForSecondTradeTickState, attemptNextTradeInSequence, startNewSequence, getActiveSequence, getMartingaleFor } from "./trading.js";
import { activeStrategies, stopStrategy, stopAllStrategies } from "./strategies.js";
import { analyzeUnder3Strategy, analyzeUnder4Strategy, analyzeUnder5Strategy, analyzeUnder6Strategy, analyzeUnder7Strategy } from "./underStrategies.js";
import { renderMarketDataTableEvenMode, renderMarketDataTableOverUnderBarrierDispatcher, renderMarketDataTableOver2Mode } from "./ui.js";
import { addMarketData } from "./dataStorage.js";

const marketTicks = {};

// Track price movement state for Rise/Fall strategies
const priceMovementState = {};

// Track martingale active state per (market, trade type)
const martingaleActive = {};
function getMartingaleKey(symbol, strategy) {
    return `${symbol}__${strategy}`;
}
function setMartingaleActive(symbol, strategy, value) {
    martingaleActive[getMartingaleKey(symbol, strategy)] = value;
}
function isMartingaleActive(symbol, strategy) {
    return martingaleActive[getMartingaleKey(symbol, strategy)] === true;
}

// Add a cooldown tracker for (symbol, strategy)
const patternCooldowns = {};
function getPatternCooldownKey(symbol, strategy) {
    return `${symbol}__${strategy}`;
}
export function isPatternOnCooldown(symbol, strategy) {
    const key = getPatternCooldownKey(symbol, strategy);
    return patternCooldowns[key] && Date.now() < patternCooldowns[key];
}
export function setPatternCooldown(symbol, strategy, seconds) {
    const key = getPatternCooldownKey(symbol, strategy);
    patternCooldowns[key] = Date.now() + seconds * 1000;
    log(`Pattern cooldown set for ${strategy} in ${marketDetails[symbol]?.name || symbol} for ${seconds} seconds`);
}

function extractLastDigit(price, decimals) {
    const priceStr = parseFloat(price).toFixed(decimals);
    return parseInt(priceStr.slice(-1));
}

function analyzeDigits(digits) {
  const counts = Array(10).fill(0);
  digits.forEach(d => counts[d]++);
  const total = digits.length;
  const numericalPercentages = counts.map(count => total > 0 ? (count / total) * 100 : 0.0);
  const uiPercentages = numericalPercentages.map(p => p.toFixed(1));
  if (total === 0) {
    return { percentages: uiPercentages, mostAppearing: [], leastAppearing: [], leastPercentage: 0.0, secondLeastPercentage: 0.0 };
  }
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  const mostAppearing = counts
    .map((count, digit) => ({ count, digit }))
    .filter(item => item.count === maxCount && maxCount > 0)
    .map(item => item.digit);
  const leastAppearing = counts
    .map((count, digit) => ({ count, digit }))
    .filter(item => item.count === minCount && minCount >= 0)
    .map(item => item.digit);
  const sortedDigitsByPercentage = numericalPercentages
    .map((percentage, digit) => ({ percentage, digit }))
    .sort((a, b) => a.percentage - b.percentage);
  let leastPercentage = 0.0;
  let secondLeastPercentage = 0.0;
  if (sortedDigitsByPercentage.length > 0) {
      leastPercentage = sortedDigitsByPercentage[0].percentage;
      if (sortedDigitsByPercentage.length > 1) {
          secondLeastPercentage = sortedDigitsByPercentage[1].percentage;
      }
  }
  return { percentages: uiPercentages, mostAppearing, leastAppearing, leastPercentage, secondLeastPercentage };
}

function updateMarketDataTableUI(symbol, price, lastDigit, percentages, mostAppearing, leastAppearing) {
    const row = document.getElementById(`market-row-${symbol}`);
    if (!row) {
        // Only log error if the table is in market-data mode
        const modeDropdown = document.getElementById('market-data-mode');
        if (!modeDropdown || modeDropdown.value === 'market-data') {
            log(`Error: Market row not found for symbol ${symbol}`);
        }
        return;
    }
    row.querySelector('.market-price').textContent = parseFloat(price).toFixed(marketDetails[symbol].decimals);
    row.querySelector('.last-digit').textContent = lastDigit;
    const digitCells = row.querySelectorAll('.digit-percentage');
    digitCells.forEach((cell, index) => {
        cell.textContent = `${percentages[index]}%`;
        cell.classList.remove('most-appearing', 'least-appearing');
        if (mostAppearing.includes(index)) {
            cell.classList.add('most-appearing');
        }
        if (leastAppearing.includes(index)) {
            cell.classList.add('least-appearing');
        }
    });
}

// Global flag to control if analysis is active
let isAnalysisActive = true;
export function stopAllAnalysis() {
    isAnalysisActive = false;
}
export function startAllAnalysis() {
    isAnalysisActive = true;
}

export function analyzeOver3Strategy(symbol) {
    if (!isAnalysisActive) return;
    const digits = marketTicks[symbol] || [];
    const strategy = 'over3';
    const patternLength = getTickCount('over3');
    const barrier = 3;

    if (digits.length < patternLength) return;

    // Check if pattern is on cooldown
    if (isPatternOnCooldown(symbol, strategy)) {
        return;
    }

    const patternMatch = checkConsecutive(digits, patternLength, digit => digit <= barrier);
    const sequence = getActiveSequence(symbol, strategy);
    const martingale = getMartingaleFor(symbol, strategy);

    // Check if the pattern is met AND we are not currently in a trade
    if (patternMatch && currentTrade === null) {
        if (!sequence || !sequence.active) {
            // Pattern met and no active sequence, start a new sequence
            log(`Over 3 strategy: Previous ${patternLength} digits ≤ ${barrier} detected. Starting new sequence for OVER 3 on ${marketDetails[symbol]?.name || symbol}`);
            saveSequence('over3', symbol, digits, 'overunder');
            startNewSequence(symbol, strategy);
            const stakeToUse = getMartingaleFor(symbol, strategy).stake; // Use martingale stake for initial trade
            log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
            placeTrade(symbol, "DIGITOVER", stakeToUse, 1, barrier, undefined, strategy);
        } else {
            // Pattern met and an active sequence exists, place the next trade in the sequence
            log(`Over 3 strategy: Previous ${patternLength} digits ≤ ${barrier} detected. Placing next trade in active sequence for OVER 3 on ${marketDetails[symbol]?.name || symbol}`);
            const stakeToUse = martingale.stake;
            log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
            placeTrade(symbol, "DIGITOVER", stakeToUse, 1, barrier, undefined, strategy);
        }
    }
}

export function handleWsMessage(data) {
    if (data.msg_type === "history") {
        const symbol = data.echo_req.ticks_history;
        const decimals = marketDetails[symbol]?.decimals || 2;
        marketTicks[symbol] = data.history.prices.map(price => extractLastDigit(price, decimals));
        const { percentages, mostAppearing, leastAppearing } = analyzeDigits(marketTicks[symbol]);
        const latestPrice = data.history.prices[data.history.prices.length - 1];
        const lastDigit = extractLastDigit(latestPrice, decimals);
        updateMarketDataTableUI(symbol, latestPrice, lastDigit, percentages, mostAppearing, leastAppearing);
        log(`Historical data loaded and market table updated for ${marketDetails[symbol]?.name}.`);
        
        // Save historical data to IndexedDB
        if (data.history && Array.isArray(data.history.prices)) {
            data.history.prices.forEach((price, index) => {
                // Assuming data.history.times is an array of timestamps corresponding to prices
                // If not, you might need to generate or approximate timestamps
                const timestamp = data.history.times ? data.history.times[index] : Date.now(); // Using epoch if available, otherwise current time
                addMarketData({ symbol: symbol, price: parseFloat(price), timestamp: timestamp, type: 'history' });
            });
             log(`Historical data for ${symbol} saved to IndexedDB.`);
        }
        
        // After receiving historical data, re-evaluate any active strategies
        if (isAnalysisActive) { // Check if analysis is globally active
            activeStrategies.forEach(strategy => {
                log(`Re-evaluating strategy ${strategy} after historical data load.`);
                // Call the specific analysis function for each active strategy
                switch (strategy) {
                    case 'even':
                        analyzeEvenStrategy(symbol); // Pass the symbol
                        break;
                    case 'odd':
                        analyzeOddStrategy(symbol); // Pass the symbol
                        break;
                    case 'over3':
                        analyzeOver3Strategy(symbol); // Pass the symbol
                        break;
                    case 'over4':
                        analyzeOver4Strategy(symbol); // Pass the symbol
                        break;
                    case 'over5':
                        analyzeOver5Strategy(symbol); // Pass the symbol
                        break;
                    case 'over6':
                        analyzeOver6Strategy(symbol); // Pass the symbol
                        break;
                    case 'over7':
                        analyzeOver7Strategy(symbol); // Pass the symbol
                        break;
                    case 'over8':
                        analyzeOver8Strategy(symbol); // Pass the symbol
                        break;
                     case 'under3':
                         analyzeUnder3Strategy(symbol, marketTicks, isAnalysisActive, isPatternOnCooldown, setPatternCooldown); // Pass necessary data
                         break;
                     case 'under4':
                         analyzeUnder4Strategy(symbol, marketTicks, isAnalysisActive, isPatternOnCooldown, setPatternCooldown); // Pass necessary data
                         break;
                     case 'under5':
                         analyzeUnder5Strategy(symbol, marketTicks, isAnalysisActive, isPatternOnCooldown, setPatternCooldown); // Pass necessary data
                         break;
                     case 'under6':
                         analyzeUnder6Strategy(symbol, marketTicks, isAnalysisActive, isPatternOnCooldown, setPatternCooldown); // Pass necessary data
                         break;
                     case 'under7':
                         analyzeUnder7Strategy(symbol, marketTicks, isAnalysisActive, isPatternOnCooldown, setPatternCooldown); // Pass necessary data
                         break;
                    case 'rise':
                         analyzeRiseStrategy(symbol); // Pass the symbol
                         break;
                    case 'fall':
                         analyzeFallStrategy(symbol); // Pass the symbol
                         break;
                    default:
                        log(`No specific re-evaluation logic for strategy ${strategy}.`);
                        break;
                }
            });
        }
    } else if (data.msg_type === "tick") {
        const symbol = data.tick.symbol;
        const price = data.tick.quote;
        const decimals = marketDetails[symbol]?.decimals || 2;
        const lastDigit = extractLastDigit(price, decimals);

        // Update price movement state for Rise/Fall strategies
        if (!priceMovementState[symbol]) {
            priceMovementState[symbol] = { lastPrice: parseFloat(price), consecutiveCount: 0, direction: null };
        } else {
            const lastPrice = priceMovementState[symbol].lastPrice;
            let currentDirection = null;
            if (parseFloat(price) > lastPrice) {
                currentDirection = 'rise';
            } else if (parseFloat(price) < lastPrice) {
                currentDirection = 'fall';
            }

            if (currentDirection && currentDirection !== priceMovementState[symbol].direction) {
                priceMovementState[symbol].consecutiveCount = 1;
                priceMovementState[symbol].direction = currentDirection;
            } else if (currentDirection) {
                priceMovementState[symbol].consecutiveCount++;
            } else {
                // Price is equal, maintain count and direction
            }
            priceMovementState[symbol].lastPrice = parseFloat(price);
        }

        if (!marketTicks[symbol]) {
            marketTicks[symbol] = [];
        }
        marketTicks[symbol].push(lastDigit);
        if (marketTicks[symbol].length > 1000) {
            marketTicks[symbol].shift();
        }
        const { percentages, mostAppearing, leastAppearing } = analyzeDigits(marketTicks[symbol]);

        // Save tick data to IndexedDB
        if (data.tick) {
             // Assuming data.tick.epoch contains the timestamp
            const timestamp = data.tick.epoch ? data.tick.epoch : Date.now(); // Using epoch if available, otherwise current time
            addMarketData({ symbol: symbol, price: parseFloat(price), timestamp: timestamp, type: 'tick' });
            // log(`Tick data for ${symbol} saved to IndexedDB.`); // Avoid excessive logging
        }

        // --- Run analysis BEFORE updating the UI ---
        if (activeStrategies.has('even')) analyzeEvenStrategy(symbol);
        if (activeStrategies.has('odd')) analyzeOddStrategy(symbol);
        if (activeStrategies.has('over4')) analyzeOver4Strategy(symbol);
        if (activeStrategies.has('over5')) analyzeOver5Strategy(symbol);
        if (activeStrategies.has('over6')) analyzeOver6Strategy(symbol);
        if (activeStrategies.has('over7')) analyzeOver7Strategy(symbol);
        if (activeStrategies.has('over8')) analyzeOver8Strategy(symbol);
        if (activeStrategies.has('over3')) analyzeOver3Strategy(symbol);
        if (activeStrategies.has('under3')) analyzeUnder3Strategy(symbol, marketTicks, isAnalysisActive, isPatternOnCooldown, setPatternCooldown);
        if (activeStrategies.has('under4')) analyzeUnder4Strategy(symbol, marketTicks, isAnalysisActive, isPatternOnCooldown, setPatternCooldown);
        if (activeStrategies.has('under5')) analyzeUnder5Strategy(symbol, marketTicks, isAnalysisActive, isPatternOnCooldown, setPatternCooldown);
        if (activeStrategies.has('under6')) analyzeUnder6Strategy(symbol, marketTicks, isAnalysisActive, isPatternOnCooldown, setPatternCooldown);
        if (activeStrategies.has('under7')) analyzeUnder7Strategy(symbol, marketTicks, isAnalysisActive, isPatternOnCooldown, setPatternCooldown);
        if (activeStrategies.has('rise')) analyzeRiseStrategy(symbol);
        if (activeStrategies.has('fall')) analyzeFallStrategy(symbol);

        // --- Now update the UI ---
        updateMarketDataTableUI(symbol, price, lastDigit, percentages, mostAppearing, leastAppearing);

        const modeDropdown = document.getElementById('market-data-mode');
        if (modeDropdown && modeDropdown.value === 'even') {
            renderMarketDataTableEvenMode(window.marketTicks);
        }
        if (modeDropdown && [
            'overunder3', 'overunder4', 'overunder5', 'overunder6', 'overunder7', 'overunder8'
        ].includes(modeDropdown.value)) {
            renderMarketDataTableOverUnderBarrierDispatcher(modeDropdown.value, window.marketTicks);
        }
        if (modeDropdown && modeDropdown.value === 'over2') {
            renderMarketDataTableOver2Mode(window.marketTicks);
        }

        if (getWaitingForSecondTradeTickState() && currentTrade === null) {
            attemptNextTradeInSequence(data);
        }

        if (!window.latestMarketPrices) window.latestMarketPrices = {};
        window.latestMarketPrices[symbol] = price;
    }
}

// --- New Pattern Strategies ---

function checkConsecutive(arr, count, predicate) {
    if (arr.length < count) return false;
    for (let i = arr.length - count; i < arr.length; i++) {
        if (!predicate(arr[i])) return false;
    }
    return true;
}

export function analyzeEvenStrategy(symbol) {
    if (!isAnalysisActive) return;
    try {
        const digits = marketTicks[symbol] || [];
        const strategy = 'even';
        const patternLength = getTickCount('even');

        if (digits.length < patternLength) return;

        const patternMatch = checkConsecutive(digits, patternLength, digit => digit % 2 !== 0); // Check for odd
        const sequence = getActiveSequence(symbol, strategy);
        const martingale = getMartingaleFor(symbol, strategy);

        // Check if the pattern is met AND we are not currently in a trade
        if (patternMatch && currentTrade === null) {
            if (!sequence || !sequence.active) {
                // Pattern met and no active sequence, start a new sequence
                log(`Even strategy: Previous ${patternLength} digits were all odd. Starting new sequence for EVEN on ${marketDetails[symbol]?.name || symbol}`);
                saveSequence('even', symbol, digits, 'evenodd'); // Assuming saveSequence is needed
                startNewSequence(symbol, strategy);
                // Re-get sequence after starting to ensure it's the latest
                const updatedSequence = getActiveSequence(symbol, strategy);
                const stakeToUse = martingale.baseStake * Math.pow(getMartingaleMultiplier(), martingale.step);
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
                placeTrade(symbol, "DIGITEVEN", stakeToUse, 1, undefined, undefined, strategy);
            } else {
                // Pattern met and an active sequence exists, place the next trade in the sequence
                log(`Even strategy: Previous ${patternLength} digits were all odd. Placing next trade in active sequence for EVEN on ${marketDetails[symbol]?.name || symbol}`);
                const stakeToUse = martingale.baseStake * Math.pow(getMartingaleMultiplier(), martingale.step);
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
                placeTrade(symbol, "DIGITEVEN", stakeToUse, 1, undefined, undefined, strategy);
            }
        }
    } catch (error) {
        log(`Error in analyzeEvenStrategy for ${symbol}: ${error.message}`);
        console.error(error); // Log full error for debugging
    }
}

export function analyzeOddStrategy(symbol) {
    if (!isAnalysisActive) return;
    try {
        const digits = marketTicks[symbol] || [];
        const strategy = 'odd';
        const patternLength = getTickCount('odd');

        if (digits.length < patternLength) return;

        const patternMatch = checkConsecutive(digits, patternLength, digit => digit % 2 === 0); // Check for even
        const sequence = getActiveSequence(symbol, strategy);
        const martingale = getMartingaleFor(symbol, strategy);

        // Check if the pattern is met AND we are not currently in a trade
        if (patternMatch && currentTrade === null) {
            if (!sequence || !sequence.active) {
                // Pattern met and no active sequence, start a new sequence
                log(`Odd strategy: Previous ${patternLength} digits were all even. Starting new sequence for ODD on ${marketDetails[symbol]?.name || symbol}`);
                saveSequence('odd', symbol, digits, 'evenodd'); // Assuming saveSequence is needed
                startNewSequence(symbol, strategy);
                const stakeToUse = getMartingaleFor(symbol, strategy).stake; // Use martingale stake for initial trade
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${stakeToUse}, stake=${stakeToUse}`);
                placeTrade(symbol, "DIGITODD", stakeToUse, 1, undefined, undefined, strategy);
            } else {
                // Pattern met and an active sequence exists, place the next trade in the sequence
                log(`Odd strategy: Previous ${patternLength} digits were all even. Placing next trade in active sequence for ODD on ${marketDetails[symbol]?.name || symbol}`);
                const stakeToUse = martingale.stake;
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
                placeTrade(symbol, "DIGITODD", stakeToUse, 1, undefined, undefined, strategy);
            }
        }
    } catch (error) {
        log(`Error in analyzeOddStrategy for ${symbol}: ${error.message}`);
        console.error(error); // Log full error for debugging
    }
}

export function analyzeOver4Strategy(symbol) {
    if (!isAnalysisActive) return;
    try {
        const digits = marketTicks[symbol] || [];
        const strategy = 'over4';
        const patternLength = getTickCount('over4');
        const barrier = 4;

        if (digits.length < patternLength) return;

        const patternMatch = checkConsecutive(digits, patternLength, digit => digit <= barrier);
        const sequence = getActiveSequence(symbol, strategy);
        const martingale = getMartingaleFor(symbol, strategy);

        // Check if the pattern is met AND we are not currently in a trade
        if (patternMatch && currentTrade === null) {
            if (!sequence || !sequence.active) {
                // Pattern met and no active sequence, start a new sequence
                log(`Over 4 strategy: Previous ${patternLength} digits ≤ ${barrier} detected. Starting new sequence for OVER 4 on ${marketDetails[symbol]?.name || symbol}`);
                saveSequence('over4', symbol, digits, 'overunder');
                startNewSequence(symbol, strategy);
                const stakeToUse = getMartingaleFor(symbol, strategy).stake; // Use martingale stake for initial trade
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
                placeTrade(symbol, "DIGITOVER", stakeToUse, 1, barrier, undefined, strategy);
            } else {
                // Pattern met and an active sequence exists, place the next trade in the sequence
                log(`Over 4 strategy: Previous ${patternLength} digits ≤ ${barrier} detected. Placing next trade in active sequence for OVER 4 on ${marketDetails[symbol]?.name || symbol}`);
                const stakeToUse = martingale.stake;
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
                placeTrade(symbol, "DIGITOVER", stakeToUse, 1, barrier, undefined, strategy);
            }
        }
    } catch (error) {
        log(`Error in analyzeOver4Strategy for ${symbol}: ${error.message}`);
        console.error(error); // Log full error for debugging
    }
}

export function analyzeOver5Strategy(symbol) {
    if (!isAnalysisActive) return;
    try {
        const digits = marketTicks[symbol] || [];
        const strategy = 'over5';
        const patternLength = getTickCount('over5');
        const barrier = 5;

        if (digits.length < patternLength) return;

        const patternMatch = checkConsecutive(digits, patternLength, digit => digit <= barrier);
        const sequence = getActiveSequence(symbol, strategy);
        const martingale = getMartingaleFor(symbol, strategy);

        // Check if the pattern is met AND we are not currently in a trade
        if (patternMatch && currentTrade === null) {
            if (!sequence || !sequence.active) {
                // Pattern met and no active sequence, start a new sequence
                log(`Over 5 strategy: Previous ${patternLength} digits ≤ ${barrier} detected. Starting new sequence for OVER 5 on ${marketDetails[symbol]?.name || symbol}`);
                saveSequence('over5', symbol, digits, 'overunder');
                startNewSequence(symbol, strategy);
                const stakeToUse = getMartingaleFor(symbol, strategy).stake; // Use martingale stake for initial trade
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
                placeTrade(symbol, "DIGITOVER", stakeToUse, 1, barrier, undefined, strategy);
            } else {
                // Pattern met and an active sequence exists, place the next trade in the sequence
                log(`Over 5 strategy: Previous ${patternLength} digits ≤ ${barrier} detected. Placing next trade in active sequence for OVER 5 on ${marketDetails[symbol]?.name || symbol}`);
                const stakeToUse = martingale.stake;
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
                placeTrade(symbol, "DIGITOVER", stakeToUse, 1, barrier, undefined, strategy);
            }
        }
    } catch (error) {
        log(`Error in analyzeOver5Strategy for ${symbol}: ${error.message}`);
        console.error(error); // Log full error for debugging
    }
}

export function analyzeOver6Strategy(symbol) {
    if (!isAnalysisActive) return;
    try {
        const digits = marketTicks[symbol] || [];
        const strategy = 'over6';
        const patternLength = getTickCount('over6');
        const barrier = 6;

        if (digits.length < patternLength) return;

        const patternMatch = checkConsecutive(digits, patternLength, digit => digit <= barrier);
        const sequence = getActiveSequence(symbol, strategy);
        const martingale = getMartingaleFor(symbol, strategy);

        // Check if the pattern is met AND we are not currently in a trade
        if (patternMatch && currentTrade === null) {
            if (!sequence || !sequence.active) {
                // Pattern met and no active sequence, start a new sequence
                log(`Over 6 strategy: Previous ${patternLength} digits ≤ ${barrier} detected. Starting new sequence for OVER 6 on ${marketDetails[symbol]?.name || symbol}`);
                saveSequence('over6', symbol, digits, 'overunder'); // Assuming saveSequence is needed for tracking
                startNewSequence(symbol, strategy);
                // Re-get sequence after starting to ensure it's the latest
                const updatedSequence = getActiveSequence(symbol, strategy);
                const stakeToUse = getMartingaleFor(symbol, strategy).stake; // Use martingale stake for initial trade
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${martingale.stake}`);
                placeTrade(symbol, "DIGITOVER", stakeToUse, 1, barrier, undefined, strategy);
            } else {
                // Pattern met and an active sequence exists, place the next trade in the sequence
                log(`Over 6 strategy: Previous ${patternLength} digits ≤ ${barrier} detected. Placing next trade in active sequence for OVER 6 on ${marketDetails[symbol]?.name || symbol}`);
                const stakeToUse = martingale.stake;
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${martingale.stake}`);
                placeTrade(symbol, "DIGITOVER", stakeToUse, 1, barrier, undefined, strategy);
            }
        }
    } catch (error) {
        log(`Error in analyzeOver6Strategy for ${symbol}: ${error.message}`);
        console.error(error); // Log full error for debugging
    }
}

export function analyzeOver7Strategy(symbol) {
    if (!isAnalysisActive) return;
    try {
        const digits = marketTicks[symbol] || [];
        const strategy = 'over7';
        const patternLength = getTickCount('over7');
        const barrier = 7;

        if (digits.length < patternLength) return;

        const patternMatch = checkConsecutive(digits, patternLength, digit => digit <= barrier);
        const sequence = getActiveSequence(symbol, strategy);
        const martingale = getMartingaleFor(symbol, strategy);

        // Check if the pattern is met AND we are not currently in a trade
        if (patternMatch && currentTrade === null) {
            if (!sequence || !sequence.active) {
                // Pattern met and no active sequence, start a new sequence
                log(`Over 7 strategy: Previous ${patternLength} digits ≤ ${barrier} detected. Starting new sequence for OVER 7 on ${marketDetails[symbol]?.name || symbol}`);
                saveSequence('over7', symbol, digits, 'overunder');
                startNewSequence(symbol, strategy);
                const stakeToUse = getMartingaleFor(symbol, strategy).stake; // Use martingale stake for initial trade
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
                placeTrade(symbol, "DIGITOVER", stakeToUse, 1, barrier, undefined, strategy);
            } else {
                // Pattern met and an active sequence exists, place the next trade in the sequence
                log(`Over 7 strategy: Previous ${patternLength} digits ≤ ${barrier} detected. Placing next trade in active sequence for OVER 7 on ${marketDetails[symbol]?.name || symbol}`);
                const stakeToUse = martingale.stake;
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
                placeTrade(symbol, "DIGITOVER", stakeToUse, 1, barrier, undefined, strategy);
            }
        }
    } catch (error) {
        log(`Error in analyzeOver7Strategy for ${symbol}: ${error.message}`);
        console.error(error); // Log full error for debugging
    }
    // Sequence will be stopped after the first win by trading.js sequence logic
}

export function analyzeOver8Strategy(symbol) {
    if (!isAnalysisActive) return;
    try {
        const digits = marketTicks[symbol] || [];
        const strategy = 'over8';
        const patternLength = getTickCount('over8');
        const barrier = 8;

        if (digits.length < patternLength) return;

        const patternMatch = checkConsecutive(digits, patternLength, digit => digit <= barrier);
        const sequence = getActiveSequence(symbol, strategy);
        const martingale = getMartingaleFor(symbol, strategy);

        // Check if the pattern is met AND we are not currently in a trade
        if (patternMatch && currentTrade === null) {
            if (!sequence || !sequence.active) {
                // Pattern met and no active sequence, start a new sequence
                log(`Over 8 strategy: Previous ${patternLength} digits ≤ ${barrier} detected. Starting new sequence for OVER 8 on ${marketDetails[symbol]?.name || symbol}`);
                saveSequence('over8', symbol, digits, 'overunder');
                startNewSequence(symbol, strategy);
                const stakeToUse = getMartingaleFor(symbol, strategy).stake; // Use martingale stake for initial trade
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
                placeTrade(symbol, "DIGITOVER", stakeToUse, 1, barrier, undefined, strategy);
            } else {
                // Pattern met and an active sequence exists, place the next trade in the sequence
                log(`Over 8 strategy: Previous ${patternLength} digits ≤ ${barrier} detected. Placing next trade in active sequence for OVER 8 on ${marketDetails[symbol]?.name || symbol}`);
                const stakeToUse = martingale.stake;
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
                placeTrade(symbol, "DIGITOVER", stakeToUse, 1, barrier, undefined, strategy);
            }
        }
    } catch (error) {
        log(`Error in analyzeOver8Strategy for ${symbol}: ${error.message}`);
        console.error(error); // Log full error for debugging
    }
}

// Analysis logic for Rise strategy (trade FALL after 6 consecutive rises)
export function analyzeRiseStrategy(symbol) {
    if (!isAnalysisActive) return;
    try {
        const strategy = 'rise';
        const sequence = getActiveSequence(symbol, strategy);
        const martingale = getMartingaleFor(symbol, strategy);

        const movementState = priceMovementState[symbol];
        if (!movementState) return;

        // Check for 11 consecutive rises and no active trade
        if (movementState.direction === 'rise' && movementState.consecutiveCount >= getTickCount('rise') && currentTrade === null) {
            log(`Rise strategy: Detected ${movementState.consecutiveCount} consecutive rises on ${marketDetails[symbol]?.name || symbol}. Entering FALL trade.`);

            // Reset consecutive count after triggering a trade
            movementState.consecutiveCount = 0;
            movementState.direction = null; // Reset direction as well

            // Place a PUT trade (Fall)
            const stakeToUse = martingale.stake; // Use martingale stake
            log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
            // Note: Rise/Fall strategies typically use duration_unit 't' (ticks) or 's' (seconds). Using 1 tick for now.
            placeTrade(symbol, "PUT", stakeToUse, 1, undefined, undefined, strategy); // Use "PUT" for Fall
        }
    } catch (error) {
        log(`Error in analyzeRiseStrategy for ${symbol}: ${error.message}`);
        console.error(error); // Log full error for debugging
    }
}

// Analysis logic for Fall strategy (trade CALL after 6 consecutive falls)
export function analyzeFallStrategy(symbol) {
    if (!isAnalysisActive) return;
    try {
        const strategy = 'fall';
        const sequence = getActiveSequence(symbol, strategy);
        const martingale = getMartingaleFor(symbol, strategy);

        const movementState = priceMovementState[symbol];
        if (!movementState) return;

        // Check for 11 consecutive falls and no active trade
        if (movementState.direction === 'fall' && movementState.consecutiveCount >= getTickCount('fall') && currentTrade === null) {
            log(`Fall strategy: Detected ${movementState.consecutiveCount} consecutive falls on ${marketDetails[symbol]?.name || symbol}. Entering RISE trade.`);

            // Reset consecutive count after triggering a trade
            movementState.consecutiveCount = 0;
            movementState.direction = null; // Reset direction as well

            // Place a CALL trade (Rise)
            const stakeToUse = martingale.stake; // Use martingale stake
            log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
            // Note: Rise/Fall strategies typically use duration_unit 't' (ticks) or 's' (seconds). Using 1 tick for now.
            placeTrade(symbol, "CALL", stakeToUse, 1, undefined, undefined, strategy); // Use "CALL" for Rise
        }
    } catch (error) {
        log(`Error in analyzeFallStrategy for ${symbol}: ${error.message}`);
        console.error(error); // Log full error for debugging
    }
}

export { setMartingaleActive };
export { marketTicks };
window.marketTicks = marketTicks;

if (!window.savedSequences) window.savedSequences = {};

function saveSequence(strategy, symbol, digits, type) {
    if (!window.savedSequences[strategy]) window.savedSequences[strategy] = {};
    if (!window.savedSequences[strategy][symbol]) window.savedSequences[strategy][symbol] = [];
    let seq;
    if (type === 'evenodd') {
        seq = digits.slice(-10).map(d => d % 2 === 0 ? 'E' : 'O');
    } else if (type === 'overunder') {
        // Example for over3: O for >3, U for <=3
        seq = digits.slice(-10).map(d => d > 3 ? 'O' : 'U');
    } else {
        seq = digits.slice(-10);
    }
    window.savedSequences[strategy][symbol].push(seq);
}

export { priceMovementState }; // Export for potential debugging or UI display 