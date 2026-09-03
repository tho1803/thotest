# Der BWS-Server: eigene Maschine für die Vereins-Apps

Stand: 3. September 2026. Der Server läuft, die Apps ziehen noch um.

## Korrektur zur ersten Fassung

Die erste Version dieses Dokuments hatte die Richtung falsch herum. Sie beschrieb den neuen Server als Maschine für Thomas Perrs freiberufliche Projekte, getrennt von einem bestehenden Vereinsserver.

Tatsächlich ist es umgekehrt. Die BWS-Apps liegen bisher auf Thomas Perrs privatem Server, und **der neue Server ist der Vereinsserver**. Dorthin ziehen sie um. Wer die frühere Fassung gelesen hat, sollte diesen Absatz kennen.

## Warum die Trennung nicht nur Geschmackssache ist

Auf Thomas Perrs privatem Server liegen bisher SEPA-Mandat, SEPA-Scan und die Übungsleiterpauschale. Alle drei verarbeiten Vereinsdaten: Bankverbindungen von Eltern, Einwilligungen für Minderjährige, Abrechnungsdaten von Übungsleitenden.

Verantwortlicher im Sinne von Art. 4 Nr. 7 DSGVO ist dafür die BildungsWerkstatt, nicht Thomas Perr als Freiberufler. Solange beides auf einer Maschine liegt, teilen sich zwei Verantwortliche ein System, und bei einem Sicherheitsvorfall trifft es automatisch beide.

Dazu kommt der praktische Teil. Der private Server ist der, auf dem experimentiert wird, und beim Experimentieren geht Dinge kaputt. Die Vereins-Apps müssen laufen, auch wenn ein Prototyp den Arbeitsspeicher frisst.

Sieben Euro im Monat sind billiger als eine einzige Stunde Aufräumen nach einer Vermischung.

## Was auf welchen Server gehört

Der neue BWS-Server bekommt alles, wofür der Verein einsteht. SEPA-Mandat, SEPA-Scan, Übungsleiterpauschale, Anwesenheitserfassung, und was künftig für die BildungsWerkstatt dazukommt.

Auf Thomas Perrs privatem Server bleibt die freiberufliche Seite. IKOBE-Werkzeuge, TalentKompass-Prototypen, Landingpages, alles was mit Claude entsteht und irgendwo laufen soll.

Die Grenze ist scharf zu ziehen und gilt in beide Richtungen. Keine Vereinsdaten auf dem privaten Server, auch nicht "nur kurz zum Testen". Umgekehrt keine Kundenprototypen auf dem BWS-Server.

## Die Rolle, die daraus folgt

Läuft der Hetzner-Vertrag auf Thomas Perrs Namen, ist er damit **Auftragsverarbeiter für die BildungsWerkstatt**. Das braucht einen AVV zwischen ihm und dem Verein, zusätzlich zu dem mit Hetzner.

Ein eigenes Projekt in der Hetzner Console trennt technisch, nicht vertraglich. Für die vollständige Trennung bräuchte der Verein ein eigenes Hetzner-Konto. Das ist eine Frage an den Vorstand, keine technische.

Auch die Domain gehört bedacht. Läuft eine Eltern-App unter `thomas-perr.de`, landen Eltern auf der persönlichen Domain eines Freiberuflers, obwohl der Verein verantwortlich ist. Die BWS-Apps gehören unter eine BWS-Domain.

## Welche Maschine

Hetzner Cloud, Standort Nürnberg. Deutschland, damit erübrigt sich die Diskussion über Drittlandtransfer.

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

Zwei Domains, zwei Anbieter. Das zu verwechseln kostet eine halbe Stunde, deshalb steht es hier ausdrücklich.

Die Vereinsdomain ist **`bws-ev.de` und liegt bei Ionos**, erkennbar an den Nameservern `ns1040.ui-dns.de` und deren Geschwistern. Dort zeigen `bws-ev.de` und `www` auf das Ionos-Webhosting mit der WordPress-Seite. **`thomas-perr.de` liegt bei GoDaddy** und hat mit den Vereins-Apps nichts zu tun.

Die BWS-Apps bekommen deshalb A-Records bei **Ionos**: `sepa.bws-ev.de`, `uebungsleiter.bws-ev.de`, später `scan.bws-ev.de`, alle auf die Server-IP. Ausgeschrieben statt abgekürzt, weil Eltern und Übungsleitende diese Adressen lesen.

Bei beiden Anbietern gehört ins Namensfeld **nur der Teil vor der Domain**, also `sepa` und nicht `sepa.bws-ev.de`. Der vollständige Name wird abgewiesen, weil der Anbieter die Domain selbst anhängt. Das war die Fehlermeldung, an der der erste Versuch scheiterte.

