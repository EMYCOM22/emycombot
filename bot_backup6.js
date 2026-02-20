const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const axios = require('axios');

console.log('🔄 Iniciando bot...');

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
        // Não espera resposta e não trava se o servidor estiver fora
        axios.post('http://localhost:3000/api/bot/status', { online, numero })
            .catch(() => {});
    } catch (e) {
        // Ignora erros silenciosamente
    }
}

// ========== EVENTOS ==========
client.on('qr', (qr) => {
    console.log('\n📱 ESCANEIE O QR CODE:\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('✅ Bot conectado!', client.info.wid.user);
    await atualizarStatus(true, client.info.wid.user);
    setTimeout(publicarImagemDoDia, 10000);
});

client.on('disconnected', async (reason) => {
    console.log('🔴 Desconectado:', reason);
    await atualizarStatus(false);
    setTimeout(() => client.initialize(), 10000);
});

// ========== MENSAGENS ==========
client.on('message', async (msg) => {
    if (msg.fromMe || msg.from.endsWith('@g.us')) return;
    
    const texto = msg.body.toLowerCase().trim();
    const numero = msg.from;
    const numeroLimpo = numero.split('@')[0];
    
    console.log(`📨 [${numeroLimpo}]: ${texto}`);

    // Comando manual imagem
    if (texto === 'imagem do dia' && numeroLimpo === '551137777212') {
        await msg.reply('📸 Publicando...');
        await publicarImagemDoDia();
        await msg.reply('✅ Publicada!');
        return;
    }

    // Verificar comandos
    for (let [cmd, dados] of Object.entries(config.comandos)) {
        if (dados.ativo && correspondeComando(texto, cmd)) {
            
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
});

// ========== MONITORAR CONFIG ==========
fs.watch(CONFIG_FILE, () => {
    try {
        config = JSON.parse(fs.readFileSync(CONFIG_FILE));
        console.log('🔄 Configuração atualizada');
    } catch (e) {}
});

client.initialize();