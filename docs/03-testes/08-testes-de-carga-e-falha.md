# Testes de carga e de falha (frente de testes)

Seção 8.1 do guia: Apache Bench com um nó e com dois nós, divisão das reproduções por nó no banco e queda de um nó sob carga. Feito em 27/10/2026, nas quatro VMs, com a aplicação completa ([../01-especificacoes/06-aplicacao.md](../01-especificacoes/06-aplicacao.md)) implantada em `app-a` (`NO_A`) e `app-b` (`NO_B`) e o banco com 9 vídeos e a tabela `reproducoes` zerada.

> **Situação:** testes de carga, divisão no banco, queda real de um nó sob carga e religamento concluídos.

## Como o teste foi feito

| Item | Escolha | Por quê |
| --- | --- | --- |
| Ferramenta | `ab` (ApacheBench 2.3, pacote `apache2-utils` 2.4.58 do Ubuntu 24.04) | É a pedida no guia |
| Onde roda | Na `lb`, contra `http://localhost/` | Passa pelo Nginx como um usuário real. Limitação: a `lb` tem 1 CPU, dividida entre o `ab` e o Nginx |
| URL | `/videos/1` | Cada acesso grava uma linha em `reproducoes` com o nó que atendeu, o que permite contar a divisão no banco |
| Carga | `-n 1000 -c 50` | 1.000 requisições, 50 simultâneas, como pede o guia |
| `-l` | Aceita tamanho de página variável | A página muda a cada acesso (número da reprodução, hora, nome do nó). Sem `-l`, o `ab` contaria cada diferença de tamanho como "Failed request" sem ser erro |
| 1 nó | `sudo systemctl stop streaming` na `app-b` | O Nginx continua com os dois nós no `upstream`; tenta o `.12`, recebe conexão recusada, repete no `.11` e, depois de 2 falhas, deixa o `.12` fora por 10 s. A cada 10 s ele testa o `.12` de novo, um custo pequeno no teste de 1 nó |

Comandos:

```bash
# lb
sudo apt-get install -y apache2-utils
ab -V
curl -s -o /dev/null -w "%{http_code}\n" http://localhost/videos/1     # 200

# app-b: só o Nó A
sudo systemctl stop streaming
systemctl is-active streaming                                          # inactive

# lb
ab -n 1000 -c 50 -l http://localhost/videos/1 | tee ~/ab-1no.txt

# app-b: volta o Nó B
sudo systemctl start streaming
systemctl is-active streaming                                          # active

# lb, depois de ~15 s (fim do fail_timeout)
for i in 1 2 3 4; do curl -s -o /dev/null -D - http://localhost/videos/1 | grep -i x-upstream; done
ab -n 1000 -c 50 -l http://localhost/videos/1 | tee ~/ab-2nos.txt
```

Antes do teste com 2 nós, o `X-Upstream` alternou `.12`, `.11`, `.12`, `.11`.

## Resultados: 1 nó contra 2 nós

| Métrica | Campo do `ab` | 1 nó (só `NO_A`) | 2 nós | Diferença |
| --- | --- | --- | --- | --- |
| Requisições completas | Complete requests | 1000 | 1000 | — |
| Requisições com erro | Failed requests + Non-2xx | 0 | 0 | — |
| **Taxa de erro** | | **0%** | **0%** | igual |
| Tempo total | Time taken for tests | 5,851 s | 3,386 s | −42% |
| **Requisições por segundo** | Requests per second | **170,92** | **295,30** | **+73%** |
| **Tempo médio** | Total, mean | **287 ms** | **164 ms** | −43% |
| Desvio padrão | Total, +/-sd | 71,2 ms | 97,7 ms | +37% |
| Mediana (p50) | 50% | 309 ms | 161 ms | −48% |
| p90 | 90% | 349 ms | 310 ms | −11% |
| **Percentil 95** | 95% | **377 ms** | **340 ms** | **−10%** |
| p99 | 99% | 399 ms | 352 ms | −12% |
| Mais lenta | 100% | 406 ms | 357 ms | −12% |
| Mais rápida | Total, min | 34 ms | 13 ms | — |
| Conexão com o Nginx | Connect, mean | 0 ms | 0 ms | — |
| Taxa de transferência | Transfer rate | 482,70 KB/s | 834,27 KB/s | +73% |

Nenhuma das duas saídas tem a linha `Non-2xx responses`, ou seja, todas as respostas foram 2xx.

