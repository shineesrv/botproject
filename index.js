const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const os = require('os');
const { exec } = require('child_process');
const settings = require('./settings');

const botToken = settings.token;
const domain = settings.domain;
const plta = settings.plta;
const pltc = settings.pltc;
const image = "https://b.top4top.io/p_39628r9pk1.jpg";

// Daftar harga panel (bisa Anda sesuaikan nilainya dalam Rupiah)
const PANEL_PRICES = {
    '1gb': 1000,
    '2gb': 2000,
    '3gb': 3000,
    '4gb': 4000,
    '5gb': 5000,
    '6gb': 6000,
    '7gb': 7000,
    '8gb': 8000,
    '9gb': 9000,
    '10gb': 10000,
    'unli': 15000
};

// Load database
let premiumUsers = [];
let adminUsers = [];
let resseler = [];
let users = [];
let allowedGroups = [];
let userBalances = {}; // Format: { "userId": saldo_number }
let topupRequests = {}; // Format: { "topup_id": { userId, amount, status } }
let userStates = {};   // Menyimpan state percakapan user (contoh: menunggu bukti transfer)

function loadDatabases() {
    try {
        if (!fs.existsSync('./database')) {
            fs.mkdirSync('./database');
        }

        premiumUsers = fs.existsSync('./database/prem.json') ? JSON.parse(fs.readFileSync('./database/prem.json')) : [];
        adminUsers = fs.existsSync('./database/admin.json') ? JSON.parse(fs.readFileSync('./database/admin.json')) : [];
        resseler = fs.existsSync('./database/resseler.json') ? JSON.parse(fs.readFileSync('./database/resseler.json')) : [];
        users = fs.existsSync('./database/user.json') ? JSON.parse(fs.readFileSync('./database/user.json')) : [];
        allowedGroups = fs.existsSync('./database/grup.json') ? JSON.parse(fs.readFileSync('./database/grup.json')) : [];
        userBalances = fs.existsSync('./database/balance.json') ? JSON.parse(fs.readFileSync('./database/balance.json')) : {};
        topupRequests = fs.existsSync('./database/topup.json') ? JSON.parse(fs.readFileSync('./database/topup.json')) : {};
    } catch (error) {
        console.error('Error loading databases:', error);
    }
}

// Save database helpers
function savePremiumUsers() { fs.writeFileSync('./database/prem.json', JSON.stringify(premiumUsers, null, 2)); }
function saveAdminUsers() { fs.writeFileSync('./database/admin.json', JSON.stringify(adminUsers, null, 2)); }
function saveResseller() { fs.writeFileSync('./database/resseler.json', JSON.stringify(resseler, null, 2)); }
function saveUsers() { fs.writeFileSync('./database/user.json', JSON.stringify(users, null, 2)); }
function saveAllowedGroups() { fs.writeFileSync('./database/grup.json', JSON.stringify(allowedGroups, null, 2)); }
function saveBalances() { fs.writeFileSync('./database/balance.json', JSON.stringify(userBalances, null, 2)); }
function saveTopupRequests() { fs.writeFileSync('./database/topup.json', JSON.stringify(topupRequests, null, 2)); }

loadDatabases();

const bot = new TelegramBot(botToken, { polling: true });

function formatRupiah(number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(number);
}

function getUserBalance(userId) {
    return userBalances[userId] || 0;
}

function addBalance(userId, amount) {
    const current = getUserBalance(userId);
    userBalances[userId] = current + amount;
    saveBalances();
}

function deductBalance(userId, amount) {
    const current = getUserBalance(userId);
    if (current >= amount) {
        userBalances[userId] = current - amount;
        saveBalances();
        return true;
    }
    return false;
}

function isOwner(userId) {
    if (Array.isArray(settings.urladmin)) {
        return settings.urladmin.includes(userId.toString()) || settings.urladmin.includes(Number(userId));
    }
    return String(settings.urladmin) === String(userId);
}

async function isRestricted(chatId, userId) {
    const isPremium = premiumUsers.includes(Number(userId));
    const isAdmin = adminUsers.includes(Number(userId));
    const isResseler = resseler.includes(Number(userId));
    const isOwnerUser = isOwner(userId);
    
    if (isPremium || isAdmin || isResseler || isOwnerUser) {
        return false;
    }
    
    await bot.sendMessage(chatId, '❌ *Akses Ditolak!* Anda tidak terdaftar di database.\nSilakan hubungi Owner.', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "Contact Owner", url: "https://t.me/FyzzOffciall" }]
            ]
        }
    });
    return true;
}

function isGroupAllowed(chatId, chatType) {
    if (chatType === 'private') return true;
    return allowedGroups.includes(Number(chatId));
}

/// Command start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;
    const username = msg.from.username ? `@${msg.from.username}` : "Tidak ada username";
    const firstName = msg.from.first_name || "";
    const lastName = msg.from.last_name || "";
    
    const UserNew = users.some(user => user.id === senderId);
    if (!UserNew) {
        users.push({
            id: senderId,
            username: msg.from.username || "",
            first_name: firstName,
            last_name: lastName,
            joined_date: new Date().toISOString(),
            last_active: new Date().toISOString()
        });
        saveUsers();
    } else {
        const userIndex = users.findIndex(user => user.id === senderId);
        if (userIndex !== -1) {
            users[userIndex].last_active = new Date().toISOString();
            saveUsers();
        }
    }
    
    const saldo = getUserBalance(senderId);

    bot.sendPhoto(chatId, image, {
        caption: `<blockquote>olá amigos👋, ${username}, to pterodactyl bot server !!\n\n<b>- USER INFORMATION -</b>\n • User ID: <code>${senderId}</code>\n • Saldo Anda: <b>${formatRupiah(saldo)}</b>\n\n<b>- BOT INFORMATION -</b>\n • Server: Pterodactyl\n • Version: 2.0 AutoOrder\n • Prefix Validation: /\n\nSelect menu is here👇</blockquote>`,
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "🛒 Beli Panel", callback_data: "buy_panel_menu" },
                    { text: "💳 Top Up Saldo", callback_data: "topup_menu" }
                ],
                [
                    { text: "Cpanel Admin", callback_data: "cpanel" }, 
                    { text: "Settings", callback_data: "setting" }
                ]
            ]
        }
    });
});

