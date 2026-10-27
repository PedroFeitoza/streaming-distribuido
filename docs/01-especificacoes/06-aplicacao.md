# Aplicação: rotas, páginas e implantação

Etapas 3 a 7 da frente da aplicação (tarefas 4 a 8 do guia): catálogo, detalhe com reprodução, registro em `reproducoes`, barra do nó e página de distribuição. A base (Express na `PORTA` e `/teste-banco`) está em [05-implantacao-da-app.md](../03-testes/05-implantacao-da-app.md).

> **Situação em 2026-10-26:** código pronto e testado contra um PostgreSQL 16 local, com os mesmos scripts e permissões da `db` ([06-teste-local-da-app.md](../03-testes/06-teste-local-da-app.md)). **A implantação nos nós está pendente**: precisa da senha do `sudo` da `app-a` e da `app-b`.

## Arquivos

| Arquivo | O que tem |
| --- | --- |
| [`app/server.js`](../../app/server.js) | Leitura das variáveis, conexão com o banco e todas as rotas |
| [`app/views/partes/topo.ejs`](../../app/views/partes/topo.ejs) | Início de toda página: CSS, barra do nó e menu |
| [`app/views/partes/rodape.ejs`](../../app/views/partes/rodape.ejs) | Fim de toda página |
| [`app/views/catalogo.ejs`](../../app/views/catalogo.ejs) | Lista de vídeos com o filtro por categoria |
| [`app/views/video.ejs`](../../app/views/video.ejs) | Detalhe com o player |
| [`app/views/distribuicao.ejs`](../../app/views/distribuicao.ejs) | Contagem de reproduções por nó |
| [`app/views/erro.ejs`](../../app/views/erro.ejs) | Página de erro (404 e 500), também com a barra |
| [`scripts/implantar-app.sh`](../../scripts/implantar-app.sh) | Atualiza a aplicação em um nó (roda no nó, com `sudo`) |
| [`scripts/implantar-app.ps1`](../../scripts/implantar-app.ps1) | Roda o script acima nos dois nós, um de cada vez (roda no Windows) |
| [`scripts/local/iniciar.mjs`](../../scripts/local/iniciar.mjs) | Ambiente de teste no PC, sem as VMs: banco temporário, os dois nós e um mini balanceador |

As páginas usam **EJS**: HTML com trechos de JavaScript. `<%= x %>` escreve o valor de `x` escapando `<`, `>` e aspas, então um título com HTML aparece como texto e não vira código na página. `<%- include('partes/topo') %>` cola o cabeçalho comum.

## Rotas

| Rota | Requisito | O que faz | SQL |
| --- | --- | --- | --- |
| `/` | RF01 | Lista título, categoria e duração (`mm:ss`) | `SELECT` em `categorias` e `videos JOIN categorias` |
| `/?categoria=2` | RF02 | Mesma lista, só da categoria 2 | o mesmo, com `WHERE v.categoria_id = $1` |
| `/videos/:id` | RF03, RF04, RF05 | Detalhe, player e gravação da reprodução | `SELECT` do vídeo e `INSERT INTO reproducoes ... RETURNING id` |
| `/distribuicao` | RF06 | Reproduções por nó, com a porcentagem e as 10 últimas | `GROUP BY no_responsavel` e `ORDER BY id DESC LIMIT 10` |
| `/teste-banco` | — | Texto com o nó e o número de vídeos (da etapa 2) | `SELECT COUNT(*) FROM videos` |
| qualquer outra | — | Página 404 com a barra | — |

Os valores que vêm da URL entram no SQL como parâmetro (`$1`), nunca colados no texto da consulta. Assim um `?categoria=1; DROP TABLE videos` não vira comando no banco. Além disso, o `id` e a categoria só são aceitos se forem números de até 9 dígitos; o resto vira 404 ou "todas as categorias".

## A barra do topo (tarefa 7)

Toda página, inclusive as de erro, começa com `partes/topo.ejs`, que mostra:

```
Respondido pelo nó NO_A (máquina app-a) às 14:03:22
```

- **Cor:** `NO_A` azul (`#1d4ed8`), `NO_B` laranja (`#c2410c`). Um nome diferente (um terceiro nó, por exemplo) fica cinza. Azul e laranja também se distinguem para quem tem daltonismo.
- **Máquina:** vem de `os.hostname()`, ou seja, do próprio Ubuntu, sem nada fixo no código.
- **Hora:** mostra que a página foi gerada de novo a cada recarga.

### Por que não há arquivo de CSS nem favicon

O round-robin do Nginx alterna **cada requisição**, não cada página. Se a página pedisse um `/estilo.css`, cada recarga faria duas requisições, a página e o CSS. Com dois nós, a página cairia sempre no mesmo nó, o CSS sempre no outro, e **a barra nunca mudaria de cor**. O mesmo vale para o `/favicon.ico`, que o navegador pede sozinho.

Por isso o CSS fica dentro do HTML e o ícone é declarado vazio (`<link rel="icon" href="data:,">`): a recarga faz uma requisição só, e a cor alterna. O `Cache-Control: no-store` impede o navegador de mostrar uma página guardada, então a barra sempre mostra quem respondeu agora.

## Sem estado

A aplicação não guarda nada na memória entre requisições. O `Pool` do `pg` guarda só conexões abertas com o banco. O `id` e a `data_hora` de cada reprodução são gerados pelo banco, e a contagem por nó é sempre lida da tabela. A única diferença entre os nós é o `/etc/streaming.env` (`NOME_DO_NO`). Por isso a página `/distribuicao` mostra o mesmo número nos dois nós.

## Reprodução: YouTube ou arquivo local

