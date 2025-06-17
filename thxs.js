// Load config
const config = require("./config.json");
const TonWeb = require('tonweb');
const fs = require('fs');
const { Bot } = require('grammy');
const axios = require('axios');
const tonweb = new TonWeb(new TonWeb.HttpProvider(config.rpc, { apiKey: config.tonweb_api_key }));
const CronJob = require('cron').CronJob;

const contractAddress = config.token_address;

// Инициализируем бота grammY с вашим токеном бота
const bot = new Bot(config.bot_api_key);

const channelId = config.channel_id;

// Путь к файлу JSON, где мы будем сохранять lastTxLt
const txFilePath = 'tx.json';

function saveState(lastTxLt, lastBlockTime) {
    const state = {
        lastTxLt: lastTxLt,
        lastBlockTime: lastBlockTime,
    };
    fs.writeFileSync('tx.json', JSON.stringify(state));
}

function loadState() {
    if (fs.existsSync('tx.json')) {
        const state = fs.readFileSync('tx.json', 'utf8');
        return JSON.parse(state);
    }
    return null;
}

// Функция вызова get_mining_data из смарт-контракта
async function getMiningData(address) {
    try {
        const result = await tonweb.call(address, 'get_mining_data', []);
        const stack = result.stack;

        // Парсим значения из стека как шестнадцатеричные числа
        const lastBlock = parseInt(stack[0][1], 16);
        const lastBlockTime = parseInt(stack[1][1], 16);
        const attempts = parseInt(stack[2][1], 16);
        const subsidy = parseInt(stack[3][1], 16);
        const probability = parseInt(stack[4][1], 16);

        return {
            lastBlock: lastBlock,
            lastBlockTime: lastBlockTime,
            attempts: attempts,
            subsidy: subsidy,
            probability: probability
        };
    } catch (error) {
        console.error('Ошибка при вызове get_mining_data:', error);
        return null;
    }
}

// Функция расчёта награды за блок в $SATOSHI
function getBlockSubsidy(height) {
    const blockSubsidyHalvingInterval = 210000;
    const halvings = Math.floor(height / blockSubsidyHalvingInterval);
    if (halvings >= 64) {
        return 0;
    }
    const initialReward = 50; // 50 $SATOSHI
    return initialReward / Math.pow(2, halvings);
}