// Handler Foto (Bukti Transfer Top Up)
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;
    const state = userStates[senderId];

    if (state && state.step === 'AWAITING_PROOF') {
        const topupId = state.topupId;
        const amount = state.amount;
        const photoId = msg.photo[msg.photo.length - 1].file_id;

        topupRequests[topupId] = {
            id: topupId,
            userId: senderId,
            username: msg.from.username ? `@${msg.from.username}` : msg.from.first_name,
            amount: amount,
            photoId: photoId,
            status: 'pending',
            date: new Date().toISOString()
        };
        saveTopupRequests();
        delete userStates[senderId];

        await bot.sendMessage(chatId, `✅ Bukti transfer berhasil diterima!\n⏳ Mohon tunggu Admin melakukan verifikasi saldo Anda.`, { parse_mode: 'Markdown' });

        // Kirim konfirmasi ke Owner / Admin
        const targetAdmin = Array.isArray(settings.urladmin) ? settings.urladmin[0] : settings.urladmin;
        if (targetAdmin) {
            await bot.sendPhoto(targetAdmin, photoId, {
                caption: `🚨 *PERMINTAAN TOP UP BARU*\n\n• TopUp ID: \`${topupId}\`\n• User ID: \`${senderId}\`\n• Username: ${msg.from.username ? '@' + msg.from.username : msg.from.first_name}\n• Nominal: *${formatRupiah(amount)}*`,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ ACC (Terima)", callback_data: `acc_topup_${topupId}` },
                            { text: "❌ TOLAK", callback_data: `reject_topup_${topupId}` }
                        ]
                    ]
                }
            });
        }
    }
});

