# Verificação da entrega, antes da implantação

Feita em 2026-10-26, num PC do grupo, **sem as VMs**. Confere a aplicação e o script de implantação contra o que o projeto entrega: requisitos da documentação de 24/09 (RF e RNF), tarefas da seção 6 do guia e o contrato técnico.

| Ferramenta | Para quê |
| --- | --- |
| [`testes/verificar-app.mjs`](../../testes/verificar-app.mjs) | Verificador automático; o mesmo vai ser rodado depois pela `lb` |
| [`scripts/local`](../../scripts/local/iniciar.mjs) | Banco temporário, os dois nós e o mini balanceador no PC |
| Ubuntu 24.04 descartável no WSL | Simula a `app-a` para testar o [`implantar-app.sh`](../../scripts/implantar-app.sh); apagado no fim |

## Situação por item

| Item | O que pede | Resultado no PC | Falta nas VMs |
| --- | --- | --- | --- |
| RF01 | Listar o catálogo | OK: 3 vídeos com título, categoria e duração | Verificador pela `lb` |
| RF02 | Filtrar por categoria | OK: cada filtro só traz a sua categoria, e a soma dá o catálogo | idem |
| RF03 | Detalhe do vídeo | OK: título, categoria, duração e descrição | idem |
| RF04 | Reproduzir no navegador | OK: `<iframe>` do YouTube; e tag `<video>` com `.mp4` local, servido como `video/mp4` | Ver o player abrindo no navegador |
| RF05 | Gravar cada reprodução com o nó | OK: 10 aberturas, 10 números diferentes, nó gravado igual ao da barra | Verificador pela `lb` |
| RF06 | Contagem por nó | OK: a página somou exatamente as 10 aberturas; e bateu com o `GROUP BY` direto no banco (17, 5, total 22) | idem |
| RNF01 | Continuar com um nó fora | OK: 0 falhas em 255 requisições com o NO_A fora por 10 s | Queda real pela `lb` |
| RNF02 | Mais requisições com dois nós | Só indicativo (abaixo) | Medição do João nas VMs |
| RNF03 | Mesmo endereço sempre | Por construção: tudo passa pelo balanceador | — |
| RNF04 | Rede isolada | Não se aplica ao PC | Infraestrutura |
| RNF05 | Aplicação idêntica nos nós | OK: o catálogo dos dois nós é idêntico, tirando a barra | Verificador pela `lb` |
| Guia 6.1.2 | Configuração só por variável de ambiente | OK: sem `BANCO_SENHA` a aplicação não sobe e diz qual falta | — |
| Guia 6.1.7 | Barra com o nó, cor diferente | OK: azul `NO_A`, laranja `NO_B`, também nas páginas 404 e 500 | Ver no navegador |
| Guia 6.1.9 | Pasta pronta para os nós | OK: `implantar-app.sh` testado num nó simulado (abaixo) | Implantar |
| Guia 7.1.5 | Pelo menos 8 vídeos | **FALHA: o catálogo tem 3** | Frente do banco |
| Guia 7.1.7 | Script da massa (500 vídeos, 2.000 reproduções) | **FALHA: não está no repositório** | Frente do banco |

Sobre o RF04: a documentação diz "arquivo servido pelo nó que atendeu". Com o YouTube, quem entrega o vídeo é o YouTube, e o nó entrega a página. A aplicação aceita os dois jeitos; a escolha é do grupo.

## Verificador automático

`node testes/verificar-app.mjs http://localhost:8080`: **15 de 16 itens OK**. A falha é o catálogo com 3 vídeos (guia 7.1.5).

Para ver se o verificador também acusa erro, ele foi rodado direto no NO_A (`http://localhost:3001`), sem balanceador: falharam os itens de balanceamento, RNF05 e "sem estado", como devia.

## Queda de um nó (RNF01)

`node testes/verificar-app.mjs http://localhost:8080 --queda 28`, com o NO_A desligado aos 8 s e religado aos 18 s:

| Segundos | Quem respondeu | Retentativas | Falhas |
| --- | --- | --- | --- |
| 1 a 8 | NO_A e NO_B alternando | 0 | 0 |
| 9 a 19 | só NO_B | 4 a 5 por segundo | 0 |
| 20 a 28 | alternando de novo, sem intervenção | 0 | 0 |

Total: 255 requisições, **0 falhas**, 46 retentativas (o mini balanceador tentou o NO_A, falhou e passou ao NO_B), a mais lenta em 74 ms. O mini balanceador não tem `max_fails`; na `lb` o Nginx deve tirar o nó de circulação depois de 2 falhas e as retentativas devem parar.

## Banco fora do ar

