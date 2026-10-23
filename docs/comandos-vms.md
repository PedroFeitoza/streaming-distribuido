# Comandos usados nas VMs app-a, app-b e db

Passo a passo dos comandos executados para criar e configurar as VMs `app-a`, `app-b` e `db` (a `lb` seguiu o mesmo roteiro, com 1 GB de RAM, 1 CPU e IP `192.168.56.10`; o netplan dela está em [`infra/netplan/lb.yaml`](../infra/netplan/lb.yaml)), com o que cada um faz e por que foi usado. O contexto e as decisões estão em [vms.md](vms.md) e [rede.md](rede.md).

> **Sobre a exatidão:** os valores (nomes, memória, CPUs, tamanhos, caminhos, IPs) e os comandos do console são os usados. Os parâmetros do controlador de disco (`storagectl` e `storageattach`), como o nome `SATA` e as portas, não ficaram registrados; aparecem aqui na forma padrão, que dá o mesmo resultado.

## Parte 1 — Criar a VM no host (PowerShell, Windows)

Troque `<PASTA_DAS_VMS>` pela pasta onde as VMs ficam e `<PASTA_DA_ISO>` pela pasta onde está a ISO do Ubuntu.

Estes comandos rodam no Windows, com o `VBoxManage`, a linha de comando do VirtualBox. Cada um equivale a uma tela do assistente gráfico. O exemplo usa a `app-a`; a tabela no fim da parte mostra o que muda nas outras.

### 1.1 Criar e registrar a VM

```powershell
VBoxManage createvm --name app-a --ostype Ubuntu_64 --register --basefolder <PASTA_DAS_VMS>
```

Cria a "ficha" da VM, um arquivo `.vbox` com toda a configuração dela, numa pasta própria.

- `--name app-a`: nome da VM no VirtualBox. É o mesmo usado depois como hostname do Ubuntu, para a máquina ter um nome só.
- `--ostype Ubuntu_64`: diz ao VirtualBox que o sistema é Ubuntu 64 bits, para ele escolher padrões compatíveis (chipset, relógio, dispositivos).
- `--register`: faz a VM aparecer na lista do VirtualBox. Sem isso o arquivo existiria, mas o VirtualBox não o conheceria.
- `--basefolder <PASTA_DAS_VMS>`: guarda a VM em `<PASTA_DAS_VMS>\app-a`, no disco com mais espaço livre.

### 1.2 Memória e CPUs

```powershell
VBoxManage modifyvm app-a --memory 2048 --cpus 2
```

`modifyvm` altera a configuração de uma VM desligada.

- `--memory 2048`: 2 GB de RAM (o valor é em MB). Os nós rodam Node.js, que precisa de folga para o V8 e para os picos do `npm install`.
- `--cpus 2`: 2 núcleos virtuais, para a VM atender requisições e cuidar do sistema ao mesmo tempo.

### 1.3 Adaptador 1: NAT

```powershell
VBoxManage modifyvm app-a --nic1 nat
```

Liga a placa de rede 1 em modo NAT. A VM sai para a internet através do Windows, como se estivesse atrás de um roteador. É por ela que o `apt install` baixa pacotes. Pelo NAT, porém, nenhuma outra VM consegue chegar até ela.

### 1.4 Adaptador 2: host-only

```powershell
VBoxManage modifyvm app-a --nic2 hostonly --hostonlyadapter2 "VirtualBox Host-Only Ethernet Adapter"
```

Liga a placa de rede 2 à rede privada `192.168.56.0/24`, que existe só dentro do PC.

- `--nic2 hostonly`: modo host-only, em que as VMs e o Windows (`192.168.56.1`) se enxergam, mas nada de fora entra.
- `--hostonlyadapter2 "..."`: qual rede host-only usar. As quatro VMs usam a mesma, por isso conseguem conversar entre si.

### 1.5 Disco

```powershell
VBoxManage createmedium disk --filename <PASTA_DAS_VMS>\app-a\app-a.vdi --size 10240 --variant Standard
```

Cria o disco virtual.

- `--filename`: caminho do arquivo `.vdi`, ao lado da ficha da VM.
- `--size 10240`: 10 GB (em MB). Na `db` foi `15360` (15 GB), porque o banco acumula dados.
- `--variant Standard`: disco **dinâmico**. O arquivo começa pequeno e só cresce conforme o uso, sem ocupar os 10 GB de uma vez.

### 1.6 Controlador, disco e ISO

```powershell
VBoxManage storagectl app-a --name SATA --add sata --controller IntelAhci
VBoxManage storageattach app-a --storagectl SATA --port 0 --device 0 --type hdd --medium <PASTA_DAS_VMS>\app-a\app-a.vdi
VBoxManage storageattach app-a --storagectl SATA --port 1 --device 0 --type dvddrive --medium <PASTA_DA_ISO>\ubuntu-24.04.5-live-server-amd64.iso
```

