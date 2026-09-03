#!/usr/bin/env bash
#
# server2-bootstrap.sh — richtet einen frischen Hetzner-Cloud-Server ein.
#
# Fuer Ubuntu 24.04 und 26.04 LTS. Laeuft einmalig als root, direkt nach der
# Bestellung. Ein zweiter Lauf ist ungefaehrlich, das Skript ist idempotent.
#
#   ssh root@<neue-ip>
#   curl -fsSL <raw-url-dieser-datei> -o bootstrap.sh
#   less bootstrap.sh          # erst lesen, dann laufen lassen
#   bash bootstrap.sh --user thomas --coolify
#
# Was es macht: Benutzer mit sudo anlegen, SSH auf Schluessel umstellen,
# Firewall und fail2ban aktivieren, Sicherheitsupdates einschalten, Docker
# installieren und auf Wunsch Coolify.
#
# Was es NICHT macht: Ports veraendern, Daten kopieren, irgendetwas an einen
# anderen Rechner senden.

set -euo pipefail

BENUTZER=""
MIT_COOLIFY=0
ZEITZONE="Europe/Berlin"
SWAP_GB=auto   # auto = nach RAM bemessen; oder feste Zahl in GB, 0 schaltet ab

rot()  { printf '\033[31m%s\033[0m\n' "$*"; }
gruen(){ printf '\033[32m%s\033[0m\n' "$*"; }
info() { printf '\n\033[1m>> %s\033[0m\n' "$*"; }
abbruch() { rot "Abbruch: $*"; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --user)     BENUTZER="${2:-}"; shift 2 ;;
    --coolify)  MIT_COOLIFY=1; shift ;;
    --zeitzone) ZEITZONE="${2:-}"; shift 2 ;;
    --swap)     SWAP_GB="${2:-}"; shift 2 ;;
    -h|--help)
      awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"
      exit 0 ;;
    *) abbruch "unbekannte Option: $1" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || abbruch "muss als root laufen"
[ -n "$BENUTZER" ] || abbruch "kein Benutzername angegeben (--user NAME)"
echo "$BENUTZER" | grep -qE '^[a-z_][a-z0-9_-]{0,31}$' \
  || abbruch "ungueltiger Benutzername: $BENUTZER"

# ---------------------------------------------------------------------------
# Schluessel pruefen, bevor irgendetwas an SSH geaendert wird.
# Ohne hinterlegten Schluessel wuerde das Skript den Zugang abschneiden.
# ---------------------------------------------------------------------------
info "SSH-Schluessel pruefen"
ROOT_KEYS=/root/.ssh/authorized_keys
if [ ! -s "$ROOT_KEYS" ]; then
  abbruch "in $ROOT_KEYS liegt kein Schluessel.
Bitte zuerst den oeffentlichen Schluessel des MacBooks hinterlegen, sonst
sperrt dich dieses Skript aus. Vom Mac aus:
    ssh-copy-id root@<ip>
oder den Schluessel im Hetzner-Panel dem Server zuweisen und neu erstellen."
fi
gruen "$(grep -c . "$ROOT_KEYS") Schluessel gefunden"

info "Grundpakete installieren"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  ca-certificates curl gnupg ufw fail2ban unattended-upgrades \
  git htop tmux rsync jq unzip

info "Zeitzone auf $ZEITZONE setzen"
timedatectl set-timezone "$ZEITZONE"

# ---------------------------------------------------------------------------
info "Benutzer $BENUTZER anlegen"
# ---------------------------------------------------------------------------
if id "$BENUTZER" >/dev/null 2>&1; then
  echo "existiert bereits, wird uebernommen"
else
  adduser --disabled-password --gecos "" "$BENUTZER"
fi
usermod -aG sudo "$BENUTZER"

install -d -m 700 -o "$BENUTZER" -g "$BENUTZER" "/home/$BENUTZER/.ssh"
cp "$ROOT_KEYS" "/home/$BENUTZER/.ssh/authorized_keys"
chown "$BENUTZER:$BENUTZER" "/home/$BENUTZER/.ssh/authorized_keys"
chmod 600 "/home/$BENUTZER/.ssh/authorized_keys"
gruen "Schluessel nach /home/$BENUTZER/.ssh/authorized_keys uebernommen"

# sudo ohne Passwort, weil das Konto ohnehin kein Passwort hat
echo "$BENUTZER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$BENUTZER"
chmod 440 "/etc/sudoers.d/90-$BENUTZER"
visudo -cf "/etc/sudoers.d/90-$BENUTZER" >/dev/null || abbruch "sudoers-Datei fehlerhaft"

