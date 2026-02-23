const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

console.log('🔄 Iniciando bot com IA Avançada...');

// ========== ARQUIVOS ==========
const CONFIG_FILE = './bot-config.json';
const BLOQUEIOS_FILE = './bloqueios.json';

// ========== CONTROLE DE INTERVENÇÃO HUMANA ==========
const ADMIN_NUMBERS = [
    '551137777212@c.us',  // 👈 COLOQUE SEU NÚMERO AQUI!
];

const CHATS_COM_HUMANO = new Set(); // Chats onde você já está falando
const TEMPO_MUDO_APOS_INTERVENCAO = 7 * 24 * 60 * 60 * 1000; // 7 dias em ms
const timeoutsReativar = new Map();

// ========== CONTROLE DE FOLLOW-UP ==========
const FOLLOW_UP_TIMERS = new Map();

// Carregar configurações
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

// ========== FUNÇÕES DE CONTROLE ==========
function isAdmin(numero) {
    return ADMIN_NUMBERS.includes(numero) || ADMIN_NUMBERS.includes(numero.split('@')[0] + '@c.us');
}

// FUNÇÃO CORRIGIDA: Quando admin responde, chat é marcado e IA para para SEMPRE
function humanoAssumiuChat(chatId) {
    console.log(`👤 Humano assumiu o chat: ${chatId} - IA silenciada permanentemente neste chat`);
    CHATS_COM_HUMANO.add(chatId);
    
    // Cancelar follow-ups
    if (FOLLOW_UP_TIMERS.has(chatId)) {
        clearTimeout(FOLLOW_UP_TIMERS.get(chatId));
        FOLLOW_UP_TIMERS.delete(chatId);
    }
    
    // NÃO reativa mais - fica mudo para sempre neste chat
    // Timeout removido - IA não volta mais
}

function iaPodeResponder(chatId) {
    // NÃO responde se:
    // 1. For grupo
    // 2. For status
    // 3. Chat já foi assumido por humano
    if (chatId.endsWith('@g.us')) return false; // Ignora grupos
    if (chatId === 'status@broadcast') return false; // Ignora status
    return !CHATS_COM_HUMANO.has(chatId);
}

