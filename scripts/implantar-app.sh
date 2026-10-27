#!/usr/bin/env bash
# Atualiza a aplicacao de um no (app-a ou app-b) com os arquivos copiados para a
# pasta deste script. Rodar no proprio no, com sudo:
#   sudo bash ~/streaming-novo/implantar-app.sh
# Nao mexe em /etc/streaming.env: o nome do no e a senha do banco continuam os mesmos.
set -euo pipefail

ORIGEM="$(cd "$(dirname "$0")" && pwd)"
DESTINO=/opt/streaming
DONO=sdadmin
GRUPO=streaming
COPIA="/opt/streaming.bak-$(date +%Y%m%d-%H%M%S)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode com sudo: sudo bash $0"
  exit 1
fi
for item in server.js package.json package-lock.json views; do
  if [ ! -e "$ORIGEM/$item" ]; then
    echo "Falta $item em $ORIGEM"
    exit 1
  fi
done
if [ ! -f /etc/streaming.env ]; then
  echo "Falta /etc/streaming.env (modelo em infra/no/streaming.env.example)"
  exit 1
fi

PORTA=$(sed -n 's/^PORTA=//p' /etc/streaming.env)
PORTA=${PORTA:-3000}

echo "1/5 Copia de seguranca da versao atual em $COPIA"
if [ -d "$DESTINO" ]; then
  cp -a "$DESTINO" "$COPIA"
else
  mkdir -p "$DESTINO"
fi

echo "2/5 Copiando o codigo novo para $DESTINO"
rm -rf "$DESTINO/views"
cp "$ORIGEM/server.js" "$ORIGEM/package.json" "$ORIGEM/package-lock.json" "$DESTINO/"
cp -r "$ORIGEM/views" "$DESTINO/"
mkdir -p "$DESTINO/public/videos"
chown -R "$DONO:$GRUPO" "$DESTINO"

echo "3/5 Instalando as dependencias (npm ci) como $DONO"
# umask 022: as pastas criadas pelo npm nao ficam com escrita para o grupo streaming
sudo -u "$DONO" bash -c "umask 022 && cd '$DESTINO' && npm ci --omit=dev --no-audit --no-fund"
# O usuario do servico (grupo streaming) so le o codigo, nao altera
chown -R "$DONO:$GRUPO" "$DESTINO"
chmod -R u+rwX,go+rX,go-w "$DESTINO"

echo "4/5 Reiniciando o servico streaming"
# reset-failed zera o limite de reinicios do systemd: depois de 5 falhas seguidas
# ele recusa novos starts ("Start request repeated too quickly") por um tempo.
systemctl reset-failed streaming 2>/dev/null || true
systemctl restart streaming || true

echo "5/5 Conferindo a aplicacao na porta $PORTA"
for tentativa in $(seq 1 15); do
  if curl -fs -o /dev/null "http://localhost:$PORTA/"; then
    break
  fi
  sleep 1
done

if curl -fsS -o /dev/null "http://localhost:$PORTA/"; then
  echo "Servico: $(systemctl is-active streaming)"
  echo "Banco:   $(curl -fsS "http://localhost:$PORTA/teste-banco")"
  echo "OK. Copia da versao anterior em $COPIA"
else
  echo "FALHOU. Ultimas linhas do log do servico:"
  journalctl -u streaming -n 20 --no-pager || true
  echo
  echo "Para voltar a versao anterior:"
  echo "  sudo rm -rf $DESTINO && sudo mv $COPIA $DESTINO && sudo systemctl reset-failed streaming && sudo systemctl restart streaming"
  exit 1
fi
