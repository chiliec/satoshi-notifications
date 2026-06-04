// $SATOSHI channel bot: posts a notification for every mining transaction
// and a daily "top 20 holders" rating.
const fs = require("fs");
const { Bot } = require("grammy");
const { CronJob } = require("cron");
const { TonClient } = require("@ton/ton");
const { Address, fromNano } = require("@ton/core");

// Load variables from a local .env file if present (Node >= 20.12).
// In production they can also come from the environment (pm2, shell, etc.).
if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {
    // no .env file — fall back to the existing environment
  }
}

const required = ["RPC", "API_KEY", "TOKEN_ADDRESS", "BOT_TOKEN", "CHANNEL_ID"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}. Copy .env.example to .env and fill it in.`);
  process.exit(1);
}

const config = {
  rpc: process.env.RPC,
  api_key: process.env.API_KEY,
  token_address: process.env.TOKEN_ADDRESS,
  bot_api_key: process.env.BOT_TOKEN,
  channel_id: process.env.CHANNEL_ID,
};

// Per-request HTTP timeout for the TON RPC, plus bounded retries with
// exponential backoff so a slow or flaky endpoint doesn't stall the poller.
const RPC_TIMEOUT = 15000;
const RPC_RETRIES = 3;
const RPC_RETRY_DELAY = 1000;

const client = new TonClient({
  endpoint: config.rpc,
  apiKey: config.api_key,
  timeout: RPC_TIMEOUT,
});
const bot = new Bot(config.bot_api_key);
const tokenAddress = Address.parse(config.token_address);

const STATE_FILE = process.env.STATE_FILE ?? "tx.json";
// A successful mine ends with the token master sending a jetton internal_transfer
// (TEP-74 op) to the miner. We read the reward straight from that message.
const JETTON_INTERNAL_TRANSFER_OP = 0x178d4519;
const MINE_OP = 0xe9b94603;
const POLL_INTERVAL = 5000;
const MEDALS = ["🥇", "🥈", "🥉"];
const LINK_MINE = '<a href="https://chiliec.github.io/Satoshi">Mine now</a>';
const LINK_DISCUSS = '<a href="https://t.me/DAOthxS">Discuss</a>';
const FOOTER = `⛏ ${LINK_MINE}  ·  💬 ${LINK_DISCUSS}`;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry an async operation with exponential backoff. Used for TON RPC calls,
// which can intermittently time out or return transient errors.
async function withRetry(fn, { retries = RPC_RETRIES, baseDelay = RPC_RETRY_DELAY, label } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries) throw err;
      const wait = baseDelay * 2 ** attempt;
      console.warn(`${label ?? "RPC call"} failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${wait}ms:`, err.message);
      await delay(wait);
    }
  }
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Resolve a wallet address to its .ton domain, or null on any failure.
async function resolveDomain(address) {
  try {
    const data = await getJson(`https://tonapi.io/v2/accounts/${address}/dns/backresolve`);
    return data?.domains?.[0] ?? null;
  } catch {
    return null;
  }
}

const shortenDomain = (s, edge = 5) =>
  s.length > edge * 2 + 2 ? `${s.slice(0, edge)}...${s.slice(-edge)}` : s;
const shortenAddress = (s, edge = 4) => `${s.slice(0, edge)}...${s.slice(-edge)}`;

function messageSource(msg) {
  const { info } = msg;
  return (info.type === "internal" || info.type === "external-out") && info.src ? info.src : null;
}

// Returns the mined reward (in $SATOSHI) if the transaction is a successful
// mint, or null otherwise. Failed attempts produce no internal_transfer.
function minedReward(tx) {
  for (const msg of tx.outMessages.values()) {
    try {
      const slice = msg.body.beginParse();
      if (slice.remainingBits >= 32 && slice.loadUint(32) === JETTON_INTERNAL_TRANSFER_OP) {
        slice.loadUintBig(64); // query_id
        return Number(fromNano(slice.loadCoins()));
      }
    } catch {
      // not an internal_transfer body, keep looking
    }
  }
  return null;
}

