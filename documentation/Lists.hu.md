Az alábbi dokumentum leírja, hogy a WikiStatPortál listáit milyen adatokkal és feltételekkel lehet definiálni.

# Általános beállítások
* `itemCount`: Meghatározza, hogy legfeljebb hány elem jelenjen meg a listában.
* `displaySettings`: Megjelenítéssel kapcsolatos beállításokat tartalmazó objektum:
    * `fadeBots` (`true`/`false`): Bot és flag nélküli bot joggal rendelkező felhasználók kiszűrkítése
    * `fadeNonSysops` (`true`/`false`): Nem adminisztrátor felhasználók kiszűrése. Ez olyna listákhoz jó, amelyeken adminisztrátori statisztikákat jelenítünk meg anélkül, hogy az adminisztrátor jogosultsággal rendelkező felhasználókra szűrnénk.Így meg tudjuk mutatni azokat a felhasználókat is, akik korábban adminisztrátorok voltak, és gyűjtöttek ilyen jellegű adatokat, de vizuálisan jelezhetjük, hogy ők már nem adminisztrátorok.
    * `skipBotsFromCounting` (`true`/`false`): A számláló oszlop feltöltésekor hagyjuk-e ki a botokat és a flag nélküli botokat. Így a nagy szerkesztésszámmal rendelkező botok nem befolyásolják a rendes szerkesztők érdemeit.
* `dateMode`: Ha az értéke `userSelectable`, akkor a felhasználó számára megjelenik a lista tetején egy dátumválasztó, amivel tetszőleges időszakra lekérheti a listát.
* `isHidden`: Rejtett-e az oszlop. Az ilyen oszlopok nem jelennek meg a táblázatokban és az exportált adatokban. Elsősorban akkor hasznos az ilyen oszlop, ha olyan adatra van szükségünk, amely szerint rendezni akarunk, de nem akarjuk megjeleníteni a táblázatban.

# Előfeltételek

Az előfeltételek (`userRequirements`) meghatározzák, hogy a listában milyen követelmények teljesítésével kerülhetnek be felhasználók. A lehetséges előfeltételek bizonyos eseteket leszámítva megegyeznek a felhasználói piramisok egyes csoportjaiban lévő felhasználóinak definíciójával.

## Szűrés regisztráció állapota alapján

| Előfeltétel azonosítója | Típus | Leírás |
|-------------------------|-------|--------|
| `registrationStatus`      | enum | Segítségével a regisztráció állapota alapján szűrhetők a felhasználók. Lehetséges értékek: `registered` → csak regisztrált felhasználók, `anon` → csak anonim felhasználók.
| `registrationAgeAtLeast`  | pozitív egész szám | Segítségével olyan felhasználókra lehet szűrni, akik legalább a megadott számú napja regisztráltak. A feltétel csak regisztrált felhasználók esetében teljesülhet.
| `registrationAgeAtMost`  | pozitív egész szám | Segítségével olyan felhasználókra lehet szűrni, akik legfeljebb a megadott számú napja regisztráltak. A feltétel csak regisztrált felhasználók esetében teljesülhet.

## Szűrés felhasználói csoportok és sablonok alapján

| Előfeltétel azonosítója | Típus | Leírás |
|-------------------------|-------|--------|
| `inAnyUserGroups` | egy vagy több csoport neve | Olyan felhasználók szűrése, akik a megadott csoportok bármelyikének tagjai.
| `inAllUserGroups` | egy vagy több csoport neve | Olyan felhasználók szűrése, akik a megadott csoportok mindegyikének tagjai.
| `notInAnyUserGroups` | egy vagy több csoport neve | Olyan felhasználók szűrése, akik a megadott csoportok közül valamelyiknek nem tagjai.
| `notInAllUserGroups` | egy vagy több csoport neve | Olyan felhasználók szűrése, akik a megadott csoportok egyikének sem tagnai.
| `hasAnyUserPageTemplates` | egy vagy több sablon neve | Olyan felhasználók szűrése, akiknek szerepel a felhasználói vagy vitalapján az összes megadott sablon.
| `hasAllUserPageTemplates` | egy vagy több sablon neve | Olyan felhasználók szűrése, akiknek szerepel a felhasználói vagy vitalapján a megadott sablonok egyike.
| `notHasAnyUserPageTemplates` | egy vagy több sablon neve | Olyan felhasználók szűrése, akiknek nem szerepel a felhasználói vagy vitalapján egyetlen megadott sablon sem.
| `notHasAllUserPageTemplates` | egy vagy több sablon neve | Olyan felhasználók szűrése, akiknek nem szerepel a felhasználói vagy vitalapján a megadott sablonok egyike.

