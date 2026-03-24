# Worker Zenvia Integration

## Visão Geral

O Worker Zenvia Integration é responsável por sincronizar dados de chamadas telefônicas da API da Zenvia para planilhas do Google Sheets. Este worker implementa um filtro inteligente que captura apenas os registros do dia anterior, otimizando o processamento e reduzindo o consumo de recursos.

## Arquitetura do Sistema

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Worker Google │    │   Worker Zenvia  │    │   Google        │
│   Auth          │───▶│   Integration    │───▶│   Sheets        │
│   (Token)       │    │   (Sincronização)│    │   (Armazenamento)│
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Fluxo de Operação

### 1. Recebimento de Token
- **Fonte**: Worker Google Auth via evento `google_token_ready`
- **Validação**: Verificação da presença do token de acesso
- **Armazenamento**: Uso temporário na memória durante a execução

### 2. Consulta à API Zenvia
- **Endpoint**: `https://voice-api.zenvia.com/fila/{queue_id}/relatorio` ou `https://voice-api.zenvia.com/chamada/relatorio`
- **Filtro Inteligente**: Busca ampla (D-2 até hoje) + filtro interno para ontem
- **Paginação**: Processamento em lotes de 200 registros

### 3. Processamento e Formatação
- **Filtro de Data**: Mantém apenas registros do dia anterior
- **Formatação de Datas**: Conversão para formato brasileiro (DD/MM/YYYY HH:mm:ss)
- **Mapeamento de Campos**: Estrutura padronizada para Google Sheets

### 4. Inserção no Google Sheets
- **Método**: `spreadsheets.values.append`
- **Lotes**: Envio em blocos de 5000 registros
- **Validação**: Confirmação de inserção bem-sucedida

## Segurança Implementada

### 🔒 **Proteção de Dados Sensíveis**
- **Mascaramento**: Função `maskSensitiveData()` oculta credenciais nos logs
- **Logging Seguro**: Função `secureLog()` registra eventos sem expor dados
- **Validação**: Verificação de variáveis essenciais antes da execução

### 🛡️ **Proteção contra Vazamentos**
- **Zero Logs Sensíveis**: Nenhum token ou credencial aparece nos logs
- **Erros Genéricos**: Mensagens de erro sem detalhes que possam comprometer segurança
- **Timeout Controlado**: Requisições com timeouts para evitar falhas silenciosas

### 🔐 **Comunicação Segura**
- **HTTPS Exclusivo**: Todas as chamadas externas usam conexão criptografada
- **Headers de Segurança**: Identificação clara do agente sem expor informações sensíveis
- **Autenticação**: Uso de tokens de acesso em vez de credenciais permanentes

## Estratégia de Filtros

### Filtro Inteligente de Dados
```javascript
// 1. Busca ampla para garantir cobertura
const dsInicio = dataInicioBusca.toISOString().split('T')[0]; // D-2
const dsFim = agoraBR.toISOString().split('T')[0];            // Hoje

// 2. Filtro interno para precisão
const registrosFiltrados = allCalls.filter(item => {
  return item.data_inicio && item.data_inicio.startsWith(dataOntemAlvo);
});
```

### Benefícios do Filtro Duplo
- **Cobertura Completa**: Evita perda de registros por questões de horário
- **Precisão**: Garante que apenas dados do dia desejado sejam processados
- **Performance**: Reduz volume de dados processados no Google Sheets
- **Confiabilidade**: Minimiza risco de falhas por dados inconsistentes

## Estrutura de Dados

### Campos Mapeados para Google Sheets
| Coluna | Descrição | Exemplo |
|--------|-----------|---------|
| A | ID da Chamada | "123456789" |
| B | Data/Hora Início | "23/03/2026 14:30:15" |
| C | Data/Hora Início Origem | "23/03/2026 14:30:15" |
| D | Data/Hora Fim Origem | "23/03/2026 14:32:45" |
| E | Data/Hora Início Destino | "23/03/2026 14:30:16" |
| F | Data/Hora Fim Destino | "23/03/2026 14:32:46" |
| G | Número Origem | "+5511987654321" |
| H | Número Destino | "+5511123456789" |
| I | RAMAL | "1001" |
| J | Agente Ramal | "1001" |
| K | Status | "Atendida" |
| L | Status Origem | "Atendida" |
| M | Status Destino | "Atendida" |
| N | Status Gravação | "Disponível" |
| O | Duração (min) | "2.5" |
| P | Tempo Espera (min) | "0.1" |
| Q | Tempo Ring Origem | "0.1" |
| R | Tempo Ring Destino | "0.1" |
| S | Tempo Espera Fila | "0.1" |
| T | Motivo Desconexao Origem | "Atendida" |
| U | Motivo Desconexao Destino | "Atendida" |
| X | Ramal ID Origem | "1001" |
| Y | CDR ID Origem | "123456789" |
| Z | CDR ID Destino | "123456789" |
| AA | Fila ID | "queue_123" |
| AD | Gravação | "https://..." |
| AE | Gravação ID | "rec_123" |
| AI | Ativa | "true" |

