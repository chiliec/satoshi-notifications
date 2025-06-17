# ton-satoshi
A Telegram channel with notifications about $SATOSHI token mining transactions, as well as an automatic token mining script.

## Functional
1. Add the bot to the Telegram channel. He will send information about mining transactions by Ton users.
2. Run the automatic mining script "mine.js ".

## Install
0. Requirement: node.js.
1. Open config.json:
Replace the RPC value if you use a different one in "rpc".
Specify the RPC API key in "tonweb_api_key" instead of "toncenter_API_KEY" (mandatory).
Change the value of "token_address" if you use a different token.
Specify in "bot_api_key" the API key of your bot (you can get it from ).
In "channel_id" instead of -1000000000000 specify the Telegram ID of your channel where you added the bot. This is necessary for the bot to be able to send notifications.
Change "YOURSEED" in "miner_seed" to your Seed phrase Ton wallet if you want to start automatic mining. IMPORTANT: do not use your main wallet (create a separate one for the miner and fund it with TON).
2. Install NPM packages:
``npm install``
3. Install Pm2 if you don't have it yet (it is needed for scripts to work in the background).
``npm i pm2 --g``
4. Give 0755 permission to the "tx.json" file, so that the script can update it (without it the notification functionality will not work).
5. Run the scripts:
For the notification bot
``pm2 start thxs.js -o logs/out.log -e logs/errors.log``
To start automatic mining (don't forget to refill TON from time to time):
``pm2 start mine.js -o logs/miner_out.log -e logs/miner_errors.log``