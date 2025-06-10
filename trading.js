import { log, updateTradeHistory, updateAccountBalanceUI, getStakeAmount, getMartingaleMultiplier, getMartingaleLevel, getMaxLoss, getTargetProfit, cumulativeProfitLoss, clearTradeHistoryTable } from "./ui.js";
import { marketDetails } from "./config.js";
import { ws, currentAccount } from "./websocket.js";
import { setMartingaleActive, stopAllAnalysis, setPatternCooldown } from "./marketAnalysis.js";
import { initialStake } from "./config.js";
import { isTradeAllowed, recordTradeWin, pauseTradeAtStep2, isTradePaused, markMarketActive, markMarketCompleted, updateMarketStep } from "./tradeLimiter.js";

let currentTrade = null;
let openContractId = null;
let waitingForSecondTradeTick = false;
let secondTradeDetails = null;
let isTradingSequenceActive = false;
let subscriptionRetryCount = 0;
const MAX_SUBSCRIPTION_RETRIES = 3;

// Martingale state per (market, tradeType)
const martingaleState = {};

// Track active sequences per (market, strategy)
const activeSequences = {};

function getMartingaleKey(symbol, userTradeType) {
    return `${symbol}__${userTradeType}`;
}

function getMartingaleForKey(key) {
    if (!martingaleState[key]) {
        martingaleState[key] = {
            baseStake: getStakeAmount(),
            step: 0
        };
    }
    return martingaleState[key];
}

function getMartingaleFor(symbol, userTradeType) {
    const key = getMartingaleKey(symbol, userTradeType);
    if (!martingaleState[key]) {
        martingaleState[key] = {
            baseStake: getStakeAmount(),
            step: 0
        };
    }
    return martingaleState[key];
}

function setInitialStakeFromUI(amount) {
    // Reset all martingale states to new initial stake
    for (const key in martingaleState) {
        martingaleState[key].baseStake = amount;
        martingaleState[key].step = 0;
    }
}

function getWaitingForSecondTradeTickState() {
    return waitingForSecondTradeTick;
}

function prepareForNextTrade(completedTrade) {
    waitingForSecondTradeTick = true;
    // Always use userTradeType from completedTrade or sequence
    let sequence = getActiveSequence(completedTrade.symbol, completedTrade.userTradeType || completedTrade.tradeType);
    let userTradeType = completedTrade.userTradeType || sequence?.userTradeType || completedTrade.tradeType;
    secondTradeDetails = { ...completedTrade, tradeType: userTradeType, userTradeType };
}

function attemptNextTradeInSequence(tickData) {
    if (!isTradingSequenceActive) return;
    try {
        if (waitingForSecondTradeTick && currentTrade === null) {
            if (tickData.tick.symbol === secondTradeDetails?.symbol) {
                log(`Attempting to place next trade in sequence on ${marketDetails[secondTradeDetails.symbol]?.name || secondTradeDetails.symbol}.`);
                if (secondTradeDetails) {
                    placeTrade(
                        secondTradeDetails.symbol,
                        secondTradeDetails.tradeType,
                        undefined, // always undefined for amount
                        secondTradeDetails.duration,
                        secondTradeDetails.barrier,
                        undefined,
                        secondTradeDetails.userTradeType // always pass userTradeType
                    );
                    resetTradingSequenceState();
                } else {
                    log("Error: Subsequent trade details not found when attempting to place.");
                    resetTradingSequenceState();
                }
            }
        }
    } catch (error) {
        log(`Error in attemptNextTradeInSequence: ${error.message}`);
        console.error(error); // Log full error for debugging
        resetTradingSequenceState(); // Attempt to reset state to allow trading to potentially resume
    }
}

function resetTradingSequenceState() {
    waitingForSecondTradeTick = false;
    secondTradeDetails = null;
    currentTrade = null;
    openContractId = null;
}

