# Data sources: 2026 Race to the WTA Finals (singles)

Every value in `data/*.json` comes from one of the sources below, all fetched on 2026-10-07. Nothing was filled in from memory.

**As of:**
- **Official race totals:** the WTA's current Race list, `rankedAt` 2026-09-28. On 2026-10-07 the race page's date picker shows 2026-10-05, and querying `at=2026-10-05` returns the same 2026-09-28 list. Re-checked unchanged at 2026-10-07T21:51Z.
- **Beijing live status:** the WTA match feed, `lastUpdated` 2026-10-08T13:02:03Z, checked at 13:04Z. QF results so far: Bartunkova d Muchova 6-3, 6-0; Andreeva d Alexandrova 7-6(4), 7-6(3).
- **`meta.json` `lastUpdated`:** 2026-10-07T21:51:15Z, the time of that final check.

## Rules (`rules.json`)

Primary sources:
- **[R]** The 2026 WTA Official Rulebook, 7-27-2026 revision: https://photoresources.wtatennis.com/wta/document/2026/08/10/f7e04e05-20c2-4f22-979c-3bbfdb3aa778/2026-WTA-Rulebook-7-27-2026-.pdf (linked from https://www.wtatennis.com/WTA-rules). Page numbers are printed page numbers.
- **[RR]** WTA, "Race to the WTA Finals – Qualification Rules": https://wtafiles.wtatennis.com/pdf/rankings/RaceRules.pdf (PDF dated 2025-11-25).

| Field | Value | Source |
|---|---|---|
| `maxCountedResults` | 18 | R §VI.A.1, p.95; RR p.1 |
| `requiredGroups` | GS ×4, WTA1000C ×6, WTA1000 ×1 | R §VI.A.1, p.95. The combined set (Indian Wells, Miami, Madrid, Rome, Toronto/Montreal, Cincinnati, **Beijing**) and the WTA-only set (Doha, Dubai, Wuhan) are named in RR p.1. |
| `excludedCategories` | WTA125, ITF | R §VI.A.1, p.95 ("WTA 125 and ITF ranking point results do not count"); RR p.1 |
| Zero-pointers always count | (engine) | R §VIII.A.4.a.i(a)–(c), pp.143–144; RR p.3 ("points being removed from their lowest-scoring corresponding tournament") |
| `pointsTables` gs-128, wta1000-96, wta1000-56, wta500-48, wta500-28, wta250-32 | see file | R §VIII.A.5, "2026 WTA Ranking Point Chart", p.147 (singles rows: Grand Slam 128; WTA 1000 96M; WTA 1000 56M; WTA 500 48M; WTA 500 30/28M; WTA 250 32M) |
| `pointsTables.united-cup` | 1 / 32 / 60 / 90 / 108 / 150 / 325 / 500 by singles match wins | R Appendix L §J, p.520 |
| `byeRule` | points-of-previous-round | R §VIII.B.3.b.i, pp.149–150 (a player who has a bye and loses her first match "will receive first round losers' points") |
| `tiebreakers` | pointsIn [WTA1000C, WTA1000]; highestIn [WTA1000C, WTA1000]; highestIn [WTA500]; highestIn [WTA250] | R §VI.B.2.c.i, p.97; RR p.2. All four criteria are defined over results "counting toward her Race Points". |
| `qualification` | top 7 by Race rank; place 8 goes to the best-ranked current-year Grand Slam champion ranked 8–20, otherwise the next player; every qualifier needs ≥ 8 WTA 1000 or WTA 500 events | R §VI.B.2.a, p.96; RR p.1 |
| Race Year | events from the week of 2025-10-27 (2025 Hong Kong, Chennai, Jiujiang) through 2026 Tokyo and Guangzhou; excludes the WTA Finals | R §VI.A, p.95; RR p.1 |

## Interpretations

- **United Cup** has category `WTA500`. R §II.A.2.c (p.10) says it counts toward the WTA 500 commitment, and the R entry table on p.69 lists "WTA 500 (including United Cup)". Its points don't follow rounds, so it has its own `united-cup` table. The round codes are chosen to match its points:

  | Code | Meaning |
  |---|---|
  | `UC0` | 0 match wins |
  | `UC1RR` | 1 round-robin win |
  | `UC1KO` | 1 win in the QF, SF or F |
  | `UC2RR` | 2 round-robin wins |
  | `UC2KO` | 2 wins, 1 of them in the QF, SF or F |
  | `UC3` | 3 match wins |
  | `UC4` | 4 match wins |
  | `W` | 5 match wins |

  Ranks 26–40: Sakkari 90 points = `UC2RR` (two round-robin wins, then lost to Gauff in the QF); Paolini 32 = `UC1RR`.