### Saída do `ab`, 1 nó

```
Concurrency Level:      50
Time taken for tests:   5.851 seconds
Complete requests:      1000
Failed requests:        0
Total transferred:      2891936 bytes
HTML transferred:       2600896 bytes
Requests per second:    170.92 [#/sec] (mean)
Time per request:       292.538 [ms] (mean)
Time per request:       5.851 [ms] (mean, across all concurrent requests)
Transfer rate:          482.70 [Kbytes/sec] received

Connection Times (ms)
              min  mean[+/-sd] median   max
Connect:        0    0   0.6      0       4
Processing:    30  287  71.4    309     406
Waiting:       29  287  71.5    308     406
Total:         34  287  71.2    309     406

Percentage of the requests served within a certain time (ms)
  50%    309
  66%    316
  75%    323
  80%    328
  90%    349
  95%    377
  98%    396
  99%    399
 100%    406 (longest request)
```

### Saída do `ab`, 2 nós

```
Concurrency Level:      50
Time taken for tests:   3.386 seconds
Complete requests:      1000
Failed requests:        0
Total transferred:      2893000 bytes
HTML transferred:       2602000 bytes
Requests per second:    295.30 [#/sec] (mean)
Time per request:       169.321 [ms] (mean)
Time per request:       3.386 [ms] (mean, across all concurrent requests)
Transfer rate:          834.27 [Kbytes/sec] received

Connection Times (ms)
              min  mean[+/-sd] median   max
Connect:        0    0   0.6      0       7
Processing:    12  164  97.7    160     355
Waiting:       12  163  97.7    160     355
Total:         13  164  97.7    161     357

Percentage of the requests served within a certain time (ms)
  50%    161
  66%    201
  75%    221
  80%    264
  90%    310
  95%    340
  98%    348
  99%    352
 100%    357 (longest request)
```

## Como ler a saída do `ab`

| Campo | O que é |
| --- | --- |
| Requests per second | Vazão (throughput): quantas páginas o sistema entregou por segundo. É o número que responde ao RNF02 |
| Time per request (mean) | Quanto cada "usuário" esperou, em média, com 50 ao mesmo tempo |
| Time per request (across all) | 1 ÷ requisições por segundo: o sistema entrega uma página a cada tantos ms |
| Connect | Abrir a conexão TCP com o Nginx |
| Waiting | Do envio da requisição até o primeiro byte da resposta: o nó gerando a página (consulta do vídeo e `INSERT` da reprodução) |
| Processing / Total | Waiting mais a transferência da resposta / Connect mais Processing |
| Percentuais | Tempo que aquela fração das requisições não ultrapassou. 95% = 377 ms quer dizer que 95 de cada 100 esperaram até 377 ms |

Conferência: com 50 requisições abertas ao mesmo tempo, cada uma espera cerca de 50 ÷ vazão. Com 1 nó, 50 ÷ 170,92 ≈ 0,29 s, que bate com os 292 ms medidos; com 2 nós, 50 ÷ 295,30 ≈ 0,17 s, que bate com os 169 ms.

## Interpretação

- **RNF02 comprovado:** com dois nós o sistema atendeu 73% mais requisições por segundo e terminou as 1.000 requisições em 42% menos tempo, sem nenhum erro nos dois casos.
- **Não dobrou.** Os dois nós compartilham peças que não foram duplicadas: o mesmo banco (cada acesso faz um `SELECT` e um `INSERT`) e a `lb`, com 1 CPU para o Nginx e o próprio `ab`. Quando a peça compartilhada vira o gargalo, somar nós rende menos que o dobro. **É uma hipótese tirada dos números**: o uso de CPU de cada VM durante o teste não foi medido.
- **Média e p95 contam histórias diferentes.** A mediana caiu quase pela metade (309 → 161 ms), mas o p95 caiu só 10% (377 → 340 ms), e o desvio padrão subiu (71 → 98 ms). Com dois nós a maioria das requisições ficou bem mais rápida, mas os 5% mais lentos continuam perto de 340 ms. Olhando só a média, isso não apareceria.
- **No teste de 1 nó, a média (287 ms) ficou abaixo da mediana (309 ms)** porque as primeiras requisições, com o servidor ainda vazio, saíram rápido (a mais rápida em 34 ms) e puxaram a média para baixo.

## Divisão das reproduções por nó

Na `db`, depois dos dois testes de carga:

