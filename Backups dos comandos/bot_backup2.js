const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

console.log('🔄 Iniciando bot...');

const client = new Client({
    authStrategy: new LocalAuth({
        // Forçar uma nova pasta de sessão para evitar conflitos
        dataPath: './session-data'
    }),
    puppeteer: {
        // Argumentos essenciais para evitar crashes
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// QR Code
client.on('qr', (qr) => {
    console.log('\n📱 NOVO QR CODE GERADO (escaneie agora):\n');
    qrcode.generate(qr, { small: true });
    console.log('\n⏳ Aguardando conexão...\n');
});

// Pronto (conectado e funcionando)
client.on('ready', () => {
    console.log('✅ Bot conectado e ESTÁVEL!');
    console.log(`📱 Número: ${client.info.wid.user}`);
});

// Autenticação falhou (sessão corrompida)
client.on('auth_failure', (msg) => {
    console.error('❌ Falha na autenticação:', msg);
    console.log('🧹 Limpe a pasta session-data e tente novamente.');
});

// Desconectou (vai tentar reconectar sozinho)
client.on('disconnected', (reason) => {
    console.log('⚠️ Bot desconectado. Motivo:', reason);
    console.log('🔄 Tentando reconectar em 5 segundos...');
    setTimeout(() => client.initialize(), 5000);
});

// Carregar configurações
let config = { comandos: {} };
try {
    config = JSON.parse(fs.readFileSync('./bot-config.json'));
    console.log('📁 Configurações carregadas.');
} catch (e) {
    console.log('⚠️ Usando configuração padrão.');
}

// Processar mensagens
client.on('message', async (msg) => {
    if (msg.fromMe) return;
    
    const texto = msg.body.toLowerCase().trim();
    console.log('📨', texto);

    // Comando genérico de teste
    if (texto === 'ping') {
        await msg.reply('pong');
        return;
    }

    // Seus outros comandos aqui...
    if (texto === 'menu' || texto === 'oi') {
        await msg.reply('📺 *EMYCOM PLAY*\n\nComandos:\n/teste - Testar lista\n/ajuda - Instruções');
        return;
    }
});

// Inicializar
client.initialize();