// Callback Query Handler
bot.on("callback_query", async (query) => {
    try {
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;
        const username = query.from.username ? `@${query.from.username}` : "Tidak ada username";
        const senderId = query.from.id;
        const data = query.data;
        
        let caption = "";
        let replyMarkup = {};

        if (data === "buy_panel_menu") {
            const currentSaldo = getUserBalance(senderId);
            caption = `<b>🛒 KATALOG & HARGA PANEL PTERODACTYL</b>\n\nSaldo Anda: <b>${formatRupiah(currentSaldo)}</b>\n\nPilih spesifikasi panel yang ingin dibeli:`;
            replyMarkup = {
                inline_keyboard: [
                    [
                        { text: `1GB - ${formatRupiah(PANEL_PRICES['1gb'])}`, callback_data: `order_panel_1gb` },
                        { text: `2GB - ${formatRupiah(PANEL_PRICES['2gb'])}`, callback_data: `order_panel_2gb` }
                    ],
                    [
                        { text: `3GB - ${formatRupiah(PANEL_PRICES['3gb'])}`, callback_data: `order_panel_3gb` },
                        { text: `4GB - ${formatRupiah(PANEL_PRICES['4gb'])}`, callback_data: `order_panel_4gb` }
                    ],
                    [
                        { text: `5GB - ${formatRupiah(PANEL_PRICES['5gb'])}`, callback_data: `order_panel_5gb` },
                        { text: `6GB - ${formatRupiah(PANEL_PRICES['6gb'])}`, callback_data: `order_panel_6gb` }
                    ],
                    [
                        { text: `7GB - ${formatRupiah(PANEL_PRICES['7gb'])}`, callback_data: `order_panel_7gb` },
                        { text: `8GB - ${formatRupiah(PANEL_PRICES['8gb'])}`, callback_data: `order_panel_8gb` }
                    ],
                    [
                        { text: `9GB - ${formatRupiah(PANEL_PRICES['9gb'])}`, callback_data: `order_panel_9gb` },
                        { text: `10GB - ${formatRupiah(PANEL_PRICES['10gb'])}`, callback_data: `order_panel_10gb` }
                    ],
                    [
                        { text: `UNLI - ${formatRupiah(PANEL_PRICES['unli'])}`, callback_data: `order_panel_unli` }
                    ],
                    [{ text: "🔙 Kembali", callback_data: "back_to_main" }]
                ]
            };
        } else if (data.startsWith('order_panel_')) {
            const ramType = data.split('_')[2];
            const price = PANEL_PRICES[ramType];
            const currentSaldo = getUserBalance(senderId);

            if (currentSaldo < price) {
                await bot.answerCallbackQuery(query.id, { text: `❌ Saldo Anda tidak cukup! Harga: ${formatRupiah(price)}, Saldo: ${formatRupiah(currentSaldo)}`, show_alert: true });
                return;
            }

            // Potong saldo & langsung proses buat panel (Auto-Order)
            deductBalance(senderId, price);
            await bot.answerCallbackQuery(query.id, { text: "⏳ Saldo terpotong. Memproses pemesanan panel..." });
            
            const ramMap = {
                '1gb': { memory: 1024, cpu: 30, disk: 1024 },
                '2gb': { memory: 2048, cpu: 60, disk: 2048 },
                '3gb': { memory: 3072, cpu: 90, disk: 3072 },
                '4gb': { memory: 4048, cpu: 110, disk: 4048 },
                '5gb': { memory: 5048, cpu: 140, disk: 5048 },
                '6gb': { memory: 6048, cpu: 170, disk: 6048 },
                '7gb': { memory: 7048, cpu: 200, disk: 7048 },
                '8gb': { memory: 8048, cpu: 230, disk: 8048 },
                '9gb': { memory: 9048, cpu: 260, disk: 9048 },
                '10gb': { memory: 10000, cpu: 500, disk: 15000 },
                'unli': { memory: 0, cpu: 0, disk: 0 }
            };
            const spec = ramMap[ramType];
            const autoUsername = `usr${senderId.toString().slice(-4)}${Math.floor(Math.random() * 89 + 10)}`;

            await createPanel(chatId, autoUsername, senderId, ramType, spec.memory, spec.cpu, spec.disk);
            return;

        } else if (data === "topup_menu") {
            caption = `<b>💳 ISI SALDO / TOP UP (MANUAL ADMIN ACC)</b>\n\nSilakan pilih nominal atau ketik perintah topup secara manual:\nContoh: <code>/topup 10000</code>\n\nTransfer Pembayaran Ke:\n• <b>DANA / OVO / GoPay:</b> 08xxxxxxxxxx\n• <b>BANK BCA:</b> 1234567890 (a/n Owner)\n\nSetelah transfer, tekan nominal di bawah lalu kirim bukti foto transfer!`;
            replyMarkup = {
                inline_keyboard: [
                    [
                        { text: "Rp 5.000", callback_data: "req_topup_5000" },
                        { text: "Rp 10.000", callback_data: "req_topup_10000" }
                    ],
                    [
                        { text: "Rp 20.000", callback_data: "req_topup_20000" },
                        { text: "Rp 50.000", callback_data: "req_topup_50000" }
                    ],
                    [{ text: "🔙 Kembali", callback_data: "back_to_main" }]
                ]
            };
        } else if (data.startsWith('req_topup_')) {
            const amount = parseInt(data.split('_')[2]);
            const topupId = 'TP' + Date.now().toString().slice(-6);

            userStates[senderId] = { step: 'AWAITING_PROOF', topupId: topupId, amount: amount };
            await bot.answerCallbackQuery(query.id);
            await bot.sendMessage(chatId, `📌 *REQUEST TOP UP ${formatRupiah(amount)}*\n\nSilakan transfer sebesar *${formatRupiah(amount)}* lalu *KIRIMKAN FOTO BUKTI TRANSFER* di chat ini sekarang.`, { parse_mode: 'Markdown' });
            return;

        } else if (data.startsWith('acc_topup_') || data.startsWith('reject_topup_')) {
            if (!isOwner(senderId) && !adminUsers.includes(Number(senderId))) {
                await bot.answerCallbackQuery(query.id, { text: "❌ Hanya Admin/Owner yang dapat memverifikasi!", show_alert: true });
                return;
            }

            const isAcc = data.startsWith('acc_topup_');
            const topupId = data.replace(isAcc ? 'acc_topup_' : 'reject_topup_', '');
            const reqData = topupRequests[topupId];

            if (!reqData) {
                await bot.answerCallbackQuery(query.id, { text: "❌ Data request Top Up tidak ditemukan!", show_alert: true });
                return;
            }

            if (reqData.status !== 'pending') {
                await bot.answerCallbackQuery(query.id, { text: `⚠️ Request ini sudah diproses (${reqData.status.toUpperCase()})`, show_alert: true });
                return;
            }

            if (isAcc) {
                reqData.status = 'approved';
                addBalance(reqData.userId, reqData.amount);
                saveTopupRequests();

                await bot.editMessageCaption(`✅ *TOP UP BERHASIL DI-ACC*\n\n• TopUp ID: \`${topupId}\`\n• User ID: \`${reqData.userId}\`\n• Nominal: *${formatRupiah(reqData.amount)}*\n• Status: ACC oleh Admin`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
                await bot.sendMessage(reqData.userId, `🎉 *TOP UP ACC SUKSES!*\n\nSaldo sebesar *${formatRupiah(reqData.amount)}* telah ditambahkan ke akun Anda.\nTotal Saldo Anda Sekarang: *${formatRupiah(getUserBalance(reqData.userId))}*`, { parse_mode: 'Markdown' });
            } else {
                reqData.status = 'rejected';
                saveTopupRequests();

                await bot.editMessageCaption(`❌ *TOP UP DITOLAK*\n\n• TopUp ID: \`${topupId}\`\n• User ID: \`${reqData.userId}\`\n• Nominal: *${formatRupiah(reqData.amount)}*\n• Status: Ditolak oleh Admin`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
                await bot.sendMessage(reqData.userId, `❌ *TOP UP DITOLAK*\n\nMaaf, permintaan top up sebesar *${formatRupiah(reqData.amount)}* ditolak oleh admin. Hubungi admin jika ada kendala.`, { parse_mode: 'Markdown' });
            }
            return;
        } else if (data === "cpanel") {
            caption = `
<blockquote><b>olá amigos👋, ${username}, to pterodactyl bot server !!</b>

<b>- USER INFORMATION -</b>
 • Server : Pterodactyl
 • User Id : ${senderId}

<b>MENU PANEL (MANUAL ADMIN)</b>
 /createpanel username,id
 /cpanel ram,username 
</blockquote>`;
            replyMarkup = { inline_keyboard: [[{ text: "🔙", callback_data: "back_to_main" }]] };
        } else if (data === "setting") {
            caption = `
<blockquote><b>olá amigos👋, ${username}, to pterodactyl bot server ‼️</b>
- Username : ${username}
- User Id : ${senderId}

 <b>𝖠𝖼𝖼𝖾𝗌𝗌 𝗆𝖾𝗇𝗎</b>
 /info
 /addadmin (id)
 /deladmin (id)
 /addprem (id)
 /delprem (id)
 /addgrup (id)
 /delgrup (id)
 /listgrup
 /listsrv 
 /listusr 
 /listprem
 /listadmin 
</blockquote>`;
            replyMarkup = { inline_keyboard: [[{ text: "back", callback_data: "back_to_main" }]] };
        } else if (data === "back_to_main") {
            const saldo = getUserBalance(senderId);
            caption = `<blockquote>olá amigos👋, ${username}, to pterodactyl bot server !!\n\n<b>- USER INFORMATION -</b>\n • User ID: <code>${senderId}</code>\n • Saldo Anda: <b>${formatRupiah(saldo)}</b>\n\n<b>- BOT INFORMATION -</b>\n • Server: Pterodactyl\n • Version: 2.0 AutoOrder\n • Prefix Validation: /\n\nSelect menu is here👇</blockquote>`;
            replyMarkup = {
                inline_keyboard: [
                    [
                        { text: "🛒 Beli Panel", callback_data: "buy_panel_menu" },
                        { text: "💳 Top Up Saldo", callback_data: "topup_menu" }
                    ],
                    [
                        { text: "Cpanel Admin", callback_data: "cpanel" }, 
                        { text: "Settings", callback_data: "setting" }
                    ]
                ]
            };
        } else if (data.startsWith('server_page_')) {
            const page = parseInt(data.split('_')[2]) || 1;
            await bot.answerCallbackQuery(query.id);
            fetchServerList(chatId, page, messageId);
            return;
        } else if (data.startsWith('listusr_page_')) {
            const page = parseInt(data.split('_')[2]) || 1;
            await bot.answerCallbackQuery(query.id);
            fetchUserList(chatId, page, messageId);
            return;
        } else if (data.startsWith('create_') || data.startsWith('admin_') || data === 'return') {
            if (data === 'return') {
                await bot.answerCallbackQuery(query.id, { text: 'Pembuatan panel dibatalkan' });
                await bot.editMessageText('Pembuatan panel dibatalkan.', {
                    chat_id: chatId,
                    message_id: messageId
                });
                return;
            }
            
            if (data.startsWith('admin_')) {
                const parts = data.split('_');
                const targetUsername = parts[1];
                const telegramId = parts[2];
                const password = `${targetUsername}71z7`;
                
                if (await isRestricted(chatId, senderId)) return;
                
                try {
                    const response = await fetch(`${domain}/api/application/users`, {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${plta}`
                        },
                        body: JSON.stringify({
                            email: `${targetUsername}@gmail.com`,
                            username: targetUsername,
                            first_name: targetUsername,
                            last_name: "Admin",
                            language: "en",
                            root_admin: true,
                            password: password
                        })
                    });
                    const resData = await response.json();
                    if (resData.errors) {
                        await bot.sendMessage(chatId, `❌ Error: ${resData.errors[0].detail}`);
                        return;
                    }
                    const user = resData.attributes;
                    await bot.sendMessage(chatId, `✅ Admin User Berhasil Dibuat ID: ${user.id}`);
                    await bot.sendMessage(telegramId, `
「 DATA ADMIN PANEL 」
 - Login: ${domain}
 - Username: ${user.username}
 - Password: ${password} `);
                } catch (error) {
                    await bot.sendMessage(chatId, '❌ Terjadi kesalahan saat pembuatan admin.');
                }
                return;
            }
            
            if (data.startsWith('create_')) {
                const parts = data.split('_');
                const type = parts[1];
                const targetUsername = parts[2];
                const telegramId = parts[3];
                
                if (await isRestricted(chatId, senderId)) return;
                
                await bot.answerCallbackQuery(query.id, { text: `Membuat panel ${type.toUpperCase()}...` });
                
                let memory = 1024, cpu = 30, disk = 1024;
                switch (type) {
                    case '1gb': memory = 1024; cpu = 30; disk = 1024; break;
                    case '2gb': memory = 2048; cpu = 60; disk = 2048; break;
                    case '3gb': memory = 3072; cpu = 90; disk = 3072; break;
                    case '4gb': memory = 4048; cpu = 110; disk = 4048; break;
                    case '5gb': memory = 5048; cpu = 140; disk = 5048; break;
                    case '6gb': memory = 6048; cpu = 170; disk = 6048; break;
                    case '7gb': memory = 7048; cpu = 200; disk = 7048; break;
                    case '8gb': memory = 8048; cpu = 230; disk = 8048; break;
                    case '9gb': memory = 9048; cpu = 260; disk = 9048; break;
                    case '10gb': memory = 10000; cpu = 500; disk = 15000; break;
                    case 'unli': memory = 0; cpu = 0; disk = 0; break;
                }

                await createPanel(chatId, targetUsername, telegramId, type, memory, cpu, disk);
                return;
            }
        } else if (data === 'cancel_delall' || data === 'confirm_delall') {
            if (data === 'cancel_delall') {
                await bot.answerCallbackQuery(query.id, { text: 'Penghapusan dibatalkan' });
                await bot.editMessageText('❌ Penghapusan massal dibatalkan.', {
                    chat_id: chatId,
                    message_id: messageId
                });
                return;
            }

            if (data === 'confirm_delall') {
                try {
                    await bot.answerCallbackQuery(query.id, { text: 'Memulai penghapusan semua server...' });
                    const processingMsg = await bot.editMessageText('🔄 Mengambil daftar semua server...', {
                        chat_id: chatId,
                        message_id: messageId
                    });

                    let allServers = [];
                    let page = 1;
                    
                    while (true) {
                        const response = await fetch(`${domain}/api/application/servers?page=${page}`, {
                            method: 'GET',
                            headers: {
                                'Accept': 'application/json',
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${plta}`
                            }
                        });

                        const dataRes = await response.json();
                        if (dataRes.errors || !dataRes.data || dataRes.data.length === 0) break;
                        
                        allServers = allServers.concat(dataRes.data);
                        page++;
                        
                        await bot.editMessageText(`🔄 Mengumpulkan daftar server... (${allServers.length} ditemukan)`, {
                            chat_id: chatId,
                            message_id: processingMsg.message_id
                        });
                    }

                    if (allServers.length === 0) {
                        await bot.editMessageText('❌ Tidak ada server yang ditemukan di panel.', {
                            chat_id: chatId,
                            message_id: processingMsg.message_id
                        });
                        return;
                    }

                    let deletedCount = 0;
                    for (const server of allServers) {
                        const serverId = server.attributes.id;
                        
                        await fetch(`${domain}/api/application/servers/${serverId}`, {
                            method: 'DELETE',
                            headers: {
                                'Accept': 'application/json',
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${plta}`
                            }
                        });
                        
                        deletedCount++;
                        if (deletedCount % 5 === 0 || deletedCount === allServers.length) {
                            await bot.editMessageText(`♻️ Menghapus server... (${deletedCount}/${allServers.length})`, {
                                chat_id: chatId,
                                message_id: processingMsg.message_id
                            });
                        }
                    }

                    await bot.editMessageText(`✅ BERHASIL! Telah menghapus ${deletedCount} server dari panel.`, {
                        chat_id: chatId,
                        message_id: processingMsg.message_id
                    });

                } catch (error) {
                    console.error('Error in mass deletion:', error);
                    await bot.editMessageText('❌ Gagal menghapus server: ' + error.message, {
                        chat_id: chatId,
                        message_id: messageId
                    });
                }
                return;
            }
        }

        await bot.editMessageMedia(
            { type: "photo", media: image, caption: caption, parse_mode: "HTML" },
            { chat_id: chatId, message_id: messageId, reply_markup: replyMarkup }
        );
        await bot.answerCallbackQuery(query.id);
    } catch (error) {
        console.error("Error handling callback query:", error);
    }
});

// Perintah Topup Manual
bot.onText(/\/topup(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;

    const amount = match[1] ? parseInt(match[1].replace(/[^0-9]/g, '')) : 0;
    if (!amount || amount <= 0) {
        return bot.sendMessage(chatId, '❌ *Format Top Up Salah!*\nGunakan: `/topup <nominal>`\nContoh: `/topup 10000`', { parse_mode: 'Markdown' });
    }

    const topupId = 'TP' + Date.now().toString().slice(-6);
    userStates[senderId] = { step: 'AWAITING_PROOF', topupId: topupId, amount: amount };

    bot.sendMessage(chatId, `📌 *REQUEST TOP UP ${formatRupiah(amount)}*\n\nSilakan transfer sebesar *${formatRupiah(amount)}* lalu *KIRIMKAN FOTO BUKTI TRANSFER* di chat ini sekarang.`, { parse_mode: 'Markdown' });
});

// Perintah Cek Saldo
bot.onText(/\/(?:balance|saldo)/, async (msg) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;
    const saldo = getUserBalance(senderId);
    bot.sendMessage(chatId, `💳 *Informasi Saldo*\n\nID: \`${senderId}\`\nTotal Saldo: *${formatRupiah(saldo)}*`, { parse_mode: 'Markdown' });
});

// Fitur Kelola Grup Whitelist
bot.onText(/\/addgrup(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;

    if (await isRestricted(chatId, senderId)) return;

    let targetGroupId = match[1] ? match[1].trim() : chatId.toString();
    targetGroupId = parseInt(targetGroupId);

    if (isNaN(targetGroupId)) {
        return bot.sendMessage(chatId, "❌ ID Grup tidak valid.");
    }

    if (!allowedGroups.includes(targetGroupId)) {
        allowedGroups.push(targetGroupId);
        saveAllowedGroups();
        bot.sendMessage(chatId, `✅ Grup dengan ID \`${targetGroupId}\` berhasil ditambahkan ke whitelist!`, { parse_mode: 'Markdown' });
    } else {
        bot.sendMessage(chatId, `⚠️ Grup \`${targetGroupId}\` sudah terdaftar sebelumnya.`, { parse_mode: 'Markdown' });
    }
});

bot.onText(/\/delgrup(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;

    if (await isRestricted(chatId, senderId)) return;

    let targetGroupId = match[1] ? match[1].trim() : chatId.toString();
    targetGroupId = parseInt(targetGroupId);

    if (allowedGroups.includes(targetGroupId)) {
        allowedGroups = allowedGroups.filter(id => id !== targetGroupId);
        saveAllowedGroups();
        bot.sendMessage(chatId, `✅ Grup \`${targetGroupId}\` berhasil dihapus dari whitelist!`, { parse_mode: 'Markdown' });
    } else {
        bot.sendMessage(chatId, `❌ Grup \`${targetGroupId}\` tidak ditemukan dalam database whitelist.`, { parse_mode: 'Markdown' });
    }
});

bot.onText(/\/listgrup/, async (msg) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;

    if (await isRestricted(chatId, senderId)) return;

    const list = allowedGroups.map((id, index) => `${index + 1}. \`${id}\``).join('\n');
    bot.sendMessage(chatId, `📋 *Daftar Grup Terdaftar:*\n\n${list || "Belum ada grup yang ditambahkan."}`, { parse_mode: 'Markdown' });
});

/// Perintah khusus grup: /cpanel ram,username
bot.onText(/\/cpanel(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;
    const chatType = msg.chat.type;

    if (chatType !== 'private' && !isGroupAllowed(chatId, chatType)) {
        return bot.sendMessage(chatId, '⚠️ Bot belum diizinkan di grup ini. Silakan minta Admin/Owner menambahkan grup ini via `/addgrup`', { parse_mode: 'Markdown' });
    }

    if (await isRestricted(chatId, senderId)) return;

    const inputRaw = match[1];
    if (!inputRaw || typeof inputRaw !== 'string') {
        return bot.sendMessage(chatId, '❌ *Format Salah!*\n\nGunakan format:\n`/cpanel ram,username`\n\nContoh:\n`/cpanel 1gb,shine`', { parse_mode: 'Markdown' });
    }

    const input = inputRaw.trim().split(',');
    if (input.length < 2) {
        return bot.sendMessage(chatId, '❌ *Format Salah!*\n\nGunakan format:\n`/cpanel ram,username`\n\nContoh:\n`/cpanel 1gb,shine`', { parse_mode: 'Markdown' });
    }

    const ramType = input[0].trim().toLowerCase();
    const username = input[1].trim();

    const ramMap = {
        '1gb': { memory: 1024, cpu: 30, disk: 1024 },
        '2gb': { memory: 2048, cpu: 60, disk: 2048 },
        '3gb': { memory: 3072, cpu: 90, disk: 3072 },
        '4gb': { memory: 4048, cpu: 110, disk: 4048 },
        '5gb': { memory: 5048, cpu: 140, disk: 5048 },
        '6gb': { memory: 6048, cpu: 170, disk: 6048 },
        '7gb': { memory: 7048, cpu: 200, disk: 7048 },
        '8gb': { memory: 8048, cpu: 230, disk: 8048 },
        '9gb': { memory: 9048, cpu: 260, disk: 9048 },
        '10gb': { memory: 10000, cpu: 500, disk: 15000 },
        'unli': { memory: 0, cpu: 0, disk: 0 }
    };

    if (!ramMap[ramType]) {
        return bot.sendMessage(chatId, '❌ *RAM Tidak Valid!* Opsional: 1gb, 2gb, 3gb, 4gb, 5gb, 6gb, 7gb, 8gb, 9gb, 10gb, unli', { parse_mode: 'Markdown' });
    }

    const loadingMsg = await bot.sendMessage(chatId, `⏳ Memproses panel *${ramType.toUpperCase()}* untuk user *${username}*...`, { parse_mode: 'Markdown' });
    const spec = ramMap[ramType];
    
    await createPanel(chatId, username, senderId, ramType, spec.memory, spec.cpu, spec.disk, loadingMsg.message_id);
});

/// Command createpanel (Standard)
bot.onText(/\/(?:createpanel)(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (await isRestricted(chatId, userId)) return;
    
    const inputRaw = match[1];
    if (!inputRaw || typeof inputRaw !== 'string') {
        return bot.sendMessage(chatId, '❌ Format salah!\nGunakan: /createpanel username,idtele');
    }

    const input = inputRaw.trim().split(',');
    if (input.length < 2) {
        return bot.sendMessage(chatId, '❌ Format salah!\nGunakan: /createpanel username,idtele');
    }

    const username = input[0].trim();
    const telegramId = input[1].trim();

    bot.sendMessage(chatId, `PILIH JENIS PANEL UNTUK ${username}:`, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '1GB', callback_data: `create_1gb_${username}_${telegramId}` },
                    { text: '2GB', callback_data: `create_2gb_${username}_${telegramId}` },
                    { text: '3GB', callback_data: `create_3gb_${username}_${telegramId}` }
                ],
                [
                    { text: '4GB', callback_data: `create_4gb_${username}_${telegramId}` },
                    { text: '5GB', callback_data: `create_5gb_${username}_${telegramId}` },
                    { text: '6GB', callback_data: `create_6gb_${username}_${telegramId}` }
                ],
                [
                    { text: '7GB', callback_data: `create_7gb_${username}_${telegramId}` },
                    { text: '8GB', callback_data: `create_8gb_${username}_${telegramId}` },
                    { text: '9GB', callback_data: `create_9gb_${username}_${telegramId}` }
                ],
                [
                    { text: '10GB', callback_data: `create_10gb_${username}_${telegramId}` },
                    { text: 'UNLI', callback_data: `create_unli_${username}_${telegramId}` }
                ],
                [
                    { text: 'Admin', callback_data: `admin_${username}_${telegramId}` }
                ],
                [
                    { text: 'Cancel', callback_data: `return` }
                ]
            ]
        }
    });
});

// Perintah Admin Pembuatan User Panel
bot.onText(/\/admin (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (await isRestricted(chatId, userId)) return;
    
    const commandParams = match[1].split(',');
    if (commandParams.length < 2) {
        bot.sendMessage(chatId, 'Format Salah! Penggunaan: /admin namapanel,idtele');
        return;
    }
    
    const panelName = commandParams[0].trim();
    const telegramId = commandParams[1].trim();
    const password = panelName + "117";
    
    try {
        const response = await fetch(`${domain}/api/application/users`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${plta}`
            },
            body: JSON.stringify({
                email: `${panelName}@gmail.com`,
                username: panelName,
                first_name: panelName,
                last_name: "Memb",
                language: "en",
                root_admin: true,
                password: password
            })
        });
        const data = await response.json();
        if (data.errors) {
            bot.sendMessage(chatId, JSON.stringify(data.errors[0], null, 2));
            return;
        }
        const user = data.attributes;
        const userInfo = `
TYPE: 
 - ID: ${user.id}
 - USERNAME: ${user.username}
 - EMAIL: ${user.email}
 - NAME: ${user.first_name} ${user.last_name}
 - LANGUAGE: ${user.language}
 - ADMIN: ${user.root_admin}
 - CREATED AT: ${user.created_at}
 - LOGIN: ${domain}
        `;
        bot.sendMessage(chatId, userInfo);
        bot.sendMessage(telegramId, `
「 DATA ADMIN PANEL 」
 - Login: ${domain}
 - Username: ${user.username}
 - Password: ${password} 

 #line warning :
  - no ddos server
  - no share link panel and minning
        `);
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, 'Terjadi kesalahan dalam pembuatan admin. Silakan coba lagi nanti.');
    }
});

// Perintah Informasi & Ping
bot.onText(/\/info/, (msg) => {
    const chatId = msg.chat.id;
    const sender = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
    const text12 = `Halo ${sender}\nID Telegram Anda: \`${msg.from.id}\``;
    bot.sendPhoto(chatId, image, { caption: text12, parse_mode: 'Markdown' });
});

bot.onText(/\/ping/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (await isRestricted(chatId, userId)) return;
    const statusMsg = await bot.sendMessage(chatId, '🔄 Mengambil informasi sistem...');
    
    const totalRam = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
    const freeRam = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
    const usedRam = (totalRam - freeRam).toFixed(2);
    const ramPercent = ((usedRam / totalRam) * 100).toFixed(2);
    const uptimeStr = `${Math.floor(process.uptime() / 3600)} Jam ${Math.floor((process.uptime() % 3600) / 60)} Menit`;
    
    bot.editMessageText(`🖥️ *SERVER INFO*\n• Uptime: ${uptimeStr}\n• RAM Usage: ${usedRam}/${totalRam} GB (${ramPercent}%)`, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: "Markdown"
    });
});

// Helper Function List Server & User
async function fetchServerList(chatId, page = 1, editMsgId = null) {
    try {
        const response = await fetch(`${domain}/api/application/servers?page=${page}`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${plta}`
            }
        });

        const data = await response.json();
        if (!data.data || data.data.length === 0) {
            const emptyText = "Tidak ada server ditemukan.";
            return editMsgId 
                ? bot.editMessageText(emptyText, { chat_id: chatId, message_id: editMsgId })
                : bot.sendMessage(chatId, emptyText);
        }

        let messageText = `📋 Daftar Server (Halaman ${page}/${data.meta.pagination.total_pages})\n\n`;
        for (const server of data.data) {
            const s = server.attributes;
            messageText += `ID: ${s.id} | Nama: ${s.name} | User ID: ${s.user}\n━━━━━━━━━━━━━━\n`;
        }

        if (editMsgId) {
            bot.editMessageText(messageText, { chat_id: chatId, message_id: editMsgId, parse_mode: "Markdown" });
        } else {
            bot.sendMessage(chatId, messageText, { parse_mode: "Markdown" });
        }
    } catch (error) {
        const errText = "❌ Terjadi kesalahan saat memuat daftar server.";
        if (editMsgId) bot.editMessageText(errText, { chat_id: chatId, message_id: editMsgId });
        else bot.sendMessage(chatId, errText);
    }
}

async function fetchUserList(chatId, page = 1, editMsgId = null) {
    try {
        const response = await fetch(`${domain}/api/application/users?page=${page}`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${plta}`
            }
        });
        const data = await response.json();
        if (!data.data || data.data.length === 0) {
            const emptyText = "Tidak ada user.";
            return editMsgId 
                ? bot.editMessageText(emptyText, { chat_id: chatId, message_id: editMsgId })
                : bot.sendMessage(chatId, emptyText);
        }

        let messageText = "📋 *Daftar User Aktif*\n\n";
        data.data.forEach((user) => {
            const u = user.attributes;
            messageText += `▸ ID: ${u.id} | Username: ${u.username}\n`;
        });

        if (editMsgId) {
            bot.editMessageText(messageText, { chat_id: chatId, message_id: editMsgId, parse_mode: "Markdown" });
        } else {
            bot.sendMessage(chatId, messageText, { parse_mode: "Markdown" });
        }
    } catch (error) {
        const errText = "❌ Terjadi kesalahan.";
        if (editMsgId) bot.editMessageText(errText, { chat_id: chatId, message_id: editMsgId });
        else bot.sendMessage(chatId, errText);
    }
}

