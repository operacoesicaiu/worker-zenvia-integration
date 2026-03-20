const axios = require('axios');
const { google } = require('googleapis');

// --- CONFIGURAÇÕES VIA AMBIENTE (GITHUB SECRETS & PAYLOAD) ---
const {
  GOOGLE_TOKEN,          // Payload do GitHub Action
  ZENVIA_ACCESS_TOKEN,   // Secret do Zenvia
  ZENVIA_QUEUE_ID,       // Secret da Fila
  SPREADSHEET_ID,        // Secret da Planilha
  SHEET_NAME             // Secret do Nome da Aba
} = process.env;

// Validação de segurança para o Token do Google
if (!GOOGLE_TOKEN || GOOGLE_TOKEN === 'undefined') {
  console.error("ERRO: GOOGLE_TOKEN nao definido. Verifique o trigger do workflow.");
  process.exit(1);
}

// Configuração de Autenticação Google (OAuth2)
const oauth2Client = new google.auth.OAuth2();
oauth2Client.setCredentials({ access_token: GOOGLE_TOKEN });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

/**
 * Formata datas para o padrão Brasileiro (DD/MM/YYYY HH:mm:ss)
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
  console.log(`INICIANDO SYNC (ZENVIA VOICE): ${new Date().toLocaleString('pt-BR')}`);

  try {
    // 1. JANELA DE 10 DIAS (Igual ao solicitado)
    const dataFim = new Date();
    const dataInicio = new Date();
    dataInicio.setDate(dataFim.getDate() - 10);

    const data_inicio = dataInicio.toISOString().split('T')[0];
    const data_fim = dataFim.toISOString().split('T')[0];

    console.log(`Janela de busca: ${data_inicio} ate ${data_fim}`);

    // 2. BUSCA NA ZENVIA VOICE API 
    // Se houver queue_id, usa o endpoint de relatório de fila, senão o geral.
    const endpoint = ZENVIA_QUEUE_ID 
      ? `https://voice-api.zenvia.com/fila/${ZENVIA_QUEUE_ID}/relatorio`
      : `https://voice-api.zenvia.com/chamada/relatorio`;

    const response = await axios.get(endpoint, {
      params: {
        data_inicio: data_inicio,
        data_fim: data_fim,
        limite: 200
      },
      headers: { 
        'Access-Token': ZENVIA_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    // A Zenvia Voice API retorna os dados dentro de dados.relatorio
    const chamadas = response.data?.dados?.relatorio || response.data?.dados || [];
    
    console.log(`API Retornou: ${chamadas.length} registros.`);

    if (chamadas.length === 0) {
      console.log("Nada para processar. Finalizando.");
      return;
    }

    // DEBUG para conferir estrutura
    console.log("ESTRUTURA DO 1º ITEM:", JSON.stringify(chamadas[0], null, 2));

    // 3. MAPEAMENTO (Baseado no seu export_to_excel.py)
    const rows = chamadas.map(item => {
      const fila_data_inicio = item.fila?.data_inicio || "";
      const ramal_numero = item.ramal?.numero || "";
      
      return [
        item.id || "",                          // ID
        formatarParaBR(item.data_inicio),       // Data/Hora
        formatarParaBR(item.data_inicio),       // Início Origem
        formatarParaBR(fila_data_inicio),       // Fim Origem (ou início destino)
        item.numero_origem || "",               // Origem
        item.numero_destino || "",              // Destino
        ramal_numero,                           // Ramal
        item.status || "",                      // Status
        item.duracao || "0",                    // Duracao
        item.tempo_espera || "0",               // Espera
        item.url_gravacao || ""                 // Link Gravacao
      ];
    });

    // 4. GRAVAÇÃO NO GOOGLE SHEETS
    console.log(`Gravando ${rows.length} linhas na aba: ${SHEET_NAME}`);
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A2`,
      valueInputOption: 'USER_ENTERED', 
      requestBody: { values: rows },
    });

    console.log("Sincronizacao concluida com sucesso.");

  } catch (error) {
    console.error("ERRO NO PROCESSO:");
    if (error.response) {
      console.error(`Status API: ${error.response.status}`);
      console.error(`Mensagem:`, error.response.data);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

runIntegration();
