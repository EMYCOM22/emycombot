const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

// Carregar configurações
let config = { comandos: {} };
try {
    config = JSON.parse(fs.readFileSync('./bot-config.json'));
} catch (e) {
    console.log('⚠️ Usando configuração padrão');
}

const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', (qr) => {
    console.log('\n📱 ESCANEIE O QR CODE:\n');
    qrcode.generate(qr, { small: true });
    console.log('\n⏳ Aguardando conexão...\n');
});

client.on('ready', () => {
    console.log('✅ Bot WhatsApp conectado!');
    console.log('📱 Número:', client.info.wid.user);
});

client.on('message', async (msg) => {
    if (msg.fromMe) return;
    
    const texto = msg.body.toLowerCase().trim();
    console.log('📨', texto);

    // Comando menu
    if (texto === 'menu' || texto === 'oi') {
        await msg.reply('📺 *EMYCOM PLAY*\n\nComandos:\n/teste - Testar lista\n/ajuda - Instruções');
        return;
    }

    // Teste simples
    if (texto === 'teste') {
        await msg.reply('🔍 Envie seu link M3U');
        return;
    }
});

client.initialize();