```bash
sudo -u postgres psql -d streaming -c "SELECT no_responsavel, COUNT(*) FROM reproducoes GROUP BY no_responsavel ORDER BY no_responsavel;"
```

```
 no_responsavel | count
----------------+-------
 NO_A           |  1502
 NO_B           |   503
(2 rows)
```

O total, 2.005, fecha com o que foi feito: 1 `curl` de conferência, 1.000 do teste com 1 nó, 4 `curl` de conferência e 1.000 do teste com 2 nós. As 1.000 do teste com 1 nó são todas do `NO_A`; descontadas elas, sobram cerca de 502 para o `NO_A` e 503 para o `NO_B` (o `curl` de conferência pode ter caído em qualquer um), uma divisão praticamente 50/50. Isso mostra no banco, e não só no cabeçalho `X-Upstream`, que o round-robin dividiu o trabalho entre os nós.

## Queda real de um nó sob carga

Cumpre a pendência do [03-teste-de-queda.md](03-teste-de-queda.md): desta vez o serviço foi parado no próprio nó, com `systemctl stop`, e não simulado com `iptables`.

Comandos:

```bash
# lb: carga mais longa, ~23 s
ab -n 6000 -c 50 -l http://localhost/videos/1 | tee ~/ab-queda.txt

# app-a, no meio da carga, anotando a hora
date +%T.%3N; sudo systemctl stop streaming; date +%T.%3N

# lb, depois do ab
sed -n '/Concurrency Level/,/Transfer rate/p' ~/ab-queda.txt
sudo grep "2026/10/27 23:0[45]" /var/log/nginx/error.log | grep -o -E "recv\(\) failed \(104[^)]*\)|connect\(\) failed \(111[^)]*\)|no live upstreams" | sort | uniq -c
sudo grep -E '23:0[45]:.*"GET /videos/1 HTTP/1.0"' /var/log/nginx/access.log | awk '{print substr($4,14), $9}' | sort | uniq -c

# db: quem atendeu em cada segundo
sudo -u postgres psql -d streaming -c "SELECT to_char(data_hora,'HH24:MI:SS') AS segundo, no_responsavel, COUNT(*) FROM reproducoes WHERE data_hora >= '2026-10-27 23:04:20' AND data_hora < '2026-10-27 23:04:50' GROUP BY 1,2 ORDER BY 1,2;"
```

O primeiro `date` marcou 23:04:34,948, mas o `sudo` pediu a senha antes de parar o serviço; a parada terminou às **23:04:37,116** (segundo `date`). O `ab` foi de 23:04:22 a 23:04:46, segundo o log de acesso.

### Resultado do `ab`

```
Concurrency Level:      50
Time taken for tests:   23.142 seconds
Complete requests:      6000
Failed requests:        0
Total transferred:      17358640 bytes
HTML transferred:       15612000 bytes
Requests per second:    259.27 [#/sec] (mean)
Time per request:       192.848 [ms] (mean)
Time per request:       3.857 [ms] (mean, across all concurrent requests)
Transfer rate:          732.52 [Kbytes/sec] received

Connection Times (ms)
              min  mean[+/-sd] median   max
Waiting:       10  191  94.0    175     389
Total:         11  192  93.9    176     389

Percentage of the requests served within a certain time (ms)
  50%    176
  66%    243
  75%    280
  80%    297
  90%    315
  95%    338
  98%    356
  99%    366
 100%    389 (longest request)
```

(A linha `Connect` e a `Processing` não ficaram na captura de tela.)

**6.000 de 6.000 completas, 0 falhas, nenhuma resposta fora de 2xx: taxa de erro 0% com um nó caindo no meio da carga.** O p95 (338 ms) e a mais lenta (389 ms) ficaram na mesma faixa do teste com dois nós: a queda não gerou espera longa para nenhum cliente.

### O que o Nginx registrou

| Erro no `error.log` | Quantas | O que significa |
| --- | --- | --- |
| `recv() failed (104: Connection reset by peer) while reading response header from upstream` | 29 | Requisições que estavam dentro do Nó A quando ele foi parado; o Node fechou a conexão sem responder |
| `connect() failed (111: Connection refused)` | 1 | Requisição nova enviada ao `.11` já parado |
| `no live upstreams` | 0 | Nunca ficou sem nó vivo |

