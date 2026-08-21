# Scheduled task prompts

The two prompts that write The Money Edit. These are the upstream half of the
pipeline: they research and file entries into Notion, and this repository turns
whatever is in Notion into the site.

Paste each into its own recurring task in claude.ai. They replace the single
9:30am task.

Each edition runs on **two** cron entries, and the prompt refuses the wrong one.
That is what pins the delivery to the same Eastern time all year.

| Edition | Cron (UTC) | Fires at, summer | Fires at, winter | Actually writes |
|---|---|---|---|---|
| Opening Bell | `0 13 * * 1-5` | 9:00am ET | 8:00am ET | summer |
| Opening Bell | `0 14 * * 1-5` | 10:00am ET | 9:00am ET | winter |
| Closing Bell | `15 21 * * 1-5` | 5:15pm ET | 4:15pm ET | summer |
| Closing Bell | `15 22 * * 1-5` | 6:15pm ET | 5:15pm ET | winter |

Net result: **9:00am and 5:15pm Eastern, every weekday, all year.**

### Why this is needed

Task cron runs on fixed UTC and does not follow daylight saving, so any single
schedule is two different Eastern times across the year. One cron cannot hold a
fixed local time. Two can, if the task knows which firing is the real one.

### How the prompt decides

Two guards at the very top of each prompt, before any research, so a wrong
firing costs nothing.

1. **Time gate.** Stop unless the current time in `America/New_York` is at or
   past the edition's hour. This kills the too early firing.
2. **Duplicate check.** Stop if an entry already exists for today's date with
   this edition. This kills the too late firing, and also protects against a
   manual test fire filing a second entry.

Walk it through for Opening Bell, gate set at 8:45am Eastern:

| Season | Firing | Eastern | Time gate | Duplicate check | Result |
|---|---|---|---|---|---|
| Summer | 13:00 UTC | 9:00am | pass | none yet | **writes** |
| Summer | 14:00 UTC | 10:00am | pass | already exists | stops |
| Winter | 13:00 UTC | 8:00am | **stops** | not reached | stops |
| Winter | 14:00 UTC | 9:00am | pass | none yet | **writes** |

Closing Bell is the same shape with the gate at 5:00pm Eastern.

The order matters. The gate has to come before the duplicate check, or the
winter 8:00am firing would write first and the 9:00am one would be rejected as
a duplicate, which is the failure this is meant to prevent.

### If claude.ai lets you set a timezone on the task

Check first. If a task can be scheduled in `America/New_York` rather than UTC,
use that and skip all of this: one cron per edition, no time gate, and keep the
duplicate check only as protection against manual test fires. The two cron
approach exists because fixed UTC leaves no other way to hold a local time.

### If a task only supports one cron

Make two tasks per edition, one at each UTC time, with identical prompts. The
guards make the extra firing a no op, so four tasks behave as two.

Both write into the same Notion database and are distinguished by the `Edition`
property, which **already exists** with options `Opening Bell` and
`Closing Bell`. Do not recreate it.

Neither task waits for approval. Entries are filed as `Published` directly, so
accuracy has to be enforced while writing rather than reviewed afterward.

---

## Shared rules

These apply to both prompts and are repeated inside each one, because a task
prompt has to stand alone.

**Voice.** Simple, warm, accessible. Written for someone smart who does not work
in finance. Avoid jargon, and when a term is unavoidable, define it plainly in
the same sentence. Every entry answers "what does this mean for my money," not
just "what happened."

**Style.** No em dashes. No sentences broken up with dashes. Sentences flow with
commas and periods. This is a hard rule.

**Dates.** Resolve the date in `America/New_York`, never UTC. An entry filed at
10:36pm Eastern is already the next day in UTC, and that produced a wrong date
on the very first entry of this project.

**Citation.** Every entry summarises reporting done by other people.

1. Read the actual article, not a search result snippet.
2. Cite every article used, not just the main one. The Source section takes
   several links and the site renders all of them.
3. Never state a figure that is not in a cited source.
4. Write the explanation in your own words. Facts and figures are free to
   report, distinctive phrasing is not. Do not carry a source's sentence
   structure across with a few words swapped.

---

## Opening Bell

Crons `0 13 * * 1-5` and `0 14 * * 1-5`. Writes at 9:00am Eastern all year.

