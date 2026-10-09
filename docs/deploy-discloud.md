# Deploy na Discloud

O workflow `Deploy (Discloud)` atualiza o site `san0` diretamente pela CLI
oficial da Discloud. Ele não usa Docker registry nem acesso SSH.

## Configuração inicial

1. No GitHub, abra **Settings → Environments → production → Environment secrets**.
2. Adicione `DISCLOUD_TOKEN` com o token da API da Discloud. Não coloque o token
   no repositório, em `discloud.config` ou em mensagens de log.
3. Na Discloud, confirme que a aplicação/site existente tem o ID `san0` e que
   as variáveis de produção necessárias estão configuradas no painel.
4. Faça push para `main` ou execute **Deploy (Discloud) → Run workflow** na aba
   Actions do GitHub.

O arquivo `discloud.config` fica na raiz do monorepo. A Discloud executa o build
dos workspaces e inicia a API, que também serve o frontend compilado.

O workflow chama `discloud app commit` para atualizar a aplicação existente.
Para o primeiro envio de uma aplicação nova, use o fluxo de upload da Discloud
e depois confirme o ID atribuído no `discloud.config`.

Após cada deploy pelo GitHub Actions, o chat responde ao pedido **"versão do
site"** com o SHA completo do commit e o horário UTC do pacote enviado. Compare
esse SHA com o commit da execução em **Actions** para confirmar qual código foi
publicado. Um build local mostra `local` até ser enviado pelo workflow.