// Perintah List Server & User Pterodactyl
bot.onText(/\/listsrv(?: (\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (await isRestricted(chatId, userId)) return;
    const page = match[1] ? parseInt(match[1]) : 1;
    fetchServerList(chatId, page);
});

bot.onText(/\/delsrv(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const srv = match[1].trim();
    const userId = msg.from.id;

    if (await isRestricted(chatId, userId)) return;
    if (!srv) return bot.sendMessage(chatId, 'Masukkan ID server: /delsrv 1');

    try {
        let f = await fetch(`${domain}/api/application/servers/${srv}`, {
            method: 'DELETE',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${plta}`
            }
        });
        if (f.ok) {
            bot.sendMessage(chatId, '✅ SERVER BERHASIL DIHAPUS');
        } else {
            bot.sendMessage(chatId, '❌ SERVER TIDAK DITEMUKAN');
        }
    } catch (error) {
        bot.sendMessage(chatId, 'Terjadi kesalahan saat menghapus server.');
    }
});

bot.onText(/\/listusr(?: (\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (await isRestricted(chatId, userId)) return;
    const page = match[1] ? parseInt(match[1]) : 1;
    fetchUserList(chatId, page);
});

bot.onText(/\/delusr(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const usr = match[1].trim();
    const userId = msg.from.id;

    if (await isRestricted(chatId, userId)) return;
    if (!usr) return bot.sendMessage(chatId, 'Contoh: /delusr 1');

    try {
        let f = await fetch(`${domain}/api/application/users/${usr}`, {
            method: 'DELETE',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${plta}`
            }
        });
        if (f.ok) {
            bot.sendMessage(chatId, '✅ USER BERHASIL DIHAPUS');
        } else {
            bot.sendMessage(chatId, '❌ USER TIDAK DITEMUKAN');
        }
    } catch (error) {
        bot.sendMessage(chatId, 'Terjadi kesalahan.');
    }
});