function placeTrade(symbol, tradeType, amount, duration, barrier = undefined, martingaleKey = undefined, userTradeType = undefined) {
    // Check if trade is paused
    if (isTradePaused(symbol, userTradeType || tradeType)) {
        log(`Skipping trade for ${userTradeType || tradeType} in ${marketDetails[symbol]?.name || symbol} as it is paused at step 2.`);
        return;
    }

    // Mark market as active when starting a trade
    markMarketActive(symbol);
    
    // Always use martingale stake for this (symbol, userTradeType)
    const key = getMartingaleKey(symbol, userTradeType || tradeType);
    const martingale = getMartingaleFor(symbol, userTradeType || tradeType);
    const martingaleMultiplier = getMartingaleMultiplier();
    const stakeToUse = parseFloat((martingale.baseStake * Math.pow(martingaleMultiplier, martingale.step)).toFixed(2));
    // --- TRADE LIMITER: Prevent trade if locked ---
    if (!isTradeAllowed(symbol, userTradeType || tradeType)) {
        log(`Trade for ${userTradeType || tradeType} in ${marketDetails[symbol]?.name || symbol} is locked after a win. Skipping.`);
        return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        log("Cannot place trade: WebSocket is not connected.");
        return;
    }
    if (currentTrade !== null) {
         log("Cannot place trade: A trade is already open.\n");
         return;
    }
    // Map tradeType/barrier to user-friendly strategy name
    let displayTradeType = userTradeType || tradeType;
    if (tradeType === 'DIGITOVER') {
        if (barrier === 4) displayTradeType = 'over4';
        else if (barrier === 5) displayTradeType = 'over5';
        else if (barrier === 6) displayTradeType = 'over6';
        else if (barrier === 7) displayTradeType = 'over7';
        else if (barrier === 8) displayTradeType = 'over8';
        else displayTradeType = 'over3'; // fallback for other over digit strategies
    } else if (tradeType === 'DIGITEVEN') {
        displayTradeType = 'even';
    } else if (tradeType === 'DIGITODD') {
        displayTradeType = 'odd';
    }
    log(`Placing ${displayTradeType} trade for ${marketDetails[symbol]?.name || symbol} at $${stakeToUse.toFixed(2)} for ${duration} ticks. (Martingale step: ${martingale.step})`);
    const payload = {
        buy: 1,
        price: stakeToUse,
        parameters: {
            amount: stakeToUse,
            basis: "stake",
            contract_type: tradeType,
            currency: "USD",
            duration: duration,
            duration_unit: "t",
            symbol: symbol
        }
    };
    if (barrier !== undefined) {
        payload.parameters.barrier = barrier;
    }
    ws.send(JSON.stringify(payload));
    // Always store userTradeType in currentTrade
    currentTrade = {
        symbol: symbol,
        tradeType: displayTradeType,
        userTradeType: userTradeType || tradeType,
        amount: stakeToUse,
        duration: duration,
        barrier: barrier,
        entrySpot: null,
        exitSpot: null,
        buyPrice: stakeToUse,
        profit: null
    };
    isTradingSequenceActive = true;
}