# ---------------------------------------------------------------------------
info "Firewall einrichten"
# ---------------------------------------------------------------------------
# Reihenfolge ist wichtig: erst SSH erlauben, dann aktivieren.
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp  >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status verbose

# ---------------------------------------------------------------------------
info "SSH haerten"
# ---------------------------------------------------------------------------
cat > /etc/ssh/sshd_config.d/99-haertung.conf <<'SSHEOF'
# von server2-bootstrap.sh gesetzt
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
SSHEOF

if sshd -t; then
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
  gruen "SSH neu geladen: Root-Login und Passwoerter sind aus"
else
  rm -f /etc/ssh/sshd_config.d/99-haertung.conf
  abbruch "sshd-Konfiguration fehlerhaft, Aenderung zurueckgenommen"
fi

info "fail2ban aktivieren"
cat > /etc/fail2ban/jail.d/sshd.local <<'F2BEOF'
[sshd]
enabled  = true
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
F2BEOF
systemctl enable --now fail2ban >/dev/null
systemctl restart fail2ban

info "Automatische Sicherheitsupdates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'AUEOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
AUEOF
# Neustarts bewusst nicht automatisch — die entscheidest du selbst.
sed -i 's|^//\?Unattended-Upgrade::Automatic-Reboot .*|Unattended-Upgrade::Automatic-Reboot "false";|' \
  /etc/apt/apt.conf.d/50unattended-upgrades 2>/dev/null || true
systemctl enable --now unattended-upgrades >/dev/null

# ---------------------------------------------------------------------------
# Auf kleinen Maschinen federt Swap die Spitzen von Docker-Builds ab. Ein
# Node-Build zieht schnell 2 GB, und der OOM-Killer trifft dann irgendeinen
# Container, nicht den Build.
if [ "$SWAP_GB" = "auto" ]; then
  RAM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
  if [ "$RAM_MB" -le 4500 ]; then SWAP_GB=4; else SWAP_GB=2; fi
  echo "RAM: ${RAM_MB} MB -> Swap automatisch auf ${SWAP_GB} GB gesetzt"
fi

info "Swap anlegen (${SWAP_GB} GB)"
# ---------------------------------------------------------------------------
if swapon --show | grep -q . ; then
  echo "Swap ist bereits aktiv"
elif [ "$SWAP_GB" -gt 0 ] 2>/dev/null; then
  fallocate -l "${SWAP_GB}G" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -qw vm.swappiness=10
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
  gruen "${SWAP_GB} GB Swap aktiv"
fi

# ---------------------------------------------------------------------------
info "Docker installieren"
# ---------------------------------------------------------------------------
if command -v docker >/dev/null 2>&1; then
  echo "bereits installiert: $(docker --version)"
else
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --yes --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
  gruen "$(docker --version)"
fi
usermod -aG docker "$BENUTZER"

# Logs begrenzen, sonst frisst ein gespraechiger Container die Platte
if [ ! -f /etc/docker/daemon.json ]; then
  mkdir -p /etc/docker
  cat > /etc/docker/daemon.json <<'DJEOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
DJEOF
  systemctl restart docker
fi

# ---------------------------------------------------------------------------
info "Woechentliches Aufraeumen einrichten"
# ---------------------------------------------------------------------------
# Docker-Images und Build-Caches wachsen still vor sich hin. Auf einer 40-GB-
# Platte ist das nach ein paar Monaten das Problem. Geloescht wird nur, was
# aelter als sieben Tage und von keinem Container belegt ist.
cat > /etc/cron.weekly/docker-aufraeumen <<'CRONEOF'
#!/bin/sh
# von server2-bootstrap.sh angelegt
docker system prune -f --filter "until=168h" >> /var/log/docker-aufraeumen.log 2>&1
docker builder prune -f --filter "unused-for=168h" >> /var/log/docker-aufraeumen.log 2>&1
CRONEOF
chmod +x /etc/cron.weekly/docker-aufraeumen
gruen "laeuft woechentlich, Protokoll in /var/log/docker-aufraeumen.log"