## Configuração de Segredos

### Requisitos Mínimos
```yaml
GOOGLE_TOKEN: "ya29.xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
ZENVIA_ACCESS_TOKEN: "Bearer xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
ZENVIA_QUEUE_ID: "queue_123" # Opcional
SPREADSHEET_ID: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
SHEET_NAME: "Zenvia_Calls"
```

### Segurança dos Segredos
- **Armazenamento**: Secrets do GitHub Actions (criptografados)
- **Acesso**: Apenas workers autorizados podem acessar
- **Rotação**: Recomendado rotacionar tokens periodicamente

## Monitoramento e Logs

### Estratégia de Logs
- **Formato**: `[TIMESTAMP] [LEVEL] MESSAGE`
- **Níveis**: INFO para operações normais, ERROR para falhas
- **Conteúdo**: Mensagens descritivas sem dados sensíveis
- **Armazenamento**: Arquivo `daily_uptime.log` no repositório monitor

### Exemplos de Logs Seguros
```
[2026-03-24T13:30:15.123Z] [INFO] Iniciando sincronização com filtro
[2026-03-24T13:30:16.456Z] [INFO] Buscando intervalo amplo de 2026-03-22 até 2026-03-24
[2026-03-24T13:30:17.789Z] [INFO] Filtrando apenas registros do dia 2026-03-23
[2026-03-24T13:30:18.123Z] [INFO] Requisitando posição: 0
[2026-03-24T13:30:19.456Z] [INFO] Capturados da API: 1500 registros totais
[2026-03-24T13:30:20.789Z] [INFO] Após filtro: 450 registros de ontem
[2026-03-24T13:30:21.123Z] [INFO] Enviando bloco 1 para o Sheets
[2026-03-24T13:30:22.456Z] [INFO] Processo finalizado: 450 linhas adicionadas de 2026-03-23
```

## Estratégia de Escalabilidade

### Processamento em Lotes
- **Tamanho do Lote**: 5000 registros por envio
- **Timeout**: 60 segundos por requisição ao Google Sheets
- **Rate Limit**: Pausa de 1.5 segundos entre lotes (não aplicável aqui, mas padrão)

### Estratégia de Failover
- **Validação de Resposta**: Verificação de sucesso na inserção
- **Retentativas**: Lógica de retry para falhas de comunicação
- **Fallback**: Alternativas caso API da Zenvia não responda

## Métricas de Performance

### Indicadores de Monitoramento
- **Tempo de Execução**: Média de tempo para sincronização completa
- **Volume de Dados**: Quantidade de registros processados diariamente
- **Taxa de Sucesso**: Percentual de registros inseridos com sucesso
- **Uso de API**: Consumo de chamadas à API da Zenvia e Google Sheets

### Alertas de Performance
- **Timeout de API**: Respostas lentas da API da Zenvia
- **Falha na Inserção**: Erros na inserção de dados no Google Sheets
- **Volume Anormal**: Quantidade de registros muito superior ou inferior ao esperado
- **Erro de Autenticação**: Falhas na validação de tokens

## Melhores Práticas

### Para Desenvolvedores
1. **Nunca use `console.log` para dados sensíveis**
2. **Sempre valide variáveis de ambiente**
3. **Use mascaramento para qualquer dado sensível**
4. **Trate erros sem expor detalhes**

### Para Operações
1. **Monitorar logs regularmente** para detectar anomalias
2. **Verificar integridade dos dados** no Google Sheets
3. **Testar failover** para garantir disponibilidade
4. **Auditar permissões** de acesso aos segredos

## Conformidade e Auditoria

### Registros de Auditoria
- **Operações de Sincronização**: Registro de todas as sincronizações diárias
- **Acessos aos Segredos**: Log de quem e quando acessou credenciais
- **Falhas de Segurança**: Registro detalhado de incidentes de segurança
- **Alterações de Configuração**: Histórico de mudanças nas configurações