É como montar o hardware: instalar a placa onde se ligam os discos, plugar o HD e colocar o DVD de instalação no leitor.

- `storagectl ... --add sata --controller IntelAhci`: cria um controlador SATA chamado `SATA`, o tipo de controlador que o Ubuntu reconhece sem drivers extras.
- `storageattach ... --port 0 --type hdd`: liga o disco `.vdi` na porta 0.
- `storageattach ... --port 1 --type dvddrive --medium ...iso`: coloca a ISO do Ubuntu Server num leitor de DVD virtual na porta 1. A VM dá boot por ele na primeira vez.

A mesma ISO, já conferida pelo SHA256, foi usada nas quatro VMs.

### 1.7 Conferir

```powershell
VBoxManage showvminfo app-a
```

Mostra a configuração da VM. Deve aparecer `Memory size: 2048MB`, `Number of CPUs: 2`, `NIC 1` como NAT, `NIC 2` como Host-only, o disco e a ISO. Conferido nas três VMs.

### O que muda em cada VM

| VM | `--name` | `--memory` | `--cpus` | `--size` | Disco |
| --- | --- | --- | --- | --- | --- |
| app-a | `app-a` | 2048 | 2 | 10240 | `<PASTA_DAS_VMS>\app-a\app-a.vdi` |
| app-b | `app-b` | 2048 | 2 | 10240 | `<PASTA_DAS_VMS>\app-b\app-b.vdi` |
| db | `db` | 2048 | 2 | 15360 | `<PASTA_DAS_VMS>\db\db.vdi` |

## Parte 2 — Instalar o Ubuntu Server