## Szűrés szerkesztésszám alapján
| Előfeltétel azonosítója | Típus | Leírás |
|-------------------------|-------|--------|
| `totalEditsAtLeast` | pozitív egész szám vagy objektum | Olyan felhasználók szűrése, akik összes szerkesztése (az összes névtérben) legalább annyi, mint a feltételként megadott érték. Lehet korábbi/későbbi napot is vizsgálni, ilyen esetben egy objektumban meg kell adni a kívánt szerkesztésszámot (`count`) és az, hogy a mai naphoz képest mikor vizsgálódunk (`epoch`). A `{ "count": 1000, "epoch": 30 }` például azt vizsgálja, hogy a kiváalsztott időszak végéhez képest 30 nappal korábban volt-e legalább 1000 szerkesztése a felhasználónak. Ha az epoch negatív, akkor egy jövőbeli dátumot vizsgálunk. Ha az epoch értéke a `"startOfSelectedPeriod"` karakterlánc, akkor a kiválasztott időszak kezdetekor vizsgálja a szerkesztésszámot. Természetesen ez csak azoknál a listáknál működik, melyek időszakkal dolgoznak.
| `totalEditsAtMost` | pozitív egész szám vagy objektum | Olyan felhasználók szűrése, akik összes szerkesztése (bármely névtérben) legfeljebb annyi, mint a feltételként megadott érték. A beállítás a `totalEditsAtLeast`-tel megegyező módon működik.
| `inPeriodEditsAtLeast` | pozitív egész szám vagy objektum | Olyan felhasználók szűrése, akik összes, kiválasztott időszakra eső szerkesztése (az összes névtérben) legalább annyi, mint a feltételként megadott érték. Lehet korábbi/későbbi időszakot vizsgálni, ilyen esetben egy objektumban meg kell adni a kívánt szerkesztésszámot (`count`) és az, hogy a mai naphoz képest mikor vizsgálódunk (`epoch`), valamint a vizsgált időszak hosszát (`period`). A `{ "count": 1000, "epoch": 30, "period": 30 }` például azt vizsgálja, hogy a kiváalsztott időszak végéhez képest 30 nappal korábban végződő, és az ezt a dátumot megelőzően 30 nappal kezdődő időszakban (tehát 60 nappal ezelőtt kezdődő, és 30 nappal ezelőtt végződő) időszakban volt-e legalább 1000 szerkesztése a felhasználónak. Ha az epoch negatív, akkor egy jövőbeli dátumot vizsgálunk. Ha az epoch értéke a `"startOfSelectedPeriod"` karakterlánc, akkor az időszak elején vizsgálja a szerkesztésszámot (így össze lehet vetni ) Természetesen ez csak azoknál a listáknál működik, melyek időszakkal dolgoznak.
| `inPeriodEditsAtMost` | pozitív egész szám vagy objektum | Olyan felhasználók szűrése, akik összes, kiválasztott időszakra eső szerkesztése (az összes névtérben) legfeljebb annyi, mint a feltételként megadott érték. A beállítás a `inPeriodEditsAtLeast`-tel megegyező módon működik.
| `totalEditsMilestoneReachedInPeriod` | egy vagy több pozitív egész szám | Olyan felhasználókra szűrés, akik a kiválasztott időszakban átlépték a megadott összszerkesztésszámok bármelyikét (az összes névtérben). Például a `[100, 1000]` olyan felhasználókra szűr, akik a kiválaszott időszakban elvégezték a 100. vagy 1000. szerkesztésüket.

## Szűrés adott névtérben végzett szerkesztésszám alapján
| Előfeltétel azonosítója | Típus | Leírás |
|-------------------------|-------|--------|
| `totalEditsInNamespaceAtLeast` | objektum | Olyan felhasználók szűrése, akik összes szerkesztése a megadott névtérben vagy névterekben (`namespace`) összesen legalább annyi, mint a feltételként megadott érték (`count`). Egy vagy több névtér megadható, egy névtér esetén elég a névtér azonosítójának megadása. Például a `{ "count": 100, "namespace": 0 }` a szócikk névtérben vizsgálja, hogy van-e 100 szerkesztés, míg a `{ "count": 100, "namespace": [0, 1] }` a szócikk és vita névtérben összesen vizsgálja a szerkesztéseket. A korábbi napok vizsgálata a `totalEditsAtLeast`-hez hasonlóan működik.
| `totalEditsInNamespaceAtMost` | objektum | Olyan felhasználók szűrése, akik összes szerkesztése a megadott névtérben vagy névterekben (`namespace`) összesen legfeljebb annyi, mint a feltételként megadott érték (`count`). A beállítás a `totalEditsInNamespaceAtLeast`-tel megegyező módon működik.
| `inPeriodEditsInNamespaceAtLeast` | objektum | Olyan felhasználók szűrése, akik összes, kiválasztott időszakra eső szerkesztése a megadott névtérben vagy névterekben (`namespace`) legalább annyi, mint a feltételként megadott érték (`count`). A névterek vizsgálata a `totalEditsInNamespaceAtLeast`-hez, míg a korábbi időszakok vizsgálata az `inPeriodEditsAtLeast`-hez hasonló módon működik.
| `inPeriodEditsInNamespaceAtMost` | objektum | Olyan felhasználók szűrése, akik összes, kiválasztott időszakra eső szerkesztése a megadott névtérben vagy névterekben (`namespace`) legfeljebb annyi, mint a feltételként megadott érték. A beállítás a `inPeriodEditsInNamespaceAtLeast`-tel megegyező módon működik.

