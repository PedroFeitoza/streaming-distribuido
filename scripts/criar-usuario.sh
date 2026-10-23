#!/usr/bin/env bash
# Cria a conta de um colega do grupo em uma VM, com acesso SSH apenas por chave.
#
# Uso (dentro da VM, como root):
#   sudo bash criar-usuario.sh <usuario> <arquivo-da-chave-publica.pub> [--sudo]
#
# Exemplo:
#   sudo bash criar-usuario.sh maria /tmp/maria.pub --sudo
#
# O que o script faz:
#   1. Confere se o arquivo recebido é mesmo uma chave PÚBLICA válida.
#   2. Cria o usuário sem senha (o login só funciona com a chave).
#   3. Coloca a chave em ~/.ssh/authorized_keys com as permissões que o SSH exige.
#   4. Coloca o usuário no grupo "grupo", usado pela sessão tmux compartilhada.
#   5. Com --sudo, dá permissão de administrador (sudo sem senha, porque a conta não tem senha).
#
# Pode ser executado de novo para o mesmo usuário: a chave só é adicionada se ainda não existir.

set -euo pipefail

GRUPO_COMPARTILHADO="grupo"

uso() {
    echo "Uso: sudo bash $0 <usuario> <arquivo-da-chave-publica.pub> [--sudo]" >&2
    exit 1
}

[ "$#" -ge 2 ] || uso
USUARIO="$1"
CHAVE="$2"
DAR_SUDO="nao"
[ "${3:-}" = "--sudo" ] && DAR_SUDO="sim"

if [ "$(id -u)" -ne 0 ]; then
    echo "Erro: execute com sudo." >&2
    exit 1
fi

# Nome de usuário Linux: letras minúsculas, números, - e _, começando por letra.
if ! [[ "$USUARIO" =~ ^[a-z][a-z0-9_-]{0,31}$ ]]; then
    echo "Erro: nome de usuário inválido: '$USUARIO' (use letras minúsculas, ex.: maria)." >&2
    exit 1
fi

if [ ! -f "$CHAVE" ]; then
    echo "Erro: arquivo de chave não encontrado: $CHAVE" >&2
    exit 1
fi

# Uma chave privada nunca deve sair do computador do colega. Se alguém mandou a errada, para aqui.
if grep -q "PRIVATE KEY" "$CHAVE"; then
    echo "Erro: $CHAVE é uma chave PRIVADA. Peça ao colega o arquivo .pub e apague este." >&2
    exit 1
fi

# ssh-keygen -l só funciona com uma chave pública válida; mostra a impressão digital.
if ! ssh-keygen -l -f "$CHAVE"; then
    echo "Erro: $CHAVE não é uma chave pública SSH válida." >&2
    exit 1
fi

getent group "$GRUPO_COMPARTILHADO" >/dev/null || groupadd "$GRUPO_COMPARTILHADO"

if id "$USUARIO" >/dev/null 2>&1; then
    echo "Usuário $USUARIO já existe; atualizando a chave."
else
    adduser --disabled-password --gecos "" "$USUARIO"
fi
usermod -aG "$GRUPO_COMPARTILHADO" "$USUARIO"

HOME_USUARIO="$(getent passwd "$USUARIO" | cut -d: -f6)"
install -d -m 700 -o "$USUARIO" -g "$USUARIO" "$HOME_USUARIO/.ssh"
AUTORIZADAS="$HOME_USUARIO/.ssh/authorized_keys"
touch "$AUTORIZADAS"

LINHA_CHAVE="$(grep -v '^[[:space:]]*$' "$CHAVE" | head -n 1)"
if grep -qxF "$LINHA_CHAVE" "$AUTORIZADAS"; then
    echo "A chave já estava autorizada."
else
    echo "$LINHA_CHAVE" >> "$AUTORIZADAS"
    echo "Chave adicionada."
fi
chown "$USUARIO:$USUARIO" "$AUTORIZADAS"
chmod 600 "$AUTORIZADAS"

if [ "$DAR_SUDO" = "sim" ]; then
    usermod -aG sudo "$USUARIO"
    ARQ_SUDOERS="/etc/sudoers.d/90-$USUARIO"
    echo "$USUARIO ALL=(ALL) NOPASSWD:ALL" > "$ARQ_SUDOERS"
    chmod 440 "$ARQ_SUDOERS"
    # visudo -c valida a sintaxe; um sudoers quebrado travaria o sudo de todo mundo.
    if ! visudo -c -f "$ARQ_SUDOERS" >/dev/null; then
        rm -f "$ARQ_SUDOERS"
        echo "Erro: regra de sudo inválida, removida." >&2
        exit 1
    fi
    echo "sudo liberado para $USUARIO."
fi

echo "Pronto: $USUARIO pode entrar com 'ssh $USUARIO@$(hostname -I | awk '{print $2}')'."
