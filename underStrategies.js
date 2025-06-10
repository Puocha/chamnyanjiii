import { marketDetails } from "./config.js";
import { log, getTickCount } from "./ui.js";
import { placeTrade, currentTrade, getMartingaleFor, getActiveSequence, startNewSequence, isTradingSequenceActive, getWaitingForSecondTradeTickState } from "./trading.js";

// Helper for checking consecutive digits >= barrier
function checkConsecutiveOver(arr, count, barrier) {
    if (arr.length < count) return false;
    for (let i = arr.length - count; i < arr.length; i++) {
        if (arr[i] < barrier) return false;
    }
    return true;
}

// Under 3: after 15 consecutive digits >= 3
export function analyzeUnder3Strategy(symbol, marketTicks, isAnalysisActive, isPatternOnCooldown, setPatternCooldown) {
    if (!isAnalysisActive) return;
    try {
        const digits = marketTicks[symbol] || [];
        const strategy = 'under3';
        const patternLength = getTickCount('under3');
        const barrier = 3;

        if (digits.length < patternLength) return;

        const patternMatch = checkConsecutiveOver(digits, patternLength, barrier);
        const sequence = getActiveSequence(symbol, strategy);
        const martingale = getMartingaleFor(symbol, strategy);

        // Check if the pattern is met AND we are not currently in a trade
        if (patternMatch && currentTrade === null) {
            if (!sequence || !sequence.active) {
                // Pattern met and no active sequence, start a new sequence
                log(`Under 3 strategy: Previous ${patternLength} digits >= ${barrier} detected. Starting new sequence for UNDER 3 on ${marketDetails[symbol]?.name || symbol}`);
                // Assuming saveSequence is needed for tracking - Note: saveSequence is not defined in this file, assuming it's imported or not needed here based on your structure
                startNewSequence(symbol, strategy);
                // Re-get sequence after starting to ensure it's the latest (though startNewSequence might return it)
                const updatedSequence = getActiveSequence(symbol, strategy);
                const stakeToUse = getMartingaleFor(symbol, strategy).stake; // Use martingale stake for initial trade
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${martingale.stake}`);
                placeTrade(symbol, "DIGITUNDER", stakeToUse, 1, barrier, undefined, strategy);
            } else {
                // Pattern met and an active sequence exists, place the next trade in the sequence
                log(`Under 3 strategy: Previous ${patternLength} digits >= ${barrier} detected. Placing next trade in active sequence for UNDER 3 on ${marketDetails[symbol]?.name || symbol}`);
                const stakeToUse = martingale.stake;
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
                placeTrade(symbol, "DIGITUNDER", stakeToUse, 1, barrier, undefined, strategy);
            }
        }
    } catch (error) {
        log(`Error in analyzeUnder3Strategy for ${symbol}: ${error.message}`);
        console.error(error); // Log full error for debugging
    }
}

// Under 4: after 14 consecutive digits >= 4
export function analyzeUnder4Strategy(symbol, marketTicks, isAnalysisActive, isPatternOnCooldown, setPatternCooldown) {
    if (!isAnalysisActive) return;
    try {
        const digits = marketTicks[symbol] || [];
        const strategy = 'under4';
        const patternLength = getTickCount('under4');
        const barrier = 4;

        if (digits.length < patternLength) return;

        const patternMatch = checkConsecutiveOver(digits, patternLength, barrier);
        const sequence = getActiveSequence(symbol, strategy);
        const martingale = getMartingaleFor(symbol, strategy);

        // Check if the pattern is met AND we are not currently in a trade
        if (patternMatch && currentTrade === null) {
            if (!sequence || !sequence.active) {
                // Pattern met and no active sequence, start a new sequence
                log(`Under 4 strategy: Previous ${patternLength} digits >= ${barrier} detected. Starting new sequence for UNDER 4 on ${marketDetails[symbol]?.name || symbol}`);
                startNewSequence(symbol, strategy);
                const martingale = getMartingaleFor(symbol, strategy);
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${martingale.stake}`);
                placeTrade(symbol, "DIGITUNDER", martingale.stake, 1, 4, undefined, strategy);
            } else {
                // Pattern met and an active sequence exists, place the next trade in the sequence
                log(`Under 4 strategy: Previous ${patternLength} digits >= ${barrier} detected. Placing next trade in active sequence for UNDER 4 on ${marketDetails[symbol]?.name || symbol}`);
                const stakeToUse = martingale.stake;
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
                placeTrade(symbol, "DIGITUNDER", stakeToUse, 1, barrier, undefined, strategy);
            }
        }
    } catch (error) {
        log(`Error in analyzeUnder4Strategy for ${symbol}: ${error.message}`);
        console.error(error); // Log full error for debugging
    }
}