**Primeiro e último erro às 23:04:37**, o mesmo segundo em que a parada terminou. Ou seja, **o Nginx percebeu a queda em menos de 1 s**: a conexão cortada e a conexão recusada são sinais imediatos, sem esperar o `proxy_connect_timeout` de 2 s. Depois das falhas (`max_fails=2`), o `.11` saiu de circulação, e as 30 requisições que falharam nele foram repetidas no Nó B pelo `proxy_next_upstream error`, porque nada tinha sido enviado ao cliente ainda. Por isso nenhuma chegou ao `ab` como erro.

### Segundo a segundo

Log de acesso da `lb` (respostas por segundo, todas HTTP 200) e tabela `reproducoes` (quem atendeu):

| Segundo | Respostas (log da `lb`) | `NO_A` (banco) | `NO_B` (banco) |
| --- | --- | --- | --- |
| 23:04:22 | 3 | — | 7 |
| 23:04:23 | 302 | 144 | 164 |
| 23:04:24 | 274 | 127 | 146 |
| 23:04:25 | 270 | 135 | 134 |
| 23:04:26 | 303 | 181 | 120 |
| 23:04:27 | 269 | 138 | 136 |
| 23:04:28 | 304 | 156 | 145 |
| 23:04:29 | 300 | 150 | 150 |
| 23:04:30 | 312 | 137 | 174 |
| 23:04:31 | 293 | 144 | 150 |
| 23:04:32 | 265 | 121 | 143 |
| 23:04:33 | 300 | 170 | 134 |
| 23:04:34 | 308 | 150 | 155 |
| 23:04:35 | 321 | 156 | 166 |
| 23:04:36 | 307 | 154 | 154 |
| **23:04:37 (queda)** | **228** | **4** | **217** |
| 23:04:38 | 160 | — | 162 |
| 23:04:39 | 158 | — | 157 |
| 23:04:40 | 169 | — | 176 |
| 23:04:41 | 217 | — | 210 |
| 23:04:42 | 162 | — | 163 |
| 23:04:43 | 164 | — | 165 |
| 23:04:44 | 280 | — | 280 |
| 23:04:45 | 317 | — | 321 |
| 23:04:46 | 14 | — | 4 |
| **Total** | **6.000** | **2.067** | **3.933** |

As duas fontes somam 6.000. Os números por segundo diferem um pouco porque o banco grava a hora do início da transação e o Nginx registra o fim da resposta.

- **Antes da queda**, divisão de 2.063 contra 2.071 (23:04:23 a 23:04:36): o round-robin meio a meio.
- **A partir de 23:04:38, só o `NO_B`**: o Nginx não mandou mais nada ao nó morto. Não houve nova tentativa no `.11` até o fim do `ab` (23:04:46), dentro dos 10 s do `fail_timeout`.
- **A vazão caiu de ~300 para ~160 por segundo** com um nó, próximo do teste de 1 nó (170,92).
- **Nos dois últimos segundos, o Nó B sozinho fez 280 e 321 por segundo**, ritmo de dois nós. A causa não foi investigada (pode ser coleta de lixo do Node, gravação em disco no banco ou o VirtualBox dividindo o processador do PC). O que fica comprovado é que a vazão de um nó **varia bastante de um segundo para o outro**, e que uma rodada só de cada teste é pouco para concluir o ganho exato.

## Religamento

```bash
# app-a
sudo systemctl start streaming
systemctl is-active streaming        # active

# lb, ~15 s depois
for i in 1 2 3 4; do curl -s -o /dev/null -D - http://localhost/videos/1 | grep -i x-upstream; done
```

Resultado: `.12`, `.11`, `.12`, `.11`. O Nó A voltou ao revezamento sozinho, sem recarregar o Nginx: passado o `fail_timeout`, o Nginx tentou o `.11` de novo e, como respondeu, o recolocou na rotação.

## Limitações

- O `ab` roda na própria `lb` (1 CPU), dividindo processador com o Nginx. O ideal seria uma máquina separada.
- Uma rodada de cada cenário; não houve repetição para tirar média entre rodadas. O teste de queda mostrou que a vazão de um nó varia bastante (de ~160 a ~320 por segundo), então o +73% é o resultado desta rodada, não um valor fixo.
- O uso de CPU das VMs durante os testes não foi medido; as causas do ganho abaixo do dobro e da variação são hipóteses.
- No teste de 1 nó, o `.12` continuou no `upstream` do Nginx (desligado só o serviço), como pede o guia ("apenas o Nó A ligado"). O Nginx o testa de novo a cada `fail_timeout` (10 s).
