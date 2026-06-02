# ton-satoshi

A Telegram channel bot that posts notifications about $SATOSHI token mining transactions, plus a daily "top 20 holders" rating.

## Requirements
- Node.js >= 20

## Setup
1. Copy the example config and fill it in (`config.json` is git-ignored, so your secrets stay local):
   ```
   cp config.example.json config.json
   ```
   - `rpc` — TON RPC endpoint (default: toncenter).
   - `api_key` — your RPC API key (mandatory).
   - `token_address` — the token address (change only if you use a different token).
   - `bot_api_key` — your Telegram bot token (from [@BotFather](https://t.me/BotFather)).
   - `channel_id` — the Telegram ID of the channel the bot was added to (e.g. `-1000000000000`).
2. Install dependencies:
   ```
   npm install
   ```
3. Add the bot to your Telegram channel so it can post messages.
4. Give the `tx.json` file write permission (`chmod 0755 tx.json`) so the bot can persist its progress.

## Run
Directly:
```
npm start
```
Or in the background with [pm2](https://pm2.keymetrics.io/):
```
pm2 start thxs.js -o logs/out.log -e logs/errors.log
```
