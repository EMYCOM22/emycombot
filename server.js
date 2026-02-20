const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/admin', express.static('admin'));

// Caminhos dos arquivos
const configPath = './bot-config.json';
const bloqueiosPath = './bloqueios.json';

// Garantir arquivos
if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({ 
        comandos: {}, 
        testes: {
            max_canais: 25,
            timeout: 10,
            mensagem_inicio: "🔍 Analisando...",
            mensagem_sucesso: "✅ {online}/{total} canais online"
        },
        bloqueio: {
            dias: 15,
            ativo: true,
            mensagem: "🔒 *ACESSO BLOQUEADO*\n\nEste número já realizou um teste recentemente.\n\n📅 Próximo teste disponível: {data}"
        }
    }, null, 2));
}

if (!fs.existsSync(bloqueiosPath)) {
    fs.writeFileSync(bloqueiosPath, JSON.stringify({}));
}

// ========== API DE COMANDOS ==========

app.get('/api/bot/comandos', (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        res.json(config.comandos || {});
    } catch (error) {
        res.json({});
    }
});

app.get('/api/bot/comandos/:nome', (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        res.json(config.comandos[req.params.nome] || { resposta: '', ativo: true });
    } catch (error) {
        res.json({ resposta: '', ativo: true });
    }
});

app.post('/api/bot/comandos/:nome', (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (!config.comandos) config.comandos = {};
        
        config.comandos[req.params.nome] = {
            resposta: req.body.resposta || '',
            modo: req.body.modo || 'escrita_exata',
            ativo: req.body.ativo !== false
        };
        
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/bot/comandos/:nome', (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.comandos && config.comandos[req.params.nome]) {
            delete config.comandos[req.params.nome];
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== API DE CONFIGURAÇÕES DE TESTE ==========

app.get('/api/testes/config', (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        res.json(config.testes || {});
    } catch (error) {
        res.json({});
    }
});

app.post('/api/testes/config', (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config.testes = req.body;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== API DE BLOQUEIO ==========

app.get('/api/bloqueio/config', (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        res.json(config.bloqueio || { dias: 15, ativo: true, mensagem: '' });
    } catch (error) {
        res.json({ dias: 15, ativo: true });
    }
});

app.post('/api/bloqueio/config', (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config.bloqueio = req.body;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/bloqueio/lista', (req, res) => {
    try {
        const bloqueios = JSON.parse(fs.readFileSync(bloqueiosPath, 'utf8'));
        
        const lista = Object.entries(bloqueios).map(([numero, dados]) => {
            const diasRestantes = Math.ceil((dados.expira - Date.now()) / (1000 * 60 * 60 * 24));
            return {
                numero: numero.split('@')[0],
                expira: dados.expira,
                dataExpiracao: dados.data,
                motivo: dados.motivo,
                diasRestantes: diasRestantes > 0 ? diasRestantes : 0
            };
        }).filter(b => b.diasRestantes > 0);
        
        res.json(lista);
    } catch (error) {
        res.json([]);
    }
});

app.delete('/api/bloqueio/:numero', (req, res) => {
    try {
        const numeroCompleto = req.params.numero.includes('@') ? req.params.numero : req.params.numero + '@c.us';
        const bloqueios = JSON.parse(fs.readFileSync(bloqueiosPath, 'utf8'));
        
        if (bloqueios[numeroCompleto]) {
            delete bloqueios[numeroCompleto];
            fs.writeFileSync(bloqueiosPath, JSON.stringify(bloqueios, null, 2), 'utf8');
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Bloqueio não encontrado' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Status do bot - AGORA SEMPRE ONLINE PARA TESTE
let botStatus = { online: true, numero: "Carregando..." };
app.get('/api/bot/status', (req, res) => res.json(botStatus));
app.post('/api/bot/status', (req, res) => {
    // Aceita atualizações mas mantém online
    botStatus = { ...botStatus, ...req.body, online: true };
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em: http://localhost:${PORT}`);
    console.log(`📁 Configurações: ${configPath}`);
    console.log(`🔒 Bloqueios: ${bloqueiosPath}`);
});