## Szűrés adott change taggel rendelkező szerkesztésszám alapján
| Előfeltétel azonosítója | Típus | Leírás |
|-------------------------|-------|--------|
| `totalEditsWithChangeTagAtLeast` | objektum | Olyan felhasználók szűrése, akik adott change taggel vagy change tagekkel (`changeTag`) megjelölt szerkesztése összesen legalább annyi, mint a feltételként megadott érték (`count`). Egy vagy több névtér megadható, egy névtér esetén elég a névtér azonosítójának megadása. Például a `{ "count": 100, "namespace": 0 }` a szócikk névtérben vizsgálja, hogy van-e 100 szerkesztés, míg a `{ "count": 100, "namespace": [0, 1] }` a szócikk és vita névtérben összesen vizsgálja a szerkesztéseket. A korábbi napok vizsgálata a `totalEditsAtLeast`-hez hasonlóan működik.
| `totalEditsWithChangeTagAtMost` | objektum | Olyan felhasználók szűrése, akik adott change taggel vagy change tagekkel (`changeTag`) megjelölt szerkesztése összesen legfeljebb annyi, mint a feltételként megadott érték (`count`). A beállítás a `totalEditsWithChangeTagAtLeast`-tel megegyező módon működik.
| `inPeriodEditsWithChangeTagAtLeast` | objektum | Olyan felhasználók szűrése, akik összes, kiválasztott időszakra eső, adott change taggel vagy change tagekkel (`changeTag`) megjelölt szerkesztése legalább annyi, mint a feltételként megadott érték (`count`). A névterek vizsgálata a `totalEditsWithChangeTagAtLeast`-hez, míg a korábbi időszakok vizsgálata az `inPeriodEditsAtLeast`-hez hasonló módon működik.
| `inPeriodEditsWithChangeTagAtMost` | objektum | Olyan felhasználók szűrése, akik összes, kiválasztott időszakra eső, adott change taggel vagy change tagekkel (`changeTag`) megjelölt szerkesztése legfeljebb annyi, mint a feltételként megadott érték. A beállítás a `inPeriodEditsWithChangeTagAtLeast`-tel megegyező módon működik.

## Szűrés visszavont szerkesztések alapján
| Előfeltétel azonosítója | Típus | Leírás |
|-------------------------|-------|--------|
| `totalRevertedEditsAtLeast` | pozitív egész szám vagy objektum | Olyan felhasználók szűrése, akik összes visszavont szerkesztése (az összes névtérben) legalább annyi, mint a feltételként megadott érték. A beállítás a `totalEditsAtLeast`-tel megegyező módon működik.
| `totalRevertedEditsAtMost` | pozitív egész szám vagy objektum | Olyan felhasználók szűrése, akik összes visszavont szerkesztése (bármely névtérben) legfeljebb annyi, mint a feltételként megadott érték. A beállítás a `totalEditsAtLeast`-tel megegyező módon működik.
| `inPeriodRevertedEditsAtLeast` | pozitív egész szám vagy objektum | Olyan felhasználók szűrése, akik összes, kiválasztott időszakra eső visszavont szerkesztése (az összes névtérben) legalább annyi, mint a feltételként megadott érték. A beállítás a `inPeriodEditsAtLeast`-tel megegyező módon működik.
| `inPeriodRevertedEditsAtMost` | pozitív egész szám vagy objektum | Olyan felhasználók szűrése, akik összes, kiválasztott időszakra eső visszavont szerkesztése (az összes névtérben) legfeljebb annyi, mint a feltételként megadott érték. A beállítás a `inPeriodEditsAtLeast`-tel megegyező módon működik.
| `totalRevertedEditsMilestoneReachedInPeriod` | egy vagy több pozitív egész szám | Olyan felhasználókra szűrés, akik a kiválasztott időszakban átlépték a megadott összes visszavont szerkesztésszámok bármelyikét (az összes névtérben). A beállítás a `totalEditsMilestoneReachedInPeriod`-tel megegyező módon működik.

## Szűrés kapott köszönetek alapján
| Előfeltétel azonosítója | Típus | Leírás |
|-------------------------|-------|--------|
| `totalReceivedThanksAtLeast` | pozitív egész szám vagy objektum | Olyan felhasználók szűrése, akik összes kapott köszönete legalább annyi, mint a feltételként megadott érték. A beállítás a `totalEditsAtLeast`-tel megegyező módon működik.
| `totalReceivedThanksAtMost` | pozitív egész szám vagy objektum | Olyan felhasználók szűrése, akik összes kapott köszönete legfeljebb annyi, mint a feltételként megadott érték. A beállítás a `totalEditsAtLeast`-tel megegyező módon működik.
| `inPeriodReceivedThanksAtLeast` | pozitív egész szám vagy objektum | Olyan felhasználók szűrése, akik összes, kiválasztott időszakra eső kapott köszönete legalább annyi, mint a feltételként megadott érték. A beállítás a `inPeriodEditsAtLeast`-tel megegyező módon működik.
| `inPeriodReceivedThanksAtMost` | pozitív egész szám vagy objektum | Olyan felhasználók szűrése, akik összes, kiválasztott időszakra eső kapott köszönete legfeljebb annyi, mint a feltételként megadott érték. A beállítás a `inPeriodEditsAtLeast`-tel megegyező módon működik.
| `totalReceivedThanksMilestoneReachedInPeriod` | egy vagy több pozitív egész szám | Olyan felhasználókra szűrés, akik a kiválasztott időszakban átlépték a megadott összes kapott köszönetszámok bármelyikét. A beállítás a `totalEditsMilestoneReachedInPeriod`-tel megegyező módon működik.