async function watchTransactions() {
    const address = new TonWeb.utils.Address(contractAddress);
    let state = loadState();
    let lastTxLt = state ? state.lastTxLt : null;
    let lastBlockTime = state ? state.lastBlockTime : null;

    if (!lastBlockTime) {
        // Если `lastBlockTime` не сохранён, инициализируем его текущим временем
        // или получаем из смарт-контракта, если имеется
        const miningData = await getMiningData(address);
        if (miningData) {
            lastBlockTime = miningData.lastBlockTime;
        } else {
            // Если не удалось получить данные, используем текущее время
            lastBlockTime = Math.floor(Date.now() / 1000);
        }
    }

    while (true) {
        try {
            // Получаем последние 20 транзакций
            const txs = await tonweb.getTransactions(address.toString(true, true, true), 20, null, null);

            if (txs.length > 0) {
                // Обрабатываем транзакции от старых к новым
                txs.reverse();

                for (const tx of txs) {
                    // Получаем lt и utime транзакции
                    const txLtRaw = tx.transaction_id.lt;
                    const txLt = BigInt(typeof txLtRaw === 'object' ? txLtRaw.value : txLtRaw);
                    const lastTxLtBigInt = lastTxLt !== null ? BigInt(lastTxLt) : null;

                    // Проверяем, не обрабатывали ли мы уже эту транзакцию
                    if (lastTxLtBigInt !== null && txLt <= lastTxLtBigInt) {
                        continue; // Транзакция уже обработана
                    }

                    const mintResult = transactionContainsMint(tx);
                    if (mintResult) {
                        // Обрабатываем транзакцию mint
                        let { recipientAddress, amount, msg, type } = mintResult;

                        const currentUnixTime = Number(tx.utime);

if (!amount) {
                            // Получаем обновлённый номер последнего блока из смарт-контракта
                            const miningData = await getMiningData(address);
                            if (!miningData) {
                                console.error('Не удалось получить данные о майнинге из смарт-контракта');
                                continue;
                            }
                            const lastBlockHeight = miningData.lastBlock;
    
                            // Вычисляем количество минут с момента предыдущего майнинга
                            const minutesSinceLastBlock = Math.floor((currentUnixTime - lastBlockTime) / 60);
    
                            // Вычисляем количество блоков для майнинга
                            let blocksToMine = Math.floor(minutesSinceLastBlock / 10);
                            if (blocksToMine < 1) {
                                blocksToMine = 1;
                            }
    
                            // Вычисляем сумму награды
                            amount = 0;
                            for (let i = 1; i <= blocksToMine; i++) {
                                const blockNumber = lastBlockHeight - blocksToMine + i;
                                const subsidy = getBlockSubsidy(blockNumber);
                                amount += subsidy;
                            }
} // end if !amount.
                        
// Обновляем `lastBlockTime` на время текущей транзакции
                        lastBlockTime = currentUnixTime;

                        // Формируем сообщение
                        const unixTime = tx.utime;
                        const date = new Date(unixTime * 1000); // Умножаем на 1000, чтобы получить миллисекунды
                        const formattedDate = date.toLocaleString('en-EN');

                        const fromAddress = new TonWeb.utils.Address(tx.in_msg.source).toString(true, true, false);
                        let source = tx.in_msg && tx.in_msg.source ? fromAddress : 'N/A';
                        source = `${source.slice(0, 4)}...${source.slice(-4)}`;
                        const receivedText = amount > 0 ? `Received: ${amount} $SATOSHI` : 'No reward';
                        
                        const transactionHashBase64 = tx.transaction_id.hash; // Предполагаем, что это base64 строка
                        const transactionHashHex = Buffer.from(transactionHashBase64, 'base64').toString('hex');
                        const txUrl = `https://tonviewer.com/transaction/${transactionHashHex}`;
                        let recipient = recipientAddress.toString(true, true, false);
try {
    const domains = await axios.get(`https://tonapi.io/v2/accounts/${fromAddress}/dns/backresolve`);
 if (domains.data && domains.data.domains && domains.data.domains.length > 0) recipient = domains.data.domains[0];
 if (domains.data && domains.data.domains && domains.data.domains.length > 0) {
    let domain = domains.data.domains[0];
    // Если домен длинный, сокращаем до 11 символов, добавляя '...'
    source = domain.length > 12 ? `${domain.slice(0, 5)}...${domain.slice(-5)}` : domain;
}
} catch(err) {
    console.error(err);
}

                        const message = `From <a href="https://tonviewer.com/${fromAddress}">${source}</a>
${receivedText}
Date: ${formattedDate}
<a href="https://chiliec.github.io/Satoshi">MINE NOW</a> | <a href="${txUrl}">TX</a> | <a href="https://t.me/DAOthxS">DISCUSS</a>`;

                        // Отправляем сообщение в Telegram-канал
                        try {
                            await bot.api.sendMessage(channelId, message, { parse_mode: 'HTML' });
                        } catch (err) {
                            console.error('Ошибка при отправке сообщения в Telegram:', err);
                        }

                        // Сохраняем состояние
                        lastTxLt = txLt.toString();
                        saveState(lastTxLt, lastBlockTime);
                    } else {
                        // Обновляем lastTxLt даже если транзакция не содержит символа "F"
                        lastTxLt = txLt.toString();
                        saveState(lastTxLt, lastBlockTime);
                    }
                }
            } else {
                console.log('Нет транзакций для обработки.');
            }

            await delay(5000);
        } catch (error) {
            console.error('Ошибка при получении транзакций:', error);
            await delay(5000);
        }
    }
}

