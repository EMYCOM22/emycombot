const axios = require('axios');

async function testar() {
    try {
        console.log('🔍 Testando API com POST...');
        
        const response = await axios.post(
            'https://mk21plataformas.sigma.st/api/chatbot/g516VvQ1jl/ANKWPdyWPR',
            {
                comando: 'teste',
                tipo: 'm2',
                timestamp: new Date().toISOString()
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 10000
            }
        );
        
        console.log('✅ Resposta:');
        console.log(JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        console.log('❌ Erro:', error.message);
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Dados:', error.response.data);
        }
    }
}

testar();