// Under 5: after 12 consecutive digits >= 5
export function analyzeUnder5Strategy(symbol, marketTicks, isAnalysisActive, isPatternOnCooldown, setPatternCooldown) {
    if (!isAnalysisActive) return;
    try {
        const digits = marketTicks[symbol] || [];
        const strategy = 'under5';
        const patternLength = getTickCount('under5');
        const barrier = 5;

        if (digits.length < patternLength) return;

        const patternMatch = checkConsecutiveOver(digits, patternLength, barrier);
        const sequence = getActiveSequence(symbol, strategy);
        const martingale = getMartingaleFor(symbol, strategy);

        // Check if the pattern is met AND we are not currently in a trade
        if (patternMatch && currentTrade === null) {
            if (!sequence || !sequence.active) {
                // Pattern met and no active sequence, start a new sequence
                log(`Under 5 strategy: Previous ${patternLength} digits >= ${barrier} detected. Starting new sequence for UNDER 5 on ${marketDetails[symbol]?.name || symbol}`);
                startNewSequence(symbol, strategy);
                const martingale = getMartingaleFor(symbol, strategy);
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${martingale.stake}`);
                placeTrade(symbol, "DIGITUNDER", martingale.stake, 1, 5, undefined, strategy);
            } else {
                // Pattern met and an active sequence exists, place the next trade in the sequence
                log(`Under 5 strategy: Previous ${patternLength} digits >= ${barrier} detected. Placing next trade in active sequence for UNDER 5 on ${marketDetails[symbol]?.name || symbol}`);
                const stakeToUse = martingale.stake;
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
                placeTrade(symbol, "DIGITUNDER", stakeToUse, 1, barrier, undefined, strategy);
            }
        }
    } catch (error) {
        log(`Error in analyzeUnder5Strategy for ${symbol}: ${error.message}`);
        console.error(error); // Log full error for debugging
    }
}

// Under 6: after 9 consecutive digits >= 6
export function analyzeUnder6Strategy(symbol, marketTicks, isAnalysisActive, isPatternOnCooldown, setPatternCooldown) {
    if (!isAnalysisActive) return;
    try {
        const digits = marketTicks[symbol] || [];
        const strategy = 'under6';
        const patternLength = getTickCount('under6');
        const barrier = 6;

        if (digits.length < patternLength) return;

        const patternMatch = checkConsecutiveOver(digits, patternLength, barrier);
        const sequence = getActiveSequence(symbol, strategy);
        const martingale = getMartingaleFor(symbol, strategy);

        // Check if the pattern is met AND we are not currently in a trade
        if (patternMatch && currentTrade === null) {
            if (!sequence || !sequence.active) {
                // Pattern met and no active sequence, start a new sequence
                log(`Under 6 strategy: Previous ${patternLength} digits >= ${barrier} detected. Starting new sequence for UNDER 6 on ${marketDetails[symbol]?.name || symbol}`);
                // Assuming saveSequence is needed for tracking - Note: saveSequence is not defined in this file, assuming it's imported or not needed here based on your structure
                startNewSequence(symbol, strategy);
                // Re-get sequence after starting to ensure it's the latest (though startNewSequence might return it)
                const updatedSequence = getActiveSequence(symbol, strategy);
                const stakeToUse = getMartingaleFor(symbol, strategy).stake; // Use martingale stake for initial trade
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${martingale.stake}`);
                placeTrade(symbol, "DIGITUNDER", stakeToUse, 1, barrier, undefined, strategy);
            } else {
                // Pattern met and an active sequence exists, place the next trade in the sequence
                log(`Under 6 strategy: Previous ${patternLength} digits >= ${barrier} detected. Placing next trade in active sequence for UNDER 6 on ${marketDetails[symbol]?.name || symbol}`);
                const stakeToUse = martingale.stake;
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
                placeTrade(symbol, "DIGITUNDER", stakeToUse, 1, barrier, undefined, strategy);
            }
        }
    } catch (error) {
        log(`Error in analyzeUnder6Strategy for ${symbol}: ${error.message}`);
        console.error(error); // Log full error for debugging
    }
}

// Under 7: after 7 consecutive digits >= 7
export function analyzeUnder7Strategy(symbol, marketTicks, isAnalysisActive, isPatternOnCooldown, setPatternCooldown) {
    if (!isAnalysisActive) return;
    try {
        const digits = marketTicks[symbol] || [];
        const strategy = 'under7';
        const patternLength = getTickCount('under7');
        const barrier = 7;

        if (digits.length < patternLength) return;

        const patternMatch = checkConsecutiveOver(digits, patternLength, barrier);
        const sequence = getActiveSequence(symbol, strategy);
        const martingale = getMartingaleFor(symbol, strategy);

        // Check if the pattern is met AND we are not currently in a trade
        if (patternMatch && currentTrade === null) {
            if (!sequence || !sequence.active) {
                // Pattern met and no active sequence, start a new sequence
                log(`Under 7 strategy: Previous ${patternLength} digits >= ${barrier} detected. Starting new sequence for UNDER 7 on ${marketDetails[symbol]?.name || symbol}`);
                startNewSequence(symbol, strategy);
                const martingale = getMartingaleFor(symbol, strategy);
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${martingale.stake}`);
                placeTrade(symbol, "DIGITUNDER", martingale.stake, 1, 7, undefined, strategy);
            } else {
                // Pattern met and an active sequence exists, place the next trade in the sequence
                log(`Under 7 strategy: Previous ${patternLength} digits >= ${barrier} detected. Placing next trade in active sequence for UNDER 7 on ${marketDetails[symbol]?.name || symbol}`);
                const stakeToUse = martingale.stake;
                log(`[MARTINGALE DEBUG] ${strategy} in ${symbol}: step=${martingale.step}, stake=${stakeToUse}`);
                placeTrade(symbol, "DIGITUNDER", stakeToUse, 1, barrier, undefined, strategy);
            }
        }
    } catch (error) {
        log(`Error in analyzeUnder7Strategy for ${symbol}: ${error.message}`);
        console.error(error); // Log full error for debugging
    }
} 