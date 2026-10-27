# Testes de carga e de falha (frente de testes)

Seção 8.1 do guia: Apache Bench com um nó e com dois nós, divisão das reproduções por nó no banco e queda de um nó sob carga. Feito em 27/10/2026, nas quatro VMs, com a aplicação completa ([../01-especificacoes/06-aplicacao.md](../01-especificacoes/06-aplicacao.md)) implantada em `app-a` (`NO_A`) e `app-b` (`NO_B`) e o banco com 9 vídeos e a tabela `reproducoes` zerada.

> **Situação:** testes de carga e divisão no banco concluídos. Queda real de um nó e religamento **pendentes** (preenchidos à medida que forem executados).

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

## Queda real de um nó sob carga (pendente)

## Religamento (pendente)

## Limitações

- O `ab` roda na própria `lb` (1 CPU), dividindo processador com o Nginx. O ideal seria uma máquina separada.
- Uma rodada de cada cenário; não houve repetição para tirar média entre rodadas.
- No teste de 1 nó, o `.12` continuou no `upstream` do Nginx (desligado só o serviço), como pede o guia ("apenas o Nó A ligado"). O Nginx o testa de novo a cada `fail_timeout` (10 s).
