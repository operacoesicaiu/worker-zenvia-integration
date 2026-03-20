const axios = require('axios');
const { google } = require('googleapis');

// --- CONFIGURAÇÕES VIA AMBIENTE (GITHUB SECRETS & PAYLOAD) ---
const {
  GOOGLE_TOKEN,          
  ZENVIA_ACCESS_TOKEN,   
  ZENVIA_QUEUE_ID,       
  SPREADSHEET_ID,       
  SHEET_NAME             
} = process.env;

// Validação de segurança
if (!GOOGLE_TOKEN || GOOGLE_TOKEN === 'undefined') {
  console.error("ERRO: GOOGLE_TOKEN não definido no payload.");
  process.exit(1);
}

// Configuração de Autenticação via Access Token (OAuth2)
const oauth2Client = new google.auth.OAuth2();
oauth2Client.setCredentials({ access_token: GOOGLE_TOKEN });

const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

/**
 * Formata strings ISO para o padrão Brasileiro (DD/MM/YYYY HH:mm:ss)
 */
const formatarParaBR = (dataISO) => {
  if (!dataISO || dataISO === "null" || dataISO === "") return "";
  try {
    const data = new Date(dataISO);
    if (isNaN(data.getTime())) return dataISO;
    return data.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (e) {
    return dataISO;
  }
};

async function runIntegration() {
  console.log(`INICIANDO SINCRONIZAÇÃO: ${new Date().toLocaleString('pt-BR')}`);

  try {
    // 1. CALCULAR DATAS (Janela de 10 dias)
    const dataFim = new Date();
    const dataInicio = new Date();
    dataInicio.setDate(dataFim.getDate() - 10);

    const isoInicio = dataInicio.toISOString().split('T')[0];
    const isoFim = dataFim.toISOString().split('T')[0];

    console.log(`Janela de busca: ${isoInicio} ate ${isoFim}`);

    // 2. BUSCAR NA API ZENVIA/HABLLA
    const response = await axios.get(`https://api.hablla.com.br/reports/services/summary`, {
      params: { 
        start: isoInicio, 
        end: isoFim,
        queueId: ZENVIA_QUEUE_ID 
      },
      headers: { 'Authorization': `Bearer ${ZENVIA_ACCESS_TOKEN}` }
    });

    const chamadas = response.data;
    console.log(`API Retornou: ${Array.isArray(chamadas) ? chamadas.length : 0} registros.`);

    if (!Array.isArray(chamadas) || chamadas.length === 0) {
      console.log("Nada para processar. Finalizando.");
      return;
    }

    // DEBUG para conferir nomes das chaves no log
    console.log("ESTRUTURA DO 1º ITEM:", JSON.stringify(chamadas[0], null, 2));

    // 3. MAPEAMENTO E FORMATAÇÃO (Colunas B, C, D, E, F em PT-BR)
    const rows = chamadas.map(item => [
      item.id || item.uuid || "",             // Coluna A
      formatarParaBR(item.createdAt),         // Coluna B
      formatarParaBR(item.startedAt),         // Coluna C
      formatarParaBR(item.answeredAt),        // Coluna D
      formatarParaBR(item.finishedAt),        // Coluna E
      formatarParaBR(item.closedAt),          // Coluna F
      item.agentName || "N/A",                // Coluna G
      item.customerName || "N/A"              // Coluna H
    ]);

    // 4. ENVIAR PARA O GOOGLE SHEETS
    const range = `${SHEET_NAME}!A2`;
    console.log(`Enviando para a aba: ${SHEET_NAME}...`);
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
      valueInputOption: 'USER_ENTERED', 
      requestBody: { values: rows },
    });

    console.log("Sincronização concluída com sucesso.");

  } catch (error) {
    console.error("ERRO NO PROCESSO:");
    if (error.response) {
      console.error(`Status API: ${error.response.status}`);
      console.error(`Dados:`, JSON.stringify(error.response.data));
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

runIntegration();