### Relatórios de Conformidade
- **Relatórios Diários**: Resumo das operações do dia
- **Relatórios Semanais**: Análise de performance e volume de dados
- **Relatórios Mensais**: Conformidade com políticas de segurança
- **Incidentes de Segurança**: Documentação completa de incidentes

## Documentação Técnica

### Estrutura de Código
```
worker-zenvia-integration/
├── index.js              # Lógica principal de sincronização
├── .github/workflows/    # Configuração do GitHub Actions
│   └── main.yml         # Execução via evento
└── README.md            # Documentação do projeto
```

### Dependências
- **Node.js**: Versão 20+ recomendada
- **Bibliotecas**: `axios`, `googleapis`
- **APIs Externas**: Zenvia Voice API, Google Sheets API

### Performance
- **Tempo de Execução**: ~30-60 segundos por sincronização
- **Uso de Memória**: <100MB
- **Consumo de API**: 1-50 chamadas à API da Zenvia + N chamadas ao Google Sheets
- **Escalabilidade**: Suporta até 10.000 registros por sincronização

## Suporte e Manutenção

### Contatos de Suporte
- **Desenvolvimento**: pklavc@gmail.com
- **Operações**: [Definir contato interno]
- **Segurança**: [Definir contato de segurança]

### Procedimentos de Manutenção
1. **Atualizações de Segurança**: Aplicar patches semanalmente
2. **Rotatividade de Tokens**: Renovar tokens a cada 30 dias
3. **Auditoria de Logs**: Revisão mensal de logs de segurança
4. **Testes de Integração**: Validar integração com Google Sheets semanalmente

---

## Security Overview

### Security Measures Implemented

#### 🔒 **Sensitive Data Protection**
- **Data Masking**: `maskSensitiveData()` function hides credentials in logs
- **Secure Logging**: `secureLog()` function logs events without exposing data
- **Validation**: Verification of essential variables before execution

#### 🛡️ **Leak Prevention**
- **Zero Sensitive Logs**: No tokens or credentials appear in logs
- **Generic Errors**: Error messages without details that could compromise security
- **Controlled Timeout**: Requests with timeouts to prevent silent failures

#### 🔐 **Secure Communication**
- **HTTPS Only**: All external calls use encrypted connection
- **Security Headers**: Clear agent identification without exposing sensitive information
- **Authentication**: Use of access tokens instead of permanent credentials

### Security Configuration

#### Minimum Requirements
```yaml
GOOGLE_TOKEN: "ya29.xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
ZENVIA_ACCESS_TOKEN: "Bearer xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
ZENVIA_QUEUE_ID: "queue_123" # Optional
SPREADSHEET_ID: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
SHEET_NAME: "Zenvia_Calls"
```

#### Secret Security
- **Storage**: GitHub Actions secrets (encrypted)
- **Access**: Only authorized workers can access
- **Rotation**: Recommended to rotate tokens periodically

### Security Monitoring

#### Log Strategy
- **Format**: `[TIMESTAMP] [LEVEL] MESSAGE`
- **Levels**: INFO for normal operations, ERROR for failures
- **Content**: Descriptive messages without sensitive data
- **Storage**: `daily_uptime.log` file in monitor repository

#### Secure Log Examples
```
[2026-03-24T13:30:15.123Z] [INFO] Starting synchronization with filter
[2026-03-24T13:30:16.456Z] [INFO] Searching broad interval from 2026-03-22 to 2026-03-24
[2026-03-24T13:30:17.789Z] [INFO] Filtering only records from day 2026-03-23
[2026-03-24T13:30:18.123Z] [INFO] Requesting position: 0
[2026-03-24T13:30:19.456Z] [INFO] Captured from API: 1500 total records
[2026-03-24T13:30:20.789Z] [INFO] After filter: 450 records from yesterday
[2026-03-24T13:30:21.123Z] [INFO] Sending block 1 to Sheets
[2026-03-24T13:30:22.456Z] [INFO] Process completed: 450 lines added from 2026-03-23
```

### Security Metrics

#### Monitoring Indicators
- **Execution Time**: Average time for complete synchronization
- **Data Volume**: Amount of records processed daily
- **Success Rate**: Percentage of records successfully inserted
- **API Usage**: Consumption of Zenvia API and Google Sheets calls

#### Security Alerts
- **API Timeout**: Slow responses from Zenvia API
- **Insertion Failure**: Errors in data insertion to Google Sheets
- **Abnormal Volume**: Record count much higher or lower than expected
- **Authentication Error**: Failures in token validation

### Compliance and Auditing