function handleTradeResponse(data) {
    if (data.msg_type === "buy") {
        if (data.buy) {
            openContractId = data.buy.contract_id;
            if (currentTrade) currentTrade.buyPrice = parseFloat(data.buy.buy_price);
            log(`Trade opened successfully. Contract ID: ${openContractId}, Buy Price: $${data.buy.buy_price}`);
            
            // Subscribe to contract updates with verification
            subscriptionRetryCount = 0;
            subscribeToContractUpdates(openContractId);
        } else if (data.error) {
            log(`Trade failed to open: ${data.error.message}`);
            currentTrade = null;
            openContractId = null;
            if (waitingForSecondTradeTick) {
                waitingForSecondTradeTick = false;
                secondTradeDetails = null;
                log("Second trade placement failed, resetting delay state.");
            }
        }
    } else if (data.proposal_open_contract) {
        const contract = data.proposal_open_contract;
        
        // Handle subscription verification
        if (data.echo_req?.passthrough?.type === "contract_subscription") {
            if (data.error) {
                log(`Contract subscription failed: ${data.error.message}`);
                if (subscriptionRetryCount < MAX_SUBSCRIPTION_RETRIES) {
                    subscriptionRetryCount++;
                    log(`Retrying contract subscription (attempt ${subscriptionRetryCount}/${MAX_SUBSCRIPTION_RETRIES})...`);
                    subscribeToContractUpdates(openContractId);
                } else {
                    log(`Failed to subscribe to contract updates after ${MAX_SUBSCRIPTION_RETRIES} attempts. Forcing trade closure.`);
                    forceCloseTrade();
                }
                return;
            } else {
                log(`Contract subscription successful for ${openContractId}`);
                subscriptionRetryCount = 0;
            }
        }

        if (contract.contract_id === openContractId) {
            // Get decimals from market details
            const contractSymbol = contract.symbol || currentTrade?.symbol || 'undefined';
            const decimals = marketDetails[contractSymbol]?.decimals || 2;

            if (contract.entry_tick && currentTrade.entrySpot === null) {
                currentTrade.entrySpot = parseFloat(contract.entry_tick);
                log(`Entry tick updated: ${currentTrade.entrySpot.toFixed(decimals)}`);
            }
            
            // Let Deriv handle the exit spot
            if (contract.exit_tick) {
                currentTrade.exitSpot = parseFloat(contract.exit_tick);
            } else if (contract.exit_spot) {
                currentTrade.exitSpot = parseFloat(contract.exit_spot);
            } else if (contract.current_spot) {
                currentTrade.exitSpot = parseFloat(contract.current_spot);
            }

            if (contract.is_sold === 1) {
                try {
                    if (!isTradingSequenceActive) {
                        log(`Ignoring completed trade message for contract ID: ${contract.contract_id} as bot is stopped.`);
                        currentTrade = null;
                        openContractId = null;
                        return;
                    }
                    const profitLoss = parseFloat(contract.profit);
                    const tradeWasLoss = profitLoss < 0;
                    if (currentTrade !== null && currentTrade.profit === null) {
                        currentTrade.profit = profitLoss;
                        log(`Trade completed: ${profitLoss >= 0 ? 'WON' : 'LOST'}, Profit/Loss: $${profitLoss.toFixed(2)}`);
                        // --- TRADE LIMITER: Record win and lock this trade if it is a win ---
                        if (profitLoss > 0) {
                            recordTradeWin(currentTrade.symbol, currentTrade.userTradeType || currentTrade.tradeType);
                            log(`TradeLimiter: Locked ${currentTrade.userTradeType || currentTrade.tradeType} in ${marketDetails[currentTrade.symbol]?.name || currentTrade.symbol} after first win.`);
                        } else {
                            // Set pattern cooldown after a loss
                            setPatternCooldown(currentTrade.symbol, currentTrade.userTradeType || currentTrade.tradeType, 5);
                        }
                    }

                    // Ensure we have all required trade data before proceeding
                    if (currentTrade && currentTrade.entrySpot !== null && currentTrade.profit !== null) {
                        const completedTrade = { ...currentTrade };
                        // Always update martingale state for the correct (symbol, userTradeType)
                        const symbol = completedTrade.symbol;
                        const userTradeType = completedTrade.userTradeType || completedTrade.tradeType;
                        const martingale = getMartingaleFor(symbol, userTradeType);
                        
                        if (tradeWasLoss) {
                            // Check if this was step 3 (third consecutive loss)
                            if (martingale.step === 3) {
                                log(`Trade ${userTradeType} in ${marketDetails[symbol]?.name || symbol} will be paused after this loss (step ${martingale.step}).`);
                                pauseTradeAtStep2(symbol, userTradeType);
                            }
                            martingale.step++;
                            // Update the market's current step
                            updateMarketStep(symbol, martingale.step);
                            // Reset martingale if step reaches user-defined limit
                            const maxMartingaleLevel = getMartingaleLevel();
                            if (martingale.step >= maxMartingaleLevel) {
                                log(`Martingale level limit (${maxMartingaleLevel}) reached for ${completedTrade.tradeType} in ${marketDetails[completedTrade.symbol]?.name || completedTrade.symbol}. Reverting to base stake.`);
                                martingale.step = 0;
                                updateMarketStep(symbol, 0);
                            }
                            const nextStake = martingale.baseStake * Math.pow(getMartingaleMultiplier(), martingale.step);
                            log(`Trade lost. Next stake for ${userTradeType} in ${marketDetails[symbol]?.name || symbol}: $${nextStake.toFixed(2)} (step ${martingale.step})`);
                        } else {
                            // Trade was a win - reset martingale
                            martingale.step = 0;
                            updateMarketStep(symbol, 0);
                            log(`Trade won. Martingale reset for ${userTradeType} in ${marketDetails[symbol]?.name || symbol}.`);
                            // End sequence on a win
                            endSequence(symbol, userTradeType);
                        }
                        
                        updateTradeHistory(completedTrade);
                        const maxLoss = getMaxLoss();
                        const targetProfit = getTargetProfit();
                        if (cumulativeProfitLoss <= -maxLoss) {
                            log(`Max loss ($${maxLoss}) reached. Stopping all trading.`);
                            stopTrading();
                            return;
                        }
                        if (cumulativeProfitLoss >= targetProfit) {
                            log(`Cumulative profit ($${cumulativeProfitLoss.toFixed(2)}) reached target profit ($${targetProfit.toFixed(2)}).`);
                            stopTrading();
                            stopAllAnalysis();
                            log('Take Profit reached! Trade again?');
                            return;
                        }
                        // Mark market as completed when trade is finished
                        markMarketCompleted(completedTrade.symbol);
                        currentTrade = null;
                        openContractId = null;
                    }
                } catch (error) {
                    log(`Error processing trade completion: ${error.message}`);
                    console.error(error);
                    // Reset state to prevent hanging
                    currentTrade = null;
                    openContractId = null;
                    waitingForSecondTradeTick = false;
                    secondTradeDetails = null;
                }
            }
        }
    } else if (data.msg_type === "sell") {
        if (data.sell) {
            log(`Sell confirmation received for contract ID: ${data.sell.contract_id}`);
            if (openContractId && data.sell.contract_id === openContractId) {
                // Delay clearing currentTrade and openContractId until proposal_open_contract confirms is_sold
            }
        } else {
            log("Sell message received but no sell data was present.");
        }
    } else if (data.error) {
        log(`Contract update error: ${data.error.message}`);
        if (currentTrade !== null) {
            log("Potentially trade-related contract update error, resetting state and resuming analysis.");
            currentTrade = null;
            openContractId = null;
            waitingForSecondTradeTick = false;
            secondTradeDetails = null;
        } else {
             log("Contract update error not related to current trade or currentTrade is already null.");
        }
    }
}