Feito pela janela da VM, no instalador. As escolhas e os motivos estão em [vms.md](vms.md#escolhas-no-instalador-do-ubuntu-server): teclado Portuguese (Brazil), Ubuntu Server sem minimized, disco inteiro sem LVM, server's name igual ao nome da VM, usuário `sdadmin`, OpenSSH marcado, nenhum snap.

## Parte 3 — Configurar dentro da VM

Os comandos abaixo foram digitados no console de cada VM. Parte deles foi enviada do Windows com `VBoxManage controlvm <vm> keyboardputstring "..."`, que simula o teclado, conferindo a tela com `VBoxManage controlvm <vm> screenshotpng <arquivo>`.

### 3.1 Liberar o sudo

```bash
sudo -v
```

Pede a senha do `sdadmin` uma vez e a deixa válida por 15 minutos, sem rodar nenhum comando. Assim os comandos `sudo` seguintes não param pedindo senha. A senha sempre foi digitada pelo próprio Pedro na janela da VM.

### 3.2 Corrigir o hostname (só na app-a)

A `app-a` foi instalada com o nome `app-b` por engano.

```bash
sudo hostnamectl set-hostname app-a
```

`hostnamectl set-hostname` troca o nome da máquina de forma permanente: grava em `/etc/hostname` e avisa o sistema na hora, sem reiniciar.

```bash
sudo sed -i 's/app-b/app-a/g' /etc/hosts
```

O `/etc/hosts` associa o nome da máquina ao endereço `127.0.1.1`. Se ele continuar com o nome antigo, o `sudo` passa a avisar "unable to resolve host" em todo comando.

- `sed` edita texto pela linha de comando.
- `-i` grava a alteração no próprio arquivo (*in place*), em vez de só mostrar na tela.
- `'s/app-b/app-a/g'`: *substitute*, troca `app-b` por `app-a`; o `g` troca todas as ocorrências da linha.
- As aspas têm que ser **simples** (`'`). Com crase (`` ` ``) o bash tenta executar o texto como comando, que foi o erro da primeira tentativa.

```bash
exec bash
```

O prompt `sdadmin@app-b` é montado só quando o shell abre. `exec bash` troca o shell atual por um novo, que lê o hostname de novo e passa a mostrar `sdadmin@app-a`.

**Conferir:** `hostnamectl --static` responde `app-a`, e `cat /etc/hosts` mostra `127.0.1.1 app-a`.

### 3.3 Ver a rede antes de mudar

```bash
ip -br a
cat /etc/netplan/50-cloud-init.yaml
```

- `ip -br a` lista as interfaces e seus IPs em formato curto (`-br` = *brief*, `a` = *address*).
- O `cat` mostra o netplan criado pelo instalador.

Nas três VMs a `enp0s8` já tinha IP do DHCP da rede host-only (`.102` na app-a, `.104` na app-b, `.103` na db), porque o instalador gravou `dhcp4: true` nas duas interfaces. Por isso o arquivo foi **editado**, e não complementado por outro: um arquivo a mais deixaria a `enp0s8` com dois IPs. Detalhes em [rede.md](rede.md#dhcp-ativo-na-rede-host-only).

### 3.4 Guardar uma cópia do original (app-b e db)

```bash
cp /etc/netplan/50-cloud-init.yaml ~/50-cloud-init.yaml.bak
```

Copia o arquivo original para a pasta do usuário antes de alterá-lo. Se algo der errado, basta copiar de volta e rodar `sudo netplan apply`. A cópia fica fora de `/etc/netplan/` de propósito, para o netplan não tentar lê-la. Na `db` o backup ficou em `~/50-cloud-init.yaml.bak`; na `app-b` também foi gravado um `50-cloud-init.yaml.bak`.

### 3.5 Gravar o netplan com o IP fixo

```bash
sudo tee /etc/netplan/50-cloud-init.yaml > /dev/null <<'EOF'
network:
  version: 2
  ethernets:
    enp0s3:
      dhcp4: true
    enp0s8:
      dhcp4: false
      addresses:
        - 192.168.56.11/24
EOF
```

Reescreve o arquivo do netplan. Na `app-b` o endereço é `192.168.56.12/24` e na `db`, `192.168.56.13/24`. Os arquivos finais de cada VM estão em [`infra/netplan/`](../infra/netplan/).

- `sudo tee <arquivo>` grava como root o que recebe na entrada. Um `sudo echo ... > arquivo` não funcionaria, porque o `>` é feito pelo shell do usuário, sem permissão em `/etc`.
- `> /dev/null` só evita que o `tee` repita o conteúdo na tela.
- `<<'EOF' ... EOF` (*heredoc*) passa várias linhas de texto ao comando. As aspas em `'EOF'` impedem o bash de interpretar `$` e outros símbolos dentro do texto.

O que cada linha do YAML significa está em [rede.md](rede.md#netplan). Em resumo: a `enp0s3` (NAT) continua no DHCP e leva a rota para a internet; a `enp0s8` (host-only) fica com `dhcp4: false` e só o IP fixo, **sem gateway**, para não criar uma segunda rota padrão.

### 3.6 Impedir o cloud-init de reescrever a rede

```bash
echo 'network: {config: disabled}' | sudo tee /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg
```

O arquivo do netplan se chama `50-cloud-init.yaml` porque foi gerado pelo cloud-init, que pode gerá-lo de novo no boot e trazer o `dhcp4: true` de volta. Este arquivo desliga a parte de rede do cloud-init. O prefixo `99-` faz ele ser lido por último e prevalecer.

### 3.7 Permissões e aplicar

```bash
sudo chmod 600 /etc/netplan/50-cloud-init.yaml
sudo netplan apply
```

- `chmod 600` deixa o arquivo legível e gravável só pelo root. O netplan reclama ("permissions too open") quando outros usuários podem lê-lo, porque esses arquivos podem guardar senhas de Wi-Fi.
- `netplan apply` gera a configuração para o `systemd-networkd` e aplica na hora.
- Foi usado `apply` em vez de `netplan try` porque os comandos eram digitados remotamente, sem como apertar Enter dentro dos 120 s que o `try` espera.

### 3.8 Testar

```bash
hostname
ip -br a
ip route
ping -c 3 ubuntu.com
ping -c 3 192.168.56.10
```

- `hostname`: confirma o nome da máquina.
- `ip -br a`: a `enp0s8` deve ter **só** o IP fixo.
- `ip route`: deve haver uma única rota `default`, `via 10.0.2.2 dev enp0s3`, ou seja, a internet sai pelo NAT.
- `ping -c 3 ubuntu.com`: testa DNS e internet; `-c 3` manda três pacotes e para.
- `ping -c 3 192.168.56.10`: testa a rede host-only até a `lb`.

No Windows (PowerShell):

```powershell
ping 192.168.56.11
ssh sdadmin@192.168.56.11
```

O primeiro pacote do ping às vezes se perde, enquanto o Windows descobre o endereço da VM (ARP). É normal.

### Resultados

| Teste | app-a | app-b | db |
| --- | --- | --- | --- |
| `hostname` | `app-a` | `app-b` | `db` |
| `enp0s8` | só `192.168.56.11/24` | só `192.168.56.12/24` | só `192.168.56.13/24` |
| Rota padrão | via `enp0s3` | via `enp0s3` | via `enp0s3` |
| `ping ubuntu.com` | 3/3 | 2/2 | 3/3 |
| Ping do Windows | ok | ok | 3/3, porta 22 aberta |
| `ping 192.168.56.10` | falha | falha | falha |

Na primeira rodada o ping para a `lb` falhou com *Destination Host Unreachable* porque a `lb` ainda não tinha o IP `.10`. Não era defeito destas VMs. Agora a `lb` tem o IP, e o ping a partir de cada VM deve ser repetido (**pendente**).