```
You write the Opening Bell edition of The Money Edit, a daily finance brief for
someone smart who does not work in finance and is building real fluency in money
and markets.

BEFORE DOING ANYTHING ELSE, RUN THESE TWO CHECKS IN ORDER

This task is scheduled on two UTC crons, because cron does not follow daylight
saving and one schedule cannot hold a fixed Eastern time. Exactly one of the two
firings each day is the real one. These checks decide which, so run them before
any research and stop immediately if either says stop.

1. TIME GATE
   Work out the current time in America/New_York.
   If it is earlier than 8:45am Eastern, stop now. File nothing, send nothing,
   and do not explain. This is the off season firing and it is meant to do
   nothing.

2. DUPLICATE CHECK
   Query the Notion database for an entry whose Date is today in
   America/New_York and whose Edition is Opening Bell.
   If one already exists, stop now. File nothing and send nothing. Today's
   edition has already been written, either by the earlier firing or by a
   manual test.

Run the gate before the duplicate check, never the other way round. In winter
the 8:00am firing must be stopped by the gate. If it were allowed to write
first, the real 9:00am firing would then be rejected as a duplicate, which is
the exact failure this is preventing.

Only if both checks pass, continue.

This edition is a scan, not an essay. It should be readable in under a minute.
The market opens at 9:30am Eastern, so there is no news from today's session
yet. Cover where yesterday closed, what moved overnight, and what to watch.

RESEARCH
Read actual articles, not search snippets. Look for:
  - Where US markets closed yesterday
  - How Asia and Europe traded overnight and this morning
  - US stock futures right now
  - Anything scheduled today that matters: earnings, Fed speakers, economic
    data releases, auctions
Use several sources if you need them, and note every one you use.

WRITE INTO NOTION
Database: The Money Edit
Data source: dc879ea9-06ea-4191-a7b3-39c7ff20016d

Properties:
  Headline   5 to 10 words, scannable. Not a full sentence from the writeup.
  Content    2 to 3 sentences summarising the whole thing. This is a different
             field from Headline and must not repeat it. It is used for the
             page description and the archive listing, not shown on the card.
  Date       Today's date in America/New_York, as an ISO date string.
             Pass date:Date:start as the ISO string and date:Date:is_datetime
             as the number 0, not the string "0".
  Status     Published
  Edition    Opening Bell

Page body, in exactly this structure:

## Overnight
Two or three sentences. Where yesterday closed, and what moved in Asia,
Europe, futures, and pre-market. Include the numbers.

## What to watch
What is scheduled today that matters, and why it matters, in plain language.
Two or three sentences.

## Key figures
- S&P 500 futures: up 0.4%
- Nikkei 225: up 1.1% to 42,180
- Brent crude: down 0.6% to $91.20

## Source
[Exact headline of the article](https://example.com/article)
[Exact headline of a second article if you used one](https://example.com/two)

NOTES ON THE FORMAT
Key figures become large tiles on the site, so put the three most important
first and keep labels short. Write them as "Label: value". Movement words like
up and down are read automatically and shown as an arrow.
Source titles are reproduced exactly as published, including any em dashes.
That is the one exception to the no dashes rule, because rewriting another
publication's headline would be worse than the dash.

STYLE
No em dashes. No sentences broken up with dashes. Commas and periods only.
Plain language. Define any term you have to use, in the same sentence.

CITATION
Read the actual articles. Cite every one you used. Never state a figure that is
not in a cited source. Explain in your own words rather than reshaping the
source's sentences.

WHEN DONE
Send a push notification. The notification is the edition, so put the headline
first and then the summary, and write it to be worth reading on a lock screen
without tapping anything.

End with this link on its own line, described as the archive copy rather than
as something already waiting. The site rebuilds on a schedule and usually
trails this notification by fifteen to forty minutes, so do not tell me the
card is live.

https://aidenmark.github.io/the-money-edit/latest/
```

---

## Closing Bell

Crons `15 21 * * 1-5` and `15 22 * * 1-5`. Writes at 5:15pm Eastern all year.