- **Draw types** come from `singlesDrawSize` in the WTA API:
  - 96 → `wta1000-96`; 56 → `wta1000-56`;
  - 48 → `wta500-48`; 28 or 30 → `wta500-28`; 32 → `wta250-32`.
  - Ostrava 2026 is a WTA 250 with a 30-player draw. It uses `wta250-32`, because the WTA 250 table is the same for 30 and 32 draws apart from byes. Its stored points are the published ones.
  - Eastbourne 2026 reports a draw size of 0, so it is treated as a 32-player WTA 250. Its stored points match that table.
- **Round codes and points.** The round is the deepest main-draw round reached: the round lost, the next round if her last match was a win (walkover or withdrawal), or `W` for a title. **Qualifying codes** mean the race points come from qualifying, stored as published:
  - `Q1`, `Q2` and `Q3` mean she lost in that qualifying round, taken from the feed's `tourn_round` on the qualifying match. The cases are Potapova at Dubai (Q1, 2 points), Chwalinska at Auckland (Q2, 12) and Chwalinska at the Australian Open (Q3, 30). Each matches its rulebook qualifying column on p.147.
  - Plain `Q` means she qualified but played no main-draw match. The only case is Cirstea at Adelaide, 25 points: the feed shows two qualifying wins and no main-draw match, and her points are the qualifier (QLFR) points.
  - A lucky loser who played a main-draw match is stored at her real main-draw round. Potapova at Adelaide lost in Q2, entered the main draw as a lucky loser (feed `entry_type` "L") and lost in R32. She is stored as `R32` with the published 13 points, which are her qualifying points only, per R §VIII.B.2.d, p.148.
  - **Counting rule:** a qualifying loss (`Q1`, `Q2`, …) never fills a required group (Grand Slams or WTA 1000s). A Grand Slam or WTA 1000 result must count only once the player is accepted into the main draw (R §VIII.A.4.a.i(a), p.144), so a qualifying loss is an optional result.
    - Plain `Q` (qualified) is a main-draw acceptance, so it can fill a required group.
    - Confirmed by Birrell: her only Rome result is Q1 (2 points). Her official 1228 is reproduced only when that result competes as optional, letting her Nottingham 12 count. Every other player with qualifying results reproduces her total under either reading.
  - Points are always the published race points (`points_champ`), even where they differ from the table: bye then first-match loss (10 or 1), qualifier points added, or walkover cases (Kostyuk at Guadalajara and Mertens at Singapore, QF = 60).
- **In-progress results not yet credited:** a result at an in-progress event stored with 0 points (not a zero-pointer) is left out of the current (official) total. Otherwise it could take a counting place, for example a required WTA 1000 place, which the official race doesn't give it. This matters for Bejlek and Alexandrova (Beijing). Projections still credit the live round.
- **WTA 125 and ITF results** are not stored. The WTA publishes no race points for them, and they never count.
- **Countries.** The WTA displays IOC codes, mapped here to ISO 3166-1 alpha-2: KAZ→KZ, BLR→BY, USA→US, RUS→RU, CZE→CZ, UKR→UA, POL→PL, CAN→CA, ROU→RO, PHI→PH, JPN→JP, BEL→BE, SUI→CH, AUT→AT, LAT→LV, GRE→GR, FRA→FR, ITA→IT, CHN→CN, ESP→ES, AUS→AU. The WTA displays RUS and BLR for players competing without a flag, so they map to RU and BY. No player needed `UN`.

## Tournaments (`tournaments.json`)

