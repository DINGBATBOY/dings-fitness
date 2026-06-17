# Hidatsa for Ding! Fitness — what we trust

_Last updated: 2026-06_

Trimmed-down reference. Only what I can verify across multiple sources,
plus the hidden gems of the Hidatsa language that could shape the app's
voice and visual identity.

**The rule:** if a word isn't in this document, don't ship it yet.
Verify with a fluent speaker first.

---

## Words you can trust

These are confirmed across at least two independent sources (Native
Languages, Omniglot, Wikipedia, ASJP, or the Matthews corpus _and_ a
modern reference). Modern orthography preferred — diacritics matter.

### The language and its people

| Word | Meaning | Notes |
|---|---|---|
| **Hiraaciréʼ** | the Hidatsa language | The language's own name. Use it when crediting the source — e.g. a small footer line: _"Vocabulary in Hiraaciréʼ."_ |
| **Hiraacá** | a Hidatsa person | Autonym. Use sparingly and with weight. |
| **Nuxbaaga** | "Original People" | Hidatsa self-identifier. Strongest candidate for a Profile-screen subtitle or About-screen line. |
| **Numakiki** | "People" (Mandan) | The Mandan parallel. Honoring all three nations of MHA together is more respectful than featuring only Hidatsa. |
| **Sáhniš** | "Original People" (Arikara) | The Arikara parallel. |

### Core nouns — verified

| Word | Meaning | Confidence |
|---|---|---|
| **mini** | water | **Highest confidence in this doc.** Modern Hidatsa AND modern Mandan share this exact form. Ship without hesitation. |
| **midi** | sun | Hidatsa. |
| **makumidi** | moon | _Literally "night-sun"_ — see Hidden Gems below. |
| **Cagáàga** | bird | (pronounced [tsaɡáàɡa]) |
| **Cagáàgawia** | "Bird Woman" | This is the original form of **Sacagawea** — a Hidatsa name, not a guess. |
| **mia** / **míà** | woman | |
| **matsé** | man | |

### Numbers 1–5 (Hidatsa, Mandan, Arikara)

These are the most-verified forms anywhere because every linguist who's
visited the MHA Nation has collected them.

| # | Hidatsa | Mandan | Arikara |
|---|---|---|---|
| 1 | Nuetza | Maxana | Áxku |
| 2 | Nopa | Nunp | Pítkux |
| 3 | Nawi | Namini | Táwit' |
| 4 | Topa | Toop | Čiití'iš |
| 5 | Kihu | Kixon | Šíhux |

### Modest gestures

- **wáaši:** — "holy story." Could be used as a name for a journaling
  feature or end-of-month recap (not a tab name — too sacred a word
  for casual UI; treat as a one-time, considered placement if used at
  all).

---

## Hidden gems — what's beautiful about the language

These aren't words to put in the UI directly. They're **patterns and
structural facts** about Hidatsa that should _shape design decisions_ —
the kind of cultural texture that no AI-generated app could ever fake.

### 1. The moon is the "night-sun"

> _makumidi_ = **moon**, literally _maku_ ("night") + _midi_ ("sun").

Hidatsa doesn't have a separate root for the moon. It's a compound
description. **Design implication:** the language thinks
compositionally. "Night-sun." "Bird-woman." Concepts get built from
parts, not lifted as nouns. The app's voice can do the same — instead
of "Workout" as a label, what's it _made of_?

### 2. M is W. N is R.

Hidatsa has a phonological rule that's genuinely unusual: between
vowels, /m/ is pronounced **[w]** and /r/ is pronounced **[n]**.

> The word for water written **mini** is sometimes heard as **wini**.
> "Miri" (older spelling) became "mini" (modern) because of the same
> rule applied in reverse.

This isn't a bug — it's a feature of the language's phonology that
linguists find genuinely cool. **Design implication:** if there's
ever a moment to teach the user one thing about Hidatsa, this is the
sticky fact. _"In Hidatsa, the M in mini sometimes becomes W. They're
the same sound."_ Beautiful and memorable.

### 3. Pitch carries meaning

Hidatsa is **pitch-accent**, like Japanese. High tone (`á`) and falling
tone (`à`) are phonemic — they change meaning. The diacritics on
**Cagáàga** and **míà** aren't decoration; they're how the word means
what it means.

**Design implication:** if you ship Hidatsa in the app, ship the
diacritics. Don't normalize them away to ASCII for "cleaner" UI. The
diacritics are the language. (Inter and most modern UI fonts support
all the diacritics we need.)