# ---------------------------------------------------------------------------
if [ "$MIT_COOLIFY" -eq 1 ]; then
  info "Coolify installieren"
  if [ -d /data/coolify ]; then
    echo "Coolify liegt bereits unter /data/coolify, wird uebersprungen"
  else
    curl -fsSL https://cdn.coollabs.io/coolify/install.sh -o /root/coolify-install.sh
    echo "Installer liegt unter /root/coolify-install.sh und wird jetzt ausgefuehrt."
    bash /root/coolify-install.sh
  fi

  # -------------------------------------------------------------------------
  info "Coolify-Port 8000 von aussen sperren"
  # -------------------------------------------------------------------------
  # Docker setzt seine DNAT-Regeln VOR die von ufw. Ein veroeffentlichter
  # Container-Port ist deshalb trotz "ufw deny" aus dem Internet erreichbar,
  # und die Coolify-Registrierung steht offen, bis das erste Konto existiert.
  # Wer sie zuerst findet, wird Administrator.
  #
  # ACHTUNG, ehrlich gemessen: Diese Regel hat den Port im Test NICHT
  # geschlossen. Sie stand nachweislich in DOCKER-USER, und curl von aussen
  # bekam weiter ein 302. Verlass dich nicht darauf.
  #
  # Die Ebene, auf die Verlass ist, liegt ausserhalb des Systems: eine
  # Hetzner Cloud Firewall, die eingehend nur 22, 80 und 443 durchlaesst.
  # Die legst du im Panel an, dieses Skript kann das nicht.
  #
  # Die Regel hier bleibt als zweite Ebene: sie kostet nichts und greift,
  # falls der Verkehr doch ueber den FORWARD-Pfad laeuft. Als systemd-Unit
  # statt iptables-persistent, damit Dockers eigene Regeln nicht eingefroren
  # werden.
  cat > /etc/systemd/system/coolify-port-sperre.service <<'UNITEOF'
[Unit]
Description=Coolify-Port 8000 fuer Zugriffe von aussen sperren
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
# -C prueft, ob die Regel schon steht; nur dann wird sie eingefuegt.
ExecStart=/bin/sh -c '/usr/sbin/iptables -C DOCKER-USER -p tcp --dport 8000 -j DROP 2>/dev/null || /usr/sbin/iptables -I DOCKER-USER -p tcp --dport 8000 -j DROP'
ExecStart=/bin/sh -c '/usr/sbin/ip6tables -C DOCKER-USER -p tcp --dport 8000 -j DROP 2>/dev/null || /usr/sbin/ip6tables -I DOCKER-USER -p tcp --dport 8000 -j DROP'

[Install]
WantedBy=multi-user.target
UNITEOF
  systemctl daemon-reload
  systemctl enable --now coolify-port-sperre.service >/dev/null
  gruen "DOCKER-USER-Regel gesetzt (zweite Ebene, siehe Punkt 4 unten)"
fi

# ---------------------------------------------------------------------------
IP="$(curl -fsS --max-time 5 https://ipv4.icanhazip.com 2>/dev/null || echo '<ip>')"
info "Fertig"
cat <<ENDEEOF

Server steht. Naechste Schritte vom MacBook aus:

1. Neue Verbindung testen, BEVOR du dieses Fenster schliesst:
       ssh $BENUTZER@$IP
   Klappt das nicht, bleibt diese Sitzung dein Rettungsanker.

2. Kurznamen in ~/.ssh/config eintragen:
       Host tho2
           HostName $IP
           User $BENUTZER
           IdentityFile ~/.ssh/id_ed25519
   Danach genuegt: ssh tho2

3. DNS bei GoDaddy setzen:
       *.lab.thomas-perr.de   A   $IP
ENDEEOF

if [ "$MIT_COOLIFY" -eq 1 ]; then
cat <<COOLEOF
4. WICHTIG: Im Hetzner-Panel eine Cloud Firewall anlegen und dem Server
   zuweisen. Eingehend nur TCP 22, 80 und 443 erlauben, SSH nicht vergessen.
   Coolify veroeffentlicht Port 8000, und ufw haelt das nicht auf - Docker
   schreibt seine Regeln davor. Nur die Cloud Firewall sitzt vor dem Server.

   Danach von aussen pruefen, es muss 000 kommen:
       curl -sS --max-time 5 -o /dev/null -w "%{http_code}\n" http://<ip>:8000/

5. Coolify oeffnen und SOFORT das erste Konto anlegen, durch einen Tunnel:
       ssh -L 8000:localhost:8000 tho2
   dann im Browser  http://localhost:8000
   Wer sich dort zuerst registriert, wird Administrator der Instanz.

COOLEOF
fi

gruen "Ein Neustart ist nicht noetig, schadet aber auch nicht: reboot"
