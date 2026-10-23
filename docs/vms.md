# Criação das máquinas virtuais

Registro de como as quatro VMs do projeto foram criadas e instaladas. A configuração de rede (netplan, IPs fixos) está em [rede.md](rede.md).

> Situação em 23/10/2026. Itens marcados como **pendente** ainda não foram concluídos ou testados.

## Resumo

| VM | Nome / hostname | Papel | IP host-only | RAM | CPUs | Disco | Situação |
| --- | --- | --- | --- | --- | --- | --- | --- |
| VM 1 | `lb` | Balanceador Nginx | 192.168.56.10 | 1 GB | 1 | 10 GB | Instalação do Ubuntu em andamento; IP **pendente** |
| VM 2 | `app-a` | Nó A da aplicação | 192.168.56.11 | 2 GB | 2 | 10 GB | Instalada, IP fixo aplicado e testado |
| VM 3 | `app-b` | Nó B da aplicação | 192.168.56.12 | 2 GB | 2 | 10 GB | Instalada; IP **pendente** |
| VM 4 | `db` | Banco PostgreSQL | 192.168.56.13 | 2 GB | 2 | 15 GB | Instalada, IP fixo aplicado e testado |

O nome da VM no VirtualBox e o hostname do Ubuntu são iguais, e indicam a função da máquina (`lb` = *load balancer*). Hostnames só aceitam letras, números e hífen.

Usuário administrador em todas as VMs: `sdadmin` (o mesmo nas quatro, para facilitar o SSH entre elas). Senhas não são versionadas.

## Ambiente do host

| Item | Valor |
| --- | --- |
| Sistema do host | Windows |
| Hipervisor | VirtualBox 7.2 |
| Pasta das VMs | `F:\UNIP\VMs` |
| ISO | `F:\UNIP\iso\ubuntu-24.04.5-live-server-amd64.iso` (Ubuntu Server 24.04.5 LTS) |
| Rede host-only | `VirtualBox Host-Only Ethernet Adapter`, host em `192.168.56.1` |

A ISO foi baixada de `releases.ubuntu.com` e o SHA256 foi conferido com o valor publicado pela Canonical. A mesma ISO foi reutilizada nas quatro VMs.

## Por que esses recursos

- **lb (1 GB, 1 CPU, 10 GB):** o Ubuntu Server sem interface gráfica usa 300 a 400 MB em repouso, e o Nginx só repassa requisições, consumindo pouca memória e CPU.
- **app-a e app-b (2 GB, 2 CPUs, 10 GB):** o Node.js (motor V8, buffers dos vídeos) e os picos do `npm install` não cabem com folga em 1 GB. Dois núcleos deixam o teste de balanceamento mais realista.
- **db (2 GB, 2 CPUs, 15 GB):** o PostgreSQL mantém páginas em memória (`shared_buffers`) e cria um processo por conexão. Mais disco porque é a única VM que acumula dados, logs e WAL.

Os discos são dinâmicos: o arquivo `.vdi` só cresce conforme o uso. No total as VMs usam cerca de 7 GB de RAM do host.

## Criação com VBoxManage

As VMs foram criadas pela linha de comando do VirtualBox. Exemplo da `app-a`; nas outras muda o nome, a memória, as CPUs e o tamanho do disco conforme a tabela acima.

```powershell
# 1. Cria e registra a VM (arquivo .vbox) em F:\UNIP\VMs\app-a
VBoxManage createvm --name app-a --ostype Ubuntu_64 --register --basefolder F:\UNIP\VMs

# 2. Memória e CPUs
VBoxManage modifyvm app-a --memory 2048 --cpus 2

# 3. Adaptador 1: NAT (internet para o apt)
VBoxManage modifyvm app-a --nic1 nat

# 4. Adaptador 2: host-only (rede 192.168.56.0/24 entre as VMs e o host)
VBoxManage modifyvm app-a --nic2 hostonly --hostonlyadapter2 "VirtualBox Host-Only Ethernet Adapter"

# 5. Disco dinâmico de 10 GB (db: --size 15360)
VBoxManage createmedium disk --filename F:\UNIP\VMs\app-a\app-a.vdi --size 10240 --variant Standard

# 6. Controlador SATA, disco e ISO
VBoxManage storagectl app-a --name SATA --add sata --controller IntelAhci
VBoxManage storageattach app-a --storagectl SATA --port 0 --device 0 --type hdd --medium F:\UNIP\VMs\app-a\app-a.vdi
VBoxManage storageattach app-a --storagectl SATA --port 1 --device 0 --type dvddrive --medium F:\UNIP\iso\ubuntu-24.04.5-live-server-amd64.iso
```

| VM | `--memory` | `--cpus` | `--size` (MB) | Disco |
| --- | --- | --- | --- | --- |
| lb | 1024 | 1 | 10240 | `F:\UNIP\VMs\lb\lb.vdi` |
| app-a | 2048 | 2 | 10240 | `F:\UNIP\VMs\app-a\app-a.vdi` |
| app-b | 2048 | 2 | 10240 | `F:\UNIP\VMs\app-b\app-b.vdi` |
| db | 2048 | 2 | 15360 | `F:\UNIP\VMs\db\db.vdi` |

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
| lb | **pendente** (instalação em andamento) | **pendente** |
| app-a | `app-a` (após correção, ver abaixo) | ok |
| app-b | ok (Ubuntu instalado, login `sdadmin` no console) | `enp0s3` com 10.0.2.15 |
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

### Configuração pelo console com `keyboardputstring`

Parte da configuração foi feita digitando no console das VMs a partir do host, com `VBoxManage controlvm <vm> keyboardputstring "..."` e conferindo a tela com `VBoxManage controlvm <vm> screenshotpng`. Não precisa de Guest Additions. Observações:

- Os símbolos usados no netplan (`/`, `:`, `-`, `[]`, `{}`, `|`, `>`) chegaram corretos com o teclado em Português (Brasil).
- O primeiro caractere de um comando às vezes se perde; começar com um Enter vazio evita isso.
- A senha do `sudo` é sempre digitada pelo próprio usuário na janela da VM (`sudo -v` libera o sudo por 15 minutos).

## Pendências

- [ ] `lb`: concluir a instalação, fixar `192.168.56.10` e testar.
- [ ] `app-b`: fixar `192.168.56.12` e testar.
- [ ] `db`: confirmar o login `ssh sdadmin@192.168.56.13` a partir do Windows (ping e porta 22 já respondem).
- [ ] Ping de todas as VMs para a `lb` (`ping -c 3 192.168.56.10`), que depende do item acima.
- [ ] `db`: decidir se expande o LVM para os 15 GB.
