# native_to cross-check — continent-level gross-error guard

33 plants checked against GBIF/WCVP native ranges + our validated native_region tags + Claude.

**gross: 0** · **contradicts: 0** · no_data: 0 · minor: 0 · ok: 33

Only non-ok rows are listed. "gross" = wrong continent (fix these).
"contradicts" = the phrase and our WCVP-validated native_region tags share no
region at all, or the tags are validated-empty and the phrase claims a range —
the phrase is describing somewhere else entirely. "no_data" = no native signal
from GBIF and Claude was unsure (often cultigens/hybrids — eyeball). "minor" =
right continent, imprecise wording.

A blank region column means the tags were not WCVP-validated for that row and
were withheld from the check rather than believed.

| verdict | plant | scientific | stored phrase | native continents | validated regions | suggested | note |
| ------- | ----- | ---------- | ------------- | ----------------- | ----------------- | --------- | ---- |

## Phrases claiming regions the validated tags exclude

7 rows. Ranked by the share of the phrase that the tags do not
support. Read from the top; most of the tail is a broad word being broad.
Nothing here is auto-applied.

| unsupported | plant                   | stored phrase                           | claims not in tags                       | validated regions                      | draft from tags                            |
| ----------- | ----------------------- | --------------------------------------- | ---------------------------------------- | -------------------------------------- | ------------------------------------------ |
| 80%         | Arabian jasmine         | tropical and subtropical Asia           | Indo-China, Malesia, China, Eastern Asia | Indian Subcontinent                    | Indian Subcontinent                        |
| 50%         | Japanese apricot        | China, Korea, and Japan                 | Eastern Asia                             | China, Indo-China                      | China and Indo China                       |
| 50%         | Redvein enkianthus      | Japan and the mountains of eastern Asia | China                                    | Eastern Asia                           | Japan                                      |
| 50%         | Roof iris               | China and Japan                         | Eastern Asia                             | China                                  | China                                      |
| 50%         | Florist's chrysanthemum | eastern Asia                            | Eastern Asia                             | China                                  | China                                      |
| 50%         | Japanese pagoda-tree    | China and Korea                         | Eastern Asia                             | China                                  | China                                      |
| 50%         | Tea plant               | eastern Asia                            | Eastern Asia                             | China, Indian Subcontinent, Indo-China | China, Indian Subcontinent, and Indo-China |
