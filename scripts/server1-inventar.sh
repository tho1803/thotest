#!/usr/bin/env bash
#
# server1-inventar.sh — liest den bestehenden Hetzner-Server aus.
#
# Das Skript ist bewusst read-only: es installiert nichts, startet nichts neu
# und schreibt keine Datei ausserhalb der Ausgabedatei. Umgebungsvariablen,
# .env-Dateien, Schluessel und Passwoerter werden NICHT ausgegeben.
#
# Aufruf auf Server 1:
#   bash server1-inventar.sh > inventar.txt 2>&1
#
# Danach inventar.txt einmal selbst durchsehen und erst dann weitergeben.

set -uo pipefail

have() { command -v "$1" >/dev/null 2>&1; }

kopf() {
  printf '\n===== %s =====\n' "$1"
}

kopf "System"
if have hostnamectl; then hostnamectl; else uname -a; fi
echo "Uptime: $(uptime -p 2>/dev/null || uptime)"

kopf "Ressourcen"
free -h 2>/dev/null || echo "free nicht verfuegbar"
echo
df -h -x tmpfs -x devtmpfs 2>/dev/null
echo
echo "CPU-Kerne: $(nproc 2>/dev/null || echo unbekannt)"

kopf "Webserver und Reverse Proxy"
for dienst in nginx apache2 caddy traefik haproxy; do
  if have systemctl && systemctl list-unit-files 2>/dev/null | grep -q "^${dienst}\.service"; then
    printf '%-10s %s\n' "$dienst" "$(systemctl is-active "$dienst" 2>/dev/null)"
  fi
done
if have nginx; then echo; nginx -v 2>&1; fi
if [ -d /etc/nginx/sites-enabled ]; then
  echo "Aktive nginx-Sites:"
  ls -1 /etc/nginx/sites-enabled 2>/dev/null
fi

kopf "Docker"
if have docker; then
  docker --version
  echo
  echo "Laufende Container (ohne Umgebungsvariablen):"
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null \
    || echo "docker ps fehlgeschlagen — evtl. sudo noetig"
  echo
  echo "Compose-Projekte:"
  docker ps -a --format '{{.Label "com.docker.compose.project"}}' 2>/dev/null \
    | grep -v '^$' | sort -u || echo "keine"
else
  echo "Docker nicht installiert"
fi

kopf "Management-Panels"
for pfad in /data/coolify /opt/coolify /var/lib/dokploy /captain /usr/local/psa /usr/local/cpanel; do
  [ -e "$pfad" ] && echo "gefunden: $pfad"
done
if have docker; then
  docker ps --format '{{.Names}} {{.Image}}' 2>/dev/null \
    | grep -Ei 'coolify|dokploy|caprover|portainer|plesk' || true
fi

kopf "Datenbanken"
for dienst in postgresql mariadb mysql mongod redis-server; do
  if have systemctl && systemctl list-unit-files 2>/dev/null | grep -q "^${dienst}\.service"; then
    printf '%-14s %s\n' "$dienst" "$(systemctl is-active "$dienst" 2>/dev/null)"
  fi
done

kopf "Laufzeitumgebungen"
for werkzeug in node npm python3 php composer git; do
  if have "$werkzeug"; then
    printf '%-10s %s\n' "$werkzeug" "$("$werkzeug" --version 2>&1 | head -1)"
  fi
done

kopf "Offene Ports"
if have ss; then
  ss -tlnp 2>/dev/null | head -40 || ss -tln | head -40
else
  echo "ss nicht verfuegbar"
fi

kopf "Firewall"
if have ufw; then ufw status verbose 2>/dev/null || echo "ufw braucht root"; fi
if have nft; then echo; nft list ruleset 2>/dev/null | head -30 || true; fi

kopf "SSH-Konfiguration"
if [ -r /etc/ssh/sshd_config ]; then
  grep -Ei '^\s*(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication|Port)\b' \
    /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null \
    | grep -v '^\s*#' || echo "keine expliziten Eintraege — es gelten die Standardwerte"
else
  echo "sshd_config nicht lesbar (ohne root normal)"
fi

kopf "Automatische Updates"
if [ -f /etc/apt/apt.conf.d/20auto-upgrades ]; then
  cat /etc/apt/apt.conf.d/20auto-upgrades
else
  echo "unattended-upgrades nicht konfiguriert"
fi

kopf "Zertifikate"
if have certbot; then certbot certificates 2>/dev/null | grep -E 'Certificate Name|Domains|Expiry' || echo "certbot braucht root"; fi
[ -d /etc/letsencrypt/live ] && ls -1 /etc/letsencrypt/live 2>/dev/null

kopf "Cronjobs des aktuellen Benutzers"
crontab -l 2>/dev/null || echo "keine"

kopf "Webverzeichnisse"
for pfad in /var/www /srv /opt /home; do
  [ -d "$pfad" ] && { echo "--- $pfad"; ls -1 "$pfad" 2>/dev/null | head -20; }
done

kopf "Fertig"
echo "Bitte die Ausgabe vor dem Weitergeben einmal selbst durchsehen."