A coluna `arquivo` guarda o ID do vídeo no YouTube ([05-banco-de-dados.md](05-banco-de-dados.md#o-campo-arquivo-com-vídeo-do-youtube)), e a tag `<video>` não toca YouTube. A página decide pelo valor de `arquivo`:

| `arquivo` | Player | De onde vem o vídeo |
| --- | --- | --- |
| ID do YouTube (`aqz-KE-bpKQ`) | `<iframe>` com `https://www.youtube.com/embed/<ID>` | YouTube, direto para o navegador |
| Nome terminado em `.mp4` ou `.webm` | tag `<video>` com `/videos/<arquivo>` | `/opt/streaming/public/videos` do nó |

O guia pede a tag `<video>`; o grupo escolheu o YouTube. O código aceita os dois sem alteração. Para passar um vídeo para arquivo local: copiar o `.mp4` para `/opt/streaming/public/videos/` **nos dois nós** e rodar na `db` `UPDATE videos SET arquivo = 'big-buck-bunny.mp4' WHERE id = 1;`. O pedido do `.mp4` também passa pelo balanceador e pode vir do outro nó, o que funciona porque os dois têm os mesmos arquivos.

Nos dois casos, quem gera a página, grava a reprodução e mostra a barra é um dos nós.

## Banco fora do ar

- **`banco.on('error', ...)`:** quando o PostgreSQL reinicia, as conexões paradas no `Pool` dão erro. Sem esse tratamento, o Node encerra o processo, e **os dois nós caem junto com o banco**. O defeito foi achado no teste local e existe na aplicação base implantada em 23/10; a versão nova corrige.
- **`connectionTimeoutMillis: 5000`:** se o banco não responder, a página dá erro em 5 s em vez de ficar carregando.
- O erro vira uma página 500 com a barra. O Nginx não repete um 500 no outro nó (o `proxy_next_upstream` repete só `error`, `timeout`, `502` e `503`), e isso está certo: o outro nó usaria o mesmo banco e daria o mesmo erro.
- Quando o banco volta, o mesmo processo volta a responder sem reiniciar.

## Como testar no PC, sem as VMs

Precisa só do Node.js (18 ou mais novo). Não precisa instalar o PostgreSQL: o script baixa um PostgreSQL 16 que roda dentro da pasta `node_modules` e é apagado no fim. Na raiz do repositório:

```powershell
cd app
npm install
cd ..\scripts\local
npm install
npm start
```

Os dois `npm install` só são necessários na primeira vez (ou quando o `package.json` mudar). O `npm start` monta, em uns 10 segundos:

| Peça | Endereço | Equivale a |
| --- | --- | --- |
| Mini balanceador | `http://localhost:8080` | `lb` (Nginx) |
| NO_A | `http://localhost:3001` | `app-a` |
| NO_B | `http://localhost:3002` | `app-b` |
| PostgreSQL 16 | `127.0.0.1:55432`, usuário `app_streaming`, senha `senha_local` | `db`, com os três scripts de [`banco/`](../../banco/) |

Abra `http://localhost:8080` e recarregue: a barra alterna entre azul e laranja. Com o terminal do `npm start` ainda aberto, digite uma letra e Enter:

| Letra | O que faz | O que se vê no navegador |
| --- | --- | --- |
| `a` | Desliga ou religa o NO_A (como `systemctl stop/start streaming`) | Barra fixa em NO_B, sem erro; ao religar, volta a alternar |
| `b` | O mesmo com o NO_B | Barra fixa em NO_A |
| `d` | Desliga ou religa o banco | Erro 500 com a barra; ao religar, as páginas voltam sem reiniciar os nós |
| `s` | Mostra o que está ligado | — |
| `q` | Encerra tudo e apaga o banco temporário | — |

O mini balanceador é um pequeno programa em Node dentro do `iniciar.mjs`, não o Nginx. Ele alterna os nós a cada requisição e, se o nó da vez não responder, tenta o outro, como o `proxy_next_upstream`. Também devolve o cabeçalho `X-Upstream`. Ele não tem o `max_fails`: tenta o nó desligado em toda requisição que cai na vez dele, o que no PC custa menos de 1 ms. O teste de verdade continua sendo pela `lb`.

O banco começa do zero a cada `npm start`. Para ver o banco por dentro com o `psql`, se estiver instalado: `psql -h 127.0.0.1 -p 55432 -U app_streaming -d streaming`.

## Como implantar nos nós

Nada muda no que já existe nos nós ([05-implantacao-da-app.md](../03-testes/05-implantacao-da-app.md)): Node 22, usuário `streaming`, `streaming.service` com `npm start` e `/etc/streaming.env`. A única dependência nova é o `ejs`, que o `npm ci` instala.

De uma máquina que alcance a rede `192.168.56.0/24`, na raiz do repositório:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\implantar-app.ps1
```

Para cada nó, primeiro a `app-a` e depois a `app-b`:

| Passo | Comando | Para quê |
| --- | --- | --- |
| 1 | `ssh sdadmin@<nó> 'rm -rf streaming-novo && mkdir streaming-novo'` | Pasta limpa em `/home/sdadmin` para receber os arquivos |
| 2 | `scp -r app/server.js app/package.json app/package-lock.json app/views scripts/implantar-app.sh sdadmin@<nó>:streaming-novo/` | Copia o código e o script |
| 3 | `ssh -t sdadmin@<nó> 'sudo bash streaming-novo/implantar-app.sh'` | Instala; o `-t` abre um terminal para o `sudo` pedir a senha |

O `implantar-app.sh`, já no nó:

1. Copia `/opt/streaming` para `/opt/streaming.bak-<data-hora>`.
2. Copia o código novo. Não toca no `/etc/streaming.env`.
3. Roda `npm ci --omit=dev` como `sdadmin`, com `umask 022`, e tira a escrita do grupo `streaming` (o problema do `node_modules` registrado em 23/10).
4. `systemctl reset-failed streaming` e `systemctl restart streaming`. O `reset-failed` zera o limite de reinícios do systemd: depois de 5 falhas seguidas (o `Restart=on-failure` tenta sozinho), ele recusa novos starts por um tempo com "Start request repeated too quickly".
5. Espera a página `/` responder 200 e mostra o resultado do `/teste-banco`. Se falhar, mostra o log e o comando para voltar à cópia.

**Um nó de cada vez:** enquanto a `app-a` reinicia, o Nginx manda tudo para a `app-b`, e o site não sai do ar. Se a `app-a` falhar, o script para e a `app-b` continua na versão antiga. Essa forma de atualizar é chamada de *rolling update*.

Voltar à versão anterior em um nó:

```bash
sudo rm -rf /opt/streaming && sudo mv /opt/streaming.bak-<data-hora> /opt/streaming && sudo systemctl reset-failed streaming && sudo systemctl restart streaming
```

## Como testar depois de implantar

Primeiro o verificador automático, de qualquer máquina com Node 18+ que alcance a `lb` (não precisa de `npm install`):

```powershell
node testes/verificar-app.mjs http://192.168.56.10
```

Ele confere, pela `lb`, o balanceamento, a barra, as cores, o RNF05 e os requisitos RF01 a RF06, e escreve `OK` ou `FALHA` em cada item. Grava 10 reproduções do primeiro vídeo. Para a queda de um nó:

```powershell
node testes/verificar-app.mjs http://192.168.56.10 --queda 60
```

Durante esses 60 s, desligue um nó (`sudo systemctl stop streaming`) e religue. O verificador mostra, segundo a segundo, quem respondeu, quantas requisições o Nginx refez no outro nó (`X-Upstream` com dois endereços) e quantas falharam para o cliente.

Depois, à mão:

| Teste | Como | Esperado |
| --- | --- | --- |
| Barra alternando | Abrir `http://192.168.56.10/` e recarregar várias vezes | Azul `NO_A` e laranja `NO_B` alternando |
| O mesmo pelo terminal | `for i in 1 2 3 4; do curl -s http://192.168.56.10/ \| grep -o 'strong>NO_.'; done` | `NO_A`, `NO_B`, `NO_A`, `NO_B` |
| Reprodução gravada | Abrir um vídeo | Player do YouTube e "Reprodução nº N registrada pelo nó ..." |
| Distribuição | `http://192.168.56.10/distribuicao` | Mesma contagem, seja qual for o nó da barra |
| Prova no banco | Na `db`: `SELECT no_responsavel, COUNT(*) FROM reproducoes GROUP BY 1;` | Os mesmos números da página |
| Queda real | `sudo systemctl stop streaming` em um nó, recarregar, depois `start` | Barra fixa no outro nó; depois volta a alternar |

## Notas para os testes de carga

- `ab -n 1000 -c 50 http://192.168.56.10/` mede o catálogo (duas consultas por requisição) e **não grava** reproduções.
- Para encher a tabela e provar a divisão, rodar também em uma página de vídeo: `ab -n 1000 -c 50 http://192.168.56.10/videos/1`. São 1000 `INSERT`s, e o esperado é algo perto de 500 por nó.
- Para zerar antes de uma rodada, na `db`, como `postgres`: `TRUNCATE reproducoes RESTART IDENTITY;`. O `app_streaming` não tem permissão para isso.
- O catálogo lista todos os vídeos. Com a massa de 500 vídeos, a página fica bem maior; as rodadas de um nó e de dois nós precisam usar os mesmos dados para serem comparáveis.
- O `ab` não pede CSS nem favicon, então ele vê a alternância exata do round-robin.

## Pendente

- Implantar nos dois nós e registrar o resultado em `03-testes/`.
- Teste de queda real com a aplicação nova (já pendente em [03-teste-de-queda.md](../03-testes/03-teste-de-queda.md)).
- Decidir se algum vídeo passa para `.mp4` local (tag `<video>`) ou se fica tudo no YouTube.
- Apagar as cópias `/opt/streaming.bak-*` quando não forem mais necessárias.
