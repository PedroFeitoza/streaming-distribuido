# Teste de queda de um nó

**Pendente** (etapa 7). Será feito com o `app-a` ou o `app-b` parado, conferindo que o Nginx segue respondendo só pelo nó vivo e que a volta do nó restabelece o round-robin.

## Plano
1. Com os dois nós no ar, confirmar o revezamento (ver [02-balanceamento.md](02-balanceamento.md)).
2. Parar a aplicação em um nó (`sudo systemctl stop <serviço>` no nó escolhido).
3. Repetir 10 requisições em `http://192.168.56.10/`: esperado HTTP 200 e `X-Upstream` sempre com o nó vivo.
4. Subir o nó de novo e repetir: o revezamento volta.

Observação: `proxy_next_upstream` faz o Nginx tentar o nó vivo na mesma requisição, então o cliente não deve ver erro durante a queda. Depende de o serviço systemd da aplicação existir nos nós (etapa 6).
