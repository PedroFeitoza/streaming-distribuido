# Criação das máquinas virtuais

Registro de como as quatro VMs do projeto foram criadas e instaladas. A configuração de rede (netplan, IPs fixos) está em [rede.md](rede.md), e o passo a passo com cada comando explicado está em [comandos-vms.md](comandos-vms.md).

> Situação em 23/10/2026. Itens marcados como **pendente** ainda não foram concluídos ou testados.

## Resumo

| VM | Nome / hostname | Papel | IP host-only | RAM | CPUs | Disco | Situação |
| --- | --- | --- | --- | --- | --- | --- | --- |
| VM 1 | `lb` | Balanceador Nginx | 192.168.56.10 | 1 GB | 1 | 10 GB | Instalada, IP fixo aplicado e testado; Nginx **pendente** |
| VM 2 | `app-a` | Nó A da aplicação | 192.168.56.11 | 2 GB | 2 | 10 GB | Instalada, IP fixo aplicado e testado |
| VM 3 | `app-b` | Nó B da aplicação | 192.168.56.12 | 2 GB | 2 | 10 GB | Instalada, IP fixo aplicado e testado |
| VM 4 | `db` | Banco PostgreSQL | 192.168.56.13 | 2 GB | 2 | 15 GB | Instalada, IP fixo aplicado e testado |

O nome da VM no VirtualBox e o hostname do Ubuntu são iguais, e indicam a função da máquina (`lb` = *load balancer*). Hostnames só aceitam letras, números e hífen.

Usuário administrador em todas as VMs: `sdadmin` (o mesmo nas quatro, para facilitar o SSH entre elas). Senhas não são versionadas.

## Ambiente do host

| Item | Valor |
| --- | --- |
| Sistema do host | Windows |
| Hipervisor | VirtualBox 7.2 |
| Pasta das VMs | `<PASTA_DAS_VMS>` (qualquer pasta num disco com espaço livre) |
| ISO | `<PASTA_DA_ISO>\ubuntu-24.04.5-live-server-amd64.iso` (Ubuntu Server 24.04.5 LTS) |
| Rede host-only | `VirtualBox Host-Only Ethernet Adapter`, host em `192.168.56.1` |

Nos comandos, `<PASTA_DAS_VMS>` e `<PASTA_DA_ISO>` são marcadores: troque pelos caminhos da sua máquina.

A ISO foi baixada de `releases.ubuntu.com` e o SHA256 foi conferido com o valor publicado pela Canonical. A mesma ISO foi reutilizada nas quatro VMs.

## Por que esses recursos

- **lb (1 GB, 1 CPU, 10 GB):** o Ubuntu Server sem interface gráfica usa 300 a 400 MB em repouso, e o Nginx só repassa requisições, consumindo pouca memória e CPU.
- **app-a e app-b (2 GB, 2 CPUs, 10 GB):** o Node.js (motor V8, buffers dos vídeos) e os picos do `npm install` não cabem com folga em 1 GB. Dois núcleos deixam o teste de balanceamento mais realista.
- **db (2 GB, 2 CPUs, 15 GB):** o PostgreSQL mantém páginas em memória (`shared_buffers`) e cria um processo por conexão. Mais disco porque é a única VM que acumula dados, logs e WAL.

Os discos são dinâmicos: o arquivo `.vdi` só cresce conforme o uso. No total as VMs usam cerca de 7 GB de RAM do host.

## Criação com VBoxManage

