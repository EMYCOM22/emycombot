const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

console.log('🔄 Iniciando bot com Gemini AI...');

// ========== CONFIGURAÇÕES ==========
const CONFIG_FILE = './bot-config.json';
const BLOQUEIOS_FILE = './bloqueios.json';

// 🔑 COLE SUA CHAVE AQUI
const GEMINI_API_KEY = 'AIzaSyBzXx...'; // 👈 COLE SUA CHAVE AQUI

// ========== CONTROLE DE INTERVENÇÃO HUMANA ==========
const ADMIN_NUMBERS = [
    '558894413934@c.us',  // 👈 SEU NÚMERO
];

const CHATS_COM_HUMANO = new Set();

// ========== FUNÇÕES DE CONTROLE ==========
function isAdmin(numero) {
    const numeroLimpo = numero.split('@')[0];
    return ADMIN_NUMBERS.includes(numero) || 
           ADMIN_NUMBERS.includes(numeroLimpo + '@c.us') ||
           ADMIN_NUMBERS.includes(numeroLimpo);
}

function humanoAssumiuChat(chatId) {
    console.log(`👤 Humano assumiu o chat: ${chatId}`);
    CHATS_COM_HUMANO.add(chatId);
}

function iaPodeResponder(chatId) {
    if (chatId.endsWith('@g.us')) return false;
    if (chatId === 'status@broadcast') return false;
    return !CHATS_COM_HUMANO.has(chatId);
}

// ========== FUNÇÃO PARA CHAMAR GEMINI AI ==========
async function perguntarGemini(prompt, historico = []) {
    try {
        console.log('🤔 Consultando Gemini AI...');
        
        const messages = [
            {
                role: 'user',
                parts: [{ text: prompt }]
            }
        ];
        
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
            {
                contents: messages,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 300,
                }
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (response.data.candidates && response.data.candidates[0]) {
            return response.data.candidates[0].content.parts[0].text;
        }
        
        return null;
        
    } catch (error) {
        console.error('❌ Erro Gemini:', error.response?.data || error.message);
        return null;
    }
}

// ========== FUNÇÃO PRINCIPAL DA IA ==========
async function responderComIA(numero, mensagem) {
    try {
        const mensagemLower = mensagem.toLowerCase();
        
        // ===== DETECTAR OPÇÃO ESCOLHIDA =====
        if (mensagemLower === '1') {
            return "Claro! Vou chamar nosso suporte humano para te atender 😊\n\nEnquanto isso, quer deixar alguma mensagem para o atendente?";
        }
        
        if (mensagemLower === '2') {
            return "Ótima escolha! 🎯\n\nNosso teste é gratuito por 1 hora com mais de 15.000 canais.\n\nQuer testar agora? É só digitar *M2*";
        }
        
        if (mensagemLower === '3') {
            return "Temos apps incríveis! 📱\n\nFuncionam em Smart TV, celular e computador.\n\nQual dispositivo você usa? (TV, celular, tablet)";
        }
        
        if (mensagemLower === '4') {
            return "Vamos renovar? 💳\n\nAceitamos PIX (mais rápido), transferência e cartão.\n\nQual forma de pagamento prefere?";
        }
        
        // ===== USAR GEMINI PARA RESPOSTAS INTELIGENTES =====
        const prompt = `Você é um assistente de vendas da EMYCOM PLAY, empresa de IPTV. 
        Seja educado, útil e responda em português do Brasil.
        Cliente disse: "${mensagem}"
        
        Regras:
        - Se for saudação, seja caloroso
        - Se perguntar sobre preços, diga que temos a partir de R$25
        - Se perguntar sobre IPTV, explique de forma simples
        - Sempre termine com uma pergunta para engajar
        - Use emojis com moderação 😊
        
        Responda de forma natural e conversacional.`;
        
        const resposta = await perguntarGemini(prompt);
        
        if (resposta) {
            return resposta;
        }
        
        return "Entendi! 😊 Como posso ajudar você hoje? Você pode digitar 1, 2, 3 ou 4 para opções, ou M2 para teste grátis.";
        
    } catch (error) {
        console.error('❌ Erro na IA:', error.message);
        return "Desculpe, tive um probleminha. Pode repetir? 😊";
    }
}

