import { analyzeEvenStrategy, analyzeOddStrategy, analyzeOver4Strategy, analyzeOver5Strategy, analyzeOver6Strategy, analyzeOver7Strategy, analyzeOver8Strategy } from "./marketAnalysis.js";
import { setInitialStakeFromUI, stopTrading } from "./trading.js";
import { getStakeAmount, log } from "./ui.js";
import { marketDetails } from "./config.js";

// Track all active strategies
const activeStrategies = new Set();
let statusInterval = null;

function startStatusInterval() {
    if (statusInterval) return;
    statusInterval = setInterval(() => {
        if (activeStrategies.size > 0) {
            const now = new Date().toLocaleTimeString();
            activeStrategies.forEach(strategy => {
                log(`[${now}] Strategy ${strategy}: analysis ongoing...`);
            });
        }
    }, 120000); // 2 minutes
}

function stopStatusInterval() {
    if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
    }
}

function handleStrategyButtonClick(button, strategy) {
    const isActive = activeStrategies.has(strategy);
    if (isActive) {
        log(`Stopping strategy ${strategy}.`);
        stopStrategy(strategy);
        button.classList.remove('active');
        button.setAttribute('aria-pressed', 'false');
        button.textContent = `Start ${strategy.charAt(0).toUpperCase() + strategy.slice(1)}`;
        activeStrategies.delete(strategy);
        if (activeStrategies.size === 0) stopStatusInterval();
        return;
    }
    log(`Starting strategy ${strategy}.`);
    const initialStakeAmount = getStakeAmount();
    setInitialStakeFromUI(initialStakeAmount);
    startPatternStrategy(strategy);
    button.classList.add('active');
    button.setAttribute('aria-pressed', 'true');
    button.textContent = `Stop ${strategy.charAt(0).toUpperCase() + strategy.slice(1)}`;
    activeStrategies.add(strategy);
    if (activeStrategies.size === 1) startStatusInterval();
}

function startPatternStrategy(strategy) {
    if (strategy === 'over3') { return; }
    // Add cases for 'rise' and 'fall' if they need specific initialization
    // For all other strategies, pattern checks are now continuous on every tick, so no interval needed
}

function stopPatternStrategy(strategy) {
    if (strategy === 'over3') { return; }
    // Add cases for 'rise' and 'fall' if they need specific cleanup
    // For all other strategies, stopping is handled by not running their logic in the tick handler if not active
    // (You may want to add per-strategy enable/disable flags in marketAnalysis.js for full isolation)
    stopTrading();
}

function stopStrategy(strategy) {
    stopPatternStrategy(strategy);
}

function stopAllStrategies() {
    // Stop all strategies and reset all buttons
    activeStrategies.forEach(strategy => {
        stopPatternStrategy(strategy);
        const button = document.querySelector(`.strategy-button[data-strategy="${strategy}"]`);
        if (button) {
            button.classList.remove('active');
            button.setAttribute('aria-pressed', 'false');
            button.textContent = `Start ${strategy.charAt(0).toUpperCase() + strategy.slice(1)}`;
        }
    });
    activeStrategies.clear();
    stopStatusInterval();
    log('All strategies stopped. Trading and analysis halted, but market data will continue updating.');
}

// Function to re-evaluate active strategies after connection/data load
// This function will be moved to marketAnalysis.js to resolve scope issues
// function reevaluateActiveStrategies() {
//     if (!isAnalysisActive) return; // Only re-evaluate if analysis is globally active

//     // Iterate through active strategies and trigger their analysis functions
//     // Note: This assumes the analysis functions in marketAnalysis.js are designed
//     // to check for the pattern and trade conditions whenever called with new data.
//     activeStrategies.forEach(strategy => {
//         log(`Re-evaluating strategy ${strategy} after connection.`);
//         // Assuming marketAnalysis.js exports these analysis functions
//         switch (strategy) {
//             case 'even':
//                 analyzeEvenStrategy(Object.keys(marketDetails)[0]); // Assuming analysis needs a symbol
//                 break;
//             case 'odd':
//                 analyzeOddStrategy(Object.keys(marketDetails)[0]); // Assuming analysis needs a symbol
//                 break;
//             case 'over3':
//                 analyzeOver3Strategy(Object.keys(marketDetails)[0]); // Assuming analysis needs a symbol
//                 break;
//             case 'over4':
//                 analyzeOver4Strategy(Object.keys(marketDetails)[0]); // Assuming analysis needs a symbol
//                 break;
//             case 'over5':
//                 analyzeOver5Strategy(Object.keys(marketDetails)[0]); // Assuming analysis needs a symbol
//                 break;
//             case 'over6':
//                 analyzeOver6Strategy(Object.keys(marketDetails)[0]); // Assuming analysis needs a symbol
//                 break;
//             case 'over7':
//                 analyzeOver7Strategy(Object.keys(marketDetails)[0]); // Assuming analysis needs a symbol
//                 break;
//             case 'over8':
//                 analyzeOver8Strategy(Object.keys(marketDetails)[0]); // Assuming analysis needs a symbol
//                 break;
//             case 'under3':
//                  // Under strategies in underStrategies.js need marketTicks, isAnalysisActive, etc.
//                  // We might need a different approach for these or pass the necessary data.
//                  // For now, leaving as a placeholder or calling with minimal data if possible.
//                  // analyzeUnder3Strategy(Object.keys(marketDetails)[0], null, isAnalysisActive, null, null);
//                 log(`Re-evaluation for under strategy ${strategy} may require specific data.`);
//                  break;
//             case 'under4':
//                  log(`Re-evaluation for under strategy ${strategy} may require specific data.`);
//                  break;
//             case 'under5':
//                  log(`Re-evaluation for under strategy ${strategy} may require specific data.`);
//                  break;
//             case 'under6':
//                  log(`Re-evaluation for under strategy ${strategy} may require specific data.`);
//                  break;
//             case 'under7':
//                  log(`Re-evaluation for under strategy ${strategy} may require specific data.`);
//                  break;
//             case 'rise':
//                  analyzeRiseStrategy(Object.keys(marketDetails)[0]); // Assuming analysis needs a symbol
//                  break;
//             case 'fall':
//                  analyzeFallStrategy(Object.keys(marketDetails)[0]); // Assuming analysis needs a symbol
//                  break;
//             default:
//                 log(`No specific re-evaluation logic for strategy ${strategy}.`);
//                 break;
//         }
//     });
// }

export { handleStrategyButtonClick, stopStrategy, stopAllStrategies, activeStrategies }; 