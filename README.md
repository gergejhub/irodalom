# Lilike – Múltunk a mítoszokban (webes dolgozat-felkészítő)

**Cél:** telefonról, játékosan, de intenzíven gyakorolni az irodalom dolgozat anyagát:  
- **Tankönyv:** 74–100. oldal (a csatolt PDF alapján)  
- **Füzet:** „Múltunk a mítoszokban” óra → összefoglalás  
- **Kérdéstípusok:** definíciók, szereplők/helyszínek, ok-okozat, sorrend, tanulságok, összehasonlítás

## Funkciók
- 🃏 **Gyorskártyák** (front/back)
- ✅ **Kvíz (választós)** – 4 opció, azonnali visszajelzés
- ⌨️ **Kvíz (beírás)** – kis/nagybetű és ékezet-toleráns ellenőrzés
- 🧠 **SRS** (újra / nehéz / jó / könnyű) – egyszerű SM-2 jellegű ütemezés
- 🏁 **Sprint** (10/20/30/40 kérdés) – a végén eredmény popup
- ⚙️ **Beállítások** – TTS (alapból OFF), Enter = következő, stat reset

## Használat GitHub Pages-szel (kb. 1 perc)
1. Hozz létre egy új repo-t GitHubon (pl. `lilike-mitoszok`).
2. Töltsd fel a kicsomagolt ZIP tartalmát a repo gyökerébe.
3. Repo → **Settings** → **Pages**
4. **Build and deployment** → Source: **Deploy from a branch**
5. Branch: **main** / Folder: **/(root)** → **Save**
6. A GitHub kiírja az URL-t (1-2 perc mire él).

## Szerkesztés / bővítés
- Kérdések és kártyák: `data/content.json`
- A logika: `app.js`

> Megjegyzés: minden statisztika csak a böngésző `localStorage`-ében tárolódik.

Jó gyakorlást! 🙂