- **Completed events:** the name, dates and draw size come from the `tournament` object in the official WTA match feed (below). Sponsor suffixes such as "presented by …" are trimmed.
- **Calendar, Beijing and upcoming events:** https://api.wtatennis.com/tennis/tournaments/?page=0&pageSize=100&excludeLevels=ITF&from=2026-09-01&to=2026-11-30
  - China Open, Beijing: 2026-09-30 to 10-11, `inProgress`.
  - Wuhan: 10-12 to 10-18.
  - Osaka (Japan Open) and Ningbo: 10-19 to 10-25.
  - Guangzhou and Tokyo (Toray Pan Pacific Open): 10-26 to 11-01. These are the last Race events (RR p.1).
  - Chennai and Hong Kong 2026 (from 11-02) belong to the 2027 Race Year, so they are excluded. The WTA Finals is excluded.
- **Beijing byes:** seeds 1–32 have byes in the 96-player draw, per R §V.A.5.d (p.80) and the seeds in https://api.wtatennis.com/tennis/tournaments/1020/2026/players. Every tracked seed is listed. The Wuhan draw is not out yet, so it has no byes.
- **Entry lists (`entries`), as of 2026-10-08, all 40 tracked players:** tracked players with entry type M (main draw) or Q (qualifying) in the singles event of https://api.wtatennis.com/tennis/tournaments/{id}/2026/players. The ids are Wuhan 1075, Ningbo 2092, Osaka 405, Tokyo 1056 and Guangzhou 1023.
  - Players were matched by full name.
  - Osaka and Guangzhou have published lists with no tracked players, so their `entries` are empty.
  - The Tokyo list had 17 names on 2026-10-08 and 37 on 2026-10-09. The 2026-10-09 refresh added Parry, Stearns, Li, Xinyu Wang, Bucsa, Birrell, Bartunkova and Samsonova. There were no other changes.
  - On 2026-10-09 the Wuhan feed listed only the 32-player qualifying draw (event `RS`). The main-draw list had been taken down ahead of the draw, so the Wuhan `entries` stay as of 2026-10-08.
  - Entry lists change with withdrawals and wildcards. The site only uses them to order and tag players in the scenario editor, never in the Q, Out, Max or chances calculations.
- **Added for ranks 26–40** (2026-10-08), WTA 250s none of the original 25 played. Names and dates are from each match's `tournament` object in the player match feed:
  - Chennai 2025 (1148);
  - Jiujiang 2025 (1077);
  - Ostrava (1154);
  - Athens (1175);
  - Memphis (1167);
  - Seoul (1024).

  The feed's group name for the 2026 Canadian Open is "MONTREAL", but its title says "Toronto, CAN", and its dates match `toronto-2026`.
- **`wtaId`** (2026-10-09): the WTA's own ids, used by the automatic updater. Players were matched by exact full name in the race ranking feed; tournaments by start date and level in the calendar feed (`tournamentGroup.id`). The `zp-*` placeholders have none.
- **Placeholder tournaments** `zp-wta500-1` and `zp-wta500-2` stand for zero-pointers whose event is not published. Their dates span the Race Year. They are allowed under **controller Ruling 8a**, which needs both of these, and not that today's total requires the zero-pointer:
  - the official `tournamentsPlayed` is higher than the player's stored events;
  - WTA 500 commitment zero-pointers must count (R §VIII.A.4.a.i(c), p.144; RR p.3), so they will take a counting slot once a player passes 18 results.

  The placeholders are Sabalenka ×2 and Gauff, Kostyuk, Swiatek and Osaka ×1. None of the 6 is needed for today's total. The per-player count arithmetic is in the zero-pointer table below.

## Players (`players.json`)

