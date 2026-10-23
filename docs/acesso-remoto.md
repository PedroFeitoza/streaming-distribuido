# Acesso remoto do grupo às VMs

As quatro VMs rodam no VirtualBox de um único computador (o anfitrião), na rede host-only `192.168.56.0/24`. Essa rede só existe dentro desse PC. Este documento mostra como os colegas do grupo acessam as VMs pela internet sem expor nada publicamente.

## Visão geral

```
 Colega (casa)                     computador anfitrião                        VMs (host-only)
┌─────────────┐   VPN Tailscale   ┌──────────────────────┐   ┌──────────────────────────┐
│ ssh maria@  │ ════════════════► │ Tailscale            │──►│ lb     192.168.56.10     │
│ 192.168.56.x│   (100.x.x.x)     │ subnet router da rota│   │ app-a  192.168.56.11     │
└─────────────┘                   │ 192.168.56.0/24      │   │ app-b  192.168.56.12     │
                                  └──────────────────────┘   │ db     192.168.56.13     │
                                                             └──────────────────────────┘
```

- **Tailscale** cria uma rede privada (VPN) entre os computadores do grupo. Cada um recebe um IP `100.x.x.x`.
- O computador anfitrião **anuncia a rota** `192.168.56.0/24` (atua como *subnet router*): o que um colega mandar para `192.168.56.11` atravessa a VPN até o computador anfitrião, que repassa para a VM.
- Cada colega tem **o próprio usuário Linux** em cada VM e entra **só com a própria chave SSH**. Ninguém compartilha senha, e dá para saber quem fez o quê.
- Para trabalhar junto: **VS Code Remote-SSH** (cada um edita pelo seu VS Code) e **tmux** (um terminal compartilhado).

> Requisitos: o computador anfitrião ligado com as VMs rodando, e as VMs com o IP fixo do netplan (ver README).

## Etapa 1 — Tailscale no computador anfitrião

No PowerShell como administrador:

```powershell
winget install Tailscale.Tailscale
```

Faça login quando o navegador abrir. A conta usada aqui é a dona da rede (tailnet).

Anuncie a rede das VMs:

```powershell
tailscale set --advertise-routes=192.168.56.0/24
```

No painel <https://login.tailscale.com/admin/machines>:

1. No computador anfitrião, menu `...` → **Edit route settings** → marque `192.168.56.0/24`. Sem essa aprovação a rota anunciada não é usada.
2. No mesmo menu, **Disable key expiry**, para o PC não sair da VPN quando a chave do dispositivo expirar.

**Teste:**

```powershell
tailscale status
tailscale debug prefs   # AdvertiseRoutes deve conter 192.168.56.0/24
```

## Etapa 2 — Colegas entram na VPN

