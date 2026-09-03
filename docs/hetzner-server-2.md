# Zweiter Hetzner-Server: eigener Maschinenraum neben dem Vereinsserver

Stand: 3. September 2026. Entwurf zur Entscheidung, noch nichts bestellt.

## Warum die Trennung nicht nur Geschmackssache ist

Auf dem bestehenden Server liegen SEPA-Mandate, Einwilligungen von Eltern und die Abrechnung der Übungsleiterpauschale. Verantwortlicher im Sinne von Art. 4 Nr. 7 DSGVO ist dort der Verein, nicht Thomas Perr als Freiberufler.

Sobald auf derselben Maschine eigene Projekte laufen, teilen sich zwei Verantwortliche ein System. Bei einem Sicherheitsvorfall trifft es dann automatisch beide, und die Meldepflicht nach Art. 33 wird zur gemeinsamen Angelegenheit.

Dazu kommt der praktische Teil. Der eigene Server ist der, auf dem experimentiert wird, und beim Experimentieren geht Dinge kaputt. Der Vereinsserver muss laufen, auch wenn ein Prototyp den Arbeitsspeicher frisst.

Ein zweiter Server kostet ungefähr sieben bis neun Euro im Monat. Das ist billiger als eine einzige Stunde Aufräumen nach einer Vermischung.

## Was auf welchen Server gehört

Server 1 behält alles, wofür der Verein einsteht. Anwesenheit, Mandate, Elternunterschriften, Übungsleiterabrechnung — dort ändert sich nichts.

Server 2 bekommt die freiberufliche Seite. IKOBE-Werkzeuge, TalentKompass-Prototypen, Landingpages, alles, was mit Claude entsteht und irgendwo laufen soll.

Die Grenze ist scharf zu ziehen und gilt in beide Richtungen. Keine Vereinsdaten auf Server 2, auch nicht "nur kurz zum Testen". Umgekehrt keine Kundenprototypen auf Server 1.

Wo Echtdaten von Kundinnen und Kunden ins Spiel kommen, braucht es vorher einen Auftragsverarbeitungsvertrag. Für Prototypen reichen erfundene Daten, so wie bei den 180 erfundenen Kindern in der Anwesenheitsliste.

## Welche Maschine

Hetzner Cloud, Standort Falkenstein. Deutschland, damit erübrigt sich die Diskussion über Drittlandtransfer.

Es wird ein CX23 aus der Kategorie Cost-Optimized: zwei vCPU, vier Gigabyte RAM, 40 Gigabyte SSD, 20 Terabyte Traffic für 5,49 Euro im Monat. Mit IPv4 und den zwanzig Prozent für Backups landet die Rechnung bei rund sieben Euro.

Geplant war ursprünglich der größere CX33 mit acht Gigabyte. Der ist in Deutschland derzeit nicht buchbar — die Cost-Optimized-Reihe läuft auf älterer Hardware mit begrenzten Kontingenten, und im September 2026 war an keinem deutschen Standort mehr als der CX23 frei.

Vier Gigabyte reichen zum Start, sind aber die untere Kante. Coolify belegt allein rund zwei davon, und ein Node-Build zieht schnell weitere zwei. Deshalb legt das Bootstrap-Skript auf Maschinen mit vier Gigabyte oder weniger automatisch vier Gigabyte Swap an statt der sonst üblichen zwei.

Die 40 Gigabyte Platte sind der zweite enge Punkt. Docker-Images und Build-Caches wachsen still vor sich hin, deshalb räumt ein wöchentlicher Cron-Job auf, was älter als sieben Tage ist und von keinem Container belegt wird.

Aufrüsten geht später per Klick, sobald der CX33 wieder verfügbar ist. CPU und RAM lassen sich in beide Richtungen ändern, die Platte wächst dabei mit und schrumpft nie wieder.

Betriebssystem ist Ubuntu 24.04 LTS. Die 26.04 wäre auch gegangen — Docker führt den Codenamen `resolute` im Repo und Coolifys Installer prüft die Version gar nicht. Bei 24.04 bezieht sich nur jede Anleitung und jeder Forenbeitrag auf dieselbe Version, und die Sicherheitsupdates laufen bis 2029.

## Coolify als Bedienoberfläche

Die eigentliche Frage ist nicht, welcher Server, sondern wie du ihn bedienst, ohne jedes Mal ins Terminal zu müssen.

Coolify löst das. Es ist eine selbst gehostete Oberfläche, die aus einem GitHub-Repository ein laufendes Projekt macht, Zertifikate von Let's Encrypt automatisch besorgt und Datenbanken per Klick anlegt. Kosten für die selbst gehostete Variante: keine.

Vom MacBook aus arbeitest du im Browser. Neues Projekt anlegen, Repository auswählen, Domain eintragen, fertig — der Rest passiert im Hintergrund.

Die Alternative wäre Docker mit Traefik von Hand. Das ist schlanker und du verstehst jede Zeile, kostet aber bei jedem neuen Projekt eine halbe Stunde Konfiguration. Bei deiner Projektfrequenz rechnet sich das nicht.

## Wie Claude an den Server kommt, ohne einen Schlüssel zu bekommen

