# Race survey: every player on the WTA race list

Generated 2026-10-10 18:19 UTC by `scripts/survey-race.ts` against the race list dated 2026-09-28. Each player's race-year results are built from her match feed with the updater's own code (no zero-pointers, no manual attributions), using only events credited by that date, and compared with her official total and event count.

## Summary (364 players)

| Outcome | All | 1–40 | 41–100 | 101–200 | 201+ |
|---|---|---|---|---|---|
| exact | 323 | 20 | 45 | 95 | 163 |
| events short | 24 | 12 | 6 | 5 | 1 |
| events over | 0 | 0 | 0 | 0 | 0 |
| points differ | 17 | 8 | 9 | 0 | 0 |
| cannot build | 0 | 0 | 0 | 0 | 0 |
| feed failed | 0 | 0 | 0 | 0 | 0 |

- **exact:** total and event count both reproduce.
- **events short:** the total reproduces but the WTA counts more events: zero-pointers to attribute.
- **events over / points differ:** the feed and the official figures disagree in a way zero-pointers can't explain.
- **cannot build:** she played events the updater can't add automatically (listed below).

## Reading the results

Every player who doesn't reproduce is a zero-pointer case. No player failed for any other reason: no feed errors, no events the updater couldn't add, and no case where we count more events than the WTA.
- **events short:** the total matches, so only the zero-pointers' events need attributing.
- **points differ:** in every case the WTA also counts more events than we do, and our total is 1–25 points too high. That is the pattern of zero-pointers that must count and so push a low result out of the best 18, exactly as with Jovic (+1) and Cirstea (+25), whose attributions are in data/SOURCES.md.

So 323 of 364 players (89%) reproduce with no human input. Of the 41 who don't, 22 are already tracked and attributed; the other 19 (race #43 down) are the off-season work, about 30 zero-pointers in all.

## Players that don't reproduce exactly