function getCurrentStake() {
    // Not used for actual trade, but for UI and initial value
    return getStakeAmount();
}

function stopTrading() {
    if (!isTradingSequenceActive) return;
    log("Stopping all trading activities...");
    isTradingSequenceActive = false;
    if (openContractId !== null) {
        log(`Attempting to sell open contract with ID: ${openContractId}`);
        ws.send(JSON.stringify({ sell: openContractId, price: 0 }));
    }
}

function getIsTradingSequenceActive() {
    return isTradingSequenceActive;
}

function handleProfitTargetReached() {
    log(`Cumulative profit ($${cumulativeProfitLoss.toFixed(2)}) reached target profit ($${getTargetProfit().toFixed(2)}).`);
    isTradingSequenceActive = false;
    // Stop all trading and pattern scanning
    stopTrading();
    stopAllAnalysis();
    log('Take Profit reached! Trade again?');
    // Do not clear table or restart analysis automatically
}

function getSequenceKey(symbol, tradeType) {
    return `${symbol}__${tradeType}`;
}

function startNewSequence(symbol, userTradeType) {
    // Map user-friendly tradeType to API contract_type and barrier
    let contractType = userTradeType;
    let barrier = undefined;
    if (userTradeType === 'over4') { contractType = 'DIGITOVER'; barrier = 4; }
    else if (userTradeType === 'over5') { contractType = 'DIGITOVER'; barrier = 5; }
    else if (userTradeType === 'over6') { contractType = 'DIGITOVER'; barrier = 6; }
    else if (userTradeType === 'over7') { contractType = 'DIGITOVER'; barrier = 7; }
    else if (userTradeType === 'over8') { contractType = 'DIGITOVER'; barrier = 8; }
    else if (userTradeType === 'even') { contractType = 'DIGITEVEN'; }
    else if (userTradeType === 'odd') { contractType = 'DIGITODD'; }
    else if (userTradeType === 'under3') { contractType = 'DIGITUNDER'; barrier = 3; }
    else if (userTradeType === 'under4') { contractType = 'DIGITUNDER'; barrier = 4; }
    else if (userTradeType === 'under5') { contractType = 'DIGITUNDER'; barrier = 5; }
    else if (userTradeType === 'under6') { contractType = 'DIGITUNDER'; barrier = 6; }
    // Add more mappings as needed

    const martingaleKey = getMartingaleKey(symbol, userTradeType);
    const key = getSequenceKey(symbol, userTradeType);
    activeSequences[key] = {
        active: true,
        consecutiveLosses: 0,
        symbol,
        tradeType: userTradeType,
        lastTradeDetails: null,
        contractType,
        barrier,
        martingaleKey,
        userTradeType
    };
    return activeSequences[key];
}