Du hast dich für den Weg über Git entschieden, und das ist die richtige Wahl. Ich habe hier ohnehin keinen Netzzugang zu deinem Server, aber auch grundsätzlich ist es der sauberere Weg.

Der Ablauf hat drei Stationen. Ich schreibe Code und Konfiguration in ein GitHub-Repository, du schaust im Pull Request drüber, und beim Merge löst GitHub einen Webhook aus, den Coolify entgegennimmt und daraufhin selbst deployt.

Damit bleibt jeder SSH-Schlüssel bei dir. Ein Deployment kann nur auslösen, wer in das Repository schreiben darf, und das ist überprüfbar und widerrufbar.

Der Preis dafür ist, dass ich nicht live auf dem Server nachsehen kann, wenn etwas hakt. Dann brauche ich von dir die Logausgabe, oder du lässt Claude Code später zusätzlich direkt auf dem Server laufen — die Tür bleibt offen.

## Zugang vom MacBook Air

Ein Schlüsselpaar auf dem Mac genügt, ed25519, mit Passphrase. Der öffentliche Teil wandert bei der Bestellung ins Hetzner-Panel, dann ist der Server ab der ersten Sekunde ohne Passwort erreichbar.

In `~/.ssh/config` bekommt der Server einen Kurznamen. Danach reicht `ssh tho2` statt der IP-Adresse.

Wenn du unterwegs auch vom iPhone ranwillst, ist Tailscale die bequemste Lösung. Der Server wird dadurch aus deinem privaten Netz erreichbar, ohne dass ein zusätzlicher Port nach außen offen steht.

## Domains und Zertifikate

Deine Domains liegen bei GoDaddy. Für den Server richtest du einen Wildcard-Eintrag ein, etwa `*.lab.thomas-perr.de` als A-Record auf die neue IP.

Danach vergibst du in Coolify jede Adresse selbst, ohne noch einmal an den DNS zu müssen. Ein neuer Prototyp bekommt `talentkompass.lab.thomas-perr.de` und hat innerhalb einer Minute ein gültiges Zertifikat.

Kundenprojekte, die produktiv gehen, bekommen später eine eigene Domain. Der Wildcard ist für die Werkstatt, nicht fürs Schaufenster.

## Sicherheit, so viel wie nötig

Das Bootstrap-Skript erledigt den Grundschutz. Root-Login und Passwortanmeldung werden abgeschaltet, es bleibt die Anmeldung per Schlüssel.

Die Firewall lässt drei Ports durch: SSH, HTTP und HTTPS. Fail2ban sperrt IP-Adressen, die es mit Anmeldeversuchen übertreiben.

Sicherheitsupdates installiert der Server selbstständig, dafür sorgen die unattended-upgrades. Neustarts nach Kernel-Updates machst du selbst, damit dir kein Reboot in einen Workshop platzt.

Die Coolify-Oberfläche gehört nicht offen ins Netz. Entweder du bindest sie an Tailscale, oder du erreichst sie über einen SSH-Tunnel.

## Backups, weil Snapshots keine sind

Hetzner bietet automatische Backups für einen Aufschlag von zwanzig Prozent. Die schaltest du bei der Bestellung mit ein, sie retten dich, wenn die ganze Maschine hinüber ist.

Was sie nicht können, ist eine einzelne Datenbank von vorgestern zurückholen. Dafür braucht es Dumps, die täglich per Cron auf eine Hetzner Storage Box wandern.

Eine Storage Box mit einem Terabyte kostet rund vier Euro im Monat. Das Bootstrap-Skript legt den Cron-Job an, sobald du die Zugangsdaten einträgst.

Ein Backup, das nie zurückgespielt wurde, ist eine Vermutung. Einmal im Quartal eine Wiederherstellung testen, sonst merkst du den Fehler am schlechtesten Tag.

## Was du zuerst tust

Erstens den bestehenden Server inventarisieren. Das Skript `scripts/server1-inventar.sh` liest nur, ändert nichts und gibt keine Passwörter aus — Ausgabe hierher, dann weiß ich, worauf Server 2 aufsetzen muss.

Zweitens den neuen Server bestellen. Hetzner Cloud, CX23, Ubuntu 24.04, Standort Falkenstein, Backups aktiviert, dein SSH-Schlüssel ausgewählt und angehakt.

Drittens das Bootstrap-Skript laufen lassen. Es läuft einmal als root und richtet Benutzer, Firewall, Docker und auf Wunsch Coolify ein.

Viertens den DNS-Eintrag bei GoDaddy setzen. Danach kannst du das erste Projekt deployen.

## Offene Punkte

Was auf Server 1 tatsächlich läuft, weiß ich nicht. Ich habe keinen Zugang dorthin, und in diesem Repository steht dazu nichts.

Ob die Vereinsprojekte langfristig auf Server 1 bleiben oder ob der Verein einen eigenen Vertrag bekommen sollte, ist eine Frage an den Vorstand. Solange der Server auf deinen Namen läuft, bist du Auftragsverarbeiter für den Verein und brauchst dafür einen AVV.

Für die datenschutzrechtliche Seite der Vereinsprojekte gibt es die Skills `minderjaehrigen-app-check` und `app-verfahrensdoku`. Die gehören in einen eigenen Durchgang, nicht in diese Serverfrage.
