# Teste local da aplicação completa

Teste feito em 2026-10-26, num PC do grupo, **sem as VMs**: a aplicação das etapas 3 a 7 ([06-aplicacao.md](../01-especificacoes/06-aplicacao.md)) rodando em duas cópias contra um PostgreSQL local. Serve para achar defeitos antes de implantar nos nós; não substitui o teste pela `lb`.

## Ambiente

| Item | Como foi montado |
| --- | --- |
| Banco | PostgreSQL 16 temporário (pacote `embedded-postgres`), apagado no fim |
| Esquema e dados | Os scripts do repositório, na ordem: `01-esquema.sql`, `02-dados-exemplo.sql`, `03-permissoes.sql` |
| Usuário | `app_streaming` com senha de teste e só as permissões do `03-permissoes.sql` |
| Nós | Duas cópias de `app/server.js`: `NO_A` na porta 3101 e `NO_B` na 3102, com as variáveis da seção 3.2 do guia |
| Node | v24 no PC (os nós usam v22) |

Não houve Nginx: as requisições foram feitas direto em cada nó.

## Resultados

| Teste | Esperado | Obtido |
| --- | --- | --- |
| `/` no `NO_A` | 3 vídeos, barra azul, sem cache | Big Buck Bunny 10:34, Sintel 14:48, Tears of Steel 12:14; `background: #1d4ed8`; `Cache-Control: no-store` |
| `/?categoria=2` no `NO_B` | Só a categoria 2 | Só Tears of Steel, botão "Ficção científica" marcado |
| `/?categoria=abc&categoria=1` | Ignora o filtro inválido | 200, catálogo completo |
| `/videos/1` no `NO_A` | Player e reprodução gravada | `iframe` com `youtube.com/embed/aqz-KE-bpKQ`; "Reprodução nº 1 registrada pelo nó NO_A" |
| `INSERT ... RETURNING id` como `app_streaming` | Funciona com as permissões mínimas | Funcionou |
| 8 aberturas, metade em cada nó | Mesma contagem vista pelos dois nós | `/distribuicao` no `NO_A` e no `NO_B`: 4 e 4, 50% cada |
| `/videos/999`, `/videos/abc`, `/videos/99999999999`, `/nada` | 404 com a barra | 404 nos quatro, com a barra do nó |

## Carga

Um script em Node imitou `ab -n 1000 -c 50`, alternando as requisições entre os dois nós como o round-robin:

| Rota | Requisições | Códigos | Req/s | p95 |
| --- | --- | --- | --- | --- |
| `/` | 1000, 50 simultâneas | 1000 × 200 | 744 | 109 ms |
| `/videos/1` | 1000, 50 simultâneas | 1000 × 200 | 915 | 67 ms |

Depois da carga, `/distribuicao` mostrou 504 e 504 (as 8 do teste anterior mais 500 de cada nó). Nenhum erro no log dos nós. Esses números são do PC, não das VMs, e **não servem** para a comparação de um nó contra dois.

## Defeito encontrado: os nós caíam junto com o banco

Com os dois nós no ar, o PostgreSQL foi parado.

| Rodada | O que aconteceu |
| --- | --- |
| Código sem correção | **Os dois processos encerraram** com `Unhandled 'error' event` / `read ECONNRESET`, vindo do `Pool` do `pg` |
| Com `banco.on('error', ...)` | O nó continuou no ar. Log: `Conexao com o banco perdida: read ECONNRESET`. `/` devolveu 500 com a barra em 7 ms; `/nada` continuou dando 404 |
| Banco ligado de novo | O mesmo processo, sem reiniciar, voltou a responder `/teste-banco` e `/videos/2` com 200 |

**Causa:** quando o banco fecha as conexões que estão paradas no `Pool`, a biblioteca emite um evento `error`. Sem ninguém tratando esse evento, o Node encerra o programa. Num reinício da `db`, a `app-a` e a `app-b` cairiam ao mesmo tempo, e a replicação não serviria de nada. A aplicação base implantada em 23/10 tem esse defeito; a versão nova corrige.

Também foi corrigida a mensagem da página de erro, que saía vazia quando o erro não tinha texto (usa o código do erro, como `ECONNREFUSED`).

## Rodada com o ambiente local (`scripts/local`)

O mesmo cenário foi repetido com o [`scripts/local/iniciar.mjs`](../../scripts/local/iniciar.mjs), com o mini balanceador na porta 8080, mandando os comandos pelo terminal e fazendo duas requisições por segundo em `http://localhost:8080/`:

| Momento | Comando | Respostas | `X-Upstream` |
| --- | --- | --- | --- |
| Tudo ligado | — | 200, alternando NO_A e NO_B | `127.0.0.1:3001` / `127.0.0.1:3002` |
| NO_A desligado | `a` | 200, só NO_B, nenhum erro | `127.0.0.1:3001, 127.0.0.1:3002` (tentou o A e passou para o B) |
| Banco desligado | `d` | 500 com a barra do NO_B | — |
| Banco religado | `d` | 200, só NO_B, sem reiniciar o nó | — |
| NO_A religado | `a` | 200, alternando de novo | `127.0.0.1:3001` / `127.0.0.1:3002` |
| Fim | `q` | Banco temporário apagado, portas 8080, 3001, 3002 e 55432 livres | — |

## O que este teste não cobre

- O caminho pela `lb` (Nginx, `max_fails`, `proxy_next_upstream`); o mini balanceador só imita o comportamento.
- A alternância da cor **no navegador** ao recarregar e o player do YouTube abrindo de fato (o teste acima foi com `curl`).
- O `scripts/implantar-app.sh`, que só roda no Ubuntu dos nós. A sintaxe foi conferida com `bash -n`.

Ficam para o teste depois da implantação, descrito em [06-aplicacao.md](../01-especificacoes/06-aplicacao.md#como-testar-depois-de-implantar).
