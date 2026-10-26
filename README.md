# Streaming Distribuído

Plataforma de streaming de vídeo distribuída em quatro máquinas virtuais, construída para demonstrar na prática **replicação**, **balanceamento de carga**, **tolerância a falhas** e **escalabilidade horizontal**.

A aplicação é um catálogo de vídeos acessado pelo navegador: o usuário vê a lista de títulos, escolhe um e assiste. A mesma aplicação roda em dois nós ao mesmo tempo, um balanceador Nginx distribui as requisições entre eles e um PostgreSQL compartilhado guarda todo o estado do sistema.

## Sumário

- [Conceitos demonstrados](#conceitos-demonstrados)
- [Arquitetura](#arquitetura)
- [Stack](#stack)
- [Topologia de rede](#topologia-de-rede)
- [Configuração](#configuração)
- [Modelo de dados](#modelo-de-dados)
- [Funcionalidades](#funcionalidades)
- [Implantação](#implantação)
- [Verificação](#verificação)
- [Estrutura do repositório](#estrutura-do-repositório)

## Conceitos demonstrados

| Conceito | Como aparece no sistema |
| --- | --- |
| **Replicação** | A mesma aplicação roda em dois nós independentes. |
| **Balanceamento de carga** | O Nginx distribui as requisições entre os nós em round-robin. |
| **Tolerância a falhas** | Se um nó cai, o Nginx passa a enviar todo o tráfego para o outro e o sistema continua respondendo. |
| **Escalabilidade horizontal** | Com dois nós o sistema atende mais requisições do que com um, sem alterar o código. |

## Arquitetura

```
                         Navegador
                             │
                             ▼  http://192.168.56.10
                ┌──────────────────────────┐
                │ Balanceador · Nginx      │
                │ 192.168.56.10:80         │
                └────────────┬─────────────┘
                 upstream    │    (round-robin)
             ┌───────────────┴───────────────┐
             ▼                               ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│ Nó A (NO_A)              │   │ Nó B (NO_B)              │
│ Node.js + Express        │   │ Node.js + Express        │
│ 192.168.56.11:3000       │   │ 192.168.56.12:3000       │
└────────────┬─────────────┘   └─────────────┬────────────┘
             └───────────────┬───────────────┘
                             ▼
                ┌──────────────────────────┐
                │ Banco · PostgreSQL       │
                │ 192.168.56.13:5432       │
                └──────────────────────────┘
```

### Princípios de projeto

- **Nós sem estado.** Nenhum nó guarda informação em memória entre requisições. Como a requisição seguinte de um mesmo usuário pode ser atendida pelo outro nó, todo estado persistente fica no banco. É essa propriedade que torna a replicação possível.
- **Uma única base de código.** Os dois nós executam exatamente o mesmo código. A identidade de cada instância vem apenas das variáveis de ambiente lidas na inicialização.
- **Configuração separada do código.** Endereços, portas e credenciais são injetados por variáveis de ambiente, nunca escritos no código-fonte.
- **Balanceamento observável.** Toda página exibe uma barra no topo indicando qual nó a gerou, com uma cor diferente para cada um. Cada reprodução também é registrada no banco com o nome do nó responsável.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Virtualização | VirtualBox |
| Sistema operacional | Ubuntu Server (sem interface gráfica) |
| Balanceador / proxy reverso | Nginx |
| Aplicação | Node.js, Express, páginas renderizadas no servidor |
| Acesso a dados | Biblioteca `pg` |
| Banco de dados | PostgreSQL |
| Gerência de processos | systemd |
| Teste de carga | Apache Bench (`ab`) |

## Topologia de rede

| Máquina | Papel | Endereço IP | Porta |
| --- | --- | --- | --- |
| VM 1 | Balanceador Nginx | 192.168.56.10 | 80 |
| VM 2 | Nó A da aplicação | 192.168.56.11 | 3000 |
| VM 3 | Nó B da aplicação | 192.168.56.12 | 3000 |
| VM 4 | Banco PostgreSQL | 192.168.56.13 | 5432 |

Cada máquina possui dois adaptadores de rede:

1. **NAT**, para acesso à internet e instalação de pacotes.
2. **Host-only**, na rede `192.168.56.0/24`, para a comunicação entre as máquinas. Os IPs da tabela são fixados neste adaptador com netplan.

## Configuração

### Variáveis de ambiente

A aplicação lê toda a sua configuração do ambiente:

| Variável | Descrição | Exemplo |
| --- | --- | --- |
| `NOME_DO_NO` | Identificador da instância | `NO_A` ou `NO_B` |
| `PORTA` | Porta HTTP da aplicação | `3000` |
| `BANCO_HOST` | Endereço do PostgreSQL | `192.168.56.13` |
| `BANCO_PORTA` | Porta do PostgreSQL | `5432` |
| `BANCO_NOME` | Nome do banco | `streaming` |
| `BANCO_USUARIO` | Usuário da aplicação no banco | `app_streaming` |
| `BANCO_SENHA` | Senha do usuário da aplicação | *(não versionada)* |

> A senha do banco não é versionada. O repositório contém apenas um arquivo de exemplo, e o arquivo real fica somente nas máquinas dos nós.

### Caminhos

| Item | Caminho |
| --- | --- |
| Aplicação | `/opt/streaming` |
| Arquivos de vídeo | `/opt/streaming/public/videos` |
| Variáveis de ambiente do serviço | `/etc/streaming.env` |

## Modelo de dados

```
categorias  (id, nome)
videos      (id, titulo, descricao, duracao_segundos, arquivo, categoria_id → categorias.id)
reproducoes (id, video_id → videos.id, data_hora, no_responsavel)
```

A coluna `reproducoes.no_responsavel` registra qual nó atendeu cada reprodução. A consulta abaixo mostra, a partir do banco, como o balanceador dividiu a carga:

```sql
SELECT no_responsavel, COUNT(*) AS total
FROM reproducoes
GROUP BY no_responsavel;
```

A aplicação acessa o banco com um usuário dedicado (`app_streaming`), que tem apenas as permissões necessárias, em vez do usuário administrador.

Os tipos de cada coluna, os scripts SQL de criação e os dados de exemplo estão em [docs/01-especificacoes/05-banco-de-dados.md](docs/01-especificacoes/05-banco-de-dados.md). A coluna `videos.arquivo` guarda o ID do vídeo no YouTube.

## Funcionalidades

- **Catálogo** com título, categoria e duração de cada vídeo.
- **Página de detalhe** com reprodução pela tag `<video>` do HTML.
- **Registro de reproduções**: cada abertura de vídeo grava uma linha em `reproducoes` com o nó responsável.
- **Indicador de nó**: barra colorida no topo de todas as páginas mostrando qual instância respondeu.
- **Painel de distribuição**: página com a contagem de reproduções por nó.

## Implantação

O passo a passo da criação das VMs, as escolhas do instalador e os problemas encontrados estão em [docs/01-especificacoes/01-vms.md](docs/01-especificacoes/01-vms.md). A configuração de rede, com o netplan de cada máquina e os testes, está em [docs/01-especificacoes/02-rede.md](docs/01-especificacoes/02-rede.md). Os comandos usados em cada VM, com a explicação de cada um, estão em [docs/02-comandos/01-criacao-e-rede-das-vms.md](docs/02-comandos/01-criacao-e-rede-das-vms.md). A lista completa está em [docs/README.md](docs/README.md). Os testes iniciais e seus resultados estão em [docs/03-testes/01-testes-iniciais.md](docs/03-testes/01-testes-iniciais.md). O SSH com chaves da `lb` para as outras VMs (etapa 3) está em [docs/01-especificacoes/03-ssh-entre-vms.md](docs/01-especificacoes/03-ssh-entre-vms.md).

### 1. Rede (todas as máquinas)

Exemplo de netplan para o Nó A. No VirtualBox, as interfaces costumam se chamar `enp0s3` (NAT) e `enp0s8` (host-only). Confira com `ip addr`.

```yaml
# /etc/netplan/50-cloud-init.yaml
network:
  version: 2
  ethernets:
    enp0s3:
      dhcp4: true
    enp0s8:
      dhcp4: false
      addresses:
        - 192.168.56.11/24
```

```bash
sudo netplan apply
```

O acesso administrativo às máquinas é feito por SSH (`openssh-server`).

### 2. Banco de dados (VM 4)

1. Instalar o PostgreSQL.
2. Habilitar conexões pela rede: ajustar `listen_addresses` no `postgresql.conf` e liberar a faixa `192.168.56.0/24` no `pg_hba.conf`. Por padrão, o PostgreSQL só aceita conexões locais.
3. Criar o banco `streaming` e o usuário `app_streaming` com permissões mínimas.
4. Criar as tabelas e carregar o catálogo.

### 3. Aplicação (VM 2 e VM 3)

Instalar o Node.js, copiar a aplicação para `/opt/streaming` e criar o arquivo `/etc/streaming.env` com as variáveis de ambiente, usando `NOME_DO_NO=NO_A` em um nó e `NOME_DO_NO=NO_B` no outro.

A aplicação roda como serviço systemd, para iniciar com a máquina e reiniciar em caso de falha:

```ini
# /etc/systemd/system/streaming.service
[Unit]
Description=Streaming Distribuido - no da aplicacao
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/streaming
EnvironmentFile=/etc/streaming.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
User=streaming

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now streaming
```

### 4. Balanceador (VM 1)

O Nginx na `lb` usa o arquivo [`infra/balanceador/streaming.conf`](infra/balanceador/streaming.conf), instalado em `/etc/nginx/conf.d/streaming.conf`. Ele declara um `upstream` com os dois nós (`192.168.56.11:3000` e `192.168.56.12:3000`, round-robin, `max_fails=2 fail_timeout=10s`) e repassa a porta 80 para ele, com `proxy_next_upstream` para repetir no outro nó uma requisição que falhou. O site `default` do Nginx foi removido para não disputar a porta 80, e o cabeçalho `X-Upstream` informa qual nó respondeu.

```bash
sudo apt-get install -y nginx
sudo cp streaming.conf /etc/nginx/conf.d/streaming.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl enable --now nginx && sudo systemctl reload nginx
```

Com `max_fails` e `fail_timeout`, o Nginx marca como indisponível um nó que deixa de responder e o volta a usar quando ele se recupera. `proxy_next_upstream` faz uma requisição que falhou em um nó ser repetida no outro. A explicação de cada diretiva está em [docs/01-especificacoes/04-nginx-e-upstream.md](docs/01-especificacoes/04-nginx-e-upstream.md), e o teste de balanceamento em [docs/03-testes/02-balanceamento.md](docs/03-testes/02-balanceamento.md).

## Verificação

### Balanceamento

Acesse `http://192.168.56.10` e recarregue a página algumas vezes. A barra do topo deve alternar entre o Nó A e o Nó B. A consulta por `no_responsavel` no banco confirma a divisão.

### Tolerância a falhas

```bash
# em um dos nós
sudo systemctl stop streaming
```

O site continua respondendo, agora sempre pelo nó restante. Ao executar `sudo systemctl start streaming`, o nó volta a receber requisições automaticamente.

### Desempenho

O mesmo teste de carga é executado com um nó e com dois:

```bash
ab -n 1000 -c 50 http://192.168.56.10/
```

As métricas comparadas são o tempo médio de resposta, o percentil 95, as requisições por segundo e a taxa de erro. O percentil 95 é acompanhado junto com a média porque revela as requisições mais lentas que a média esconde.

Também é medido o comportamento durante uma falha: com o sistema sob carga, um nó é desligado, e registra-se quanto tempo o Nginx leva para deixar de usá-lo e quantas requisições falham nesse intervalo.

## Estrutura do repositório

```
streaming-distribuido/
├── app/                 # Aplicação Node.js + Express (copiada para /opt/streaming nos nós)
│   ├── src/             # Código-fonte: rotas, acesso ao banco, páginas
│   └── public/videos/   # Arquivos de vídeo servidos pela aplicação
├── banco/               # Scripts SQL: esquema, carga do catálogo e massa de teste
├── infra/               # Arquivos de configuração das máquinas
│   ├── balanceador/     # VM 1: site do Nginx com o upstream dos dois nós
│   ├── no/              # VM 2 e VM 3: streaming.service e streaming.env.example
│   ├── banco/           # VM 4: ajustes do postgresql.conf e do pg_hba.conf
│   └── netplan/         # Um arquivo de netplan por máquina
├── scripts/             # Scripts de instalação e de implantação
├── testes/              # Comandos e resultados dos testes de carga e de falha
├── docs/                # Diagramas e material de apoio à apresentação
├── .gitignore
└── README.md
```

As pastas ainda vazias contêm um arquivo `.gitkeep`, que só existe para o Git versionar a pasta. Ele pode ser apagado quando a pasta receber o primeiro arquivo.

Arquivos com senha nunca entram no repositório: o `.gitignore` bloqueia `.env` e `*.env`, permitindo apenas os modelos `*.env.example`.