// Fungsi pembuatan Panel Pterodactyl Core
async function createPanel(chatId, username, telegramId, type, memory, cpu, disk, editMsgId = null) {
    const name = username + type;
    const egg = settings.eggs;
    const loc = settings.loc;
    const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';
    const email = `${username}@gmail.com`;
    const password = `${username}xz122`;

    try {
        const userResponse = await fetch(`${domain}/api/application/users`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${plta}`
            },
            body: JSON.stringify({
                email: email,
                username: username,
                first_name: username,
                last_name: username,
                language: 'en',
                password: password
            })
        });

        const userData = await userResponse.json();
        if (userData.errors) {
            throw new Error(userData.errors[0].detail || JSON.stringify(userData.errors[0]));
        }

        const user = userData.attributes;
        const serverResponse = await fetch(`${domain}/api/application/servers`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${plta}`
            },
            body: JSON.stringify({
                name: name,
                description: '',
                user: user.id,
                egg: parseInt(egg),
                docker_image: 'ghcr.io/parkervcp/yolks:nodejs_18',
                startup: spc,
                environment: { INST: 'npm', USER_UPLOAD: '0', AUTO_UPDATE: '0', CMD_RUN: 'npm start' },
                limits: { memory: memory, swap: 0, disk: disk, io: 500, cpu: cpu },
                feature_limits: { databases: 5, backups: 5, allocations: 1 },
                deploy: { locations: [parseInt(loc)], dedicated_ip: false, port_range: [] }
            })
        });

        const serverData = await serverResponse.json();
        if (serverData.errors) {
            throw new Error(serverData.errors[0].detail || JSON.stringify(serverData.errors[0]));
        }

        let isDmSent = false;
        try {
            await bot.sendMessage(telegramId, 
                `# YOUR PANEL INFORMATION🐬 (${type.toUpperCase()})\n` +
                `│🔗 Login : ${domain}\n` +
                `│👤 Username : ${username}\n` +
                `│🔑 Password : ${password}`,
                { parse_mode: 'Markdown' }
            );
            isDmSent = true;
        } catch (e) {
            isDmSent = false;
        }

        let statusText = `✅ *PANEL ${type.toUpperCase()} SUCCESS CREATED*\n\n` +
                         `• *Username:* \`${username}\`\n` +
                         `• *RAM:* ${memory === 0 ? 'Unlimited' : memory + 'MB'}\n` +
                         `• *CPU:* ${cpu === 0 ? 'Unlimited' : cpu + '%'}\n\n`;

        statusText += isDmSent 
            ? `📩 *Detail panel and information success sending to private chat.*` 
            : `⚠️ *Failed.* Please type /start to bot on private chat`;

        if (editMsgId) {
            await bot.editMessageText(statusText, { chat_id: chatId, message_id: editMsgId, parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, statusText, { parse_mode: 'Markdown' });
        }

    } catch (error) {
        const errText = '❌ *Create panel failed* ' + error.message;
        if (editMsgId) {
            await bot.editMessageText(errText, { chat_id: chatId, message_id: editMsgId, parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, errText, { parse_mode: 'Markdown' });
        }
    }
}