// ========== FUNÇÃO PARA PUBLICAR IMAGENS NO STATUS ==========
async function publicarImagemAleatoria() {
    try {
        const pastaImagens = './imagens';
        
        if (!fs.existsSync(pastaImagens)) {
            fs.mkdirSync(pastaImagens);
            return;
        }
        
        const imagens = fs.readdirSync(pastaImagens)
            .filter(file => file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png'));
        
        if (imagens.length === 0) return;
        
        const imagemEscolhida = imagens[Math.floor(Math.random() * imagens.length)];
        const caminhoCompleto = path.join(pastaImagens, imagemEscolhida);
        
        const media = MessageMedia.fromFilePath(caminhoCompleto);
        await client.sendMessage('status@broadcast', media);
        
        console.log(`✅ Imagem publicada: ${imagemEscolhida}`);
        
    } catch (error) {
        console.error('❌ Erro ao publicar imagem:', error);
    }
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
                msgBloqueio = `\n\n🔒 Bloqueado por ${config.bloqueio.dias} dias (até ${dataExpira})`;
            }
            
            return `🧪 *TESTE M2*\n\n${msg}${msgBloqueio}`;
        }
        
        return `🧪 *TESTE M2*\n\n✅ Usuário: ${dados.username}\n🔐 Senha: ${dados.password}`;
        
    } catch (error) {
        console.error('❌ Erro API:', error.message);
        return `🧪 *TESTE M2*\n\n❌ Erro ao gerar teste. Tente novamente.`;
    }
}

// ========== CARREGAR CONFIGURAÇÕES ==========
let config = { comandos: {}, testes: {}, bloqueio: { dias: 15, ativo: true } };
let bloqueios = {};

try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE));
    console.log('✅ Configurações carregadas');
} catch (e) {
    console.log('⚠️ Usando configuração padrão');
    config = {
        comandos: {
            "m2": { "resposta": "🧪 Comando especial para teste", "ativo": true, "modo": "escrita_exata" }
        },
        testes: { max_canais: 25, timeout: 10, mensagem_inicio: "🔍 Analisando...", mensagem_sucesso: "✅ {online}/{total} canais online" },
        bloqueio: { dias: 15, ativo: true, mensagem: "🔒 *BLOQUEADO*\n\nVocê já utilizou nosso teste recentemente.\n\n📅 Próximo teste disponível: {data}" }
    };
}

try {
    bloqueios = JSON.parse(fs.readFileSync(BLOQUEIOS_FILE));
    console.log('🔒 Bloqueios carregados');
} catch (e) {
    fs.writeFileSync(BLOQUEIOS_FILE, JSON.stringify({}));
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

// ========== EVENTOS ==========
client.on('qr', (qr) => {
    console.log('\n📱 ESCANEIE O QR CODE:\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('✅ Bot conectado!', client.info.wid.user);
    console.log('👤 Admin:', ADMIN_NUMBERS);
    console.log('🤖 Gemini AI ativa!');
    
    setTimeout(publicarImagemAleatoria, 10000);
    setInterval(publicarImagemAleatoria, 4 * 60 * 60 * 1000);
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
    if (msg.fromMe || msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return;
    
    const texto = msg.body.trim();
    const textoLower = texto.toLowerCase();
    const numero = msg.from;
    const numeroLimpo = numero.split('@')[0];
    const chatId = msg.from;
    
    console.log(`📨 [${numeroLimpo}]: ${texto}`);

    if (isAdmin(numero)) return;

    if (CHATS_COM_HUMANO.has(chatId)) return;

    // Comando M2
    if (textoLower === 'm2') {
        if (estaBloqueado(numero)) {
            const expira = new Date(bloqueios[numero].expira).toLocaleString('pt-BR');
            let msgBloqueio = config.bloqueio?.mensagem?.replace('{data}', expira) || '🔒 Bloqueado';
            await msg.reply(msgBloqueio);
            return;
        }
        
        await msg.reply('🧪 Gerando seu teste...\n\n⏱️ Só um instante.');
        const resposta = await gerarTesteM2(numero);
        await msg.reply(resposta);
        return;
    }

    // IA com Gemini
    const respostaIA = await responderComIA(numero, texto);
    if (respostaIA) {
        await msg.reply(respostaIA);
    }
});

// ========== DETECTAR RESPOSTAS DO ADMIN ==========
client.on('message', async (msg) => {
    if (!msg.fromMe) return;
    
    const chatId = msg.to;
    if (chatId && !chatId.endsWith('@g.us') && chatId !== 'status@broadcast') {
        console.log(`👤 Admin respondeu para ${chatId.split('@')[0]}`);
        humanoAssumiuChat(chatId);
    }
});

client.initialize();

process.on('uncaughtException', (err) => {
    console.error('❌ Erro:', err);
});