**Auf der Vereinsdomain kein Wildcard.** Er schickt jeden Tippfehler und jede geratene Subdomain auf den Server. Drei einzelne Einträge sind einmal Arbeit und danach sauber. Eine Subdomain anzulegen berührt die Website nicht, dort kann nichts kaputtgehen.

Für die eigenen Prototypen ist ein Wildcard dagegen richtig: `*.lab.thomas-perr.de` bei GoDaddy, danach vergibt Coolify jede Adresse selbst und hat innerhalb einer Minute ein Zertifikat.

Zugang zum Ionos-Konto hat Tina Gaspard aus der Öffentlichkeitsarbeit. Änderungen an der Vereinsdomain gehören ihr kurz mitgeteilt, auch wenn du die Zugangsdaten hast.

## Die Firewall gehört vor den Server, nicht auf ihn

Das ist die teuerste Lektion aus dem Aufsetzen, deshalb steht sie hier eigens und mit dem Irrweg dazu.

Docker schreibt seine eigenen iptables-Regeln, und die liegen vor denen von `ufw`. Ein Container, der einen Port veröffentlicht, ist damit aus dem Internet erreichbar — auch wenn `ufw status` diesen Port gar nicht aufführt. Coolify veröffentlicht seine Oberfläche auf Port 8000, und solange dort kein Konto existiert, steht die Registrierung offen. Wer sie zuerst findet, wird Administrator. Hetzner-Adressbereiche werden ununterbrochen abgescannt.

Der erste Versuch war eine DROP-Regel in der Kette `DOCKER-USER`. Die Regel stand nachweislich, und der Port blieb trotzdem offen: `curl` von außen bekam weiter ein 302. Warum sie nicht greift, ist ungeklärt — die naheliegende Erklärung über nftables ließ sich widerlegen, es sind die iptables-Kompatibilitätstabellen.

Die Lehre daraus ist nicht, die nächste Regel eine Ebene tiefer zu suchen. Sie ist, die Firewall dorthin zu legen, wo Docker sie nicht erreichen kann: in die **Hetzner Cloud Firewall**. Die sitzt vor der Netzwerkkarte, außerhalb des Betriebssystems. Was sie verwirft, kommt am Server nie an.

Eingehend erlaubt sind dort genau drei Ports: 22 für SSH, 80 und 443 für den Reverse Proxy. Alles andere fällt weg, auch die 8000. Die Coolify-Oberfläche erreichst du danach über einen SSH-Tunnel vom Mac.

`ufw` und die systemd-Unit bleiben trotzdem stehen. Sie schaden nicht und greifen für alles, was nicht durch Docker läuft. Verlassen kann man sich bei veröffentlichten Container-Ports nur auf die Cloud Firewall.

Auf Dauer bekommt Coolify eine eigene Domain. Dann läuft die Oberfläche über Traefik auf 443 mit gültigem Zertifikat, und der Tunnel entfällt.

## Sicherheit, so viel wie nötig

Das Bootstrap-Skript erledigt den Grundschutz. Root-Login und Passwortanmeldung werden abgeschaltet, es bleibt die Anmeldung per Schlüssel.

Die Firewall lässt drei Ports durch: SSH, HTTP und HTTPS. Fail2ban sperrt IP-Adressen, die es mit Anmeldeversuchen übertreiben.

Sicherheitsupdates installiert der Server selbstständig, dafür sorgen die unattended-upgrades. Neustarts nach Kernel-Updates machst du selbst, damit dir kein Reboot in einen Workshop platzt.

Die Coolify-Oberfläche gehört nicht offen ins Netz. Entweder du bindest sie an Tailscale, oder du erreichst sie über einen SSH-Tunnel.

## Welche Apps umziehen

Auf dem privaten Server liegen sechs Anwendungen, und nur zwei davon gehören dem Verein. Die Zuordnung ergibt sich aus den DNS-Einträgen unter `thomas-perr.de`.

Umziehen müssen **`uebungsleiter`** (Übungsleiterabrechnung) und **`sepascan`** (Einlesen der Papiermandate). Beide laufen produktiv.

Die **SEPA-Mandat-App** ist laut ihrem Übergabedokument noch im Bau und hat noch keinen DNS-Eintrag. Ihre Adresse kann trotzdem gleich mit angelegt werden.

Bleiben dürfen **`mobbit`**, **`choosy`**, **`timos`** und **`talentometer`**. Das sind IKOBE-Werkzeuge und damit freiberuflich, kein Vereinsgeschäft.