Com o banco desligado, os dois nós continuaram no ar e devolveram 500 com a barra e a mensagem `connect ECONNREFUSED`. Com o banco religado, voltaram a dar 200 sem reiniciar.

## Entradas maliciosas

| Teste | Resultado |
| --- | --- |
| Vídeo com título `<script>alert(1)</script>` e descrição `<img src=x onerror=...>` | Aparecem como texto (`&lt;script&gt;`), nenhum `<script>` ou `<img>` de verdade na página |
| `/?categoria=1; DROP TABLE videos` e `/videos/1' OR '1'='1` | 200 com o catálogo completo e 404; catálogo intacto |
| `/videos/..%2f..%2fserver.js` | 404, o código não é exposto |

Os vídeos de teste e o `.mp4` foram apagados no fim.

## Carga, só como indicação

Um script imitando `ab -n 2000 -c 50` contra o mini balanceador, alternando "só NO_B" e "os dois nós", duas rodadas:

| Rodada | Nós | Req/s | Média | p95 |
| --- | --- | --- | --- | --- |
| 1 | só NO_B | 594 | 82,5 ms | 96,7 ms |
| 1 | NO_A e NO_B | 974 | 49,7 ms | 109,5 ms |
| 2 | só NO_B | 629 | 77,8 ms | 89,8 ms |
| 2 | NO_A e NO_B | 961 | 50,4 ms | 115,4 ms |

A vazão subiu e a média caiu, mas o p95 subiu. Tudo rodou no mesmo PC (banco, dois nós, balanceador e o gerador de carga disputando a CPU), então **esses números não servem** para a comparação do trabalho, que é a do João nas VMs. Servem de aviso: o p95 pode piorar mesmo com a vazão melhorando, e vale explicar isso se acontecer.

## Script de implantação num nó simulado

Ubuntu 24.04.5 no WSL2 com systemd, Node v22.23.4, npm 10.9.9 e PostgreSQL 16.15, as mesmas versões dos nós. Montado como a `app-a` em 23/10 ([05-implantacao-da-app.md](05-implantacao-da-app.md)): usuários `sdadmin` e `streaming`, aplicação base do commit `625feb6` em `/opt/streaming`, `/etc/streaming.env` com dono `root` e permissão 600, `streaming.service` com `npm start`. O banco ficou na mesma máquina. Os passos do `implantar-app.ps1` foram repetidos como `sdadmin`, com `cp` no lugar do `scp`.

| Teste | Resultado |
| --- | --- |
| Implantar sobre a aplicação base | OK: cópia de segurança, 87 pacotes, serviço `active`, `/teste-banco` com 3 vídeos |
| Permissões depois | Nenhum arquivo com escrita para grupo ou outros; o usuário `streaming` lê, mas não altera o código; o processo roda como `streaming`; `streaming.env` intacto |
| Implantar de novo por cima | OK |
| Implantar um `server.js` com erro de sintaxe | Parou com código 1, mostrou o `SyntaxError` do log e o comando de volta |
| Rodar o comando de volta logo em seguida | Na primeira versão, **recusado** (abaixo); depois da correção, serviço `active` e página 200 |
| Reiniciar a máquina | O serviço subiu sozinho; `/`, `/videos/1` e `/distribuicao` com 200, `/nada` com 404 |

### Defeitos encontrados e corrigidos no script

| Defeito | Efeito | Correção |
| --- | --- | --- |
| Depois de uma implantação com erro, o `Restart=on-failure` tenta 5 vezes e o systemd passa a recusar starts ("Start request repeated too quickly") | O comando de volta, rodado logo em seguida, falhava e o nó ficava parado | `systemctl reset-failed streaming` antes do `restart`, no script e no comando de volta |
| A espera pelo serviço mostrava `curl: (7) Failed to connect` | Parecia erro numa implantação que deu certo | `curl` silencioso durante a espera |
| O `node_modules` ficava com grupo `sdadmin` | Diferente do registrado em 23/10 (grupo `streaming`) | `chown` de novo depois do `npm ci` |

## O que não foi coberto

- O `implantar-app.ps1` com `ssh` e `scp` de verdade: só a sintaxe foi conferida; os passos foram repetidos à mão no nó simulado.
- O Nginx da `lb`, a rede host-only e o banco em outra máquina.
- A cor alternando **no navegador** e o player do YouTube abrindo.

## Pendente

1. Implantar nos dois nós com o `implantar-app.ps1`.
2. Rodar `node testes/verificar-app.mjs http://192.168.56.10` e o modo `--queda` pela `lb`, e registrar aqui em `03-testes/`.
3. Frente do banco: completar o catálogo para 8 vídeos e criar o script da massa de teste.
4. Decidir sobre o RF04 (YouTube ou `.mp4` servido pelo nó).