// Perintah Pengelolaan User Role
bot.onText(/\/addprem(?:\s(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;
    if (await isRestricted(chatId, senderId)) return;
    if (!match[1]) return bot.sendMessage(chatId, "❌ input ID user.");
    const userId = parseInt(match[1].replace(/[^0-9]/g, ''));
    if (!premiumUsers.includes(userId)) {
        premiumUsers.push(userId);
        savePremiumUsers();
        bot.sendMessage(chatId, `✅ User ${userId} success add to premium.`);
    }
});

bot.onText(/\/delprem(?:\s(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;
    if (await isRestricted(chatId, senderId)) return;
    if (!match[1]) return bot.sendMessage(chatId, "❌ input ID user.");
    const userId = parseInt(match[1].replace(/[^0-9]/g, ''));
    if (premiumUsers.includes(userId)) {
        premiumUsers = premiumUsers.filter(id => id !== userId);
        savePremiumUsers();
        bot.sendMessage(chatId, `✅ User ${userId} delleted from Premium.`);
    }
});

bot.onText(/\/addadmin(?:\s(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;
    if (!isOwner(senderId)) return;
    if (!match[1]) return bot.sendMessage(chatId, "❌ Masukkan ID user.");
    const userId = parseInt(match[1].replace(/[^0-9]/g, ''));
    if (!adminUsers.includes(userId)) {
        adminUsers.push(userId);
        saveAdminUsers();
        bot.sendMessage(chatId, `✅ User ${userId} success add to Admin.`);
    }
});

bot.onText(/\/deladmin(?:\s(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;
    if (!isOwner(senderId)) return;
    if (!match[1]) return bot.sendMessage(chatId, "❌ Masukkan ID user.");
    const userId = parseInt(match[1].replace(/[^0-9]/g, ''));
    if (adminUsers.includes(userId)) {
        adminUsers = adminUsers.filter(id => id !== userId);
        saveAdminUsers();
        bot.sendMessage(chatId, `✅ User ${userId} delleted from Admin.`);
    }
});

bot.onText(/\/listprem/, async (msg) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;
    if (await isRestricted(chatId, senderId)) return;
    const list = premiumUsers.map((id, index) => `${index + 1}. ${id}`).join("\n");
    bot.sendMessage(chatId, `*list Premium:*\n${list || "Kosong."}`, { parse_mode: "Markdown" });
});

bot.onText(/\/listadmin/, async (msg) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;
    if (await isRestricted(chatId, senderId)) return;
    const list = adminUsers.map((id, index) => `${index + 1}. ${id}`).join("\n");
    bot.sendMessage(chatId, `*list Admin:*\n${list || "Kosong."}`, { parse_mode: "Markdown" });
});

bot.on('polling_error', (error) => {
    console.error('⚠️ Polling Error:', error.message);
});

console.log('Bot Pterodactyl Auto-Order & Saldo Manual Aktif!');