As VMs foram criadas pela linha de comando do VirtualBox. A explicação de cada comando e opção está em [comandos-vms.md](comandos-vms.md#parte-1--criar-a-vm-no-host-powershell-windows). Exemplo da `app-a`; nas outras muda o nome, a memória, as CPUs e o tamanho do disco conforme a tabela acima.

```powershell
# 1. Cria e registra a VM (arquivo .vbox) em <PASTA_DAS_VMS>\app-a
VBoxManage createvm --name app-a --ostype Ubuntu_64 --register --basefolder <PASTA_DAS_VMS>

# 2. Memória e CPUs
VBoxManage modifyvm app-a --memory 2048 --cpus 2

# 3. Adaptador 1: NAT (internet para o apt)
VBoxManage modifyvm app-a --nic1 nat

# 4. Adaptador 2: host-only (rede 192.168.56.0/24 entre as VMs e o host)
VBoxManage modifyvm app-a --nic2 hostonly --hostonlyadapter2 "VirtualBox Host-Only Ethernet Adapter"

# 5. Disco dinâmico de 10 GB (db: --size 15360)
VBoxManage createmedium disk --filename <PASTA_DAS_VMS>\app-a\app-a.vdi --size 10240 --variant Standard

# 6. Controlador SATA, disco e ISO
VBoxManage storagectl app-a --name SATA --add sata --controller IntelAhci
VBoxManage storageattach app-a --storagectl SATA --port 0 --device 0 --type hdd --medium <PASTA_DAS_VMS>\app-a\app-a.vdi
VBoxManage storageattach app-a --storagectl SATA --port 1 --device 0 --type dvddrive --medium <PASTA_DA_ISO>\ubuntu-24.04.5-live-server-amd64.iso
```

| VM | `--memory` | `--cpus` | `--size` (MB) | Disco |
| --- | --- | --- | --- | --- |
| lb | 1024 | 1 | 10240 | `<PASTA_DAS_VMS>\lb\lb.vdi` |
| app-a | 2048 | 2 | 10240 | `<PASTA_DAS_VMS>\app-a\app-a.vdi` |
| app-b | 2048 | 2 | 10240 | `<PASTA_DAS_VMS>\app-b\app-b.vdi` |
| db | 2048 | 2 | 15360 | `<PASTA_DAS_VMS>\db\db.vdi` |

**Como conferir:** `VBoxManage showvminfo <nome>` deve mostrar a memória e as CPUs da tabela, `nic1="nat"`, `nic2="hostonly"`, o disco e a ISO no drive de DVD. Isso foi conferido nas quatro VMs.

## Escolhas no instalador do Ubuntu Server

| Tela | Escolha | Motivo |
| --- | --- | --- |
| Teclado | Portuguese (Brazil) | Acentos e Ç funcionando no console |
| Tipo de instalação | Ubuntu Server, **sem** "minimized" | A versão minimized vem sem `ping` e `nano` |
| Rede | Padrão | `enp0s3` pega IP por DHCP do NAT; o IP fixo da `enp0s8` é feito depois com netplan |
| Proxy e mirror | Padrão | |
| Disco | "Use an entire disk", **desmarcar** "Set up this disk as an LVM group" | Com LVM o instalador só usa parte do disco para `/` |
| Perfil | Server's name = nome da VM, usuário `sdadmin` | Mesmo usuário nas quatro VMs |
| Ubuntu Pro | Pular | |
| SSH | **Marcar** "Install OpenSSH server" | Acesso remoto às VMs |
| Snaps | Nenhum | O PostgreSQL, o Node.js e o Nginx são instalados depois pelo grupo |

No fim, "Reboot Now".

## Verificações após a instalação

Logado no console da VM:

```bash
hostname            # deve responder o nome da VM
ip -br a            # enp0s3 com 10.0.2.15 (NAT)
ping -c 3 ubuntu.com
```

| VM | hostname | NAT / internet |
| --- | --- | --- |
| lb | `lb` | ok (0% de perda) |
| app-a | `app-a` (após correção, ver abaixo) | ok |
| app-b | `app-b` | ok |
| db | `db` | ok |

## Problemas encontrados e soluções

### Nome de usuário `admin`

O instalador reserva alguns nomes de sistema, e `admin` é um deles (era o antigo grupo com acesso ao `sudo`, e ainda aparece no `/etc/sudoers`). Foi usado `sdadmin`.

### Aviso para remover a mídia no reboot

Ao reiniciar após a instalação, o Ubuntu pede para remover a mídia de instalação (o CD-ROM virtual com a ISO). O aviso é inofensivo: basta apertar Enter e a VM inicia pelo disco.

### Hostname errado na `app-a`

A `app-a` foi instalada com o hostname `app-b`. Correção:

```bash
sudo hostnamectl set-hostname app-a
sudo sed -i 's/app-b/app-a/g' /etc/hosts   # 127.0.1.1 app-a
exec bash                                  # o prompt só lê o hostname quando o shell abre
```

O `/etc/hosts` precisa acompanhar o hostname; sem isso o `sudo` avisa "unable to resolve host" a cada comando.

Na primeira tentativa o `sed` foi digitado com crases (`` ` ``) em vez de aspas simples (`'`). No bash, a crase executa o conteúdo como comando, o que gerou "No such file or directory" e "extra characters" no sed.

Conferência: `hostnamectl --static` responde `app-a` e o `/etc/hosts` mostra `127.0.1.1 app-a`.

### LVM marcado na `db`

Na `db` o LVM ficou marcado na instalação, e o `/` ficou com 9,75 GB em vez dos 15 GB do disco. Por enquanto foi mantido assim; o espaço restante pode ser liberado depois com `lvextend` e `resize2fs`, quando o banco precisar. **Pendente**, se o grupo decidir expandir.

### Instalação da `lb` interrompida na fase de atualizações

A `lb` tem só 1 GB de RAM, e o instalador ficou muito tempo na fase "Updating system", baixando e aplicando atualizações de segurança. A instalação foi interrompida nessa fase e a VM seguiu para o primeiro boot sem as atualizações. Os avisos `perl: warning: Setting locale failed` que aparecem nessa tela são inofensivos. As atualizações ficaram para depois, com `sudo apt update && sudo apt upgrade` (**pendente**).

### Acesso de laboratório

Para configurar a `lb` à distância foram criados dois acessos que **devem ser removidos no fim do trabalho**:

- Uma chave SSH pública de laboratório (comentário `claude-lab`) em `~sdadmin/.ssh/authorized_keys`.
- `/etc/sudoers.d/90-lab` com `sdadmin ALL=(ALL) NOPASSWD:ALL`, que libera o `sudo` sem senha. Só é aceitável num laboratório isolado, nunca em produção.

Para remover:

```bash
sudo rm /etc/sudoers.d/90-lab
sed -i '/claude-lab/d' ~/.ssh/authorized_keys
```

### Observação sobre a app-b

A `app-b` apareceu com dois IPs na `enp0s8`, o fixo `192.168.56.12` e o `192.168.56.104` do DHCP. Isso indica que o `.104` pode ter ficado ativo até o DHCP expirar ou até o próximo `netplan apply` ou reinício. Deve ser reconferida com `ip -br a`, e a `enp0s8` deve ter só o `.12` (**pendente**).

### Configuração pelo console com `keyboardputstring`

Parte da configuração foi feita digitando no console das VMs a partir do host, com `VBoxManage controlvm <vm> keyboardputstring "..."` e conferindo a tela com `VBoxManage controlvm <vm> screenshotpng`. Não precisa de Guest Additions. Observações:

- Os símbolos usados no netplan (`/`, `:`, `-`, `[]`, `{}`, `|`, `>`) chegaram corretos com o teclado em Português (Brasil).
- O primeiro caractere de um comando às vezes se perde; começar com um Enter vazio evita isso.
- A senha do `sudo` é sempre digitada pelo próprio usuário na janela da VM (`sudo -v` libera o sudo por 15 minutos).

## Pendências

- [ ] `lb`: atualizar o sistema (`sudo apt update && sudo apt upgrade`), porque a instalação foi interrompida na fase de atualizações.
- [ ] `lb`: instalar o Nginx e configurar o upstream para `192.168.56.11:3000` e `192.168.56.12:3000`.
- [ ] Remover o acesso de laboratório ao fim do trabalho (ver [Acesso de laboratório](#acesso-de-laboratório)).
- [ ] `app-b`: reconferir os IPs da `enp0s8` (ver [Observação sobre a app-b](#observação-sobre-a-app-b)).
- [ ] `db`: confirmar o login `ssh sdadmin@192.168.56.13` a partir do Windows (ping e porta 22 já respondem).
- [ ] Ping da app-a, app-b e db para a `lb` (`ping -c 3 192.168.56.10`); a `lb` já alcança as três.
- [ ] `db`: decidir se expande o LVM para os 15 GB.