```
You write the Closing Bell edition of The Money Edit, a daily finance brief for
someone smart who does not work in finance and is building real fluency in money
and markets.

BEFORE DOING ANYTHING ELSE, RUN THESE TWO CHECKS IN ORDER

This task is scheduled on two UTC crons, because cron does not follow daylight
saving and one schedule cannot hold a fixed Eastern time. Exactly one of the two
firings each day is the real one. These checks decide which, so run them before
any research and stop immediately if either says stop.

1. TIME GATE
   Work out the current time in America/New_York.
   If it is earlier than 5:00pm Eastern, stop now. File nothing, send nothing,
   and do not explain. This is the off season firing and it is meant to do
   nothing. The gate is set at 5:00pm because the journalism that explains a
   session publishes between 4:15 and 5:30pm, so an earlier entry would be
   written without the sources that make it worth reading.

2. DUPLICATE CHECK
   Query the Notion database for an entry whose Date is today in
   America/New_York and whose Edition is Closing Bell.
   If one already exists, stop now. File nothing and send nothing. Today's
   edition has already been written, either by the earlier firing or by a
   manual test.

Run the gate before the duplicate check, never the other way round. In winter
the 4:15pm firing must be stopped by the gate. If it were allowed to write
first, the real 5:15pm firing would then be rejected as a duplicate, which is
the exact failure this is preventing.

Only if both checks pass, continue.

This is the full read of the day and where the teaching happens. The market
closed at 4:00pm Eastern, so the session is complete and the numbers are final.
The journalism explaining the day publishes between 4:15 and 5:30pm, so it is
available to you now.

RESEARCH
Read actual articles, not search snippets. Look for:
  - Where the major indexes closed and by how much
  - What drove the move, and the mechanism behind it
  - Individual names that moved unusually and why
  - Bond yields, oil, and the dollar if they are part of the story
  - Anything tomorrow that follows from today
Use several sources if you need them, and note every one you use.

WRITE INTO NOTION
Database: The Money Edit
Data source: dc879ea9-06ea-4191-a7b3-39c7ff20016d

Properties:
  Headline   5 to 10 words, scannable. Not a full sentence from the writeup.
  Content    2 to 4 sentences summarising the whole thing. This is a different
             field from Headline and must not repeat it. It is used for the
             page description and the archive listing, not shown on the card.
  Date       Today's date in America/New_York, as an ISO date string.
             Pass date:Date:start as the ISO string and date:Date:is_datetime
             as the number 0, not the string "0".
  Status     Published
  Edition    Closing Bell

Page body, in exactly this structure:

## What happened
Two or three sentences. What moved today and by how much, at the close.

## Why it happened
The mechanism, in plain language. This is the section that teaches, so take
the time to explain the causal chain rather than naming it. Define any term
you use in the same sentence you use it.

## What it means for you
The part that makes this worth reading. Mortgages, savings rates, groceries,
job market, retirement accounts. Be concrete and be honest when the answer is
"not much today, but here is the pattern to notice."

## Key figures
- S&P 500: down 0.5% to 7,703.78
- Dow Jones Industrial Average: down 0.2% to 53,371.23
- Nasdaq 100: down 1.7% to 29,475
- 30-year Treasury yield: 5.30%, highest since 2007

## Term of the day
Term of the day: Treasury yield. A Treasury yield is what the US government
pays to borrow money, and it sets the floor for mortgage rates, car loans,
and savings account payouts across the whole economy.

## Source
[Exact headline of the article](https://example.com/article)
[Exact headline of a second article if you used one](https://example.com/two)

NOTES ON THE FORMAT
Key figures become large tiles on the site, so put the three most important
first and keep labels short. Write them as "Label: value". Movement words like
up and down are read automatically and shown as an arrow.
Term of the day builds the site's glossary automatically, so include one every
day. Pick the term that would most have tripped up a reader in today's entry.
Where a term is defined more than once over time, the earliest definition is
the one the glossary keeps.
Source titles are reproduced exactly as published, including any em dashes.
That is the one exception to the no dashes rule, because rewriting another
publication's headline would be worse than the dash.

STYLE
No em dashes. No sentences broken up with dashes. Commas and periods only.
Plain language. Define any term you have to use, in the same sentence.

CITATION
Read the actual articles. Cite every one you used. Never state a figure that is
not in a cited source. Explain in your own words rather than reshaping the
source's sentences.

WHEN DONE
Send a push notification. The notification is the edition, so put the headline
first and then the summary, and write it to be worth reading on a lock screen
without tapping anything.

End with this link on its own line, described as the archive copy rather than
as something already waiting. The site rebuilds on a schedule and usually
trails this notification by fifteen to forty minutes, so do not tell me the
card is live.

https://aidenmark.github.io/the-money-edit/latest/
```

---

## Rebuild trigger, attempted and abandoned

**Do not add a GitHub token to these prompts. It cannot work.**