// The reward recipient encoded in the mine request (op + address). The miner
// can direct rewards to a different address, so this may differ from the sender.
function mineRecipient(tx) {
  if (!tx.inMessage) return null;
  try {
    const slice = tx.inMessage.body.beginParse();
    if (slice.remainingBits < 32 || slice.loadUint(32) !== MINE_OP) return null;
    return slice.loadAddress();
  } catch {
    return null;
  }
}

// Full domain (or full friendly address) for an address — no truncation.
async function addressLabel(addr) {
  if (!addr) return "N/A";
  const friendly = addr.toString({ bounceable: false });
  return (await resolveDomain(friendly)) ?? friendly;
}

function addressLink(addr, text) {
  if (!addr) return text;
  return `<a href="https://tonviewer.com/${addr.toString({ bounceable: false })}">${text}</a>`;
}

async function notify(tx, amount) {
  const source = tx.inMessage ? messageSource(tx.inMessage) : null;
  const recipient = mineRecipient(tx);

  // Show "sender → recipient" when the reward goes to a different address.
  let who = addressLink(source, await addressLabel(source));
  if (recipient && !(source && recipient.equals(source))) {
    who += ` → ${addressLink(recipient, await addressLabel(recipient))}`;
  }

  const date = new Date(Number(tx.now) * 1000).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const reward =
    amount > 0 ? `<b>+${amount.toLocaleString("en-US")} $SATOSHI</b>` : "No reward";
  const txUrl = `https://tonviewer.com/transaction/${tx.hash().toString("hex")}`;

  const message = `👤 ${who}
💰 ${reward}
🕐 ${date}

🔗 <a href="${txUrl}">Transaction</a>  ·  ${FOOTER}`;

  await bot.api.sendMessage(config.channel_id, message, { parse_mode: "HTML" });
}

async function watchTransactions() {
  const state = loadState();
  let lastTxLt = state.lastTxLt ? BigInt(state.lastTxLt) : null;

  while (true) {
    try {
      const txs = (
        await withRetry(() => client.getTransactions(tokenAddress, { limit: 20 }), {
          label: "getTransactions",
        })
      ).reverse();
      for (const tx of txs) {
        const lt = BigInt(tx.lt);
        if (lastTxLt !== null && lt <= lastTxLt) continue;

        const reward = minedReward(tx);
        if (reward !== null) {
          try {
            await notify(tx, reward);
          } catch (err) {
            console.error("Failed to send Telegram message:", err);
          }
        }

        lastTxLt = lt;
        saveState({ lastTxLt: lastTxLt.toString() });
      }
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
    }
    await delay(POLL_INTERVAL);
  }
}

async function postTopHolders() {
  try {
    const url = `https://toncenter.com/api/v3/jetton/wallets?jetton_address=${config.token_address}&exclude_zero_balance=true&limit=20&offset=0&sort=desc`;
    const { jetton_wallets: wallets } = await getJson(url);
    if (!wallets?.length) return;

    const lines = [];
    let rank = 1;
    for (const wallet of wallets) {
      const address = Address.parse(wallet.owner).toString({ bounceable: false });
      const balance = parseInt(fromNano(wallet.balance)).toLocaleString("en-US");
      const domain = await resolveDomain(address);
      const holder = domain ? shortenDomain(domain, 8) : shortenAddress(address, 7);
      const badge = MEDALS[rank - 1] ?? `${String(rank).padStart(2)}`;
      lines.push(`${badge}  <a href="https://tonviewer.com/${address}">${holder}</a> — <b>${balance}</b>`);
      rank++;
      await delay(POLL_INTERVAL);
    }

    const text = `🏆 <b>$SATOSHI — Top 20 Holders</b>\n\n${lines.join("\n")}\n\n${FOOTER}`;
    await bot.api.sendMessage(config.channel_id, text, { parse_mode: "HTML" });
  } catch (err) {
    console.error("Failed to post top holders:", err);
  }
}

watchTransactions();
new CronJob("0 0 20 * * *", postTopHolders, null, true);
