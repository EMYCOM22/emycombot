const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/admin', express.static('admin'));

// Garantir que o arquivo de configuração existe
const configPath = './bot-config.json';
if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({ comandos: {}, testes: {} }, null, 2));
}

// ========== API DE COMANDOS ==========

// Buscar todos os comandos
app.get('/api/bot/comandos', (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        res.json(config.comandos || {});
    } catch (error) {
        res.json({});
    }
});

// Buscar um comando específico
app.get('/api/bot/comandos/:nome', (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        res.json(config.comandos[req.params.nome] || { resposta: '', ativo: true });
    } catch (error) {
        res.json({ resposta: '', ativo: true });
    }
});

// Salvar/atualizar comando (COM MODO INCLUÍDO)
app.post('/api/bot/comandos/:nome', (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        if (!config.comandos) config.comandos = {};
        
        config.comandos[req.params.nome] = {
            resposta: req.body.resposta || '',
            modo: req.body.modo || 'escrita_exata',  // <<< CAMPO MODO ADICIONADO
            ativo: req.body.ativo !== false
        };
        
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Deletar comando
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

// Status do bot
let botStatus = { online: true, numero: "5511999999999" };
app.get('/api/bot/status', (req, res) => res.json(botStatus));
app.post('/api/bot/status', (req, res) => {
    botStatus = { ...botStatus, ...req.body, online: true };
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em: http://localhost:${PORT}`);
    console.log(`📁 Configuração: ${configPath}`);
});