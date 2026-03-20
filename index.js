const axios = require('axios');
const { google } = require('googleapis'); // Certifique-se de ter 'googleapis' no package.json

// --- CONFIGURAÇÕES (Use GitHub Secrets para os tokens) ---
const ZENVIA_TOKEN = process.env.ZENVIA_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME; 
const RANGE = `${SHEET_NAME}!A2`;

// Configuração de Autenticação Google (Service Account)
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

/**
 * Formata strings ISO para o padrão Brasileiro (DD/MM/YYYY HH:mm:ss)
 */
const formatarParaBR = (dataISO) => {
  if (!dataISO || dataISO === "null") return "";
  try {
    const data = new Date(dataISO);
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
  console.log(`\nINICIANDO SINCRONIZAÇÃO: ${new Date().toLocaleString('pt-BR')}`);

  try {
    // 1. CALCULAR DATAS (Janela de 10 dias)
    const dataFim = new Date();
    const dataInicio = new Date();
    dataInicio.setDate(dataFim.getDate() - 10);

    const isoInicio = dataInicio.toISOString().split('T')[0];
    const isoFim = dataFim.toISOString().split('T')[0];

    console.log(`Buscando de ${isoInicio} até ${isoFim} (Janela de 10 dias)`);

    // 2. BUSCAR NA API ZENVIA/HABLLA
    const response = await axios.get(`https://api.hablla.com.br/reports/services/summary`, {
      params: { start: isoInicio, end: isoFim },
      headers: { 'Authorization': `Bearer ${ZENVIA_TOKEN}` }
    });

    const chamadas = response.data;
    console.log(`API Retornou: ${Array.isArray(chamadas) ? chamadas.length : 0} registros.`);

    if (!chamadas || chamadas.length === 0) {
      console.log("Nada para processar. Finalizando.");
      return;
    }

    // LOG DE DEBUG DO PRIMEIRO ITEM (Pra você ver os nomes reais das chaves)
    console.log("DEBUG - Estrutura do 1º item:", JSON.stringify(chamadas[0], null, 2));

    // 3. MAPEAR E FORMATAR (Colunas B, C, D, E, F em PT-BR)
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

    // 4. ENVIAR PARA O GOOGLE SHEETS (APPEND)
    console.log(`Enviando ${rows.length} linhas para o Google Sheets...`);
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE,
      valueInputOption: 'USER_ENTERED', // Para o Sheets entender a data como data
      requestBody: { values: rows },
    });

    console.log("Sincronização concluída com sucesso!");

  } catch (error) {
    console.error("ERRO FATAL:");
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Detalhes:`, JSON.stringify(error.response.data));
    } else {
      console.error(error.message);
    }
    process.exit(1); // Força falha no GitHub Actions se der erro
  }
}

runIntegration();
