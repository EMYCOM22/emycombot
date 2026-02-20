const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const axios = require('axios');

console.log('🔄 Iniciando bot...');

// Carregar configurações do painel
let config = { comandos: {}, testes: {} };
try {
    config = JSON.parse(fs.readFileSync('./bot-config.json'));
    console.log('✅ Configurações carregadas do painel');
    console.log('📋 Comandos do painel:', Object.keys(config.comandos).join(', ') || 'nenhum');
} catch (e) {
    console.log('⚠️ Usando configuração padrão (sem comandos)');
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// ========== FUNÇÕES AUXILIARES ==========

// Função para publicar imagem no status
async function publicarStatusImagem() {
    try {
        const { MessageMedia } = require('whatsapp-web.js');
        
        // Verificar se pasta imagens existe
        if (!fs.existsSync('./imagens')) {
            fs.mkdirSync('./imagens');
            console.log('📁 Pasta imagens criada');
        }
        
        // Caminho da imagem
        const caminhoImagem = './imagens/promo.jpg';
        
        // Verificar se arquivo existe
        if (!fs.existsSync(caminhoImagem)) {
            console.log('❌ Imagem não encontrada em:', caminhoImagem);
            console.log('📥 Coloque a imagem promo.jpg na pasta imagens/');
            return;
        }
        
        // Carregar imagem
        const media = MessageMedia.fromFilePath(caminhoImagem);
        
        // Publicar no status
        await client.sendMessage('status@broadcast', media, {
            caption: '🎬 TODOS OS STREAMINGS EM UM SÓ LUGAR!\n\nNETFLIX • HBOmax • STAR+ • Disney+ • Paramount+ • prime video\n\n🔗 ASSINE JÁ: https://bit.ly/emycom-play'
        });
        
        console.log('✅ Imagem publicada no status!');
        
    } catch (error) {
        console.error('❌ Erro ao publicar status:', error);
    }
}

// Função para chamar a API de teste M2
async function gerarTesteM2() {
    try {
        console.log('🌐 Chamando API M2...');
        
        const response = await axios({
            method: 'post',
            url: 'https://mk21plataformas.sigma.st/api/chatbot/g516VvQ1jl/ANKWPdyWPR',
            timeout: 20000,
            data: {
                acao: 'gerar_teste',
                tipo: 'm2',
                timestamp: new Date().toISOString()
            },
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'WhatsAppBot/1.0'
            }
        });
        
        console.log('✅ API respondeu!');
        
        // Extrai a resposta
        const dados = response.data;
        
        // Prioriza o campo 'reply' que tem a mensagem completa
        if (dados.reply) {
            // Limita o tamanho para não exceder o WhatsApp
            let mensagem = dados.reply;
            if (mensagem.length > 4000) {
                mensagem = mensagem.substring(0, 4000) + '\n\n... (mensagem resumida)';
            }
            return `🧪 *TESTE M2 - ACESSO GERADO*\n\n${mensagem}`;
        }
        
        // Se não tiver reply, pega do array data
        if (dados.data && dados.data[0] && dados.data[0].message) {
            let mensagem = dados.data[0].message;
            if (mensagem.length > 4000) {
                mensagem = mensagem.substring(0, 4000) + '\n\n... (mensagem resumida)';
            }
            return `🧪 *TESTE M2 - ACESSO GERADO*\n\n${mensagem}`;
        }
        
        // Fallback: mensagem resumida
        return `🧪 *TESTE M2*\n\n` +
               `✅ *ACESSO CRIADO*\n` +
               `👤 Usuário: ${dados.username || 'N/A'}\n` +
               `🔐 Senha: ${dados.password || 'N/A'}\n` +
               `📦 Plano: ${dados.package || 'N/A'}\n` +
               `📅 Válido até: ${dados.expiresAtFormatted || dados.expiresAt || 'N/A'}`;
        
    } catch (error) {
        console.error('❌ Erro na API:', error.message);
        
        // Fallback caso a API falhe
        const agora = new Date();
        return `🧪 *TESTE M2 (MODO FALLBACK)*\n\n` +
               `⚠️ API temporariamente indisponível.\n\n` +
               `✅ *ACESSO SIMULADO:*\n` +
               `👤 Usuário: TESTE${agora.getDate()}${agora.getHours()}\n` +
               `🔐 Senha: M2${agora.getMinutes()}${agora.getSeconds()}\n` +
               `🌐 Servidor: http://teste.emycom.com\n\n` +
               `⏱️ Gerado em: ${agora.toLocaleString('pt-BR')}`;
    }
}

