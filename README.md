# ⛏ ton-satoshi

A Telegram channel bot for the **$SATOSHI** token. It watches the token contract and:

- 🔔 posts a notification for every mining transaction
- 🏆 posts a daily **top 20 holders** rating

## Requirements

- Node.js **≥ 20.12**

## Setup

1. Create your `.env` from the template (it's git-ignored, so secrets stay local):

   ```bash
   cp .env.example .env
   ```

   | Variable | Description |
   | --- | --- |
   | `RPC` | TON RPC endpoint (default: toncenter) |
   | `API_KEY` | RPC API key — get one from [@tonapibot](https://t.me/tonapibot) |
   | `TOKEN_ADDRESS` | Token address (change only for a different token) |
   | `BOT_TOKEN` | Telegram bot token from [@BotFather](https://t.me/BotFather) |
   | `CHANNEL_ID` | Channel ID the bot was added to, e.g. `-1002312994949` |

2. Install dependencies:

   ```bash
   npm install
   ```

3. Add the bot to your channel as an **administrator** with permission to post.

## Run

```bash
npm start
```