## Szűrés aktív napok alapján
| Előfeltétel azonosítója | Típus | Leírás |
|-------------------------|-------|--------|
| `totalActiveDaysAtLeast` | pozitív egész szám vagy objektum | Olyan felhasználók szűrése, akik összes aktív napja legalább annyi, mint a feltételként megadott érték. A beállítás a `totalEditsAtLeast`-tel megegyező módon működik.
| `totalActiveDaysAtMost` | pozitív egész szám vagy objektum | Olyan felhasználók szűrése, akik összes aktív napja legfeljebb annyi, mint a feltételként megadott érték. A beállítás a `totalEditsAtLeast`-tel megegyező módon működik.
| `inPeriodActiveDaysAtLeast` | pozitív egész szám vagy objektum | Olyan felhasználók szűrése, akik összes, kiválasztott időszakra eső aktív napja legalább annyi, mint a feltételként megadott érték. A beállítás a `inPeriodEditsAtLeast`-tel megegyező módon működik.
| `inPeriodActiveDaysAtMost` | pozitív egész szám vagy objektum | Olyan felhasználók szűrése, akik összes, kiválasztott időszakra eső aktív napja legfeljebb annyi, mint a feltételként megadott érték. A beállítás a `inPeriodEditsAtLeast`-tel megegyező módon működik.
| `totalActiveDaysMilestoneReachedInPeriod` | egy vagy több pozitív egész szám | Olyan felhasználókra szűrés, akik a kiválasztott időszakban átlépték a megadott összes aktív napok számának bármelyikét. A beállítás a `totalEditsMilestoneReachedInPeriod`-tel megegyező módon működik.

# Oszlopok

Az oszlopok (`columns`) határozzák meg, hogy mely oszlopok jelenjenek meg az adott listában. Oszlopból akármennyi tartozhat egy listához, azonban fontos, hogy minden olyan oszlop, amelynek újabb adatforrásra van szüksége (pl. összes szerkesztésszám helyett időszakra nézett szerkesztésszám, vagy pl. adott névtérre, naplóra szűrt adatok lekérdezése), az lassítja a lista elkészítésének sebességét. Ezt lehet azzal ellensúlyozni, ha a felhasználók listáját megfelelően leszűkítjük (pl. felhasználói csoportok alapján).

Közös oszloptulajdonságok:
* `columnId`: Az oszlop egyedi szöveges azonsoítója. Akkor szükséges megadni, ha rendezni akarunk az adott oszlop alapján, ezzel a névvel tudunk hivatkozni az adott oszlopra.
* `type`: Az adott oszlop típusa. Ez határozza meg, hogy milyen adat jelenik meg az adott oszlopban.
* `headerI18nKey`: Az oszlop fejlécének lokalizációs kulcsa.
* `filterByRule`: Szűrési szabály az adott oszlop tartalmára. Ezzel kiszűrhetünk olyan felhasználókat, akiknél az adott oszlop tartalma pl. nulla. Lehetséges szabályok:
    * `moreThanZero`: Csak azok a felhasználók maradnak a végeredményben, akiknél az adott oszlop értéke több mint nulla.

## Általános oszlopok

| Típus | Adattípus | Leírás |
|-------|-----------|--------|
| `counter` | egész szám | Számláló oszlop, amely az adott felhasználó sorrendjét  tartalmazza a listában. Az oszlop tartalmát befolyásolhatja a lista `displaySettings`.`skipBotsFromCounting` beállítása, hiszen ha ez engedélyezve van, akkor a botok nem kapnak sorszámot.
| `userName` | string | A felhasználó neve.
| `userGroups` | jogosultságtömb | Oszlop, amely tartalmazza a felhasználó valós és pszeudo-jogosultságait.