- **Top 40 and `officialRaceTotal`:** ranks 1–25 as of 2026-09-28, ranks 26–40 added 2026-10-08 (same feed, `pageSize=45`): https://api.wtatennis.com/tennis/players/ranked?page=0&pageSize=30&type=rankSingles&sort=asc&metric=CHAMPSINGLES&name= . This is the feed behind https://www.wtatennis.com/rankings/race-singles. Totals are copied exactly. The same feed gives `tournamentsPlayed`, the official event count.
- **Per-tournament race points:** https://api.wtatennis.com/tennis/players/{wtaId}/matches?page=0&pageSize=100&sort=desc&type=S . This is the feed behind the profile and rankings "Latest Matches". The field `points_champ_N` is the race points; it is 0 at the WTA Finals and absent for WTA 125 and ITF. Every Race-Year event since 2025-10-27 is included.
- **Beijing:**
  - Source: https://api.wtatennis.com/tennis/tournaments/1020/2026/matches and /players.
  - The official race (2026-09-28) credits no Beijing points yet, so each tracked player in the draw has `{round, points: 0}` plus a `live` entry.
  - As of 2026-10-09, all QFs are done. Alive at SF: Andreeva (72), Bartunkova (91), Mertens (36), and the untracked Zheng.
  - SFs: Zheng v Mertens; Andreeva v Bartunkova.
  - QF results on 2026-10-09: Zheng d. Svitolina 6-3 7-6(6); Mertens d. Swiatek 7-6(0) 6-3.
  - Draw: `drawSize` 96 and each alive player's `drawPosition` are her 1-based index in the singles draw order of the /players feed: Svitolina 24, Mertens 36, Swiatek 48, Andreeva 72. Checked against the match feed: the quarters are positions 1–24, 25–48, 49–72 and 73–96 (Zheng v Svitolina, Mertens v Swiatek, Alexandrova v Andreeva, Muchova v Bartunkova).
  - Ranks 26–40, from the same feeds on 2026-10-08:
    - Bartunkova is alive in the SF at `drawPosition` 91; she beat Muchova in the QF.
    - Alexandrova lost in the QF (to Andreeva).
    - Other eliminations: Ann Li R16; Bejlek, Ostapenko, Sakkari and Samsonova R32; Fernandez, Parry, Paolini, Stearns, Xinyu Wang, Bucsa and Birrell R64.
    - Baptiste is not in the draw.
    - Seeds among them were added to `byes`.
  - Eliminated: Svitolina QF, Swiatek QF, Muchova QF, Rybakina R64 (after a bye), Sabalenka R32, Gauff R16, Noskova R16, Jovic R16, Shnaider R32, Osaka R16, Bencic R32, Kalinskaya R64 (retired), Potapova R64 (retired), Chwalinska R64, Bouzkova R32.
- **`wtaId`** (2026-10-09): the WTA's own ids, used by the automatic updater. Players were matched by exact full name in the race ranking feed; tournaments by start date and level in the calendar feed (`tournamentGroup.id`). The `zp-*` placeholders have none.
- **`qualified`:** true for Rybakina and Sabalenka only. Source: WTA press release, 2026-09-28, https://www.wtatennis.com/news/4583238/aryna-sabalenka-qualifies-for-wta-finals-indian-wells-for-sixth-consecutive-season ("Sabalenka joins PIF WTA World No. 1 Elena Rybakina, who qualified earlier this month"). No other singles qualification had been announced.
- **`eventMinimumWaived`:** false for everyone. The WTA has announced no long-term-injury exemption.

### Zero-pointers

No official per-player race breakdown could be fetched; every breakdown-style endpoint returned 404 or held no breakdown. Zero-pointers were therefore found this way:
1. The official `tournamentsPlayed` count was compared with the WTA events found in the match feed. The difference is the number of hidden zero-pointers.
2. Each one was attributed to a real event when a source names that event. Otherwise it was stored as a labelled WTA 500 placeholder under controller Ruling 8a, described under Tournaments above. These are kept even where today's total doesn't need them.
3. After this, every player's stored event count (excluding the in-progress Beijing) equals `tournamentsPlayed`.

Zero-pointers arise only from Grand Slams, WTA 1000 commitments and WTA 500 commitment shortfalls (R §II.A, pp.9–10; §VIII.A.4.a.i, pp.143–144; §VIII.B.3.a.i(a), p.148). A WTA 500 commitment zero-pointer is a count shortfall, not tied to one event (RR p.3).

Official draw sheets cited below have the form `https://wtafiles.wtatennis.com/pdf/draws/2026/<id>/MDS.pdf`. Their "Withdrawals" section lists withdrawals after the draw was made:
- Doha `1003`; Dubai `718`; Madrid `1038`; Rome `709`; Cincinnati `1017`; Miami `902`.

