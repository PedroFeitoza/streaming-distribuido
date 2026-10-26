# Implantação da aplicação base nos nós

Teste feito em 2026-10-23: a aplicação das etapas 1 e 2 (Express na `PORTA` e rota `/teste-banco` com a biblioteca `pg`) foi instalada em `app-a` (NO_A) e `app-b` (NO_B) e testada contra o banco da `db` ([04-teste-da-db.md](04-teste-da-db.md)).

Código: [`app/server.js`](../../app/server.js), [`app/package.json`](../../app/package.json) e `app/package-lock.json`. Modelo do arquivo de variáveis: [`infra/no/streaming.env.example`](../../infra/no/streaming.env.example).

## O que foi feito em cada nó

Os arquivos foram copiados com `scp` e instalados por um script rodado com `sudo` por SSH (`ssh -t`). A senha do `app_streaming` foi digitada duas vezes, sem eco na tela, e testada no banco **antes** de qualquer alteração. Se a senha estivesse errada, o script parava sem mudar nada.

| Passo | app-a (NO_A) | app-b (NO_B) |
| --- | --- | --- |
| Node / npm | v22.23.4 / 10.9.9 (o Express 5 pede Node 18 ou mais novo) | igual |
| `streaming.service` | `User=streaming`, `WorkingDirectory=/opt/streaming`, `EnvironmentFile=/etc/streaming.env`, `ExecStart=/usr/bin/npm start` | igual |
| Cópia de segurança | `/opt/streaming.bak-20261023` (app de teste e `streaming.env` antigo) | igual |
| Dependências | `npm ci --omit=dev`: 79 pacotes, express 5.3.0, pg 8.23.1 | igual |
| Permissões do código | dono `sdadmin`, grupo `streaming`, arquivos 644, `node_modules` 755 | igual |
| `/etc/streaming.env` | `root:root`, permissão 600; `NOME_DO_NO=NO_A`, `PORTA=3000`, `BANCO_HOST=192.168.56.13`, `BANCO_PORTA=5432`, `BANCO_NOME=streaming`, `BANCO_USUARIO=app_streaming`, `BANCO_SENHA` definida | igual, com `NOME_DO_NO=NO_B` |
| Reinício | `active` e `enabled`; no log, `No NO_A ouvindo na porta 3000` | `No NO_B ouvindo na porta 3000` |

## Testes

| Teste | Comando | Esperado | Obtido |
| --- | --- | --- | --- |
| Rota `/` em cada nó | `curl localhost:3000/` | nome do nó | `Ola! Quem respondeu foi o no NO_A` / `... NO_B` |
| Banco a partir do nó | `curl localhost:3000/teste-banco` | 3 vídeos | `No NO_A: o banco tem 3 videos` / `No NO_B: ...` |
| Balanceamento com banco | 6 vezes `curl http://192.168.56.10/teste-banco` | alterna os nós, sempre 3 vídeos | NO_A, NO_B, NO_A, NO_B, NO_A, NO_B, sempre 3 vídeos |
| Rota `/` pela `lb` | 2 vezes `curl http://192.168.56.10/` | alterna | NO_A, NO_B |
| Início automático | `systemctl is-enabled streaming` | `enabled` | `enabled` nos dois nós |

Os dois nós leem o mesmo banco e devolvem o mesmo número, porque não guardam dados próprios. A aplicação não guarda nada na memória entre requisições; o `Pool` do `pg` guarda só conexões.

## Falhas encontradas

| O que aconteceu | Causa | Solução |
| --- | --- | --- |
| O Claude Code no PC não pôde copiar os arquivos para os nós | Trava de permissões do próprio Claude Code (escrita em shell remoto) | Os comandos `scp` e `ssh -t` foram rodados no PowerShell por quem tem a senha |
| `node_modules` ficou com escrita para o grupo `streaming` na `app-a` | O `npm` criou as pastas com `umask 002`, e o usuário do serviço poderia alterar as bibliotecas | `chmod -R g-w /opt/streaming/node_modules`; o script foi corrigido antes da `app-b` |
| `Sorry, try again` no `sudo` da `app-b` | Senha do `sdadmin` digitada errada | Digitar de novo |

## Pendente

- Teste de queda real de um nó com a aplicação nova (`sudo systemctl stop streaming` em um nó, `curl` pela `lb`, depois `start`).
- Teste de reinício dos nós com a aplicação nova (o serviço deve subir sozinho).
- Apagar `/opt/streaming.bak-20261023` quando o grupo não precisar mais da app de teste.
