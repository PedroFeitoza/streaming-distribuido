# Nginx na lb e upstream para os nós

Etapa 4: a `lb` (192.168.56.10) recebe as requisições na porta 80 e as distribui entre `app-a` (192.168.56.11:3000) e `app-b` (192.168.56.12:3000).

## O que cada peça faz
- **Nginx** é o servidor web que aqui atua como *reverse proxy*: o cliente fala só com a `lb`, e ela repassa a requisição a um nó.
- **`upstream`** declara o grupo de servidores de destino. Sem outra diretiva, o Nginx usa *round-robin*: uma requisição para cada nó, alternando.
- **`max_fails=2 fail_timeout=10s`**: depois de 2 falhas, o nó é tirado de circulação por 10 s. É isso que faz o tráfego seguir só para o nó vivo quando o outro cai.
- **`proxy_next_upstream`**: se a tentativa em um nó falhar (erro, timeout, 502, 503), o Nginx tenta o outro na mesma requisição, e o cliente não vê o erro.
- **`add_header X-Upstream`**: devolve no cabeçalho qual nó respondeu, para os testes de balanceamento.

## Instalação
```bash
sudo apt-get update
sudo apt-get install -y nginx
```
O pacote é o `nginx` 1.24.0 do Ubuntu 24.04. Depois de configurar: `sudo systemctl enable --now nginx`.

## Configuração
Arquivo `/etc/nginx/conf.d/streaming.conf`, versionado em [`infra/balanceador/streaming.conf`](../../infra/balanceador/streaming.conf) (o site `default` foi removido de `sites-enabled`, para não disputar a porta 80):

```nginx
upstream streaming_app {
    server 192.168.56.11:3000 max_fails=2 fail_timeout=10s;  # app-a
    server 192.168.56.12:3000 max_fails=2 fail_timeout=10s;  # app-b
}

server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://streaming_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        proxy_connect_timeout 2s;
        proxy_next_upstream error timeout http_502 http_503;

        add_header X-Upstream $upstream_addr always;
    }
}
```

## Ajuste no apt
O `apt update` reclamava de `file:///cdrom` (a ISO foi removida da VM). A linha em `/etc/apt/sources.list` foi comentada.

## Como validar
```bash
sudo nginx -t                      # sintaxe da configuração
systemctl is-active nginx          # active
ss -ltn | grep ":80 "              # escutando na porta 80
```
Testes de balanceamento: [../03-testes/02-balanceamento.md](../03-testes/02-balanceamento.md).

## Pendente
- Teste de queda de um nó (etapa 7): [../03-testes/03-teste-de-queda.md](../03-testes/03-teste-de-queda.md). Foi feito de forma simulada na `lb`; a queda real, parando o serviço em um nó sob carga, está em [../03-testes/08-testes-de-carga-e-falha.md](../03-testes/08-testes-de-carga-e-falha.md).
- Depende de a aplicação responder na porta 3000 dos dois nós e do serviço systemd (etapas 5 e 6).
