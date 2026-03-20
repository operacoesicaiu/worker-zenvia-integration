const axios = require('axios');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function sanitize(val) {
    if (typeof val !== 'string') return val;
    const formulaChars = ['=', '+', '-', '@'];
    return formulaChars.some(char => val.startsWith(char)) ? `'${val}` : val;
}

async function run() {
    const {
        ZENVIA_ACCESS_TOKEN, ZENVIA_QUEUE_ID,
        SPREADSHEET_ID, SHEET_NAME, GOOGLE_TOKEN
    } = process.env;

    const gHeaders = { 'Authorization': `Bearer ${GOOGLE_TOKEN}`, 'Content-Type': 'application/json' };
    const zHeaders = { 'Access-Token': ZENVIA_ACCESS_TOKEN, 'Content-Type': 'application/json' };

    try {
        // Cálculo de "Ontem" (Formato YYYY-MM-DD para a API Zenvia)
        const dataRef = new Date();
        dataRef.setDate(dataRef.getDate() - 1);
        const dataFiltro = dataRef.toISOString().split('T')[0];
        
        console.log(`--- ETAPA 1: Buscando chamadas de ontem (${dataFiltro}) ---`);

        let allProcessed = [];
        let posicao = 0;
        const limite = 200;

        while (true) {
            const endpoint = ZENVIA_QUEUE_ID 
                ? `https://voice-api.zenvia.com/fila/${ZENVIA_QUEUE_ID}/relatorio`
                : `https://voice-api.zenvia.com/chamada/relatorio`;

            const resp = await axios.get(endpoint, {
                headers: zHeaders,
                params: {
                    posicao: posicao,
                    limite: limite,
                    data_inicio: dataFiltro,
                    data_fim: dataFiltro
                }
            });

            const calls = resp.data?.dados?.relatorio || resp.data?.data || [];
            if (calls.length === 0) break;

            calls.forEach(call => {
                // Mapeamento baseado no seu export_to_excel.py
                const row = [
                    sanitize(call.id),
                    sanitize(call.data_inicio),
                    sanitize(call.numero_origem),
                    sanitize(call.numero_destino),
                    sanitize(call.ramal?.numero || ''),
                    sanitize(call.status),
                    sanitize(call.duracao),
                    sanitize(call.tempo_espera),
                    call.url_gravacao ? 'Disponível' : 'Não disponível',
                    sanitize(call.url_gravacao || '')
                ];
                allProcessed.push(row);
            });

            if (calls.length < limite) break;
            posicao += limite;
            await sleep(500);
        }

        if (allProcessed.length > 0) {
            console.log(`--- ETAPA 2: Enviando ${allProcessed.length} linhas para a aba ${SHEET_NAME} ---`);
            const urlAppend = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A1:append?valueInputOption=USER_ENTERED`;
            
            await axios.post(urlAppend, { values: allProcessed }, { headers: gHeaders });
            console.log("Processo concluído com sucesso!");
        } else {
            console.log("Nenhuma chamada encontrada para ontem.");
        }

    } catch (e) {
        console.error("Falha:", e.response?.data || e.message);
        process.exit(1);
    }
}

run();