News sources cited:
- **W-DOHA:** wtatennis.com, 2026-02-04, https://www.wtatennis.com/news/4443783/2026-qatar-open-411-dates-players-and-everything-else-you-need-to-know . It names Sabalenka, Pegula, Bencic, Osaka, Kostyuk, Keys and Jovic as out of Doha.
- **T-DUBAI:** tennis365, 2026-02-17, https://www.tennis365.com/tennis-features/dubai-tennis-championships-withdrawals-retirements-field-wta-1000-decimated . It names Kostyuk, Osaka and Keys as withdrawn from the entry list.
- **T-MADRID:** tennis365, 2026-04-26, https://www.tennis365.com/tennis-features/madrid-open-withdrawals-retirements-30-stars-out-iga-swiatek . It names Muchova and Navarro.
- **T-MIAMI:** tennis365, https://www.tennis365.com/tennis-features/miami-open-2026-withdrawal-list-novak-djokovic-emma-raducanu . It says "Emma Navarro – replaced by Zhang Shuai" and "Wang Yafan – replaced by Anastasia Potapova".
- **T-TORONTO:** tennis365, 2026-07-19, https://www.tennis365.com/tennis-features/canadian-open-withdrawal-list-carlos-alcaraz-emma-raducanu-joined-karolina-muchova . It names Muchova.
- **T-CINCY:** tennis365, 2026-08-14, https://www.tennis365.com/tennis-features/cincinnati-open-withdrawal-list-2026-17-players-out-alcaraz-sinner-osaka . It names Muchova.
- **W-WIMB:** wtatennis.com, 2026-06-12, https://www.wtatennis.com/news/4518167/mboko-withdraws-from-wimbledon-due-to-knee-injury
- **T-PAOLINI-TOR:** tennisuptodate, https://tennisuptodate.com/wta/jasmine-paolini-withdraws-from-canadian-open-as-injury-list-continues-to-grow ("withdraw from Washington and Toronto").
- **W-CINCY:** wtatennis.com, https://www.wtatennis.com/news/4556337/karolina-muchova-2025-finalist-jasmine-paolini-to-miss-cincinnati-open-with-injuries
- **P-BUCSA:** puntodebreak, 2026-06-22, https://www.puntodebreak.com/en/2026/06/22/official-cristina-bucsa-will-not-be-able-to-compete-in-wimbledon-2026 . The main-draw spot went to Jimenez Kasintseva.
- **TT-BAPTISTE:** tennistonic, https://tennistonic.com/tennis-news/1004362/hailey-baptiste-faces-long-recovery-after-roland-garros-injury-with-acl-and-meniscus-issues
- **T-USO:** tennis365, 2026-07-29, https://www.tennis365.com/tennis-features/us-open-withdrawal-list-4-wta-stars-out-australian-joins-victoria-mboko-doubts-emma-raducanu