Ha egy adott oszlop névterszűrést tartalmaz, akkor a kívánt szűrést a `namespace` paraméterrel lehetséges definiálni. Minden névteres oszlophoz egy vagy több névteret lehet megadni, a névterek azonosítójának megadásával. A névterek listája [itt](https://hu.wikipedia.org/wiki/Wikip%C3%A9dia:N%C3%A9vt%C3%A9r) található meg. Ha csak egy névteret adunk meg, akkor elég a névtér számát használnunk (pl. `"namespace": 1`), egyébként egy tömbben adhatunk meg több névteret (`"namespace": [0, 2, 4]`). Természetesen ha több névtérrel dolgozunk, akkor például szerkesztésszámok esetén a különböző névtérben végzett szerkesztések összeadódnak, dátumok esetén pedig az adott dátum típusa alapján (pl. első, utolsó) megjelenik a megfelelő dátum (legelső, legutolsó).

Ha egy adott oszlop címkeszűrést tartalmaz, akkor a kívánt szűrést a `changeTag` paraméterrel lehetséges definiálni. Minden change tages oszlophoz egy vagy több change taget lehet megadni. Egy change tag egy címkeazonosítóból, valamint egy opcionális névtérből áll. Ha a névtér meg van adva, akkor az adott névtérben lesz vizsgálva a címke. Ha csak egy címkeszűrést adunk meg, akkor elég egyetlen címkedefiníció (pl. `{ "changeTagId": 1 }` vagy `{ "changeTagId": 1, "namespace": 0 }`), egyébként egy tömbben adhatunk meg több címkeszűrőt (`"changeTag": [{ "changeTagId": 1 }, { "changeTagId": 2 }]`).

Ha egy adott oszlop naplószűrést tartalmaz, akkor azt a `logFilter` paraméterrel lehetséges definiálni. Minden naplószűréses oszlophoz egy vagy több naplószűrés tartozik, egy naplószűrés szűrhet a napló típusára (`type`), a napló műveletére (`action`), vagy mindkettőre. Ha csak egy naplószűrést adunk meg, akkor elég egyetlen naplószűrő (pl. `{ "logType": "delete" }`, `{ "logAction": "unblock" }` vagy `{ "logType": "import", "logAction": "interwiki" }`), egyébként egy tömbben adhatunk meg több címkeszűrőt (`"logFilter": [{ "logType": "delete" }, { "logAction": "unblock" }]`).

## Regisztrációval kapcsolatos oszlopok

| Típus | Adattípus | Leírás |
|-------|-----------|--------|
| `registrationDate` | dátum | A regisztráció dátuma (ha a felhasználó regisztrált).
| `daysSinceRegistration` | egész szám | A regisztráció óta eltelt napok száma (ha a felhasználó regisztrált).
| `firstEditDate` | dátum | Az első szerkesztés dátuma.
| `lastEditDate` | dátum | Az utolsó szerkesztés dátuma.
| `daysBetweenFirstAndLastEdit` | egész szám | Az első és utolsó szerkesztés között eltelt napok száma.
| `firstLogEventDate` | dátum | Az első naplóbejegyzés dátuma.
| `lastLogEventDate` | dátum | Az utolsó naplóbejegyzés dátuma.
| `daysBetweenFirstAndLastLogEvent` | egész szám | Az első és utolsó naplóbejegyzés között eltelt napok száma.
| `lastEditDateInNamespace` | dátum | Az adott névtérben vagy névterekben végzett utolsó szerkesztés dátuma.
| `lastLogEventDateByType` | dátum | Az adott naplótípusból vagy naplótípusokból az utolsó bejegyzés dátuma.

## Aktív napokkal kapcsolatos oszlopok
| Típus | Adattípus | Leírás |
|-------|-----------|--------|
| `activeDaysSinceRegistration` | egész szám | A regisztráció óta aktív napok száma. Aktív egy nap, ha volt szerkesztése vagy naplóbejegyzése a felhasználónak.
| `activeDaysInPeriod` | egész szám | A kiválasztott időszakban aktív napok száma. Aktív egy nap, ha volt szerkesztése vagy naplóbejegyzése a felhasználónak.
| `activeDaysInNamespaceInPeriod` | szám | A kiválasztott időszakban a megadott névtérben vagy névterekben hány aktív napja volt a felhasználónak.
| `activeDaysInNamespaceSinceRegistration` | szám | Fiók létrejötte óta a megadott névtérben vagy névterekben hány aktív napja volt a felhasználónak.
| `activeDaysSinceRegistrationMilestone` | szám | A megadott mérföldkövek közül melyeket lépte át az adott időszakban a felhasználó az aktív napok vonatkozásában. A mérföldkövek (`milestones`) megadási sorrendben vannak vizsgálva, így érdemes a nagyobb értékeket előre rakni. Érdemes a `totalActiveDaysMilestoneReachedInPeriod` előfeltétellel együtt, megegyező paraméterekkel használni.

## Átlagos szerkesztésszámmal kapcsolatos oszlopok
| Típus | Adattípus | Leírás |
|-------|-----------|--------|
| `averageEditsPerDaySinceRegistration` | szám | Átlagos napi szerkesztésszám a regisztráció óta. Az összes szerkesztés van osztva az aktív napok számával.
| `averageEditsPerDayInPeriod` | szám | Átlagos napi szerkesztésszám a kiválasztott időszakban. Az időszakban végzett összes szerkesztés van osztva az aktív napok számával.
| `averageLogEventsPerDaySinceRegistration` | szám | Átlagos napi naplóbejegyzések száma a regisztráció óta. Az összes létrejött naplóbejegyzés van osztva az aktív napok számával.
| `averageLogEventsPerDayInPeriod` | szám | Átlagos napi naplószám a kiválasztott időszakban. Az időszakban létrejött naplóbejegyzések száma van osztva az aktív napok számával.

## Szerkesztésszámmal kapcsolatos oszlopok
| Típus | Adattípus | Leírás |
|-------|-----------|--------|
| `editsInPeriod` | egész szám | A kiválasztott időszakban az összes névtérben elvégzett szerkesztések száma.
| `editsInPeriodPercentageToWikiTotal` | százalék | A kiválasztott időszakban az összes névtérben elvégzett szerkesztések száma hány százaléka a wikin az adott időszakban végzett összes szerkesztésnek.
| `editsSinceRegistration` | egész szám | A fiók létrejötte óta az összes névtérben elvégzett szerkesztések száma.
| `editsSinceRegistrationPercentageToWikiTotal` | százalék | A fiók létrejötte óta az összes névtérben elvégzett szerkesztések száma hány százaléka a wikin a wiki indulása óta végzett összes szerkesztésnek.
| `editsSinceRegistrationMilestone` | szám | A megadott mérföldkövek közül melyeket lépte át az adott időszakban a felhasználó a szerkesztések számának vonatkozásában. A mérföldkövek (`milestones`) megadási sorrendben vannak vizsgálva, így érdemes a nagyobb értékeket előre rakni. Érdemes a `totalEditsMilestoneReachedInPeriod` előfeltétellel együtt, megegyező paraméterekkel használni.
## Adott névtérben végzett szerkesztésekkel kapcsolatos oszlopok
| Típus | Adattípus | Leírás |
|-------|-----------|--------|
| `editsInNamespaceInPeriod` | egész szám | A kiválasztott időszakban az adott névtérben vagy névterekben elvégzett szerkesztések száma.
| `editsInNamespaceInPeriodPercentageToWikiTotal` | szám | A kiválasztott időszakban az adott névtérben vagy névterekben elvégzett szerkesztések száma hány százaléka a wikin az adott időszakban az adott névtérben vagy névterekben végzett összes szerkesztésnek.
| `editsInNamespaceInPeriodPercentageToOwnTotalEdits` | szám | A kiválasztott időszakban az adott névtérben vagy névterekben elvégzett szerkesztések száma hány százaléka a felhasználó által az adott időszakban az összes névtérben végzett szerkesztésnek számának.
| `editsInNamespaceSinceRegistration` | egész szám | A fiók létrejötte óta az adott névtérben vagy névterekben elvégzett szerkesztések száma.
| `editsInNamespaceSinceRegistrationPercentageToWikiTotal` | szám | A fiók létrejötte óta az adott névtérben vagy névterekben elvégzett szerkesztések száma hány százaléka a wikin a wiki indulása óta az adott névtérben vagy névterekben elvégzett összes szerkesztésnek.
| `editsInNamespaceSinceRegistrationPercentageToOwnTotalEdits` | szám | A fiók létrejötte óta az adott névtérben vagy névterekben elvégzett szerkesztések száma hány százaléka a felhasználó által a fiók létrejötte óta az összes névtérben végzett szerkesztésének.

## Adott címkével ellátottt szerkesztésekkel kapcsolatos oszlopok
| Típus | Adattípus | Leírás |
|-------|-----------|--------|
| `editsInPeriodByChangeTag` | egész szám | A kiválasztott időszakban az adott címkével vagy címkékkel ellátott szerkesztések száma (opcionálisan névtérre szűrve).
| `editsSinceRegistrationByChangeTag` | egész szám | A fiók létrejötte óta az adott címkével vagy címkékkel ellátott szerkesztések száma (opcionálisan névtérre szűrve).

## Visszaállított szerkesztésekkel kapcsolatos oszlopok
| Típus | Adattípus | Leírás |
|-------|-----------|--------|
| `revertedEditsInPeriod` | egész szám | A kiválasztott időszakban a felhasználó visszavont szerkesztéseinek száma.
| `revertedEditsInPeriodPercentageToWikiTotal` | százalék | A kiválasztott időszakban a felhasználó visszavont szerkesztéseinek száma hány százaléka a wikin az adott időszakban visszavont összes szerkesztésnek.
| `revertedEditsInPeriodPercentageToOwnTotalEdits` | százalék | A kiválasztott időszakban a felhasználó visszavont szerkesztéseinek száma hány százaléka az általa a kiválasztott időszakban elvégzett összes szerkesztésnek.
| `revertedEditsSinceRegistration` | egész szám | A fiók létrejötte óta a felhasználó visszavont szerkesztéseinek száma.
| `revertedEditsSinceRegistrationPercentageToWikiTotal` | százalék | A fiók létrejötte óta a felhasználó visszavont szerkesztéseinek száma hány százaléka a wikin a wiki indulása óta visszavont összes szerkesztésnek.
| `revertedEditsSinceRegistrationPercentageToOwnTotalEdits` | százalék | A fiók létrejötte óta a felhasználó visszavont szerkesztéseinek száma hány százaléka a felhasználói fiók létrejötte óta elvégzett összes szerkesztésének.
| `revertedEditsSinceRegistrationMilestone` | szám | A megadott mérföldkövek közül melyeket lépte át az adott időszakban a felhasználó a visszavont szerkesztések számának vonatkozásában. A mérföldkövek (`milestones`) megadási sorrendben vannak vizsgálva, így érdemes a nagyobb értékeket előre rakni. Érdemes a `totalRevertedEditsMilestoneReachedInPeriod` előfeltétellel együtt, megegyező paraméterekkel használni.

## Adott névtérben visszaállított szerkesztésekkel kapcsolatos oszlopok
| Típus | Adattípus | Leírás |
|-------|-----------|--------|
| `revertedEditsInNamespaceInPeriod` | egész szám | A kiválasztott időszakban az adott névtérben vagy névterekben a felhasználó visszavont szerkesztéseinek száma.
| `revertedEditsInNamespaceInPeriodPercentageToWikiTotal` | szám | A kiválasztott időszakban az adott névtérben vagy névterekben a felhasználó visszavont szerkesztéseinek száma hány százaléka a wikin az adott időszakban az adott névtérben vagy névterekben visszavont szerkesztéseknek.
| `revertedEditsInNamespaceInPeriodPercentageToOwnTotalEdits` | szám | A kiválasztott időszakban az adott névtérben vagy névterekben a felhasználó visszavont szerkesztéseinek száma hány százaléka a felhasználó által az adott időszakban elvégzett összes szerkesztésének.
| `revertedEditsInNamespaceSinceRegistration` | egész szám | A fiók létrejötte óta az adott névtérben vagy névterekben a felhasználó visszavont szerkesztéseinek száma.
| `revertedEditsInNamespaceSinceRegistrationPercentageToWikiTotal` | szám | A fiók létrejötte óta az adott névtérben vagy névterekben a felhasználó visszavont szerkesztéseinek száma hány százaléka a wikin a wiki indulása óta az adott névtérben vagy névterekben visszavont összes szerkesztésnek.
| `revertedEditsInNamespaceSinceRegistrationPercentageToOwnTotalEdits` | szám | A fiók létrejötte óta az adott névtérben vagy névterekben a felhasználó visszavont szerkesztéseinek száma hány százaléka a wiki indulása óta felhasználó által elvégzett összes szerkesztésnek.

## Karakterváltoztatással kapcsolatos oszlopok
| Típus | Adattípus | Leírás |
|-------|-----------|--------|
| `characterChangesInPeriod` | egész szám | A kiválasztott időszakban a felhasználó által elvégzett szerkesztések karakterszám-változásának összege.
| `characterChangesInPeriodPercentageToWikiTotal` | százalék | A kiválasztott időszakban a felhasználó által elvégzett szerkesztések karakterszám-változásának összege hány százaléka a wikin az adott időszakban elvégzett szerkesztések karakterszám-változásának.
| `characterChangesSinceRegistration` | egész szám | A fiók létrejötte óta a felhasználó által elvégzett szerkesztések karakterszám-változásának összege.
| `characterChangesSinceRegistrationPercentageToWikiTotal` | százalék | A fiók létrejötte óta a felhasználó által elvégzett szerkesztések karakterszám-változásának összege hány százaléka a wikin a wiki indulása óta elvégszett szerkesztések karakterszám-változásának.
| `characterChangesSinceRegistrationMilestone` | szám | A megadott mérföldkövek közül melyeket lépte át az adott időszakban a felhasználó a szerkesztések karakterszám-változásának összege vonatkozásában. A mérföldkövek (`milestones`) megadási sorrendben vannak vizsgálva, így érdemes a nagyobb értékeket előre rakni.

## Adott névtérben végzett karakterváltozásokkal kapcsolatos oszlopok
| Típus | Adattípus | Leírás |
|-------|-----------|--------|
| `characterChangesInNamespaceInPeriod` | egész szám | A kiválasztott időszakban a felhasználó által az adott névtérben vagy névterekben elvégzett szerkesztések karakterszám-változásának összege.
| `characterChangesInNamespaceInPeriodPercentageToWikiTotal` | százalék | A kiválasztott időszakban a felhasználó által az adott névtérben vagy névterekben elvégzett szerkesztések karakterszám-változásának összege hány százaléka a wikin az adott időszakban az adott névtérben vagy névterekben elvégzett szerkesztések karakterszám-változásának.
| `characterChangesInNamespaceSinceRegistration` | egész szám | A fiók létrejötte óta a felhasználó által az adott névtérben vagy névterekben elvégzett szerkesztések karakterszám-változásának összege.
| `characterChangesInNamespaceSinceRegistrationPercentageToWikiTotal` | százalék | A fiók létrejötte óta a felhasználó által az adott névtérben vagy névterekben elvégzett szerkesztések karakterszám-változásának összege hány százaléka a wikin a wiki indulása óta az adott névtérben vagy névterekben elvégszett szerkesztések karakterszám-változásának.

## Adott címkével ellátott karakterváltozásokkal kapcsolatos oszlopok
| Típus | Adattípus | Leírás |
|-------|-----------|--------|
| `characterChangesInPeriodByChangeTag` | egész szám | A kiválasztott időszakban a felhasználó által az adott címkével vagy címkékkel ellátott szerkesztések karakterszám-változásának összege (opcionálisan névtérre szűrve).
| `characterChangesSinceRegistrationByChangeTag` | egész szám | A fiók létrejötte óta a felhasználó által az adott címkével vagy címkékkel ellátott szerkesztések karakterszám-változásának összege (opcionálisan névtérre szűrve).

## Kapott köszönetekkel kapcsolatos oszlopok
| Típus | Adattípus | Leírás |
|-------|-----------|--------|
| `receivedThanksInPeriod` | egész szám | A kiválasztott időszakban a felhasználó által kapott köszönetek száma.
| `receivedThanksInPeriodPercentageToWikiTotal` | százalék | A kiválasztott időszakban a felhasználó által kapott köszönetek száma hány százaléka a wikin az adott időszakban kapott köszönetek számának.
| `receivedThanksSinceRegistration` | egész szám | A fiók létrejötte óta a felhasználó által kapott köszönetek száma.
| `receivedThanksSinceRegistrationPercentageToWikiTotal` | százalék | A fiók létrejötte óta a felhasználó által kapott köszönetek száma hány százaléka a wikin a wiki indulása óta az összes felhasználó által kapott köszönetek számának.
| `receivedThanksSinceRegistrationMilestone` | szám | A megadott mérföldkövek közül melyeket lépte át az adott időszakban a felhasználó a kapott köszönetek vonatkozásában. A mérföldkövek (`milestones`) megadási sorrendben vannak vizsgálva, így érdemes a nagyobb értékeket előre rakni. Érdemes a `totalReceivedThanksMilestoneReachedInPeriod` előfeltétellel együtt, megegyező paraméterekkel használni.

## Küldött köszönetekkel kapcsolatos oszlopok
| Típus | Adattípus | Leírás |
|-------|-----------|--------|
| `sentThanksInPeriod` | egész szám | A kiválasztott időszakban a felhasználó által küldött köszönetek száma.
| `sentThanksInPeriodPercentageToWikiTotal` | százalék | A kiválasztott időszakban a felhasználó által küldött köszönetek száma hány százaléka a wikin az adott időszakban küldött köszönetek számának.
| `sentThanksSinceRegistration` | egész szám | A fiók létrejötte óta a felhasználó által küldött köszönetek száma.
| `sentThanksSinceRegistrationPercentageToWikiTotal` | százalék | A fiók létrejötte óta a felhasználó által küldött köszönetek száma hány százaléka a wikin a wiki indulása óta az összes felhasználó által küldött köszönetek számának.

## Naplóeseményekkel kapcsolatos oszlopok
| Típus | Adattípus | Leírás |
|-------|-----------|--------|
| `logEventsInPeriod` | egész szám | A kiválasztott időszakban a felhasználóval kapcsolatosan keletkezett, bármely típusú naplóesemények száma.
| `logEventsInPeriodPercentageToWikiTotal` | százalék | A kiválasztott időszakban a felhasználóval kapcsolatosan keletkezett naplóesemények száma hány százaléka a wikin az adott időszakban összesen keletkezett naplóesemények számának.
| `logEventsSinceRegistration` | egész szám | A fiók létrejötte óta a felhasználóval kapcsolatosan keletkezett naplóesemények száma.
| `logEventsSinceRegistrationPercentageToWikiTotal` | százalék | A fiók létrejötte óta a felhasználóval kapcsolatosan keletkezett naplóbejegyzések száma hány százaléka a wikin a wiki indulása óta keletkezett összes naplóbejegyzés számának.
| `serviceAwardLogEventsInPeriod` | egész szám | A kiválasztott időszakban a felhasználóval kapcsolatosan keletkezett, Szolgálati Emlékérembe beszámító naplóesemények száma.
| `serviceAwardLogEventsSinceRegistration` | egész szám | A fiók létrejötte óta a felhasználóval kapcsolatosan keletkezett, Szolgálati Emlékérembe beszámító naplóesemények száma.

## Adott típusú naplóeseményekkel kapcsolatos oszlopok
| Típus | Adattípus | Leírás |
|-------|-----------|--------|
| `logEventsInPeriodByType` | szám |  A kiválasztott időszakban a felhasználóval kapcsolatosan keletkezett, megadott típusú (egy vagy több típus megadható) naplóesemények száma.
| `logEventsSinceRegistrationByType` | szám | A fiók létrejötte óta a felhasználóval kapcsolatosan keletkezett, megadott típusú (egy vagy több típus megadható) naplóesemények száma.

## Szolgálati Emlékélemmel kapcsolatos oszlopok
| Típus | Adattípus | Leírás |
|-------|-----------|--------|
| `serviceAwardContributionsInPeriod` | egész szám | A kiválasztott időszakban a Szolgálati Emlékéremnél figyelembe fett közreműködések (szerkesztések és adott naplóesemények) száma.
| `serviceAwardContributionsSinceRegistration` | egész szám | A fiók létrejötte óta a Szolgálati Emlékéremnél figyelembe fett közreműködések (szerkesztések és adott naplóesemények) száma.
| `levelAtPeriodStart` | szint | A felhasználó szintje a kiválasztott időszak kezdetén.
| `levelAtPeriodEnd` | szint | A felhasználó szintje a kiválasztott időszak végén.
| `levelAtPeriodEndWithChange` | szint + volt-e váltzoás | A felhasználó szintje a kiválasztott időszak végén azzal az információval, hogy volt-e szintváltozása a felhasználónak a kiválasztott időszakban.

# Rendezés

A rendezések (`orderBy`) határozzák meg, hogy a kapott eredményhalmaz mely szempontok alapján legyen rendezve.
