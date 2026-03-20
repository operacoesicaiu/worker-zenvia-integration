const axios = require('axios');
const { google } = require('googleapis');

const {
  GOOGLE_TOKEN,
  ZENVIA_ACCESS_TOKEN,
  ZENVIA_QUEUE_ID,
  SPREADSHEET_ID,
  SHEET_NAME
} = process.env;

if (!GOOGLE_TOKEN || GOOGLE_TOKEN === 'undefined') {
  console.error("ERRO: GOOGLE_TOKEN nao definido.");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2();
oauth2Client.setCredentials({ access_token: GOOGLE_TOKEN });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

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
    }).replace(',', '');
  } catch (e) {
    return dataISO;
  }
};

async function runIntegration() {
  console.log(`INICIANDO SYNC HISTORICO COMPLETO: ${new Date().toLocaleString('pt-BR')}`);

  try {
    const dataFim = new Date(); 
    dataFim.setDate(dataFim.getDate() - 1); // Agora dataFim é ontem

    const dataInicio = new Date(dataFim); // dataInicio também é ontem

    const dsInicio = dataInicio.toISOString().split('T')[0];
    const dsFim = dataFim.toISOString().split('T')[0];

    console.log(`Buscando apenas o dia: ${dsInicio}`);

    const allCalls = [];
    let posicao = 0;
    const limite = 200;

    console.log(`Buscando de ${dsInicio} ate ${dsFim}`);

    while (true) {
      const endpoint = ZENVIA_QUEUE_ID 
        ? `https://voice-api.zenvia.com/fila/${ZENVIA_QUEUE_ID}/relatorio`
        : `https://voice-api.zenvia.com/chamada/relatorio`;

      console.log(`Requisitando posicao: ${posicao}`);
      
      const response = await axios.get(endpoint, {
        params: {
          data_inicio: dsInicio,
          data_fim: dsFim,
          posicao: posicao,
          limite: limite
        },
        headers: { 
          'Access-Token': ZENVIA_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      });

      const calls = response.data?.dados?.relatorio || [];
      if (calls.length === 0) break;

      allCalls.push(...calls);

      if (calls.length < limite) break;
      posicao += limite;
      
      // NOVA TRAVA: 500k registros (ajuste se precisar de mais)
      if (posicao > 500000) {
        console.warn("Limite de seguranca de 500k atingido.");
        break;
      }
    }

    console.log(`Total capturado: ${allCalls.length} registros.`);

    if (allCalls.length === 0) return;

    // Mapeamento para o padrao icaiu_telefonia
    const rows = allCalls.map(item => {
      const fila_data_inicio = item.fila?.data_inicio || "";
      const ramal_numero = item.ramal?.numero || "";
      const atendida = item.atendida ? "Atendida" : "Não atendida";

      return [
        item.id || "",                          // ID (A)
        formatarParaBR(item.data_inicio),       // Data/Hora (B)
        formatarParaBR(item.data_inicio),       // Data/Hora Início Origem (C)
        formatarParaBR(fila_data_inicio),       // Data/Hora Fim Origem (D)
        formatarParaBR(fila_data_inicio),       // Data/Hora Início Destino (E)
        formatarParaBR(fila_data_inicio),       // Data/Hora Fim Destino (F)
        item.numero_origem || "",               // Origem (G)
        item.numero_destino || "",              // Destino (H)
        ramal_numero,                           // RAMAL (I)
        ramal_numero,                           // Agente Ramal (J)
        item.status || "",                      // Status (K)
        item.status || "",                      // Status Origem (L)
        item.status || "",                      // Status Destino (M)
        item.url_gravacao ? "Disponível" : "Não disponível", // Status Gravação (N)
        item.duracao || "0",                    // Duracao (min) (O)
        item.tempo_espera || "0",               // Espera (min) (P)
        item.tempo_espera || "0",               // Tempo Ring Origem (Q)
        item.tempo_espera || "0",               // Tempo Ring Destino (R)
        item.tempo_espera || "0",               // Tempo Espera Fila (S)
        atendida,                               // Motivo Desconexao Origem (T)
        atendida,                               // Motivo Desconexao Destino (U)
        item.ramal?.id || "",                   // Ramal ID Origem (X)
        item.id || "",                          // CDR ID Origem (Y)
        item.id || "",                          // CDR ID Destino (Z)
        item.fila?.id || "",                    // Fila ID (AA)
        item.url_gravacao || "",                // Gravação (AD)
        item.id || "",                          // Gravação ID (AE)
        item.ativa || "",                       // Ativa (AI)
      ];
    });

    // Envio em blocos de 5000 para nao estourar o Google
    const chunk_size = 5000;
    for (let i = 0; i < rows.length; i += chunk_size) {
      const chunk = rows.slice(i, i + chunk_size);
      console.log(`Enviando bloco ${Math.floor(i/chunk_size) + 1} para o Sheets...`);
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A2`,
        valueInputOption: 'USER_ENTERED', 
        requestBody: { values: chunk },
      });
    }

    console.log("Carga completa de 2025 ate hoje realizada com sucesso.");

  } catch (error) {
    console.error("ERRO NO PROCESSO:");
    console.error(error.response ? JSON.stringify(error.response.data) : error.message);
    process.exit(1);
  }
}

runIntegration();
