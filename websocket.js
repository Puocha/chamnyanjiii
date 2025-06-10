// websocket.js
import { app_id, tokens, marketDetails } from "./config.js";
import { log, updateAccountBalanceUI, initializeMarketDataTable } from "./ui.js";
import { handleWsMessage } from "./marketAnalysis.js";
import { handleTradeResponse } from "./trading.js";

export let ws = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000; // 2 seconds
let lastMessageTime = Date.now();
const CONNECTION_CHECK_INTERVAL = 5000; // 5 seconds
const MAX_MESSAGE_GAP = 10000; // 10 seconds
let connectionCheckInterval;
export let currentAccount = 'demo'; // 'demo' or 'real'

export function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('WebSocket is already connected');
        return;
    }

    console.log('Connecting to WebSocket...');
    ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');

    ws.onopen = () => {
        console.log('WebSocket connected');
        isConnected = true;
        reconnectAttempts = 0;
        
        // Start connection monitoring
        startConnectionMonitoring();
        
        // Send initial authorization
        authorize();
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        lastMessageTime = Date.now(); // Update last message time

        if (data.msg_type === "authorize") {
            if (data.authorize) {
                log("Authorized successfully.");
                // Request balance after authorization
                ws.send(JSON.stringify({ balance: 1 }));
                log(`Requesting balance for ${currentAccount} account.`);

                // Initialize market data table and subscribe to ticks for all markets
                initializeMarketDataTable();
                Object.keys(marketDetails).forEach(symbol => {
                    ws.send(JSON.stringify({
                        ticks_history: symbol,
                        count: 1000, // Rolling window of 1000 ticks
                        end: "latest",
                        style: "ticks",
                        adjust_start_time: 1,
                        subscribe: 1
                    }));
                });
            } else if (data.error) {
                log(`Authorization error: ${data.error.message}`);
                disconnectWebSocket();
            }
        } else if (data.msg_type === "balance") {
            if (data.balance) {
                updateAccountBalanceUI(data.balance.balance, data.balance.currency);
                log(`Account balance updated: ${data.balance.currency} ${data.balance.balance}`);
            } else if (data.error) {
                 log(`Balance request error: ${data.error.message}`);
            }
        } else if (data.msg_type === "tick") {
             handleWsMessage(data);
        } else if (data.msg_type === "history") {
             handleWsMessage(data);
        } else if (data.msg_type === "buy") {
             handleTradeResponse(data);
        } else if (data.msg_type === "sell") {
             handleTradeResponse(data);
        } else if (data.msg_type === "proposal_open_contract") {
             handleTradeResponse(data);
        } else if (data.msg_type === "pong") {
            log("[HEARTBEAT] Pong received from server");
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        isConnected = false;
        stopConnectionMonitoring();
        
        // Attempt to reconnect if we haven't exceeded max attempts
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
            setTimeout(connectWebSocket, RECONNECT_DELAY);
        } else {
            console.error('Max reconnection attempts reached. Please refresh the page.');
        }
    };

    ws.onerror = (error) => {
        log("WebSocket error:");
        console.error(error); // Log the full error object to the browser console for inspection
        log("See browser console for detailed WebSocket error object.");
        // Optionally close the socket to trigger onclose and reconnection
        if (ws && ws.readyState !== WebSocket.CLOSED) {
            ws.close();
        }
    };
}

function startConnectionMonitoring() {
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
    }
    
    connectionCheckInterval = setInterval(() => {
        const now = Date.now();
        const timeSinceLastMessage = now - lastMessageTime;
        
        if (timeSinceLastMessage > MAX_MESSAGE_GAP) {
            console.warn('No messages received for', timeSinceLastMessage / 1000, 'seconds');
            if (ws && ws.readyState === WebSocket.OPEN) {
                console.log('Sending ping to check connection...');
                ws.send(JSON.stringify({ ping: 1 }));
            }
        }
    }, CONNECTION_CHECK_INTERVAL);
}

function stopConnectionMonitoring() {
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
        connectionCheckInterval = null;
    }
}

export function disconnectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
        log("WebSocket disconnected manually.");
    }
}

function authorize() {
    const token = tokens[currentAccount];
    if (!token) {
        log(`Error: API token for ${currentAccount} account not found.`);
        return;
    }
    ws.send(JSON.stringify({ authorize: token }));
    log(`Authorizing with ${currentAccount} account...`);
}

export function toggleAccount() {
    currentAccount = currentAccount === 'demo' ? 'real' : 'demo';
    document.getElementById("account-toggle-button").textContent = `${currentAccount.charAt(0).toUpperCase() + currentAccount.slice(1)} Account`;
    log(`Switched to ${currentAccount} account.`);
    // If connected, re-authorize with the new token
    if (ws && ws.readyState === WebSocket.OPEN) {
        authorize();
    }
} 