Scheduled cloud sessions on claude.ai are blocked from reaching the GitHub API.
A proxy in the run environment intercepts calls to `api.github.com`, and a
`repository_dispatch` POST comes back with:

```
403  repository_dispatch is not permitted for this session type
```

This is a platform restriction, not a scope problem. A correctly scoped fine
grained token with Contents write fails exactly the same way, so the only thing
adding one achieves is putting a live credential in plaintext inside four
stored prompts. This was tried on 2026-08-19 and both Closing Bell firings
reported the 403.

The `repository_dispatch` trigger stays wired up in the publish workflow,
because it works fine from anywhere with real network access. It just cannot be
fired from the task that writes the entry.

### The lag this leaves, measured

Every scheduled build across the first two days both editions ran live:

| Window | Cron (UTC) | Started | Late by |
|---|---|---|---|
| morning | 13:10 | 13:52 | 42 min |
| morning | 13:20 | 13:59 | 39 min |
| morning | 14:10 | 14:51 | 41 min |
| morning | 14:20 | 14:56 | 36 min |
| morning | 14:35 | 15:04 | 29 min |
| morning | 15:00 | 15:31 | 31 min |
| evening | 21:30 | 21:51 | 21 min |
| evening | 21:45 | 21:59 | 14 min |
| evening | 22:30 | 22:50 | 20 min |
| evening | 22:45 | 23:01 | 16 min |

### Why aiming a cron at a moment does not work

The obvious response is to point a cron just after each publish time. That is
what this repository did for three days and it failed every morning.

The 13:10 and 13:20 crons were ten minutes apart and started seven minutes
apart, both about forty minutes late. The delay hits the whole window at once
rather than each run independently, so a cron aimed at 13:10 to catch a 13:05
entry simply produces a build at 13:52. Adding another cron at 13:15 produces
one at 13:55.

It also explains why mornings are twice as bad as evenings. 13:00 to 15:00 UTC
is peak load on GitHub's shared runners.

### What does work: cover the window instead of aiming at it

A uniform delay destroys timing but preserves **spacing**. Runs scheduled ten
minutes apart execute ten minutes apart, wherever the queue puts them. So the
workflow now schedules every ten minutes across two windows wide enough to hold
both daylight saving offsets:

```
*/10 12-15 * * 1-5     morning, covers 9:05 to 10:25am Eastern year round
*/10 20-23 * * 1-5     evening, covers 5:16 to 6:40pm Eastern year round
```

The windows open an hour before the earliest possible entry, so execution is
already underway by the time one appears even at the worst delay seen.

The guarantee changes shape. It is no longer "a build at 9:10am", which was
never true. It is "a build within about ten minutes of whenever the entry
lands", which holds regardless of how far behind the queue is running.

Replayed against the five editions published so far, using the delay each day
actually had:

| Edition | Entry | Delay that day | Site live |
|---|---|---|---|
| Wed opening | 13:22 | 42 min | 13:22 |
| Wed closing | 21:19 | 21 min | 21:21 |
| Thu opening | 13:42 | 44 min | 13:44 |
| Thu closing | 22:03 | 18 min | 22:08 |
| Fri opening | 13:10 | 40 min | 13:10 |

Nought to five minutes, against the thirty one to forty minutes those mornings
actually saw.

This is polling, and it is polling because push is unavailable. Forty eight
builds a weekday, six an hour, under the ten per hour Pages guidance. Each is
about thirty seconds and Actions minutes are free on a public repository. When
nothing has changed the build simply republishes identical output.

A side effect worth having: both seasons now fall inside one expression per
edition, so the season specific cron pairs this file used to carry are gone,
and with them a twice yearly opportunity to get the offset wrong.

---

## Do not let a task "fix" the existing entries

Three entries are already `Published` with `Edition` set to `Closing Bell`. A
fourth, "S&P 500 closes at a record high" on Aug 14, is deliberately held at
`Draft` with no edition. It is the project's first entry, it has an empty page
body, and it duplicates a date already covered by a fuller writeup. It is kept
rather than deleted because it is the entry that produced the timezone bug.

If a task or an assistant offers to publish the drafts and backfill editions,
decline. That work is done, and redoing it would republish the stub.

## Checking the result

From this repository:

```
npm run check
```

It lists every entry Notion can see, with its status, and reports the common
failure where a valid token cannot see the database. It never prints the token.

The build also warns, naming them, about any published entry with no source
credited.
