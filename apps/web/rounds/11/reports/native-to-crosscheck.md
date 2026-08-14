# native_to cross-check — continent-level gross-error guard

25 plants checked against GBIF/WCVP native ranges + our validated native_region tags + Claude.

**gross: 0** · **contradicts: 0** · no_data: 0 · minor: 2 · ok: 23

Only non-ok rows are listed. "gross" = wrong continent (fix these).
"contradicts" = the phrase and our WCVP-validated native_region tags share no
region at all, or the tags are validated-empty and the phrase claims a range —
the phrase is describing somewhere else entirely. "no_data" = no native signal
from GBIF and Claude was unsure (often cultigens/hybrids — eyeball). "minor" =
right continent, imprecise wording.

A blank region column means the tags were not WCVP-validated for that row and
were withheld from the check rather than believed.

| verdict | plant                 | scientific              | stored phrase                  | native continents | validated regions                                     | suggested | note                                                                                                                                                                             |
| ------- | --------------------- | ----------------------- | ------------------------------ | ----------------- | ----------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| minor   | Baltic parsley        | _Cenolophium denudatum_ | northern and eastern Europe    | Europe, Asia      | China, Eastern Europe, Middle Asia, Mongolia, Siberia |           | phrase claims: Northern Europe                                                                                                                                                   |
| minor   | Miss Willmott's ghost | _Eryngium giganteum_    | the Caucasus and northern Iran | Asia, Europe      | Caucasus, Western Asia                                |           | The phrase is geographically accurate but slightly imprecise: it says 'northern Iran' where the validated tags indicate broader 'Western Asia' (which includes Türkiye per WCVP) |

## Phrases claiming regions the validated tags exclude

4 rows. Ranked by the share of the phrase that the tags do not
support. Read from the top; most of the tail is a broad word being broad.
Nothing here is auto-applied.

| unsupported | plant                       | stored phrase                         | claims not in tags | validated regions                                                                                               | draft from tags                                                                           |
| ----------- | --------------------------- | ------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 50%         | Cup-and-saucer-vine         | Mexico and Central America            | Central America    | Mexico                                                                                                          | Mexico                                                                                    |
| 50%         | Baltic parsley              | northern and eastern Europe           | Northern Europe    | China, Eastern Europe, Middle Asia, Mongolia, Siberia                                                           | eastern Europe to Siberia and China                                                       |
| 50%         | Heavenly-blue morning-glory | Mexico and Central America            | Central America    | Mexico                                                                                                          | Mexico                                                                                    |
| 25%         | Silver spear grass          | southern Europe and the Mediterranean | Western Asia       | China, Middle Asia, Middle Europe, Mongolia, Northern Africa, Siberia, Southeastern Europe, Southwestern Europe | southern and central Europe, the Mediterranean, Middle Asia, Siberia, Mongolia, and China |
