const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const axios = require('axios');
const ollama = require('ollama').default;

console.log('🔄 Iniciando bot com IA Híbrida...');

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
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

// ========== CONFIGURAÇÃO DA IA ==========
const MODELO_IA = 'gemma3:1b'; // Altere para o modelo que você baixou
const IA_ATIVADA = true; // true = usa IA, false = só comandos
const HISTORICO_POR_NUMERO = new Map(); // Armazena histórico de conversas

// Palavras que indicam desejo de falar com suporte
const PALAVRAS_SUPORTE = [
    'falar com alguém', 'falar com atendente', 'falar com humano',
    'quero atendente', 'quero suporte', 'preciso de ajuda',
    'me ajuda', 'me ajude', 'socorro', 'problema', 'urgente',
    'reclamar', 'falar com gerente', 'falar com pessoa',
    'atendimento', 'suporte humano', 'falar com voce',
    'falar com você', 'quero falar', 'falar com responsável',
    'cancelar', 'reembolso', 'dinheiro de volta', 'problemas',
    'não funciona', 'não está funcionando', 'parou', 'erro',
    'falha', 'bug', 'insatisfeito', 'cancelamento', 'estornar',
    'ajuda', 'help', 'auxílio', 'emergência'
];

// Função para gerar resposta com IA (Ollama local)
async function responderComIA(numero, mensagem) {
    if (!IA_ATIVADA) return null;
    
    try {
        // Verificar se a mensagem contém palavras de suporte
        const mensagemLower = mensagem.toLowerCase();
        const querSuporte = PALAVRAS_SUPORTE.some(palavra => mensagemLower.includes(palavra));
        
        if (querSuporte) {
            console.log(`🔴 Cliente ${numero.split('@')[0]} quer falar com suporte - redirecionando para menu`);
            
            // Mensagem do menu principal (igual ao comando "oi")
            const menuPrincipal = 
                "Seja Bem Vindo ao Grupo EMYCOM PLAY.\n\n" +
                "Digite a opção desejada.\n\n" +
                "1- PARA FALAR COM NOSSO SUPORTE.\n\n" +
                "2- PARA FAZER UM TESTE EM NOSSOS SERVIDORES.\n\n" +
                "3- PARA CONHECER NOSSOS APPS PROPRIOS E PARCEIROS.\n\n" +
                "4- PARA RENOVAR SUA ASSINATURA.";
            
            return menuPrincipal;
        }
        
        // CONTINUA COM A IA NORMAL SE NÃO FOR SUPORTE
        let historico = HISTORICO_POR_NUMERO.get(numero) || [];
        
        // Construir mensagens para o Ollama
        const messages = [
            { 
                role: 'system', 
                content: 'Você é um assistente da Emycom Play, empresa especializada em IPTV e streaming. Seja educado, útil e responda apenas em português. Para informações sobre aplicativos, planos e compatibilidade, sempre use o site oficial: https://mk21.cbstore.top/. Se o usuário perguntar sobre TV box ou aplicativos, direcione para este site. Se não souber algo relacionado a IPTV, direcione para o suporte digitando 1.'
            }
        ];
        
        // Adicionar histórico (últimas 3 trocas para não estourar contexto)
        const ultimasTrocas = historico.slice(-6);
        for (let msg of ultimasTrocas) {
            messages.push(msg);
        }
        
        // Adicionar mensagem atual
        messages.push({ role: 'user', content: mensagem });
        
        console.log(`🤔 IA pensando para ${numero.split('@')[0]}...`);
        
        // Chamar Ollama local 
        const response = await ollama.chat({
            model: MODELO_IA,
            messages: messages,
            options: {
                temperature: 0.7,
                max_tokens: 300
            }
        });
        
        let respostaIA = response.message.content;
        
        // Pós-processamento para garantir o site correto
        if (respostaIA.includes('emcyplay.com') || respostaIA.includes('emycomplay.com')) {
            respostaIA = respostaIA.replace(/https?:\/\/[^\s]+/g, 'https://mk21.cbstore.top/');
            respostaIA = respostaIA.replace(/emycomplay/gi, 'Emycom Play');
        }
        
        // Se perguntou sobre TV box ou apps, garantir que o site seja mencionado
        if (mensagemLower.includes('tv box') || mensagemLower.includes('aplicativo') || 
            mensagemLower.includes('app') || mensagemLower.includes('compatível')) {
            if (!respostaIA.includes('mk21.cbstore.top')) {
                respostaIA += '\n\n📱 Confira nossos aplicativos em: https://mk21.cbstore.top/';
            }
        }
        
        // Atualizar histórico
        historico.push({ role: 'user', content: mensagem });
        historico.push({ role: 'assistant', content: respostaIA });
        
        // Manter apenas últimas 10 mensagens
        if (historico.length > 10) {
            historico = historico.slice(-10);
        }
        HISTORICO_POR_NUMERO.set(numero, historico);
        
        console.log(`✅ IA respondeu para ${numero.split('@')[0]}`);
        return respostaIA;
        
    } catch (error) {
        console.error('❌ Erro na IA:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            return '⚠️ *IA temporariamente indisponível*\n\nO serviço de IA local não está rodando. Digite 1 para falar com suporte.';
        }
        
        return null;
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

// ========== FUNÇÃO M2 COM NÚMERO ==========
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
        
        // Bloquear o número
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

// ========== IMAGEM DO DIA ==========
async function publicarImagemDoDia() {
    try {
        const { MessageMedia } = require('whatsapp-web.js');
        const pasta = './imagens';
        
        if (!fs.existsSync(pasta)) fs.mkdirSync(pasta);
        
        const imagens = fs.readdirSync(pasta).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
        if (imagens.length === 0) return;
        
        const dia = new Date().getDate();
        const img = imagens[(dia - 1) % imagens.length];
        
        const media = MessageMedia.fromFilePath(`${pasta}/${img}`);
        await client.sendMessage('status@broadcast', media, {
            caption: '🎬 TODOS OS STREAMINGS EM UM SÓ LUGAR!'
        });
        
        console.log('✅ Imagem do dia publicada');
    } catch (error) {
        console.error('❌ Erro imagem:', error);
    }
}

// ========== STATUS ==========
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
    
    // Verificar se Ollama está rodando
    try {
        await ollama.list();
        console.log(`🤖 IA Ollama ativa (modelo: ${MODELO_IA})`);
    } catch (e) {
        console.log('⚠️ Ollama não está rodando. IA desativada.');
    }
    
    setTimeout(publicarImagemDoDia, 10000);
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
    if (msg.fromMe || msg.from.endsWith('@g.us')) return;
    
    const texto = msg.body.trim();
    const textoLower = texto.toLowerCase();
    const numero = msg.from;
    const numeroLimpo = numero.split('@')[0];
    
    console.log(`📨 [${numeroLimpo}]: ${texto}`);

    // Comando manual imagem (só seu número)
    if (textoLower === 'imagem do dia' && numeroLimpo === '551137777212') {
        await msg.reply('📸 Publicando...');
        await publicarImagemDoDia();
        await msg.reply('✅ Publicada!');
        return;
    }

    // ===== 1. VERIFICAR COMANDOS NUMÉRICOS (1,2,3,4) =====
    if (textoLower === '1' || textoLower === '2' || textoLower === '3' || textoLower === '4') {
        const comando = config.comandos[textoLower];
        if (comando && comando.ativo) {
            console.log(`✅ Comando numérico: ${textoLower}`);
            await msg.reply(comando.resposta);
            return;
        }
    }

    // ===== 2. VERIFICAR DEMAIS COMANDOS DO PAINEL =====
    for (let [cmd, dados] of Object.entries(config.comandos)) {
        if (dados.ativo && correspondeComando(textoLower, cmd)) {
            
            console.log(`✅ Comando: ${cmd} (modo: ${dados.modo || 'escrita_exata'})`);
            
            // COMANDO M2 (COM BLOQUEIO)
            if (cmd.toLowerCase() === 'm2') {
                
                // Verificar bloqueio
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
            
            // Outros comandos
            await msg.reply(dados.resposta);
            return;
        }
    }

    // ===== 3. SE NÃO FOR COMANDO, USA IA =====
    if (IA_ATIVADA) {
        console.log(`🤖 Usando IA para: ${texto}`);
        
        // Mostrar "digitando"
        await msg.reply('🤖 *IA processando...*');
        
        const respostaIA = await responderComIA(numero, texto);
        
        if (respostaIA) {
            await msg.reply(`🤖 *Emycom AI:*\n\n${respostaIA}`);
        }
    } else {
        console.log(`⏭️ Ignorando: ${texto}`);
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
    console.error('❌ Erro não capturado:', err);
});