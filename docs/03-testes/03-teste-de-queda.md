# Teste de queda de um nó

> **Teste simulado na `lb`.** A queda foi simulada com regras de `iptables` na `lb`, e não parando o serviço nos nós. A **queda real** (`sudo systemctl stop streaming` em um nó, sob carga) foi feita em 27/10/2026: [08-testes-de-carga-e-falha.md](08-testes-de-carga-e-falha.md#queda-real-de-um-nó-sob-carga).

Configuração testada: [../01-especificacoes/04-nginx-e-upstream.md](../01-especificacoes/04-nginx-e-upstream.md). Testado em 23/10/2026, com a aplicação mínima de teste nos nós (responde `NO_A` e `NO_B`).

## Como a queda foi simulada
A queda foi simulada **na `lb`**, com regras do `iptables` que bloqueiam o tráfego para a porta 3000 de um nó, e não parando o serviço `streaming` no próprio nó (o `sudo` dos nós pede senha). Para o Nginx o efeito é o mesmo de um nó fora do ar, e as regras são removidas ao fim de cada cenário.

| Cenário | Regra na `lb` | O que simula |
| --- | --- | --- |
| Conexão recusada | `iptables -I OUTPUT -d 192.168.56.11 -p tcp --dport 3000 -j REJECT --reject-with tcp-reset` | serviço parado (a porta responde "recusado") |
| Sem resposta | `iptables -I OUTPUT -d 192.168.56.12 -p tcp --dport 3000 -j DROP` | nó travado ou rede cortada (pior caso, termina em timeout) |

Remoção: o mesmo comando com `-D` no lugar de `-I`.

## Medição
Cada requisição foi feita na `lb` com `curl -i http://localhost/`, lendo o código HTTP, o tempo total e o cabeçalho `X-Upstream`.

| Etapa | Requisições | Códigos | Nós que responderam | Tempo |
| --- | --- | --- | --- | --- |
| 1. Dois nós no ar | 6 | 200 em todas | `.11` e `.12` alternando | 4 a 9 ms |
| 2. `app-a` com conexão recusada | 12 | 200 em todas | só `NO_B`; em 2 requisições o `X-Upstream` mostra `.11, .12` (tentou o `.11`, falhou e foi ao `.12`) | 5 a 8 ms |
| 3. `app-a` de volta (após 12 s) | 6 | 200 em todas | `.11` e `.12` alternando | 5 a 8 ms |
| 4. `app-b` sem resposta (DROP) | 6 | 200 em todas | só `NO_A`; 2 requisições tentaram o `.12` antes (`.12, .11`) | **2,0 s** nas 2 que tentaram o `.12`, 5 ms nas demais |
| 5. Regras removidas (após 12 s) | 6 | 200 em todas | `.11` e `.12` alternando | 4 a 8 ms |

O log do Nginx registra `connect() failed (111: Connection refused) while connecting to upstream` para o `.11` na etapa 2.

## Conclusões
- **Nenhum erro chegou ao cliente**: as 36 requisições deram HTTP 200, inclusive durante a queda. O `proxy_next_upstream` faz o Nginx repetir a requisição no nó vivo.
- Com o nó **recusando conexão**, a falha é imediata e quase não há custo no tempo de resposta.
- Com o nó **sem responder**, as requisições que tentaram o nó morto levaram cerca de 2 s, que é o `proxy_connect_timeout`. Depois de 2 falhas (`max_fails=2`), o Nginx deixa o nó fora por `fail_timeout=10s`, e o tempo volta ao normal.
- Passado o `fail_timeout`, o nó recuperado volta ao revezamento sozinho, sem recarregar o Nginx.
- Ao fim, `iptables -S OUTPUT` mostra só `-P OUTPUT ACCEPT`, ou seja, as regras de teste foram removidas.

## Limitações e pendências
- A queda real do serviço foi feita depois, sob carga: [08-testes-de-carga-e-falha.md](08-testes-de-carga-e-falha.md#queda-real-de-um-nó-sob-carga).
- Não foi testada a queda dos **dois** nós ao mesmo tempo (esperado: HTTP 502 da `lb`).
- A queda do processo com `kill` (o `Restart=always` do systemd o reergue) não foi medida.
