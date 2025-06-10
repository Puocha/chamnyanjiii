import { marketDetails } from "./config.js";
import { connectWebSocket, disconnectWebSocket, toggleAccount } from "./websocket.js";
import { setInitialStakeFromUI } from "./trading.js";
import { handleStrategyButtonClick, stopAllStrategies } from "./strategies.js";
import { getMarketDataBySymbol } from "./dataStorage.js";

export function log(msg) {
  const div = document.getElementById("log");
  const message = `[${new Date().toLocaleTimeString()}] ${msg}<br>`;
  div.innerHTML = message + div.innerHTML;
}

export let cumulativeProfitLoss = 0;

export function updateTradeHistory(completedTrade) {
  const table = document.getElementById("trade-history-table");
  if (!table) {
    log("ERROR: Trade history table element not found!");
    return;
  }
  const tbody = table.querySelector('tbody');
  if (!tbody) {
    log("ERROR: Trade history table tbody not found!");
    return;
  }
  
  if (tbody.querySelector('td[colspan="5"]')) {
      tbody.innerHTML = '';
  }

  const row = document.createElement('tr');
  const decimals = marketDetails[completedTrade.symbol]?.decimals || 2;
  row.innerHTML = `
      <td>${completedTrade.tradeType}</td>
      <td>${marketDetails[completedTrade.symbol]?.name || completedTrade.symbol}</td>
      <td>${completedTrade.entrySpot !== null ? completedTrade.entrySpot.toFixed(decimals) : '-'}</td>
      <td>${completedTrade.exitSpot !== null ? completedTrade.exitSpot.toFixed(decimals) : '-'}</td>
      <td style="color: ${completedTrade.profit >= 0 ? 'green' : 'red'};">${completedTrade.profit !== null ? (completedTrade.profit >= 0 ? '+' : '') + completedTrade.profit.toFixed(2) : '-'}</td>
  `;
  tbody.insertBefore(row, tbody.firstChild); // Add new row at the top

  if (completedTrade.profit !== null) {
      cumulativeProfitLoss += completedTrade.profit;
  }

  log(`Cumulative Profit/Loss: $${cumulativeProfitLoss.toFixed(2)}`);

   let totalRow = tbody.querySelector('tr.total-pl');
   if (!totalRow) {
       totalRow = document.createElement('tr');
       totalRow.classList.add('total-pl');
       totalRow.innerHTML = '<td colspan="4" style="text-align:right; font-weight:bold;">Total P/L</td><td></td>';
       tbody.appendChild(totalRow);
   }
   totalRow.querySelector('td:last-child').textContent = `${cumulativeProfitLoss >= 0 ? '+' : ''}${cumulativeProfitLoss.toFixed(2)}`;
   totalRow.querySelector('td:last-child').style.color = cumulativeProfitLoss >= 0 ? 'green' : 'red';

  log("Trade history table updated.");
}

export function updateAccountBalanceUI(balance, currency) {
    const accountBalanceSpan = document.getElementById("account-balance");
    if (balance !== 'N/A') {
        accountBalanceSpan.textContent = `Balance: ${currency} ${balance.toFixed(2)}`;
    } else {
        accountBalanceSpan.textContent = `Balance: N/A`;
    }
}

export function initializeMarketDataTable() {
    const tbody = document.getElementById("market-data-table").querySelector('tbody');
    tbody.innerHTML = ''; // Clear existing rows
    
    Object.keys(marketDetails).forEach(symbol => {
        const row = document.createElement('tr');
        row.id = `market-row-${symbol}`;
        row.innerHTML = `
            <td>${marketDetails[symbol].name}</td>
            <td class="market-price">-</td>
            <td class="last-digit">-</td>
            ${Array(10).fill('<td class="digit-percentage">-</td>').join('')}
        `;
        tbody.appendChild(row);
    });
    log("Market data table initialized.");
}

export function getStakeAmount() {
    return parseFloat(document.getElementById("stake-amount").value);
}

export function getMartingaleMultiplier() {
    return parseFloat(document.getElementById("martingale-multiplier").value);
}

export function getMartingaleLevel() {
    return parseInt(document.getElementById("martingale-level").value);
}

export function getMaxLoss() {
    return parseFloat(document.getElementById("max-loss").value);
}