### 4. Sentences end in the verb

Hidatsa is **Subject-Object-Verb**. The thing happening lands last.

> _"In the boat the buffalo travels"_ — not "The buffalo travels in
> the boat."

**Design implication:** if you ever write any Hidatsa-style English
voice copy, the action goes at the end. _"Today, the trail you walk."_
not _"You walk the trail today."_ It's a subtle thing but it shifts
the rhythm.

### 5. The Sacagawea connection

The famous interpreter on Lewis & Clark's expedition was Hidatsa-named.
**Cagáàgawia** = "Bird Woman." She was Shoshone by birth but captured
and raised among the Hidatsa, and her name in the historical record is
the Hidatsa one.

**Design implication:** this is publicly known history. Mentioning it
once — in the About screen, the App Store description, or a one-line
credit — gives the cultural layer instant legitimacy with anyone who's
read American history. It's not appropriation; it's a name that's
already in the canon.

### 6. The language is critically endangered

<65 fluent speakers as of 2019. The MHA Language Project (Fort
Berthold Community College, New Town, ND) is working to revitalize it.

**Design implication:** **how the app handles its Hidatsa layer is a
public-facing statement.** Done right (well-credited, accurate, sparse,
respectful), this app becomes a small artifact of revitalization.
Done sloppily (misspelled words, forced translations, decorative
sprinkling), it becomes the thing tribal language teachers cite as
"how not to do it."

That's not a reason not to ship — it's a reason to ship the words you
trust and label the rest as forthcoming.

---

## Where these words could live in the app

Concrete, minimal, respectful proposals:

- **Auth / sign-in screen footer**: _"Hiraaciréʼ · Numakiki · Sáhniš —
  built from the languages of the Three Affiliated Tribes."_ One line.
  Sets the tone immediately.
- **Water card in Today's Movement**: subtitle becomes _"mini"_ in
  italic, with English below. The one perfect word.
- **Profile screen footer**: _"Nuxbaaga"_ — Original People — appears
  below the Dings Fitness OS v2.1 line. Quiet, considered.
- **Wrapped "Standout days" section**: when there's a high-streak
  moment, the heading reads _"wáaši:"_ — holy story — once a year.
  Maybe at year-end Wrapped. Rare enough to feel earned.
- **Splash screen subtitle**: _"Cagáàga"_ — a feather + the word.
  Doesn't have to explain itself.
- **About / Credits screen** (build this): a real page that names the
  MHA Language Project, Fort Berthold Community College, and notes
  that the app's Hidatsa is preliminary and verified-by-elders work
  is in progress.

That's seven candidate placements. Pick the ones that feel right.
Skip the rest.

---

## What to do next

1. **Find the MHA Language Project's current contact.** Their websites
   are down, but Fort Berthold Community College is active. The language
   department there is the right channel.
2. **Get the Hidatsa Dictionary iOS app** if it's still on the App
   Store (publisher: MHA Language Project). 4,000+ entries with audio.
3. **Verify Mati-Watsā** specifically. The mockup wordmark you started
   with isn't in any public source I could reach. If it came from family
   knowledge, that's likely solid — but for App Store visibility, get
   a fluent speaker to confirm the spelling and diacritics first.
4. **Add a "verified by" credit** as soon as a real speaker reviews any
   word. Even one name lends massive credibility: _"Vocabulary verified
   by [Name], MHA Language Project."_
5. **Ship `mini` first.** Lowest risk, highest payoff. One real Hidatsa
   word in the app today is worth ten unverified ones next month.

---

## Sources used

- [Hidatsa Words — Native-Languages.org](http://www.native-languages.org/hidatsa_words.htm)
- [Mandan Words — Native-Languages.org](http://www.native-languages.org/mandan_words.htm)
- [Hidatsa Language — Wikipedia](https://en.wikipedia.org/wiki/Hidatsa_language)
- [Hidatsa — Omniglot](https://www.omniglot.com/writing/hidatsa.htm)
- [Hidatsa Dictionary iOS App](https://apps.apple.com/us/app/hidatsa-dictionary/id1254982767)
- [MHA Nation Official](https://www.mhanation.com/)
- Matthews, Washington (1877). _Ethnography and philology of the Hidatsa
  Indians._ Public domain on archive.org.

Anything not from these sources isn't in this document.
