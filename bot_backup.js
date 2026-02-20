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

// Função para publicar imagem do dia no status
async function publicarImagemDoDia() {
    try {
        const { MessageMedia } = require('whatsapp-web.js');
        const pastaImagens = './imagens';
        
        if (!fs.existsSync(pastaImagens)) {
            fs.mkdirSync(pastaImagens);
            console.log('📁 Pasta imagens criada');
            return;
        }
        
        const imagens = fs.readdirSync(pastaImagens)
            .filter(file => file.endsWith('.jpg') || file.endsWith('.png'))
            .sort();
        
        if (imagens.length === 0) {
            console.log('❌ Nenhuma imagem encontrada');
            return;
        }
        
        const dia = new Date().getDate();
        const indice = (dia - 1) % imagens.length;
        const imagemEscolhida = imagens[indice];
        
        const caminhoCompleto = `${pastaImagens}/${imagemEscolhida}`;
        const media = MessageMedia.fromFilePath(caminhoCompleto);
        
        const legendas = [
            '🎬 TODOS OS STREAMINGS EM UM SÓ LUGAR!\n\nNETFLIX • HBOmax • STAR+ • Disney+ • Paramount+ • prime video',
            '📺 OFERTA ESPECIAL DO DIA!\n\n🔗 ASSINE JÁ: https://bit.ly/emycom-play',
            '💰 O MELHOR CUSTO-BENEFÍCIO DO MERCADO!\n\n🔗 https://bit.ly/emycom-play',
            '🎯 APROVEITE HOJE!\n\nNETFLIX • HBOmax • STAR+ • Disney+'
        ];
        
        const indiceLegenda = dia % legendas.length;
        const legenda = legendas[indiceLegenda];
        
        await client.sendMessage('status@broadcast', media, { caption: legenda });
        console.log(`✅ Imagem do dia publicada: ${imagemEscolhida}`);
        
    } catch (error) {
        console.error('❌ Erro ao publicar imagem:', error);
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
        
        const dados = response.data;
        
        if (dados.reply) {
            let mensagem = dados.reply;
            if (mensagem.length > 4000) {
                mensagem = mensagem.substring(0, 4000) + '\n\n... (mensagem resumida)';
            }
            return `🧪 *TESTE M2 - ACESSO GERADO*\n\n${mensagem}`;
        }
        
        return `🧪 *TESTE M2*\n\n✅ *ACESSO CRIADO*\n👤 Usuário: ${dados.username || 'N/A'}\n🔐 Senha: ${dados.password || 'N/A'}`;
        
    } catch (error) {
        const agora = new Date();
        return `🧪 *TESTE M2 (MODO FALLBACK)*\n\n⚠️ API indisponível.\n\n✅ Usuário: TESTE${agora.getDate()}${agora.getHours()}\n🔐 Senha: M2${agora.getMinutes()}${agora.getSeconds()}`;
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

// ========== NOVA FUNÇÃO DE CORRESPONDÊNCIA ==========
function correspondeComando(textoUsuario, comandoNome) {
    const texto = textoUsuario.toLowerCase().trim();
    const comando = comandoNome.toLowerCase().trim();
    const dados = config.comandos[comandoNome];
    const modo = dados?.modo || 'escrita_exata';
    
    switch(modo) {
        case 'escrita_exata':
            return texto === comando;
        case 'contem':
            return texto.includes(comando);
        case 'comeca_com':
            return texto.startsWith(comando);
        case 'termina_com':
            return texto.endsWith(comando);
        default:
            return texto === comando;
    }
}

// ========== EVENTOS DO WHATSAPP ==========

client.on('qr', (qr) => {
    console.log('\n📱 ESCANEIE O QR CODE:\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('✅ Bot conectado ao WhatsApp!');
    console.log('📱 Número:', client.info.wid.user);
    await atualizarStatus(true, client.info.wid.user);
    
    setTimeout(async () => {
        await publicarImagemDoDia();
    }, 10000);
});

client.on('auth_failure', (msg) => {
    console.error('❌ Falha na autenticação:', msg);
});

client.on('disconnected', async (reason) => {
    console.log('🔴 Bot desconectado. Motivo:', reason);
    await atualizarStatus(false);
    setTimeout(() => client.initialize(), 10000);
});

// ========== PROCESSAR MENSAGENS ==========
client.on('message', async (msg) => {
    if (msg.fromMe) return;
    if (msg.from.endsWith('@g.us')) return;
    
    const texto = msg.body.toLowerCase().trim();
    const remetente = msg.from;
    
    console.log(`📨 [${remetente}]: ${texto}`);

    // Comando manual para publicar imagem
    const meuNumero = '551137777212';
    if (texto === 'imagem do dia' && remetente.includes(meuNumero)) {
        await msg.reply('📸 Publicando imagem...');
        await publicarImagemDoDia();
        await msg.reply('✅ Imagem publicada!');
        return;
    }

    // ===== VERIFICAR COMANDOS DO PAINEL (COM MODO) =====
    for (let [cmd, dados] of Object.entries(config.comandos)) {
        if (dados.ativo && correspondeComando(texto, cmd)) {
            
            console.log(`✅ Comando: ${cmd} (modo: ${dados.modo || 'escrita_exata'})`);
            
            if (cmd.toLowerCase() === 'm2') {
                await msg.reply('🧪 Gerando teste M2...');
                const respostaAPI = await gerarTesteM2();
                await msg.reply(respostaAPI);
            } else {
                await msg.reply(dados.resposta);
            }
            return;
        }
    }

    console.log(`⏭️ Ignorando: ${texto}`);
});

// ========== MONITORAR MUDANÇAS ==========
fs.watch('./bot-config.json', () => {
    try {
        config = JSON.parse(fs.readFileSync('./bot-config.json'));
        console.log('🔄 Configuração atualizada!');
    } catch (e) {
        console.log('⚠️ Erro ao recarregar');
    }
});

client.initialize();

process.on('uncaughtException', (err) => {
    console.error('❌ Erro:', err);
});