Bei Ionos werden daraus `uebungsleiter.bws-ev.de`, `sepascan.bws-ev.de` und `sepa.bws-ev.de`. Die TTL vor dem Umzug auf den kleinsten Wert stellen, den Ionos anbietet, sonst wartest du beim Umschalten auf ablaufende Zwischenspeicher.

Die alten Adressen sterben nicht von selbst. Übungsleitende haben `uebungsleiter.thomas-perr.de` im Browser gespeichert, deshalb braucht es dort eine Weiterleitung oder einen Parallelbetrieb von einigen Wochen.

## So kommst du ran

Auf dem Mac steht in `~/.ssh/config` ein Eintrag, der den Tunnel gleich mitbringt:

```
Host tho2
    HostName <ip>
    User thomas
    IdentityFile ~/.ssh/id_ed25519
    LocalForward 8000 localhost:8000
```

Damit genügt `ssh tho2`. Solange das Fenster offen ist, erreichst du Coolify im Browser unter `http://localhost:8000`.

Zwei Stolperstellen, beide beim Aufsetzen passiert. Der Tunnelbefehl gehört auf den Mac, nicht auf den Server — dort versucht die Maschine sich bei sich selbst anzumelden und findet keinen privaten Schlüssel. Und am Prompt siehst du, wo du gerade bist: der Mac-Benutzername steht vorne, auf dem Server steht `thomas@ubuntu-...`.

Jedes Gerät bekommt seinen eigenen Schlüssel, der private wandert nie von einem Rechner zum anderen. Hetzner spielt Schlüssel außerdem nur beim Erstellen des Servers ein. Ein später im Panel hinterlegter landet **nicht** auf der laufenden Maschine — der wird über den bestehenden Zugang nach `~/.ssh/authorized_keys` nachgetragen.

## Backups, weil Snapshots keine sind

Hetzner bietet automatische Backups für einen Aufschlag von zwanzig Prozent. Die schaltest du bei der Bestellung mit ein, sie retten dich, wenn die ganze Maschine hinüber ist.

Was sie nicht können, ist eine einzelne Datenbank von vorgestern zurückholen. Dafür braucht es Dumps, die täglich per Cron auf eine Hetzner Storage Box wandern.

Eine Storage Box mit einem Terabyte kostet rund vier Euro im Monat. Das Bootstrap-Skript legt den Cron-Job an, sobald du die Zugangsdaten einträgst.

Ein Backup, das nie zurückgespielt wurde, ist eine Vermutung. Einmal im Quartal eine Wiederherstellung testen, sonst merkst du den Fehler am schlechtesten Tag.

## Was du zuerst tust

Erstens den privaten Server inventarisieren, auf dem die BWS-Apps heute liegen. Das Skript `scripts/server1-inventar.sh` liest nur, ändert nichts und gibt keine Passwörter aus. Die Ausgabe zeigt, was umziehen muss.

Zweitens den neuen Server bestellen. Hetzner Cloud, CX23, Ubuntu 24.04, Standort Nürnberg, Backups aktiviert, dein SSH-Schlüssel ausgewählt und angehakt. Gleich mit dabei eine Cloud Firewall, die eingehend nur 22, 80 und 443 durchlässt.

Drittens das Bootstrap-Skript laufen lassen. Es läuft einmal als root und richtet Benutzer, Firewall, Docker und auf Wunsch Coolify ein.

Viertens die DNS-Einträge setzen, für die BWS-Apps bei Ionos unter `bws-ev.de`. Danach kannst du das erste Projekt deployen.

## Offene Punkte

Was auf dem privaten Server tatsächlich läuft, weiß ich nicht. Ich habe keinen Zugang dorthin, und in diesem Repository steht dazu nichts. Das Inventar-Skript beantwortet es.

Der Umzug selbst ist ein eigener Vorgang. Für die Übungsleiterpauschale gibt es dafür eine Anleitung, SEPA-Mandat und SEPA-Scan folgen nach demselben Muster in eigenen Durchgängen.

Ob der Verein ein eigenes Hetzner-Konto bekommen sollte, ist eine Frage an den Vorstand. Solange der Vertrag auf deinen Namen läuft, bist du Auftragsverarbeiter für die BildungsWerkstatt und brauchst dafür einen AVV mit dem Verein.

Für die datenschutzrechtliche Seite der Vereinsprojekte gibt es die Skills `minderjaehrigen-app-check` und `app-verfahrensdoku`. Die gehören in einen eigenen Durchgang, nicht in diese Serverfrage.
