const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const axios = require('axios');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

console.log('🔄 Iniciando bot com IA Híbrida em produção...');

// ========== ARQUIVOS ==========
const CONFIG_FILE = './bot-config.json';
const BLOQUEIOS_FILE = './bloqueios.json';

// Carregar configurações
let config = { comandos: {}, testes: {}, bloqueio: { dias: 15, ativo: true } };
let bloqueios = {};

try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE));
    console.log('✅ Configurações carregadas');
} catch (e) {
    console.log('⚠️ Usando configuração padrão');
}

try {
    bloqueios = JSON.parse(fs.readFileSync(BLOQUEIOS_FILE));
    console.log('🔒 Bloqueios carregados');
} catch (e) {
    fs.writeFileSync(BLOQUEIOS_FILE, JSON.stringify({}));
}

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth' // Persistir sessão
    }),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

// ========== SERVIDOR WEB (para manter o Render ativo) ==========
app.get('/', (req, res) => {
    res.send('✅ Bot Emycom Play está rodando!');
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'online', 
        timestamp: new Date().toISOString(),
        bot: client.info ? 'conectado' : 'conectando'
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor web rodando na porta ${PORT}`);
});

// ========== CONFIGURAÇÃO DA IA ==========
const MODELO_IA = 'gemma3:1b';
const IA_ATIVADA = false; // Desativada em produção até configurar Ollama
const HISTORICO_POR_NUMERO = new Map();

// Palavras que indicam desejo de ir para o menu principal
const PALAVRAS_MENU = [
    'testar', 'conhecer mais', 'saber mais', 'quero saber', 'como funciona',
    'gostaria de saber', 'me explica', 'o que é', 'como faz', 'quero testar',
    'experimentar', 'demonstração', 'quero conhecer', 'falar sobre', 'info',
    'informações', 'planos', 'preços', 'valores', 'quanto custa', 'tabela',
    'promoção', 'ofertas', 'serviços', 'produtos', 'catálogo', 'novidades'
];

// Palavras que indicam desejo de aprender sobre IPTV
const PALAVRAS_APRENDER = [
    'como funciona iptv', 'o que é iptv', 'explicação iptv', 'tutorial iptv',
    'aprender iptv', 'guia iptv', 'como instalar iptv', 'como usar iptv',
    'iptv funciona', 'entender iptv', 'iptv explicado', 'iptv para iniciantes',
    'como assistir iptv', 'configurar iptv', 'aplicativo iptv', 'player iptv'
];

// ========== FUNÇÃO PARA BUSCAR CONTEÚDO SOBRE IPTV ==========
async function buscarConteudoIPTV(termo) {
    // Sem Ollama em produção, retorna fallback educacional
    return `📚 *O QUE É IPTV?*\n\nIPTV é uma tecnologia que permite assistir TV pela internet, usando aplicativos em vez de antenas ou cabos.\n\n⚙️ *COMO FUNCIONA?*\n\nVocê precisa de um aplicativo e uma lista de canais (playlist). O app se conecta à lista e transmite os canais ao vivo.\n\n📱 *O QUE VOCÊ PRECISA?*\n• Internet de qualidade\n• Um dispositivo (TV, celular, tablet)\n• Um aplicativo IPTV\n• Uma lista de canais\n\n🎥 *COMO APRENDER MAIS:*\n• Pesquise no YouTube: "IPTV para iniciantes"\n• Pesquise: "Como configurar IPTV"\n• Pesquise: "Melhor app IPTV"\n\n🌐 *DICAS DE PESQUISA:*\n• Google: "O que é IPTV guia completo"\n• Google: "IPTV como funciona tutorial"`;
}

// Função para responder com IA (desativada em produção)
async function responderComIA(numero, mensagem) {
    const mensagemLower = mensagem.toLowerCase();
    
    // Verificar se quer aprender sobre IPTV
    for (let termo of PALAVRAS_APRENDER) {
        if (mensagemLower.includes(termo)) {
            console.log(`📚 Cliente quer aprender sobre IPTV`);
            return await buscarConteudoIPTV(termo);
        }
    }
    
    // Verificar se quer ir para o menu principal
    const querMenu = PALAVRAS_MENU.some(palavra => mensagemLower.includes(palavra));
    
    if (querMenu) {
        console.log(`🔴 Cliente quer informações comerciais - redirecionando para menu`);
        return `📋 *MENU PRINCIPAL*\n\n` +
               `Escolha uma opção digitando o número correspondente:\n\n` +
               `1️⃣ *FALAR COM SUPORTE*\n` +
               `2️⃣ *TESTAR NOSSOS SERVIDORES*\n` +
               `3️⃣ *CONHECER APPS E PARCEIROS*\n` +
               `4️⃣ *RENOVAR ASSINATURA*`;
    }
    
    return null;
}

// ========== FUNÇÕES DE BLOQUEIO ==========
function estaBloqueado(numero) {
    if (!config.bloqueio?.ativo) return false;
    if (!bloqueios[numero]) return false;
    
    const agora = Date.now();
    if (agora > bloqueios[numero].expira) {
        delete bloqueios[numero];
        fs.writeFileSync(BLOQUEIOS_FILE, JSON.stringify(bloqueios, null, 2));
        return false;
    }
    
    return true;
}

function bloquearNumero(numero) {
    const dias = config.bloqueio?.dias || 15;
    const expira = Date.now() + (dias * 24 * 60 * 60 * 1000);
    const dataExpira = new Date(expira).toLocaleString('pt-BR');
    
    bloqueios[numero] = {
        expira: expira,
        data: dataExpira,
        motivo: 'Teste M2'
    };
    
    fs.writeFileSync(BLOQUEIOS_FILE, JSON.stringify(bloqueios, null, 2));
    return { expira, dataExpira };
}

// ========== FUNÇÃO M2 ==========
async function gerarTesteM2(numero) {
    try {
        console.log(`🌐 Chamando API M2...`);
        
        const response = await axios({
            method: 'post',
            url: 'https://mk21plataformas.sigma.st/api/chatbot/g516VvQ1jl/ANKWPdyWPR',
            timeout: 20000,
            data: {
                acao: 'gerar_teste',
                tipo: 'm2',
                numero: numero,
                timestamp: new Date().toISOString()
            },
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        const dados = response.data;
        const { dataExpira } = bloquearNumero(numero);
        
        if (dados.reply) {
            let msg = dados.reply;
            if (msg.length > 3500) msg = msg.substring(0, 3500) + '\n\n...';
            
            let msgBloqueio = '';
            if (config.bloqueio?.ativo) {
                msgBloqueio = `\n\n🔒 *BLOQUEIO*\nEste número está bloqueado por ${config.bloqueio.dias} dias (até ${dataExpira})`;
            }
            
            return `🧪 *TESTE M2*\n\n${msg}${msgBloqueio}`;
        }
        
        return `🧪 *TESTE M2*\n\n✅ Usuário: ${dados.username}\n🔐 Senha: ${dados.password}`;
        
    } catch (error) {
        console.error('❌ Erro API:', error.message);
        return `🧪 *TESTE M2*\n\n❌ Erro ao gerar teste. Tente novamente.`;
    }
}

// ========== FUNÇÃO DE CORRESPONDÊNCIA ==========
function correspondeComando(textoUsuario, comandoNome) {
    const texto = textoUsuario.toLowerCase().trim();
    const comando = comandoNome.toLowerCase().trim();
    const dados = config.comandos[comandoNome];
    const modo = dados?.modo || 'escrita_exata';
    
    switch(modo) {
        case 'escrita_exata': return texto === comando;
        case 'contem': return texto.includes(comando);
        case 'comeca_com': return texto.startsWith(comando);
        case 'termina_com': return texto.endsWith(comando);
        default: return texto === comando;
    }
}

// ========== FUNÇÃO PARA GERAR CONTEÚDO IPTV ==========
async function gerarConteudoIPTV() {
    const fallbacks = [
        '📺 *EMYCOM PLAY* - Teste grátis por 24h! 🚀',
        '🎬 Mais de 15.000 canais e VOD! Qualidade Full HD. 🔥',
        '💎 Planos a partir de R$25,00. Aproveite!',
        '⚡ Teste nossos servidores! Digite M2 e ganhe 1 hora.'
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// ========== FUNÇÃO PARA PUBLICAR CONTEÚDO ==========
async function publicarConteudoIPTV() {
    try {
        const texto = await gerarConteudoIPTV();
        await client.sendMessage('status@broadcast', texto);
        console.log(`✅ Conteúdo publicado: ${texto.substring(0, 50)}...`);
    } catch (error) {
        console.error('❌ Erro ao publicar:', error);
    }
}

// ========== EVENTOS DO WHATSAPP ==========
client.on('qr', (qr) => {
    console.log('\n📱 ESCANEIE O QR CODE:\n');
    qrcode.generate(qr, { small: true });
    console.log('\n⚠️ IMPORTANTE: Escaneie este QR CODE nos logs do Render!');
});

client.on('ready', async () => {
    console.log('✅ Bot conectado!', client.info.wid.user);
    
    // Publicar conteúdo IPTV 10 segundos após conectar
    setTimeout(publicarConteudoIPTV, 10000);
    
    // Agendar publicações a cada 6 horas
    setInterval(publicarConteudoIPTV, 6 * 60 * 60 * 1000);
});

client.on('auth_failure', (msg) => {
    console.error('❌ Falha na autenticação:', msg);
});

client.on('disconnected', async (reason) => {
    console.log('🔴 Desconectado:', reason);
    setTimeout(() => client.initialize(), 10000);
});

// ========== MENSAGENS ==========
client.on('message', async (msg) => {
    if (msg.fromMe || msg.from.endsWith('@g.us')) return;
    
    const texto = msg.body.trim();
    const textoLower = texto.toLowerCase();
    const numero = msg.from;
    const numeroLimpo = numero.split('@')[0];
    
    console.log(`📨 [${numeroLimpo}]: ${texto}`);

    // Comandos numéricos
    if (textoLower === '1' || textoLower === '2' || textoLower === '3' || textoLower === '4') {
        const comando = config.comandos[textoLower];
        if (comando && comando.ativo) {
            await msg.reply(comando.resposta);
            return;
        }
    }

    // Demais comandos do painel
    for (let [cmd, dados] of Object.entries(config.comandos)) {
        if (dados.ativo && correspondeComando(textoLower, cmd)) {
            
            if (cmd.toLowerCase() === 'm2') {
                if (estaBloqueado(numero)) {
                    const expira = new Date(bloqueios[numero].expira).toLocaleString('pt-BR');
                    let msgBloqueio = config.bloqueio?.mensagem || '🔒 Bloqueado até {data}';
                    msgBloqueio = msgBloqueio.replace('{data}', expira);
                    await msg.reply(msgBloqueio);
                    return;
                }
                
                await msg.reply('🧪 Gerando teste...');
                const resposta = await gerarTesteM2(numero);
                await msg.reply(resposta);
                return;
            }
            
            await msg.reply(dados.resposta);
            return;
        }
    }

    // IA (fallback apenas)
    const respostaIA = await responderComIA(numero, texto);
    if (respostaIA) {
        await msg.reply(respostaIA);
    }
});

// ========== MONITORAR CONFIG ==========
fs.watch(CONFIG_FILE, () => {
    try {
        config = JSON.parse(fs.readFileSync(CONFIG_FILE));
        console.log('🔄 Configuração atualizada');
    } catch (e) {}
});

client.initialize();

process.on('uncaughtException', (err) => {
    console.error('❌ Erro:', err);
});