// Load config
const config = require("./config.json");
const seedPhrase = config.miner_seed;
const mnemonic = seedPhrase.split(' ');
const TonWeb = require('tonweb');
const { mnemonicToWalletKey, mnemonicValidate } = require('@ton/crypto');
const BN = TonWeb.utils.BN;

// Создаём провайдера для доступа к блокчейну TON
// Замените на ваш HTTP API провайдер, если используете другой
const tonweb = new TonWeb(new TonWeb.HttpProvider(config.rpc, { apiKey: config.tonweb_api_key }));

// Адрес смарт-контракта Satoshi
const contractAddress = config.token_address; // Замените на адрес вашего контракта

(async () => {
    // Проверяем валидность мнемонической фразы
    const isValid = await mnemonicValidate(mnemonic);
    if (!isValid) {
        console.error('Неверная мнемоническая фраза');
        return;
    }

    // Получаем ключи из мнемонической фразы
    const keyPair = await mnemonicToWalletKey(mnemonic);
    const publicKey = keyPair.publicKey;
    const secretKey = keyPair.secretKey;

    // Создаем кошелек
    const WalletClass = tonweb.wallet.all.v3R2; // Выберите версию кошелька, если необходимо
    const wallet = new WalletClass(tonweb.provider, {
        publicKey: publicKey,
        wc: 0
    });

    // Получаем адрес кошелька
    const walletAddress = await wallet.getAddress();
    console.log('Адрес кошелька:', walletAddress.toString(true, true, false));

    // Функция для получения данных о майнинге
    async function getMiningData() {
        try {
                const address = new TonWeb.utils.Address(contractAddress);
                const result = await tonweb.call(address, 'get_mining_data', []);
    
            const stack = result.stack;
    
            // Парсим значения из стека как шестнадцатеричные числа
            const lastBlock = parseInt(stack[0][1], 16);
            const lastBlockTime = parseInt(stack[1][1], 16);
            const attempts = parseInt(stack[2][1], 16);
            const subsidy = new BN(stack[3][1].replace(/^0x/, ''), 16);
            const probability = parseInt(stack[4][1], 16);
    
            const miningData = {
                last_block: lastBlock,
                last_block_time: lastBlockTime,
                attempts: attempts,
                subsidy: subsidy,
                probability: probability
            };
    
            return miningData;
        } catch (error) {
            console.error('Ошибка при получении данных о майнинге:', error);
            throw error;
        }
    }

    // Функция для получения баланса
    async function getBalance(address) {
        try {
            const balance = await tonweb.getBalance(address);
            return new BN(balance, 10);
        } catch (error) {
            console.error('Ошибка при получении баланса:', error);
            throw error;
        }
    }

    // Функция для отправки транзакции на майнинг
    async function sendMiningTransaction() {
        try {
            // Проверяем баланс кошелька
            const balance = await getBalance(walletAddress.toString(true, true, true));
            const minBalance = TonWeb.utils.toNano('0.06');
            if (balance.lt(minBalance)) {
                console.log('Недостаточно средств на кошельке для майнинга.');
                return;
            }

// Получаем seqno кошелька
const seqno = await wallet.methods.seqno().call();

            // Создаем и отправляем транзакцию
            const transfer = wallet.methods.transfer({
                secretKey: secretKey,
                toAddress: contractAddress,
                amount: TonWeb.utils.toNano('0.06'),
                seqno: seqno,
                payload: 'F',
                sendMode: 3,
            });

            await transfer.send();
            console.log('Транзакция на майнинг отправлена.');
        } catch (error) {
            console.error('Ошибка при отправке транзакции на майнинг:', error);
        }
    }

    // Основной цикл майнинга
    async function main() {
        let previousLastBlock = 0;
        let previousAttempts = 0;
        let lastAttemptTime = 0; // Время последней отправки майнинг-транзакции
        let desiredWaitTime = 20; // Инициализируем желаемое время ожидания (в минутах)
        const thresholdAttemptChange = 1; // Порог изменения попыток для определения нагрузки сети
    
        while (true) {
            try {
                const miningData = await getMiningData();
    
                const now = Math.floor(Date.now() / 1000);
                const minutesSinceLastBlock = Math.floor((now - miningData.last_block_time) / 60);
                const attempts = miningData.attempts;
    
                const probability = miningData.probability;
                const expectedReward = TonWeb.utils.fromNano(miningData.subsidy);
    
                const threshold = 70; // Минимальная вероятность
    
                // Определяем изменение нагрузки сети
                const attemptChange = attempts - previousAttempts;
    
                // Обновляем desiredWaitTime в зависимости от нагрузки
                if (attemptChange > thresholdAttemptChange) {
                    // Высокая нагрузка сети обнаружена
                    desiredWaitTime = Math.max(20, desiredWaitTime - 10); // Уменьшаем время ожидания на 10 минут, но не меньше 20 минут
                } else {
                    // Низкая нагрузка сети
                    desiredWaitTime = Math.min(20, desiredWaitTime + 10); // Увеличиваем время ожидания на 10 минут, но не больше 20 минут
                }
    
                previousAttempts = attempts;
    
                // Проверяем, обновился ли последний блок
                if (miningData.last_block !== previousLastBlock) {
                    previousLastBlock = miningData.last_block;
                    lastAttemptTime = now; // Обновляем время последней попытки
                    // Сбрасываем desiredWaitTime до начального значения при обнаружении нового блока
                    desiredWaitTime = 20;
                }
    
                // Проверяем, прошло ли желаемое время ожидания с момента последнего найденного блока
                if (minutesSinceLastBlock >= desiredWaitTime) {
                    if (probability >= threshold) {
                        await sendMiningTransaction();
                        lastAttemptTime = now; // Обновляем время последней попытки
                        await new Promise(resolve => setTimeout(resolve, 60000)); // Ждём 1 минуту после отправки транзакции
                    }
                }
    
                // Устанавливаем интервал проверки в 1 минуту
                let checkInterval = 1000; // Проверяем каждую минуту
    
                await new Promise(resolve => setTimeout(resolve, checkInterval));
            } catch (error) {
                console.error('Ошибка в основном цикле:', error);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    // Проверяем и деплоим кошелек при необходимости
    async function deployWallet() {
        try {
            const seqno = await wallet.methods.seqno().call();
            if (seqno === 0) {
                console.log('Кошелек не задеплоен. Деплоим кошелек...');
                const balance = await getBalance(walletAddress.toString(true, true, true));
                if (balance.lte(TonWeb.utils.toNano('0.05'))) {
                    console.log('Недостаточно средств для деплоя кошелька. Пожалуйста, пополните кошелек.');
                    return;
                }
                const deploy = wallet.deploy(secretKey);
                await deploy.send();
                console.log('Кошелек успешно задеплоен.');
            } else {
                console.log('Кошелек уже задеплоен.');
            }
        } catch (error) {
            console.error('Ошибка при деплое кошелька:', error);
        }
    }

    // Запуск скрипта
    await deployWallet();
    await main();

})();