function transactionContainsMint(tx) {
    let messages = [];
    if (tx.in_msg) {
        messages.push(tx.in_msg);
    }
    if (tx.out_msgs && tx.out_msgs.length > 0) {
        messages = messages.concat(tx.out_msgs);
    }

    // Шаг 1: Проверяем, содержит ли транзакция сообщение "Mining failed."
    for (const msg of messages) {
        if (msg.message && typeof msg.message === 'string' && msg.message.includes('Mining failed.')) {
            // Транзакция содержит "Mining failed.", пропускаем всю транзакцию
            return null;
        }
    }

    // Шаг 2: Если нет "Mining failed.", продолжаем обработку сообщений
    for (const msg of messages) {
        // Проверяем наличие тела сообщения
        const bodyBase64 = msg.msg_data && msg.msg_data.body ? msg.msg_data.body : null;

        if (bodyBase64) {
            try {
                const bodyBuffer = Buffer.from(bodyBase64, 'base64');
                const cell = TonWeb.boc.Cell.fromBoc(bodyBuffer)[0];
                const slice = cell.beginParse();

                if (slice.remainingBits >= 32) {
                    const opcode = slice.loadUint(32).toNumber();
console.log('opcode:', opcode);
                    if (opcode === 260734629) { // 0x0f8a7ea5 в десятичном 260734629
                        // Опкод совпадает, операция transfer
                        const query_id = slice.loadUintBig(64);
                        const amount = slice.loadCoins();
                        const _ = slice.loadAddress(); // Пропускаем ненужный адрес
                        const recipientAddress = slice.loadAddress(); // Читаем destination (адрес получателя)

                        return {
                            recipientAddress: recipientAddress,
                            amount: TonWeb.utils.fromNano(amount),
                            msg: msg,
                            type: 'MINT_OPCODE'
                        };
                    }
                }
            } catch (err) {
                // Игнорируем ошибки парсинга
                // console.error('Ошибка при парсинге тела сообщения:', err);
            }
        }

        // Если сообщение содержит текстовое сообщение
        if (msg.message && typeof msg.message === 'string' && msg.message.includes('F')) {
            // Сообщение содержит "F"
            // Мы уже проверили, что транзакция не содержит "Mining failed."
            return {
                recipientAddress: msg.source ? new TonWeb.utils.Address(msg.source) : null,
                msg: msg,
                type: 'F_MESSAGE'
            };
        }
    }

    return null;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Запускаем функцию наблюдения за транзакциями
watchTransactions();

async function getTop() {
    try {
                const page = await axios.get(`https://toncenter.com/api/v3/jetton/wallets?jetton_address=EQCkdx5PSWjj-Bt0X-DRCfNev6ra1NVv9qqcu-W2-SaToSHI&exclude_zero_balance=true&limit=20&offset=0&sort=desc`);
        const top = page.data.jetton_wallets;
        let text = '';
        if (top && top.length > 0) {
            text = `$SATOSHI top 20 #rating:
| Number | from | amount |
`;
let counter = 1;
for (let user of top) {
                const address = new TonWeb.utils.Address(user.owner).toString(true, true, false);
                const balance = parseInt(TonWeb.utils.fromNano(user.balance));
                let owner = `${address.slice(0, 4)}...${address.slice(-4)}`;
try {
    const domains = await axios.get(`https://tonapi.io/v2/accounts/${address}/dns/backresolve`);
    if (domains.data && domains.data.domains && domains.data.domains.length > 0) {
        let domain = domains.data.domains[0];
        // Если домен длинный, сокращаем до 11 символов, добавляя '...'
        owner = domain.length > 12 ? `${domain.slice(0, 5)}...${domain.slice(-5)}` : domain;
    }
} catch(err) {}
           text += `| ${counter} | <a href="https://tonviewer.com/${address}">${owner}</a> | ${balance} |
`;
                counter++;
                await delay(5000);
            }
        text += `
<a href="https://chiliec.github.io/Satoshi">MINE NOW</a> | <a href="https://t.me/DAOthxS">DISCUSS</a>`
        }
        if (text !== '') {
            await bot.api.sendMessage(channelId, text, { parse_mode: 'HTML' });
        }
    } catch(err) {
        console.error(err);
    }
}

new CronJob('0 0 20 * * *', getTop, null, true);    