export function getTargetProfit() {
    return parseFloat(document.getElementById("target-profit").value);
}

export function renderMarketDataTableEvenMode(marketTicks) {
    const tbody = document.getElementById("market-data-table").querySelector('tbody');
    const thead = document.getElementById("market-data-table").querySelector('thead');
    // Set headers: Markets, Price, Last Digit, 1-10
    thead.innerHTML = `<tr>
        <th>Markets</th>
        <th>Price</th>
        <th>Last Digit</th>
        ${Array.from({length: 10}, (_, i) => `<th>${i+1}</th>`).join('')}
    </tr>`;
    tbody.innerHTML = '';
    Object.keys(marketDetails).forEach(symbol => {
        let lastPrice = '-';
        let lastDigit = '-';
        if (window.latestMarketPrices && window.latestMarketPrices[symbol]) {
            lastPrice = window.latestMarketPrices[symbol].toFixed(marketDetails[symbol].decimals);
        }
        const digits = (marketTicks[symbol] || []);
        if (digits.length > 0) {
            lastDigit = digits[digits.length - 1];
        }
        const last10 = digits.slice(-10);
        const seq = Array(10 - last10.length).fill('-').concat(last10.map(d => (typeof d === 'number' ? (d % 2 === 0 ? 'E' : 'O') : '-')));
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${marketDetails[symbol].name}</td>
            <td>${lastPrice}</td>
            <td>${lastDigit}</td>
            ${seq.map(val => val === 'E' ? `<td class="even-cell">E</td>` : val === 'O' ? `<td class="odd-cell">O</td>` : `<td>-</td>`).join('')}
        `;
        tbody.appendChild(row);
    });
}

export function renderMarketDataTableOverUnderBarrierMode(barrier, marketTicks) {
    const tbody = document.getElementById("market-data-table").querySelector('tbody');
    const thead = document.getElementById("market-data-table").querySelector('thead');
    thead.innerHTML = `<tr>
        <th>Markets</th>
        <th>Price</th>
        <th>Last Digit</th>
        ${Array.from({length: 10}, (_, i) => `<th>${i+1}</th>`).join('')}
    </tr>`;
    tbody.innerHTML = '';
    Object.keys(marketDetails).forEach(symbol => {
        let lastPrice = '-';
        let lastDigit = '-';
        if (window.latestMarketPrices && window.latestMarketPrices[symbol]) {
            lastPrice = window.latestMarketPrices[symbol].toFixed(marketDetails[symbol].decimals);
        }
        const digits = (marketTicks[symbol] || []);
        if (digits.length > 0) {
            lastDigit = digits[digits.length - 1];
        }
        const last10 = digits.slice(-10);
        const seq = Array(10 - last10.length).fill('-').concat(
            last10.map(d => {
                if (typeof d !== 'number') return '-';
                if (d === barrier) return 'B';
                if (d > barrier) return 'O';
                if (d < barrier) return 'U';
                return '-';
            })
        );
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${marketDetails[symbol].name}</td>
            <td>${lastPrice}</td>
            <td>${lastDigit}</td>
            ${seq.map(val => val === 'O' ? `<td class="odd-cell">O</td>` : val === 'U' ? `<td class="even-cell">U</td>` : val === 'B' ? `<td class="barrier-cell">B</td>` : `<td>-</td>`).join('')}
        `;
        tbody.appendChild(row);
    });
}