1. O administrador do Tailscale convida cada colega em **Users → Invite users** no painel. Compartilhar só a máquina (*Share*) não basta: máquinas compartilhadas não levam as rotas de sub-rede.
2. Cada colega instala o Tailscale (<https://tailscale.com/download>) e entra pelo convite.
   - Windows e macOS aceitam as rotas por padrão.
   - Linux: `sudo tailscale up --accept-routes`

**Teste (no computador do colega):**

```bash
tailscale status          # deve listar o computador anfitrião
ping 192.168.56.10
```

> Se o colega também tiver VirtualBox com host-only em `192.168.56.0/24`, a rede local dele tem prioridade e o ping vai para a máquina dele. Nesse caso, ele desativa o adaptador host-only local enquanto acessa as VMs do grupo.

## Etapa 3 — Chave SSH de cada colega

Cada colega gera um par de chaves **no próprio computador**:

```bash
ssh-keygen -t ed25519 -C "maria-streaming"
```

Isso cria dois arquivos em `~/.ssh/`:

- `id_ed25519` — chave **privada**. Nunca sai do computador do colega.
- `id_ed25519.pub` — chave **pública**. É esta que o colega manda para o administrador.

A chave pública não é segredo, mas também não precisa ir para o repositório: o administrador recebe o `.pub` por mensagem.

## Etapa 4 — Criar o usuário do colega em cada VM

O script [`scripts/criar-usuario.sh`](../scripts/criar-usuario.sh) cria o usuário sem senha, instala a chave pública em `~/.ssh/authorized_keys` com as permissões certas e coloca o usuário no grupo `grupo` (usado pelo tmux compartilhado). Com `--sudo`, também libera `sudo`.

Dê `--sudo` só a quem vai administrar a VM (instalar pacotes, mexer no Nginx, no systemd, no PostgreSQL).

No computador anfitrião, com a chave `maria.pub` na pasta atual, para as quatro VMs:

```bash
for ip in 10 11 12 13; do
  scp scripts/criar-usuario.sh maria.pub sdadmin@192.168.56.$ip:/tmp/
  ssh -t sdadmin@192.168.56.$ip 'sudo bash /tmp/criar-usuario.sh maria /tmp/maria.pub --sudo && rm /tmp/criar-usuario.sh /tmp/maria.pub'
done
```

**Teste (no computador da colega):**

```bash
ssh maria@192.168.56.11 'whoami; hostname; groups'
```

Deve entrar sem pedir senha e mostrar `maria`, o nome da VM e o grupo `grupo` (e `sudo`, se liberado).

## Etapa 5 — Desligar login por senha no SSH

Com todo mundo entrando por chave, o login por senha pode ser desligado. Faça isso **só depois de testar que a sua própria chave funciona** (`ssh sdadmin@192.168.56.x` sem pedir senha) e **mantenha uma sessão SSH aberta** enquanto testa. Se algo der errado, o console da VM no VirtualBox continua funcionando.

Em cada VM:

```bash
sudo tee /etc/ssh/sshd_config.d/10-acesso-grupo.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sudo sshd -t && sudo systemctl restart ssh
```

O prefixo `10-` faz este arquivo ser lido antes do `50-cloud-init.conf`; no `sshd`, vale o primeiro valor encontrado.

**Teste:**

```bash
sudo sshd -T | grep -Ei 'passwordauthentication|permitrootlogin'
ssh -o PubkeyAuthentication=no sdadmin@192.168.56.11   # deve recusar: Permission denied (publickey)
```

## Etapa 6 — Atalhos no `~/.ssh/config`

Para não digitar IP e usuário toda vez, cada um cria (ou completa) o `~/.ssh/config` no próprio computador, trocando `maria` pelo seu usuário:

```
Host lb
    HostName 192.168.56.10
Host app-a
    HostName 192.168.56.11
Host app-b
    HostName 192.168.56.12
Host db
    HostName 192.168.56.13

Host lb app-a app-b db
    User maria
    IdentityFile ~/.ssh/id_ed25519
```

No Windows o arquivo fica em `C:\Users\<voce>\.ssh\config`. Depois disso, `ssh app-a` basta.

## Etapa 7 — VS Code Remote-SSH

1. Instale a extensão **Remote - SSH** (`ms-vscode-remote.remote-ssh`).
2. `F1` → **Remote-SSH: Connect to Host...** → escolha `app-a` (vem do `~/.ssh/config`).
3. **File → Open Folder** → `/opt/streaming`.

Para editar `/opt/streaming`, o usuário precisa de permissão de escrita na pasta. Uma forma é dar a pasta ao grupo do projeto (em cada nó, com `sudo`):

```bash
sudo chgrp -R grupo /opt/streaming
sudo chmod -R g+rwX /opt/streaming
sudo find /opt/streaming -type d -exec chmod g+s {} +   # arquivos novos herdam o grupo
```

## Etapa 8 — Terminal compartilhado com tmux

O tmux mantém uma sessão de terminal viva no servidor. Quem se conecta ao mesmo *socket* vê e digita no mesmo terminal, útil para acompanhar uma instalação ou depurar junto.

Uma vez por VM, crie uma pasta para o socket que só o `grupo` acessa:

```bash
sudo install -d -m 2770 -g grupo /srv/tmux
```

Quem abre a sessão:

```bash
tmux -S /srv/tmux/grupo new -s grupo
chmod 660 /srv/tmux/grupo   # dentro da sessão, libera o socket para o grupo
# A partir do tmux 3.3, só o dono entra no servidor; libere cada membro do grupo:
for u in $(getent group grupo | cut -d: -f4 | tr , ' '); do
  tmux -S /srv/tmux/grupo server-access -a "$u"
done
```

Quem entra depois:

```bash
tmux -S /srv/tmux/grupo attach -t grupo
```

Comandos úteis dentro do tmux: `Ctrl+b d` sai sem encerrar a sessão; `Ctrl+b c` abre uma nova janela; `Ctrl+b n` vai para a próxima.

> Todo mundo na sessão digita como o usuário que a criou. Se essa pessoa tem `sudo`, os outros também têm ali dentro.

## Remover o acesso de alguém

Em cada VM:

```bash
sudo deluser --remove-home maria
sudo rm -f /etc/sudoers.d/90-maria
```

E, no painel do Tailscale, remova o usuário em **Users**.

## Problemas comuns

| Sintoma | Causa provável | O que verificar |
| --- | --- | --- |
| `ping 192.168.56.10` falha no colega, mas `tailscale ping <nome-do-anfitriao>` funciona | Rota não aprovada ou não aceita | Painel → *Edit route settings*; no Linux, `--accept-routes` |
| Nada responde, nem `tailscale ping` | computador anfitrião desligado ou fora da VPN | `tailscale status` no computador anfitrião |
| Ping funciona, SSH dá `Connection refused` | `sshd` parado na VM | `sudo systemctl status ssh` na VM |
| `Permission denied (publickey)` | Chave errada ou permissões de `~/.ssh` | `ssh -v` no colega; na VM, `ls -la ~maria/.ssh` (700 na pasta, 600 no arquivo) |
| SSH funciona do computador anfitrião mas não pela VPN | Repasse de rede do anfitrião com problema | Alternativa: instalar o Tailscale na VM `lb` e anunciar a rota a partir dela (`sudo tailscale up --advertise-routes=192.168.56.0/24`) |

## O que nunca vai para o repositório

Chaves privadas, senhas, auth keys do Tailscale e e-mails dos integrantes. Chaves públicas também ficam fora: o administrador as recebe por mensagem e instala direto nas VMs.