| Player | Official events | Stored played | Zero-pointers stored | Evidence |
|---|---|---|---|---|
| Sabalenka | 16 | 12 | doha, dubai, zp-wta500-1, zp-wta500-2 | Doha: W-DOHA. Dubai: MDS 718 ("Right hip injury"). She played all 4 Grand Slams and all 6 other combined events. Doha and Dubai are attributed, and Wuhan and Beijing 2025 fall outside the Race Year, so the remaining 2 can only be WTA 500 commitment shortfalls. |
| Pegula | 16 | 15 | doha | W-DOHA |
| Gauff | 16 | 15 | zp-wta500-1 | She played every Grand Slam and every WTA 1000 in the Race Year, so the 1 missing event can only be a WTA 500 commitment shortfall. |
| Muchova | 16 | 12 | dubai, madrid, toronto, cincinnati | Dubai: MDS 718. Madrid: T-MADRID. Toronto: T-TORONTO. Cincinnati: T-CINCY. |
| Kostyuk | 16 | 12 | doha, dubai, rome, zp-wta500-1 | Doha: W-DOHA. Dubai: T-DUBAI. Rome: MDS 709 ("right hip injury"). The 4th: all Grand Slams and other WTA 1000s are played or attributed, so it is a WTA 500 shortfall. |
| Swiatek | 16 | 14 | dubai, zp-wta500-1 | Dubai: MDS 718. The 2nd: all Grand Slams and other WTA 1000s were played, so it is a WTA 500 shortfall. |
| Jovic | 19 | 18 | doha | W-DOHA. **Needed for the total:** the sum of all stored results is 2732. Doha 0 fills the WTA 1000 slot, Dubai 120 moves to the open pool, and Strasbourg 1 drops: 2732 − 1 = 2731 official. |
| Mboko | 15 | 11 | dubai, rome, wimbledon, us-open | See the note below the table. |
| Cirstea | 19 | 18 | doha | MDS 1003 ("S. Cirstea change of schedule"). **Needed for the total:** sum 2415. Doha 0 fills the WTA 1000 slot, and Adelaide 25 drops from the open pool: 2415 − 25 = 2390 official. |
| Osaka | 16 | 12 | doha, dubai, cincinnati, zp-wta500-1 | Doha: W-DOHA. Dubai: T-DUBAI. Cincinnati: MDS 1017 ("N. Osaka Fatigue"). The 4th: all Grand Slams and other WTA 1000s were played, so it is a WTA 500 shortfall. |
| Keys | 18 | 15 | doha, dubai, madrid | Doha: W-DOHA. Dubai: T-DUBAI. Madrid: MDS 1038 ("M. Keys illness"). |
| Bencic | 15 | 14 | doha | W-DOHA ("Belinda Bencic (illness)") |
| Potapova | 19 | 18 | miami | She was accepted into Miami as a replacement (T-MIAMI), but she is not in the official draw sheet (MDS 902) and has no Miami match. **Needed for the total:** sum 1808. With Miami as a combined zero-pointer, Beijing 0 is surplus and the open pool drops Mérida 1, giving 1807 official. A WTA 500 zero-pointer instead would give 1793. |
| Navarro | 21 | 19 | miami, madrid | Miami: T-MIAMI. Madrid: T-MADRID. **Needed for the total:** sum 1808. With the combined group full of 4 played plus 2 zero-pointers, the open pool keeps its best 7 and drops 1 + 1 + 1, giving 1805 official. |
| Sakkari | 20 | 19 | dubai | MDS 718 ("M. Sakkari Illness"). **Needed for the total:** without it, 1405; with it, 1404 official. |
| Alexandrova | 23 | 22 | madrid | MDS 1038 ("E. Alexandrova Lower Back Injury"). The only single attribution that reproduces 1279. |
| Bucsa | 20 | 19 | wimbledon | P-BUCSA. **Needed for the total:** 1232 without it, 1231 with it. |
| Paolini | 17 | 14 | toronto, cincinnati, zp-wta500-1 | Toronto: T-PAOLINI-TOR. Cincinnati: W-CINCY. The 3rd: all other Grand Slams and WTA 1000s were played or attributed, and she also withdrew from Washington (500), so it is a WTA 500 shortfall. Total 1324 under every attribution. |
| Baptiste | 14 | 12 | wimbledon, us-open | A Long-Term Injury from Roland Garros on (ACL; TT-BAPTISTE): Grand Slam zero-pointers must count, WTA 1000 ones during the injury need not (R §VIII.A.4.a.ii(c), p.145). That leaves exactly Wimbledon and the US Open, the same reasoning as Mboko. Total 1153 under any attribution. |
| Bejlek | 20 | 19 | zp-wta500-1 | **Unattributed (controller ruling, 2026-10-08).** No source names the missing event. Doha, Indian Wells, Madrid and a WTA 500 shortfall all reproduce 1472, so it is stored as the existing labelled placeholder. Replace it if a source turns up. |

**Mboko** (an interpretation; flagged in the report):
- Dubai (MDS 718, "Right elbow injury"), Rome (MDS 709, "gastrointestinal illness") and Wimbledon (W-WIMB) are cited withdrawals after acceptance.
- She also withdrew from Toronto (T-TORONTO) and Cincinnati (T-CINCY), and T-USO says she is out of the US Open. Counting every one of those as a zero-pointer would give 6, but the official count allows only 4.
- She has not played since injuring her knee at Queen's on about 10 June, which is more than 8 weeks. Under the Long-Term Injury rule (R §VIII.A.4.a.ii(c), pp.145–146), WTA 1000 zero-pointers during the injury are not required, while Grand Slam zero-pointers must count. Her WTA 500 requirement drops to at most 4, and she has played 4: United Cup, Adelaide, Strasbourg and Queen's.
- That leaves exactly Dubai, Rome, Wimbledon and the US Open. Her total, 2393, is the same under any attribution.
- These 4 of her 6 cited withdrawals were picked as zero-pointers by inference from the official `tournamentsPlayed` count and the long-term-injury rule. The WTA has not announced which events carry her zero-pointers.
- `eventMinimumWaived` stays false, because no exemption has been announced.