export function renderMarketDataTableOver2Mode(marketTicks) {
    const tbody = document.getElementById("market-data-table").querySelector('tbody');
    const thead = document.getElementById("market-data-table").querySelector('thead');
    thead.innerHTML = `<tr>
        <th>Markets</th>
        <th>Price</th>
        <th>Last Digit</th>
        ${Array.from({length: 10}, (_, i) => `<th>${i+1}</th>`).join('')}
    </tr>`;
    tbody.innerHTML = '';
    Object.keys(marketDetails).forEach(symbol => {
        let lastPrice = '-';
        let lastDigit = '-';
        if (window.latestMarketPrices && window.latestMarketPrices[symbol]) {
            lastPrice = window.latestMarketPrices[symbol].toFixed(marketDetails[symbol].decimals);
        }
        const digits = (marketTicks[symbol] || []);
        if (digits.length > 0) {
            lastDigit = digits[digits.length - 1];
        }
        const last10 = digits.slice(-10);
        // O: 3-9, U: 0-2
        const seq = Array(10 - last10.length).fill('-').concat(
            last10.map(d => {
                if (typeof d !== 'number') return '-';
                if (d >= 3 && d <= 9) return 'O';
                if (d >= 0 && d <= 2) return 'U';
                return '-';
            })
        );
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${marketDetails[symbol].name}</td>
            <td>${lastPrice}</td>
            <td>${lastDigit}</td>
            ${seq.map(val => val === 'O' ? `<td class="odd-cell">O</td>` : val === 'U' ? `<td class="even-cell">U</td>` : `<td>-</td>`).join('')}
        `;
        tbody.appendChild(row);
    });
}

export function renderMarketDataTableOverUnderBarrierDispatcher(mode, marketTicks) {
    if (mode === 'overunder3') return renderMarketDataTableOverUnderBarrierMode(3, marketTicks);
    if (mode === 'overunder4') return renderMarketDataTableOverUnderBarrierMode(4, marketTicks);
    if (mode === 'overunder5') return renderMarketDataTableOverUnderBarrierMode(5, marketTicks);
    if (mode === 'overunder6') return renderMarketDataTableOverUnderBarrierMode(6, marketTicks);
    if (mode === 'overunder7') return renderMarketDataTableOverUnderBarrierMode(7, marketTicks);
    if (mode === 'overunder8') return renderMarketDataTableOverUnderBarrierMode(8, marketTicks);
}

function renderMarketDataTableDefault() {
    // Restore the original table headers and digit percentage view
    const tbody = document.getElementById("market-data-table").querySelector('tbody');
    const thead = document.getElementById("market-data-table").querySelector('thead');
    thead.innerHTML = `<tr>
        <th>Markets</th>
        <th>Price</th>
        <th>Last Digit</th>
        <th>0%</th>
        <th>1%</th>
        <th>2%</th>
        <th>3%</th>
        <th>4%</th>
        <th>5%</th>
        <th>6%</th>
        <th>7%</th>
        <th>8%</th>
        <th>9%</th>
    </tr>`;
    // Re-render using the existing updateMarketDataTableUI logic (simulate a tick)
    Object.keys(marketDetails).forEach(symbol => {
        // This will be updated by the next tick, so just leave as is
    });
}

function initializeUI() {
    // Automatically connect WebSocket when page loads
    connectWebSocket();

    const accountToggleButton = document.getElementById("account-toggle-button");
    if (accountToggleButton) {
        accountToggleButton.onclick = () => {
            toggleAccount();
        };
    }

    const clearHistoryButton = document.getElementById("clear-history");
    if (clearHistoryButton) {
        clearHistoryButton.onclick = () => {
            clearTradeHistoryTable();
        };
    }

    document.querySelectorAll('.strategy-button').forEach(button => {
        button.onclick = () => {
            const strategy = button.getAttribute('data-strategy');
            handleStrategyButtonClick(button, strategy);
        };
    });

    // Wire up the general stop button
    const stopButton = document.getElementById('stop-button');
    if (stopButton) {
        stopButton.onclick = () => {
            stopAllStrategies();
        };
    }

    const dropdown = document.getElementById('market-data-mode');
    if (dropdown) {
        dropdown.addEventListener('change', () => {
            if (dropdown.value === 'even') {
                import('./marketAnalysis.js').then(mod => {
                    const marketTicks = mod.__esModule ? mod.marketTicks : undefined;
                    renderMarketDataTableEvenMode(window.marketTicks || marketTicks || {});
                });
            } else if (dropdown.value === 'over2') {
                import('./marketAnalysis.js').then(mod => {
                    const marketTicks = mod.__esModule ? mod.marketTicks : undefined;
                    renderMarketDataTableOver2Mode(window.marketTicks || marketTicks || {});
                });
            } else if ([
                'overunder3', 'overunder4', 'overunder5', 'overunder6', 'overunder7', 'overunder8'
            ].includes(dropdown.value)) {
                import('./marketAnalysis.js').then(mod => {
                    const marketTicks = mod.__esModule ? mod.marketTicks : undefined;
                    renderMarketDataTableOverUnderBarrierDispatcher(dropdown.value, window.marketTicks || marketTicks || {});
                });
            } else if (dropdown.value === 'market-data') {
                initializeMarketDataTable();
            } else {
                renderMarketDataTableDefault();
            }
        });
    }
}

// Initialize UI after a short delay to ensure DOM is ready
setTimeout(initializeUI, 100);

// Variable to keep track of the currently active strategy button
let activeStrategyButton = null;

export function clearTradeHistoryTable() {
    const table = document.getElementById("trade-history-table");
    if (!table) {
      log("ERROR: Trade history table element not found!");
      return;
    }
    const tbody = table.querySelector('tbody');
    if (!tbody) {
      log("ERROR: Trade history table tbody not found!");
      return;
    }
    log("Clearing trade history table...");
    tbody.innerHTML = '';
    log("DEBUG: After clearing tbody.innerHTML.");
    cumulativeProfitLoss = 0;
    log(`Cumulative Profit/Loss: $${cumulativeProfitLoss.toFixed(2)}`);
    let totalRow = tbody.querySelector('tr.total-pl');
    if (totalRow) {
        totalRow.querySelector('td:last-child').textContent = '0.00';
        totalRow.querySelector('td:last-child').style.color = 'black';
    }
    log("Trade history table cleared.");
}

// Add a global error handler to log uncaught errors
window.onerror = function(message, source, lineno, colno, error) {
  log(`UNCAUGHT ERROR: ${message} at ${source}:${lineno}:${colno}`);
  if (error && error.stack) {
    log(error.stack);
  }
};

export function addDownloadSequencesButton() {
    const marketDataCard = document.getElementById('market-data-card');
    if (!marketDataCard) {
        log("Market Data card not found.");
        return;
    }

    // Check if the buttons already exist to avoid adding them multiple times
    if (document.getElementById('download-sequences-button')) {
        return;
    }

    // Create a container div for the buttons to manage their layout
    const buttonContainer = document.createElement('div');
    buttonContainer.style.marginTop = '10px'; // Add some spacing above the buttons
    buttonContainer.style.marginBottom = '10px'; // Add some spacing below the buttons

    const downloadSequencesButton = document.createElement('button');
    downloadSequencesButton.id = 'download-sequences-button';
    downloadSequencesButton.classList.add('btn', 'btn-secondary');
    downloadSequencesButton.textContent = 'Download Sequences';
    downloadSequencesButton.setAttribute('aria-label', 'Download active sequences data');
    downloadSequencesButton.style.marginRight = '10px'; // Add spacing between buttons

    const downloadMarketDataButton = document.createElement('button');
    downloadMarketDataButton.id = 'download-market-data-button';
    downloadMarketDataButton.classList.add('btn', 'btn-secondary');
    downloadMarketDataButton.textContent = 'Download Market Data';
    downloadMarketDataButton.setAttribute('aria-label', 'Download all market data');

    // Append buttons to the container
    buttonContainer.appendChild(downloadSequencesButton);
    buttonContainer.appendChild(downloadMarketDataButton);

    // Find the market data table wrapper
    const marketDataTableWrapper = marketDataCard.querySelector('.table-wrapper');

    // Insert the button container before the table wrapper
    if (marketDataTableWrapper) {
        marketDataCard.insertBefore(buttonContainer, marketDataTableWrapper);
    } else {
        // Fallback if table-wrapper is not found (shouldn't happen based on index.html)
        marketDataCard.appendChild(buttonContainer);
    }

    // Attach event listeners
    downloadSequencesButton.addEventListener('click', downloadSequencesTxt);
    downloadMarketDataButton.addEventListener('click', downloadAllMarketData);

    log("Download buttons added to Market Data card.");
}

// Function to format data as CSV (or another format)
function formatMarketDataAsCsv(data, symbol) {
    if (!data || data.length === 0) {
        // Update header to match new columns
        return "Markets,Price,Last Digit,Timestamp\n"; // Header only for empty data
    }

    // Assuming each data item has symbol, price, timestamp, type
    // We will get market name from symbol
    const header = "Markets,Price,Last Digit,Timestamp\n";

    const marketName = marketDetails[symbol]?.name || symbol; // Get market name or use symbol as fallback

    const rows = data.map(item => {
        const price = parseFloat(item.price);
        const decimals = marketDetails[item.symbol]?.decimals || 2;
        // Function to extract the last digit from the price (reusing logic if available, otherwise define locally)
        const extractLastDigit = (price, decimals) => {
            const priceStr = parseFloat(price).toFixed(decimals);
            return priceStr.slice(-1);
        };
        const lastDigit = extractLastDigit(price, decimals);

        // Function to format epoch timestamp to HH:MM:SS AM/PM
        const formatTimestamp = (epoch) => {
            const date = new Date(epoch * 1000); // Convert seconds to milliseconds
            const hours = date.getHours();
            const minutes = date.getMinutes();
            const seconds = date.getSeconds();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const formattedHours = hours % 12 === 0 ? 12 : hours % 12; // 12-hour format
            const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
            const formattedSeconds = seconds < 10 ? '0' + seconds : seconds;
            return `${formattedHours}:${formattedMinutes}:${formattedSeconds} ${ampm}`;
        };
        const formattedTimestamp = formatTimestamp(item.timestamp);

        return `${marketName},${price.toFixed(decimals)},${lastDigit},${formattedTimestamp}`;
    }).join("\n");

    return header + rows;
}

// Function to trigger download
function downloadFile(filename, text) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

// New function to download all market data
async function downloadAllMarketData() {
    log("Attempting to download all market data...");
    const symbols = Object.keys(marketDetails);

    for (const symbol of symbols) {
        try {
            const data = await getMarketDataBySymbol(symbol);
            if (data && data.length > 0) {
                // Pass the symbol to the formatting function
                const csvData = formatMarketDataAsCsv(data, symbol);
                const filename = `${symbol}_market_data.csv`;
                downloadFile(filename, csvData);
                log(`Downloaded data for ${symbol}.`);
            } else {
                log(`No data found for ${symbol}.`);
            }
        } catch (error) {
            log(`Error downloading data for ${symbol}: ${error.message}`);
            console.error(`Download error for ${symbol}:`, error);
        }
    }
    log("Finished attempting to download market data for all symbols.");
}

export function downloadSequencesTxt() {
    if (!window.savedSequences) {
        alert('No sequences saved yet.');
        return;
    }
    let lines = [];
    for (const [strategy, markets] of Object.entries(window.savedSequences)) {
        for (const [symbol, seqArr] of Object.entries(markets)) {
            seqArr.forEach(seq => {
                lines.push(`${marketDetails[symbol]?.name || symbol} ${seq.join(' ')}`);
            });
        }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sequences.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

window.addEventListener('load', addDownloadSequencesButton); // Ensure button is added on load

// --- Tick Count Management ---
const tickCountDefaults = {
  over3: 12,
  over4: 10,
  over5: 14,
  over6: 18,
  under4: 14,
  under5: 11,
  under6: 8,
  under7: 10,
  even: 11,
  odd: 10,
  rise: 6,
  fall: 11
};

const tickCounts = { ...tickCountDefaults };

export function getTickCount(strategy) {
  // Always get the latest value from the UI if available
  const input = document.getElementById(`tick-${strategy}`);
  if (input) {
    const val = parseInt(input.value, 10);
    if (!isNaN(val) && val > 0) {
      tickCounts[strategy] = val;
    }
  }
  return tickCounts[strategy];
}

function saveTickCountsToStorage() {
  localStorage.setItem('chinchilla_tick_counts', JSON.stringify(tickCounts));
}

function loadTickCountsFromStorage() {
  const saved = localStorage.getItem('chinchilla_tick_counts');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      Object.keys(tickCountDefaults).forEach(strategy => {
        if (parsed[strategy] && !isNaN(parsed[strategy])) {
          tickCounts[strategy] = parsed[strategy];
        }
      });
    } catch (e) {
      // Ignore parse errors, fallback to defaults
    }
  }
}

function setupTickCountListeners() {
  loadTickCountsFromStorage();
  Object.keys(tickCountDefaults).forEach(strategy => {
    const input = document.getElementById(`tick-${strategy}`);
    if (input) {
      input.value = tickCounts[strategy];
      input.addEventListener('input', () => {
        const val = parseInt(input.value, 10);
        if (!isNaN(val) && val > 0) {
          tickCounts[strategy] = val;
          saveTickCountsToStorage();
        }
      });
    }
  });
}

window.addEventListener('DOMContentLoaded', setupTickCountListeners);