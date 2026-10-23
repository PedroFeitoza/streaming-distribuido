# Teste de balanceamento (round-robin)

Configuração testada: [../01-especificacoes/04-nginx-e-upstream.md](../01-especificacoes/04-nginx-e-upstream.md). Testado em 23/10/2026.

## Resumo
| Teste | Esperado | Obtido |
| --- | --- | --- |
| `nginx -t` | sintaxe ok | ok |
| Nginx ativo e ouvindo na porta 80 | `active`, `0.0.0.0:80` | ok |
| Nós respondem direto na 3000 | HTTP 200 em `.11:3000` e `.12:3000` | 200 nos dois |
| 4 requisições a `http://localhost/` na `lb` | HTTP 200, `X-Upstream` alternando | `.12`, `.11`, `.12`, `.11` |
| Requisição do Windows a `http://192.168.56.10/` | HTTP 200 | 200 |

## Comandos
Na `lb`:
```bash
for i in 1 2 3 4; do curl -s -i http://localhost/ | grep -iE "^HTTP|x-upstream"; done
curl -s -o /dev/null -w "%{http_code}\n" http://192.168.56.11:3000/
curl -s -o /dev/null -w "%{http_code}\n" http://192.168.56.12:3000/
```
Do Windows: `curl.exe -i http://192.168.56.10/`

O cabeçalho `X-Upstream` mostra o nó que atendeu cada requisição; o padrão alternado confirma o round-robin.

## Limitação
O conteúdo da aplicação nos nós não foi avaliado aqui; só se confirmou que a porta 3000 responde 200 e que o Nginx alterna entre os dois.
