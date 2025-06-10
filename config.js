export const app_id = 71979;

export const tokens = {
    demo: 'lvdD58UJ6xldxqm',
    real: 'SKyFDXvqk55Xtyr'
};

export const marketDetails = {
  "R_10": { name: "Volatility 10 Index", decimals: 3 },
  "R_25": { name: "Volatility 25 Index", decimals: 3 },
  "R_50": { name: "Volatility 50 Index", decimals: 4 },
  "R_75": { name: "Volatility 75 Index", decimals: 4 },
  "R_100": { name: "Volatility 100 Index", decimals: 2 },
  "1HZ10V": { name: "Volatility 10 (1s) Index", decimals: 2 },
  "1HZ25V": { name: "Volatility 25 (1s) Index", decimals: 2 },
  "1HZ50V": { name: "Volatility 50 (1s) Index", decimals: 2 },
  "1HZ75V": { name: "Volatility 75 (1s) Index", decimals: 2 },
  "1HZ100V": { name: "Volatility 100 (1s) Index", decimals: 2 }
};

export let initialStake = 0.35;
let currentStake = initialStake;
let martingaleStep = 0; 