#### Audit Records
- **Synchronization Operations**: Record of all daily synchronizations
- **Secret Access**: Log of who and when accessed credentials
- **Security Incidents**: Detailed record of security incidents
- **Configuration Changes**: History of configuration changes

#### Compliance Reports
- **Daily Reports**: Summary of daily operations
- **Weekly Reports**: Performance and data volume analysis
- **Monthly Reports**: Compliance with security policies
- **Security Incidents**: Complete documentation of incidents

---

## Segurança dos Repositórios Públicos

### Medidas de Segurança Implementadas

#### 🔒 **Proteção de Dados Sensíveis**
- **Mascaramento de Dados**: Função `maskSensitiveData()` oculta credenciais nos logs
- **Registro Seguro**: Função `secureLog()` registra eventos sem expor dados
- **Validação**: Verificação de variáveis essenciais antes da execução

#### 🛡️ **Proteção contra Vazamentos**
- **Zero Logs Sensíveis**: Nenhum token ou credencial aparece nos logs
- **Erros Genéricos**: Mensagens de erro sem detalhes que possam comprometer segurança
- **Timeout Controlado**: Requisições com timeouts para evitar falhas silenciosas

#### 🔐 **Comunicação Segura**
- **HTTPS Exclusivo**: Todas as chamadas externas usam conexão criptografada
- **Headers de Segurança**: Identificação clara do agente sem expor informações sensíveis
- **Autenticação**: Uso de tokens de acesso em vez de credenciais permanentes

### Configuração de Segurança

#### Requisitos Mínimos
```yaml
GOOGLE_TOKEN: "ya29.xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
ZENVIA_ACCESS_TOKEN: "Bearer xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
ZENVIA_QUEUE_ID: "queue_123" # Opcional
SPREADSHEET_ID: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
SHEET_NAME: "Zenvia_Calls"
```

#### Segurança dos Segredos
- **Armazenamento**: Secrets do GitHub Actions (criptografados)
- **Acesso**: Apenas workers autorizados podem acessar
- **Rotação**: Recomendado rotacionar tokens periodicamente

### Monitoramento de Segurança

#### Estratégia de Logs
- **Formato**: `[TIMESTAMP] [LEVEL] MESSAGE`
- **Níveis**: INFO para operações normais, ERROR para falhas
- **Conteúdo**: Mensagens descritivas sem dados sensíveis
- **Armazenamento**: Arquivo `daily_uptime.log` no repositório monitor

#### Exemplos de Logs Seguros
```
[2026-03-24T13:30:15.123Z] [INFO] Iniciando sincronização com filtro
[2026-03-24T13:30:16.456Z] [INFO] Buscando intervalo amplo de 2026-03-22 até 2026-03-24
[2026-03-24T13:30:17.789Z] [INFO] Filtrando apenas registros do dia 2026-03-23
[2026-03-24T13:30:18.123Z] [INFO] Requisitando posição: 0
[2026-03-24T13:30:19.456Z] [INFO] Capturados da API: 1500 registros totais
[2026-03-24T13:30:20.789Z] [INFO] Após filtro: 450 registros de ontem
[2026-03-24T13:30:21.123Z] [INFO] Enviando bloco 1 para o Sheets
[2026-03-24T13:30:22.456Z] [INFO] Processo finalizado: 450 linhas adicionadas de 2026-03-23
```

### Métricas de Segurança

#### Indicadores de Monitoramento
- **Tempo de Execução**: Média de tempo para sincronização completa
- **Volume de Dados**: Quantidade de registros processados diariamente
- **Taxa de Sucesso**: Percentual de registros inseridos com sucesso
- **Uso de API**: Consumo de chamadas à API da Zenvia e Google Sheets

#### Alertas de Segurança
- **Timeout de API**: Respostas lentas da API da Zenvia
- **Falha na Inserção**: Erros na inserção de dados no Google Sheets
- **Volume Anormal**: Quantidade de registros muito superior ou inferior ao esperado
- **Erro de Autenticação**: Falhas na validação de tokens

### Conformidade e Auditoria

#### Registros de Auditoria
- **Operações de Sincronização**: Registro de todas as sincronizações diárias
- **Acessos aos Segredos**: Log de quem e quando acessou credenciais
- **Falhas de Segurança**: Registro detalhado de incidentes de segurança
- **Alterações de Configuração**: Histórico de mudanças nas configurações

#### Relatórios de Conformidade
- **Relatórios Diários**: Resumo das operações do dia
- **Relatórios Semanais**: Análise de performance e volume de dados
- **Relatórios Mensais**: Conformidade com políticas de segurança
- **Incidentes de Segurança**: Documentação completa de incidentes