// ========== FUNÇÃO PARA PUBLICAR IMAGENS NO STATUS ==========
async function publicarImagemAleatoria() {
    try {
        const pastaImagens = './imagens';
        
        // Verificar se pasta existe
        if (!fs.existsSync(pastaImagens)) {
            console.log('📁 Pasta imagens não encontrada. Criando...');
            fs.mkdirSync(pastaImagens);
            return;
        }
        
        // Listar todas as imagens
        const imagens = fs.readdirSync(pastaImagens)
            .filter(file => file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png'));
        
        if (imagens.length === 0) {
            console.log('❌ Nenhuma imagem encontrada na pasta imagens/');
            return;
        }
        
        // Escolher imagem aleatória
        const imagemEscolhida = imagens[Math.floor(Math.random() * imagens.length)];
        const caminhoCompleto = path.join(pastaImagens, imagemEscolhida);
        
        console.log(`📸 Publicando imagem no status: ${imagemEscolhida}`);
        
        const media = MessageMedia.fromFilePath(caminhoCompleto);
        
        // Publicar no status (sem texto)
        await client.sendMessage('status@broadcast', media);
        
        console.log(`✅ Imagem publicada com sucesso!`);
        
    } catch (error) {
        console.error('❌ Erro ao publicar imagem:', error);
    }
}

// ========== CONFIGURAÇÃO DA IA ==========
const HISTORICO_POR_NUMERO = new Map();
const ETAPA_DO_CLIENTE = new Map(); // Armazena em qual fluxo o cliente está

// ========== DIRETRIZ PRINCIPAL DA IA ==========
const DIRETRIZ_VENDAS = `
Você é uma IA especialista em vendas da EMYCOM PLAY, empresa de IPTV.

🎯 **FLUXOS QUE VOCÊ DOMINA:**

1️⃣ **SUPORTE HUMANO** - Quando cliente escolhe opção 1
   - Acolha o cliente
   - Explique que o suporte humano virá
   - Pergunte se quer deixar mensagem
   - Mantenha o cliente confortável enquanto aguarda

2️⃣ **TESTE GRÁTIS** - Quando cliente escolhe opção 2
   - Explique como funciona o teste
   - Pergunte se quer testar agora
   - Direcione para digitar M2
   - Explique o que ele vai receber

3️⃣ **APLICATIVOS** - Quando cliente escolhe opção 3
   - Apresente os apps disponíveis
   - Explique como instalar
   - Pergunte qual dispositivo ele usa (TV, celular, tablet)
   - Dê orientações específicas

4️⃣ **RENOVAÇÃO/PAGAMENTO** - Quando cliente escolhe opção 4
   - Informe formas de pagamento (PIX)
   - Explique o processo
   - Pergunte se já tem o comprovante
   - Oriente sobre o envio

📋 **REGRAS DE OURO:**
- Sempre use linguagem calorosa e profissional
- Faça perguntas para entender a necessidade
- Conduza o cliente naturalmente
- Se desviar do assunto, redirecione com educação
- NUNCA seja robótico - seja humano
- Use emojis com moderação 😊
`;

// ========== FLUXOS DAS OPÇÕES 1-4 ==========
const FLUXOS = {
    suporte: {
        boasVindas: [
            "Claro! Vou chamar nosso suporte humano para te atender 😊",
            "Enquanto isso, posso ajudar com alguma informação?",
            "O suporte já foi notificado. Em poucos minutos alguém fala com você!"
        ],
        perguntas: [
            "Quer deixar alguma mensagem para o atendente?",
            "É sobre algum problema específico?",
            "Já é cliente ou quer informações?"
        ],
        despedida: [
            "Fique tranquilo, o suporte já vai te chamar!",
            "Qualquer coisa, é só aguardar um pouquinho 😊"
        ]
    },
    
    teste: {
        boasVindas: [
            "Ótima escolha! Nosso teste é gratuito por 1 hora ⏱️",
            "Você vai poder testar todos os nossos servidores.",
            "Mais de 15.000 canais, Fimes e Series disponíveis!"
        ],
        perguntas: [
            "Quer testar agora? É só digitar *M2*",
            "Já sabe como funciona o teste?",
            "Qual dispositivo você vai usar? (TV, celular, tablet)"
        ],
        explicacao: [
            "Ao digitar M2, você receberá automaticamente:",
            "✅ Usuário e senha de teste",
            "✅ Links dos servidores",
            "✅ Instruções de configuração",
            "Tudo na hora! 😊"
        ],
        despedida: [
            "É só digitar M2 quando quiser começar!",
            "Qualquer dúvida, estou aqui."
        ]
    },
    
    apps: {
        boasVindas: [
            "Temos apps incríveis! 📱",
            "Funcionam em Smart TV, celular, tablet e computador.",
            "Os principais são: PlaySim, IPTV Player, Vizzion Play, Blessed Player, Assist+, StarIPTV e IPTV Smarters."
        ],
        perguntas: [
            "Qual dispositivo você usa?",
            "Já tem algum app preferido?",
            "Quer saber como instalar em algum específico?"
        ],
        instrucoes: {
            tv: "Na Smart TV, você pode baixar direto da loja de apps. Procure por 'XCIPTV' ou 'IPTV Smarters'.",
            celular: "No celular, baixe pela Play Store (Android) ou App Store (iPhone). O TiviMate é ótimo!",
            pc: "No computador, pode usar o VLC Media Player ou programas como MyIPTV Player."
        },
        despedida: [
            "Se precisar de ajuda com a instalação, é só falar!",
            "Depois de instalar, é só colocar seus dados de acesso."
        ]
    },
    
    pagamento: {
        boasVindas: [
            "Vamos renovar? 💳",
            "Aceitamos PIX e cartão.",
            "O PIX é a forma mais rápida - a ativação é imediata!"
        ],
        informacoes: [
            "💳 *PIX:* emycom.pix@gmail.com",
            "💳 *Cartão:* https://painelmk21.top"
        ],
        perguntas: [
            "Qual forma de pagamento prefere?",
            "Já fez o pagamento?",
            "Quer que eu te explique o passo a passo?"
        ],
        aposPagamento: [
            "Perfeito! Assim que enviar o comprovante, ativamos na hora.",
            "Pode mandar o comprovante aqui mesmo.",
            "Vou ficar de olho e já ativo pra você 😊"
        ]
    }
};

// ========== FUNÇÃO PRINCIPAL DA IA ==========
async function responderComIA(numero, mensagem) {
    try {
        const mensagemLower = mensagem.toLowerCase();
        const etapaAtual = ETAPA_DO_CLIENTE.get(numero) || { fluxo: 'inicio', passo: 0 };
        let historico = HISTORICO_POR_NUMERO.get(numero) || [];
        
        // ===== DETECTAR OPÇÃO ESCOLHIDA =====
        if (mensagemLower === '1') {
            ETAPA_DO_CLIENTE.set(numero, { fluxo: 'suporte', passo: 0 });
            return "Claro! Vou chamar nosso suporte humano para te atender 😊\n\nEnquanto isso, quer deixar alguma mensagem para o atendente?";
        }
        
        if (mensagemLower === '2') {
            ETAPA_DO_CLIENTE.set(numero, { fluxo: 'teste', passo: 0 });
            return "Ótima escolha! 🎯\n\nNosso teste é gratuito por 1 hora com mais de 15.000 canais.\n\nQuer testar agora? É só digitar *M2*";
        }
        
        if (mensagemLower === '3') {
            ETAPA_DO_CLIENTE.set(numero, { fluxo: 'apps', passo: 0 });
            return "Temos apps incríveis! 📱\n\nFuncionam em Smart TV, celular e computador.\n\nQual dispositivo você usa? (TV, celular, tablet)";
        }
        
        if (mensagemLower === '4') {
            ETAPA_DO_CLIENTE.set(numero, { fluxo: 'pagamento', passo: 0 });
            return "Vamos renovar? 💳\n\nAceitamos PIX (mais rápido), transferência e cartão.\n\nQual forma de pagamento prefere?";
        }
        
        // ===== CONTINUAR NO FLUXO ATUAL =====
        if (etapaAtual.fluxo !== 'inicio') {
            const fluxo = etapaAtual.fluxo;
            const passo = etapaAtual.passo;
            
            // Incrementa passo para não ficar repetitivo
            ETAPA_DO_CLIENTE.set(numero, { fluxo: fluxo, passo: passo + 1 });
            
            // Respostas baseadas no fluxo
            if (fluxo === 'suporte') {
                if (mensagemLower.includes('sim') || mensagemLower.includes('mensagem')) {
                    return "Pode escrever aqui mesmo, que eu repasso ao atendente 😊";
                } else if (mensagemLower.includes('não') || mensagemLower.includes('problema')) {
                    return "Sem problemas! O suporte já vai te chamar em instantes. Fique tranquilo!";
                } else {
                    return "Entendi! Vou repassar isso ao suporte. Eles já vão te atender 😊";
                }
            }
            
            if (fluxo === 'teste') {
                if (mensagemLower === 'm2') {
                    return "Ótimo! Vou gerar seu teste agora mesmo...";
                } else if (mensagemLower.includes('tv') || mensagemLower.includes('celular') || mensagemLower.includes('tablet')) {
                    return "Perfeito! Nosso teste funciona perfeitamente em todos esses dispositivos. É só digitar M2 para começar!";
                } else {
                    return "Legal! O teste é bem simples: digita M2 e já recebe tudo na hora. Quer testar agora?";
                }
            }
            
            if (fluxo === 'apps') {
                if (mensagemLower.includes('tv')) {
                    return "Na Smart TV, você pode baixar direto da loja de apps. Procure por 'XCIPTV' ou 'IPTV Smarters'. Depois de instalar, é só colocar seus dados de acesso!";
                } else if (mensagemLower.includes('celular')) {
                    return "No celular, baixe pela Play Store (Android) ou App Store (iPhone). O TiviMate é um dos melhores! Quer mais dicas?";
                } else if (mensagemLower.includes('computador') || mensagemLower.includes('pc')) {
                    return "No computador, pode usar o VLC Media Player ou programas como MyIPTV Player. São gratuitos e funcionam muito bem!";
                } else {
                    return "Qualquer dispositivo funciona! O importante é ter um bom app. Recomendo XCIPTV ou TiviMate. Já conhece algum desses?";
                }
            }
            
            if (fluxo === 'pagamento') {
                if (mensagemLower.includes('pix')) {
                    return "Ótima escolha! O PIX é instantâneo. A chave é: emycom.pix@gmail.com\n\nApós o pagamento, pode mandar o comprovante aqui mesmo que já ativamos!";
                } else if (mensagemLower.includes('cartão') || mensagemLower.includes('cartao')) {
                    return "Para cartão, use o link: https://painelmk21.top\n\nÉ seguro e você pode parcelar! Depois do pagamento, me avise aqui.";
                } else if (mensagemLower.includes('transferência')) {
                    return "Para transferência:\nBanco Itaú\nAg: 1234\nCC: 56789-0\n\nAssim que cair, ativamos na hora!";
                } else if (mensagemLower.includes('comprovante') || mensagemLower.includes('paguei')) {
                    return "Perfeito! Pode enviar o comprovante aqui mesmo. Vou ativar rapidinho pra você!";
                } else {
                    return "Entendi! O PIX é mais rápido, mas aceitamos todas as formas. Qual prefere?";
                }
            }
        }
        
        // ===== PRIMEIRA MENSAGEM OU SEM FLUXO =====
        if (historico.length === 0) {
            const mensagemBoasVindas = "Oi 😊 Seja bem-vindo à EMYCOM PLAY!\n\nMe conta uma coisa… você quer economizar ou quer mais variedade?";
            return mensagemBoasVindas;
        }
        
        // ===== RESPOSTA PADRÃO =====
        return "Entendi! 😊 Como posso ajudar você hoje? Você pode digitar 1, 2, 3 ou 4 para opções, ou M2 para teste grátis.";
        
    } catch (error) {
        console.error('❌ Erro na IA:', error.message);
        return "Desculpe, tive um probleminha. Pode repetir? 😊";
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
        console.log(`🌐 Chamando API M2 para ${numero}...`);
        
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

// ========== STATUS PAINEL ==========
async function atualizarStatus(online, numero = null) {
    try {
        await axios.post('http://localhost:3000/api/bot/status', { online, numero });
    } catch (e) {}
}

// ========== EVENTOS ==========
client.on('qr', (qr) => {
    console.log('\n📱 ESCANEIE O QR CODE:\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('✅ Bot conectado!', client.info.wid.user);
    await atualizarStatus(true, client.info.wid.user);
    console.log('👤 Admin:', ADMIN_NUMBERS.map(n => n.split('@')[0]).join(', '));
    
    // Publicar primeira imagem após 10 segundos
    setTimeout(publicarImagemAleatoria, 10000);
    
    // Agendar publicações de imagem a cada 4 horas
    setInterval(publicarImagemAleatoria, 4 * 60 * 60 * 1000);
    
    console.log('🖼️ Publicação de imagens no status agendada a cada 4 horas');
    console.log('🤖 IA ativa apenas para conversas privadas');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Falha na autenticação:', msg);
});

client.on('disconnected', async (reason) => {
    console.log('🔴 Desconectado:', reason);
    await atualizarStatus(false);
    setTimeout(() => client.initialize(), 10000);
});

// ========== MENSAGENS ==========
client.on('message', async (msg) => {
    // 1. IGNORAR MENSAGENS DO PRÓPRIO BOT
    if (msg.fromMe) return;
    
    // 2. IGNORAR GRUPOS COMPLETAMENTE
    if (msg.from.endsWith('@g.us')) {
        console.log(`⏭️ Ignorando mensagem de grupo: ${msg.from}`);
        return;
    }
    
    // 3. IGNORAR STATUS (já são tratados separadamente)
    if (msg.from === 'status@broadcast') {
        return;
    }
    
    const texto = msg.body.trim();
    const textoLower = texto.toLowerCase();
    const numero = msg.from;
    const numeroLimpo = numero.split('@')[0];
    const chatId = msg.from;
    
    console.log(`📨 [${numeroLimpo}]: ${texto}`);

    // ===== DETECTAR RESPOSTA DO ADMIN =====
    // Se for admin, marca que humano assumiu e NÃO responde
    if (isAdmin(numero)) {
        console.log(`👤 Admin ${numeroLimpo} enviou mensagem - marcando chat como humano`);
        humanoAssumiuChat(chatId);
        return; // IMPORTANTE: não responder
    }
    
    // ===== VERIFICAR SE PODE RESPONDER =====
    if (!iaPodeResponder(chatId)) {
        console.log(`🤖 IA silenciada no chat ${chatId} (humano já está falando)`);
        return;
    }

    // Cancelar follow-ups se o cliente respondeu
    if (FOLLOW_UP_TIMERS.has(chatId + '_cancel')) {
        const { timers } = FOLLOW_UP_TIMERS.get(chatId + '_cancel');
        timers.forEach(t => clearTimeout(t));
        FOLLOW_UP_TIMERS.delete(chatId + '_cancel');
        console.log(`⏰ Follow-ups cancelados para ${numeroLimpo}`);
    }

    // Comando manual do admin para publicar imagem
    if (textoLower === 'postar' && numeroLimpo === '551137777212') {
        await msg.reply('📸 Publicando imagem no status...');
        await publicarImagemAleatoria();
        await msg.reply('✅ Imagem publicada!');
        return;
    }

    // ===== COMANDO M2 (sempre disponível) =====
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

    // ===== RESPOSTA DA IA =====
    const respostaIA = await responderComIA(numero, texto);
    if (respostaIA) {
        await msg.reply(respostaIA);
        
        let historico = HISTORICO_POR_NUMERO.get(numero) || [];
        historico.push({ role: 'user', content: texto });
        historico.push({ role: 'assistant', content: respostaIA });
        if (historico.length > 20) {
            historico = historico.slice(-20);
        }
        HISTORICO_POR_NUMERO.set(numero, historico);
    }
});

// ========== DETECTAR RESPOSTAS DO ADMIN PARA MARCAR CHAT COMO HUMANO ==========
client.on('message', async (msg) => {
    // Só processa mensagens enviadas pelo bot (admin respondendo)
    if (!msg.fromMe) return;
    
    const chatId = msg.to;
    // Ignora se for grupo ou status
    if (!chatId || chatId.endsWith('@g.us') || chatId === 'status@broadcast') return;
    
    console.log(`👤 Admin respondeu para ${chatId.split('@')[0]} - marcando chat como humano`);
    humanoAssumiuChat(chatId);
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
    console.error('❌ Erro não capturado:', err);
});