// Função para atualizar status no painel
async function atualizarStatus(online, numero = null) {
    try {
        await axios.post('http://localhost:3000/api/bot/status', {
            online: online,
            numero: numero
        });
    } catch (e) {}
}

// ========== EVENTOS DO WHATSAPP ==========

// QR Code
client.on('qr', (qr) => {
    console.log('\n📱 ESCANEIE O QR CODE:\n');
    qrcode.generate(qr, { small: true });
    console.log('\n⏳ Aguardando conexão...\n');
});

// Bot pronto
client.on('ready', async () => {
    console.log('✅ Bot conectado ao WhatsApp!');
    console.log('📱 Número:', client.info.wid.user);
    await atualizarStatus(true, client.info.wid.user);
    
    // Publicar imagem no status (opcional - comente se não quiser automático)
    setTimeout(async () => {
        await publicarStatusImagem();
    }, 5000); // Espera 5 segundos para garantir conexão
});

// Autenticação falhou
client.on('auth_failure', (msg) => {
    console.error('❌ Falha na autenticação:', msg);
});

// Desconectou
client.on('disconnected', async (reason) => {
    console.log('🔴 Bot desconectado. Motivo:', reason);
    await atualizarStatus(false);
    console.log('🔄 Tentando reconectar em 10 segundos...');
    setTimeout(() => client.initialize(), 10000);
});

// ========== PROCESSAR MENSAGENS ==========
client.on('message', async (msg) => {
    if (msg.fromMe) return;

    // IGNORAR MENSAGENS DE GRUPOS
    if (msg.from.endsWith('@g.us')) {
        return; // Não responde a mensagens de grupo
    }
    
    const texto = msg.body.toLowerCase().trim();
    const remetente = msg.from;
    
    console.log(`📨 [${remetente}]: ${texto}`);

    // ===== 1. PRIORIDADE: COMANDOS DO PAINEL =====
    for (let [cmd, dados] of Object.entries(config.comandos)) {
        if (dados.ativo && texto === cmd.toLowerCase()) {
            
            console.log(`✅ Comando do painel: ${cmd}`);
            
            // COMANDO ESPECIAL M2 - Chama a API real
            if (cmd.toLowerCase() === 'm2') {
                await msg.reply('🧪 *Gerando teste M2...*\n\n⏳ Aguarde, consultando API...');
                const respostaAPI = await gerarTesteM2();
                await msg.reply(respostaAPI);
            } 
            else {
                // Comando normal do painel
                await msg.reply(dados.resposta);
            }
            
            return; // Sai após processar
        }
    }

    // ===== 2. SE CHEGOU AQUI, NÃO É COMANDO VÁLIDO =====
    // Removeu completamente os fallbacks e mensagem de erro
    console.log(`⏭️ Ignorando mensagem não comando: ${texto}`);
    // NÃO RESPONDE NADA - apenas ignora silenciosamente
    return;
});

// ========== MONITORAR MUDANÇAS NO CONFIG ==========
fs.watch('./bot-config.json', () => {
    try {
        config = JSON.parse(fs.readFileSync('./bot-config.json'));
        console.log('🔄 Configuração atualizada pelo painel!');
        console.log('📋 Comandos agora:', Object.keys(config.comandos).join(', ') || 'nenhum');
    } catch (e) {
        console.log('⚠️ Erro ao recarregar config');
    }
});

// ========== INICIAR ==========
client.initialize();

process.on('uncaughtException', (err) => {
    console.error('❌ Erro não capturado:', err);
});