function getActiveSequence(symbol, userTradeType) {
    const key = getSequenceKey(symbol, userTradeType);
    return activeSequences[key];
}

function endSequence(symbol, userTradeType, resetMartingale = true) {
    const key = getSequenceKey(symbol, userTradeType);
    if (activeSequences[key]) {
        activeSequences[key].active = false;
        activeSequences[key].consecutiveLosses = 0;
        activeSequences[key].lastTradeDetails = null;
    }
    // Only reset martingale state if requested
    if (resetMartingale) {
        const martingale = getMartingaleFor(symbol, userTradeType);
        martingale.step = 0;
    }
}

function endAllSequences() {
    Object.keys(activeSequences).forEach(key => {
        const sequence = activeSequences[key];
        endSequence(sequence.symbol, sequence.tradeType);
    });
}

function subscribeToContractUpdates(contractId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        log("Cannot subscribe to contract updates: WebSocket is not connected");
        return;
    }
    ws.send(JSON.stringify({ 
        proposal_open_contract: 1, 
        contract_id: contractId, 
        subscribe: 1,
        passthrough: { type: "contract_subscription" }
    }));
    log(`Subscribed to contract updates for ID: ${contractId}`);
}

function forceCloseTrade() {
    if (openContractId) {
        log(`Forcing closure of trade ${openContractId} due to subscription failure`);
        ws.send(JSON.stringify({ sell: openContractId, price: 0 }));
        // Reset state after a short delay
        setTimeout(() => {
            if (currentTrade) {
                log(`Recovery: Resetting state for trade ${openContractId}`);
                currentTrade = null;
                openContractId = null;
                waitingForSecondTradeTick = false;
                secondTradeDetails = null;
            }
        }, 2000);
    }
}

export { 
    currentTrade, 
    getCurrentStake, 
    isTradingSequenceActive, 
    prepareForNextTrade, 
    resetTradingSequenceState, 
    attemptNextTradeInSequence, 
    getWaitingForSecondTradeTickState, 
    placeTrade, 
    handleTradeResponse, 
    setInitialStakeFromUI, 
    stopTrading, 
    startNewSequence, 
    getActiveSequence, 
    endSequence, 
    getMartingaleFor
}; 