| Race # | Player | Tracked | Outcome | Detail |
|---|---|---|---|---|
| 2 | Aryna Sabalenka | yes | events short | 4 zero-pointers to attribute |
| 3 | Jessica Pegula | yes | events short | 1 zero-pointer to attribute; e.g. Unnamed WTA 500 zero-pointer; Unnamed WTA 500 zero-pointer |
| 5 | Coco Gauff | yes | events short | 1 zero-pointer to attribute; e.g. Unnamed WTA 500 zero-pointer; Unnamed WTA 500 zero-pointer |
| 7 | Karolina Muchova | yes | events short | 4 zero-pointers to attribute |
| 9 | Marta Kostyuk | yes | events short | 4 zero-pointers to attribute |
| 10 | Iga Swiatek | yes | events short | 2 zero-pointers to attribute; e.g. Unnamed WTA 500 zero-pointer + Unnamed WTA 500 zero-pointer; Unnamed WTA 500 zero-pointer + Dubai |
| 11 | Iva Jovic | yes | points differ | ours 2732 from 18, official 2731 from 19 (+1) |
| 12 | Victoria Mboko | yes | events short | 4 zero-pointers to attribute |
| 13 | Sorana Cirstea | yes | points differ | ours 2415 from 18, official 2390 from 19 (+25) |
| 16 | Naomi Osaka | yes | events short | 4 zero-pointers to attribute |
| 18 | Madison Keys | yes | events short | 3 zero-pointers to attribute; e.g. Unnamed WTA 500 zero-pointer + Unnamed WTA 500 zero-pointer + Doha; Unnamed WTA 500 zero-pointer + Unnamed WTA 500 zero-pointer + Dubai |
| 19 | Belinda Bencic | yes | events short | 1 zero-pointer to attribute; e.g. Unnamed WTA 500 zero-pointer; Unnamed WTA 500 zero-pointer |
| 22 | Anastasia Potapova | yes | points differ | ours 1808 from 18, official 1807 from 19 (+1) |
| 23 | Emma Navarro | yes | points differ | ours 1807 from 19, official 1805 from 21 (+2) |
| 27 | Sara Bejlek | yes | points differ | ours 1473 from 19, official 1472 from 20 (+1) |
| 29 | Maria Sakkari | yes | points differ | ours 1405 from 19, official 1404 from 20 (+1) |
| 31 | Jasmine Paolini | yes | events short | 3 zero-pointers to attribute; e.g. Unnamed WTA 500 zero-pointer + Unnamed WTA 500 zero-pointer + Toronto; Unnamed WTA 500 zero-pointer + Unnamed WTA 500 zero-pointer + Cincinnati |
| 35 | Ekaterina Alexandrova | yes | points differ | ours 1280 from 22, official 1279 from 23 (+1) |
| 36 | Cristina Bucsa | yes | points differ | ours 1232 from 19, official 1231 from 20 (+1) |
| 39 | Hailey Baptiste | yes | events short | 2 zero-pointers to attribute; e.g. Unnamed WTA 500 zero-pointer + Unnamed WTA 500 zero-pointer; Unnamed WTA 500 zero-pointer + Doha |
| 43 | Clara Tauson |  | points differ | ours 1057 from 21, official 1056 from 22 (+1) |
| 44 | Barbora Krejcikova |  | events short | 1 zero-pointer to attribute; e.g. Unnamed WTA 500 zero-pointer; Unnamed WTA 500 zero-pointer |
| 48 | Qinwen Zheng | yes | events short | 2 zero-pointers to attribute; e.g. Unnamed WTA 500 zero-pointer + Unnamed WTA 500 zero-pointer; Unnamed WTA 500 zero-pointer + Australian Open |
| 53 | Elisabetta Cocciaretto |  | points differ | ours 962 from 18, official 961 from 19 (+1) |
| 58 | Jaqueline  Cristian |  | points differ | ours 870 from 16, official 869 from 19 (+1) |
| 62 | Oleksandra Oliynykova |  | events short | 1 zero-pointer to attribute; e.g. Unnamed WTA 500 zero-pointer; Unnamed WTA 500 zero-pointer |
| 65 | Paula Badosa |  | points differ | ours 818 from 18, official 817 from 19 (+1) |
| 68 | Daria Kasatkina |  | points differ | ours 753 from 20, official 751 from 22 (+2) |
| 75 | Emma Raducanu |  | events short | 2 zero-pointers to attribute; e.g. Unnamed WTA 500 zero-pointer + Unnamed WTA 500 zero-pointer; Unnamed WTA 500 zero-pointer + Miami |
| 78 | Tereza Valentova |  | events short | 1 zero-pointer to attribute; e.g. Unnamed WTA 500 zero-pointer; Unnamed WTA 500 zero-pointer |
| 79 | Mccartney Kessler |  | points differ | ours 676 from 18, official 673 from 21 (+3) |
| 82 | Petra Marcinko |  | points differ | ours 648 from 18, official 647 from 19 (+1) |
| 88 | Dayana Yastremska |  | points differ | ours 548 from 20, official 547 from 21 (+1) |
| 89 | Ajla Tomljanovic |  | events short | 1 zero-pointer to attribute; e.g. Unnamed WTA 500 zero-pointer; Unnamed WTA 500 zero-pointer |
| 97 | Eva Lys |  | points differ | ours 461 from 18, official 458 from 21 (+3) |
| 101 | Laura Siegemund |  | events short | 2 zero-pointers to attribute; e.g. Unnamed WTA 500 zero-pointer + Unnamed WTA 500 zero-pointer; Unnamed WTA 500 zero-pointer + Toronto |
| 108 | Sonay Kartal |  | events short | 2 zero-pointers to attribute; e.g. Unnamed WTA 500 zero-pointer + Unnamed WTA 500 zero-pointer; Unnamed WTA 500 zero-pointer + Miami |
| 115 | Varvara Gracheva |  | events short | 3 zero-pointers to attribute; e.g. Unnamed WTA 500 zero-pointer + Unnamed WTA 500 zero-pointer + Madrid; Unnamed WTA 500 zero-pointer + Unnamed WTA 500 zero-pointer + Rome |
| 145 | Julia Grabher |  | events short | 1 zero-pointer to attribute; e.g. Unnamed WTA 500 zero-pointer; Unnamed WTA 500 zero-pointer |
| 151 | Lois Boisson |  | events short | 1 zero-pointer to attribute; e.g. Unnamed WTA 500 zero-pointer; Unnamed WTA 500 zero-pointer |
| 229 | Marketa Vondrousova |  | events short | 3 zero-pointers to attribute; e.g. Unnamed WTA 500 zero-pointer + Unnamed WTA 500 zero-pointer + Australian Open; Unnamed WTA 500 zero-pointer + Unnamed WTA 500 zero-pointer + Doha |
