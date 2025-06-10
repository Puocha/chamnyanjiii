// dataStorage.js

const DB_NAME = 'MarketDataDB';
const DB_VERSION = 1;
const STORE_NAME = 'marketTicks';

let db = null;

/**
 * Opens the IndexedDB database. Creates the object store if it doesn't exist.
 * @returns {Promise<IDBDatabase>} A promise that resolves with the database instance.
 */
export function openDatabase() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            // Create an object store to hold information about market ticks and history.
            // Use 'symbol' + '_' + 'timestamp' as the key path to ensure uniqueness
            // and allow querying by symbol.
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = db.createObjectStore(STORE_NAME, { keyPath: ['symbol', 'timestamp'] });
                // Create an index to query data by symbol efficiently
                objectStore.createIndex('by_symbol', 'symbol', { unique: false });
                console.log("IndexedDB object store created.");
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log("IndexedDB opened successfully.");
            resolve(db);
        };

        request.onerror = (event) => {
            console.error("IndexedDB error:", event.target.errorCode);
            reject(event.target.error);
        };
    });
}

/**
 * Adds market data (tick or history) to the object store.
 * @param {object} data The market data object (e.g., a 'tick' or an item from 'history' array).
 *                      Should contain 'symbol' and 'timestamp'.
 */
export async function addMarketData(data) {
    try {
        const db = await openDatabase();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);

        // Ensure the data has symbol and timestamp
        if (!data || !data.symbol || !data.timestamp) {
            console.error("Invalid data format for storing in IndexedDB:", data);
            return;
        }

        // Add the data. Using put() will either add a new record or update an existing one
        // if the key (symbol, timestamp) already exists.
        const request = objectStore.put(data);

        request.onsuccess = () => {
            // console.log("Market data added:", data.symbol, data.timestamp);
            // Avoid excessive logging for every single tick
        };

        request.onerror = (event) => {
            console.error("Error adding market data to IndexedDB:", event.target.error);
        };

        // Wait for the transaction to complete
        await new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                // console.log("Add data transaction complete.");
                resolve();
            };
            transaction.onerror = (event) => {
                console.error("Add data transaction error:", event.target.error);
                reject(event.target.error);
            };
        });

    } catch (error) {
        console.error("Failed to add market data due to database error:", error);
    }
}

/**
 * Retrieves all market data for a specific symbol.
 * @param {string} symbol The market symbol (e.g., 'R_100').
 * @returns {Promise<Array<object>>} A promise that resolves with an array of data objects.
 */
export async function getMarketDataBySymbol(symbol) {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await openDatabase();
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const objectStore = transaction.objectStore(STORE_NAME);
            const index = objectStore.index('by_symbol');

            const request = index.getAll(symbol);

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onerror = (event) => {
                console.error(`Error retrieving data for symbol ${symbol}:`, event.target.error);
                reject(event.target.error);
            };

        } catch (error) {
            console.error("Failed to retrieve market data due to database error:", error);
            reject(error);
        }
    });
}

/**
 * Clears all data from the marketTicks object store.
 */
export async function clearMarketData() {
    try {
        const db = await openDatabase();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);

        const request = objectStore.clear();

        request.onsuccess = () => {
            console.log("All market data cleared from IndexedDB.");
        };

        request.onerror = (event) => {
            console.error("Error clearing market data from IndexedDB:", event.target.error);
        };

         await new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                console.log("Clear data transaction complete.");
                resolve();
            };
             transaction.onerror = (event) => {
                console.error("Clear data transaction error:", event.target.error);
                reject(event.target.error);
            };
        });

    } catch (error) {
        console.error("Failed to clear market data due to database error:", error);
    }
}

// Ensure the database is opened when the script is loaded
openDatabase().catch(console.error);
