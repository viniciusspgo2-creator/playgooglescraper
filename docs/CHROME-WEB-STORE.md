# Publicação na Chrome Web Store — Play Google Scraper v1.0.0

## 1. Pacote
O zip oficial vem do painel (`Extensão → Baixar extensão`) — mas para a loja, use o pacote **sem credenciais embutidas**:
```bash
bun scripts/pack-extension.ts   # gera o zip com apiBase genérico (sem token)
```
Na loja, o `config.template.js` vai com `__API_BASE__`? Não — para publicar, injete a URL de produção fixa (ex.: `https://app.playgooglescraper.com`) no template antes de empacotar; o token o usuário cola na Side Panel (nunca no pacote).

## 2. Permissões declaradas (justificativa obrigatória no review)
| Permissão | Justificativa |
|---|---|
| `storage` | Token de conexão (session only) + preferências + fila local |
| `sidePanel` | Painel de controle da coleta |
| `scripting` | Injeção do content script na aba ativa do Maps |
| `alarms` | Heartbeat/retomada do service worker (MV3 dorme) |
| `host_permissions` (google.com/maps) | A coleta acontece na página do Google Maps que o usuário já está usando |
| `web_accessible_resources` (injected.js) | Leitura do payload de inicialização no MAIN world |

Não há `<all_urls>`, não há coleta de navegação pessoal, não há servidores remotos além da API do próprio tenant.

## 3. Single purpose (política da loja)
"Extrair dados públicos de empresas do Google Maps para prospecção, sob credenciais do usuário, com ritmo humanizado." — descrever exatamente isso no campo *Description*.

## 4. Itens do review
- **Privacy policy:** URL da landing (`/#faq` tem seção LGPD) + página dedicada com uso de dados.
- **Justificativas de host permission:** preencher o formulário com o texto da tabela acima.
- **Screenshots:** side panel conectado, busca rodando com progresso de células, painel web (leads + Kanban).
- **Demo video (YouTube):** fluxo criar token → colar na extensão → busca pequena → lead aparecendo no painel.

## 5. Riscos de política a monitorar
- Scraping pode conflitar com ToS do Google Maps — a store já baniu scrapers agressivos. Mitigação do produto: ritmo humanizado por padrão (Moderado), circuit breaker, coleta apenas de dados públicos, LGPD embutida (opt-out/supressão). Documentar isso na descrição pública reduz risco de remoção.
- Enviar o `README.md` da extensão dentro do zip ajuda o reviewer a reproduzir o fluxo.

## 6. Versionamento
`manifest.json` `version` é a fonte da verdade; a rota de download usa o sufixo `-v1.0.0` no filename — atualize ambos em conjunto (`src/app/api/extension/download/route.ts` → `ZIP_FILENAME`).
