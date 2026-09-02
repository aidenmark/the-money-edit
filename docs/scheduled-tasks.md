# Scheduled task prompts

The two prompts that write The Money Edit. These are the upstream half of the
pipeline: they research and file entries into Notion, and this repository turns
whatever is in Notion into the site.

Paste each into its own recurring task in claude.ai.

| Edition | Scheduled at | Guard |
|---|---|---|
| Opening Bell | 9:00am Eastern, weekdays | duplicate check |
| Closing Bell | 5:15pm Eastern, weekdays | duplicate check |

**Two tasks, not four.** claude.ai schedules in local time and follows daylight
saving on its own, so one task per edition holds the same Eastern time all year.
A task set up as the 13:00 UTC firing displays as `Repeats: Weekdays at 9:00 AM`
and stays there across the boundary.

### The one guard

Each prompt opens with a duplicate check: stop if an entry already exists for
today's date with this edition. It is not there for daylight saving. It is there
because a manual run, a retry, or a task that fires twice would otherwise file a
second entry for a slot that already has one.

It is a soft guard and it is known to fail. Across two weeks it stopped a
redundant firing most of the time and let one through on six occasions. That is
expected from a check a model re-derives each run, and it is why the build
enforces one entry per slot in code, with tests. The prompt check saves a wasted
research run. The build is what keeps the site correct.

### Why there used to be four tasks, and why there are not now

The original design ran each edition on two UTC crons with a time gate in front
of the duplicate check, so that exactly one firing per day would write:

| Edition | Cron (UTC) | Summer | Winter | Wrote in |
|---|---|---|---|---|
| Opening Bell | `0 13 * * 1-5` | 9:00am ET | 8:00am ET | summer |
| Opening Bell | `0 14 * * 1-5` | 10:00am ET | 9:00am ET | winter |
| Closing Bell | `15 21 * * 1-5` | 5:15pm ET | 4:15pm ET | summer |
| Closing Bell | `15 22 * * 1-5` | 6:15pm ET | 5:15pm ET | winter |

That reasoning is correct for a scheduler genuinely fixed to UTC, which is what
GitHub Actions cron is. It is wrong for this one, and it cost something real.
The time gate made the task look up the current time over the network on every
single run, which raised an approval prompt each time, and the redundant firings
were the source of every duplicate entry the database accumulated.

So the gate is gone and the extra tasks are deleted. The GitHub Actions crons in
the workflow are a separate matter and genuinely are UTC, so the two season
handling there stays.

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

One task, scheduled at 9:00am Eastern. The scheduler holds that time across daylight saving.

```
You write the Opening Bell edition of The Money Edit, a daily finance brief for
someone smart who does not work in finance and is building real fluency in money
and markets.

BEFORE DOING ANYTHING ELSE, RUN THIS CHECK

DUPLICATE CHECK
Query the Notion database for an entry whose Date is today in America/New_York
and whose Edition is Opening Bell.
If one already exists, stop now. File nothing and send nothing. Today's edition
has already been written, either by an earlier firing or by a manual run.

Do not look up the current time over the network, and do not check the clock to
decide whether to run. This task is scheduled at 9:00am Eastern and the
scheduler follows daylight saving on its own, so every firing is a real one.
There is no wrong season firing to detect. If you need today's date, use the
date already available to you.

Only if the check passes, continue.

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

One task, scheduled at 5:15pm Eastern. The scheduler holds that time across daylight saving.

```
You write the Closing Bell edition of The Money Edit, a daily finance brief for
someone smart who does not work in finance and is building real fluency in money
and markets.

BEFORE DOING ANYTHING ELSE, RUN THIS CHECK

DUPLICATE CHECK
Query the Notion database for an entry whose Date is today in America/New_York
and whose Edition is Closing Bell.
If one already exists, stop now. File nothing and send nothing. Today's edition
has already been written, either by an earlier firing or by a manual run.

Do not look up the current time over the network, and do not check the clock to
decide whether to run. This task is scheduled at 5:15pm Eastern and the
scheduler follows daylight saving on its own, so every firing is a real one.
The 5:15pm slot is deliberate: the journalism that explains a session publishes
between 4:15 and 5:30pm, so an earlier entry would lack the sources that make it
worth reading. If you need today's date, use the date already available to you.

Only if the check passes, continue.

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

### What does work, within a limit found the hard way

A uniform delay destroys timing but preserves **spacing**. Runs scheduled N
minutes apart execute N minutes apart, wherever the queue puts them.

That reasoning is right, and acting on it alone still broke the site. The
workflow briefly used `*/10` across both windows, asking for 48 builds a
weekday. GitHub throttles high frequency schedules, and delivery collapsed:

```
10 crons requested  ->  10 to 13 runs a day
48 crons requested  ->  1 to 3 runs a day, delays up to four hours
```

Runs per day went 13, 13, 5, 2, 2, 1, 2, 3, 1. Some fired at 02:03 and 04:05
UTC, hours outside either window. On 2026-09-02 the site was a full day stale,
serving September 1 while September 2 sat published in Notion. Nothing failed
loudly: the workflow stayed active, both crons parsed, and every test passed.

So spacing has to be bought inside a cron budget rather than on top of one. The
deployed schedule is fourteen crons, thirty five minutes apart, placed early
enough that the queue delay lands them inside the window rather than after it:

```
15,50 12 * 1-5   25 13   0,35 14   10,45 15     morning
30 20   5,40 21   15,50 22   25,55 23           evening
```

Both seasons fall inside one span per edition, so nothing changes twice a year.

The honest guarantee is a build within about thirty five minutes of an entry.
That is worse than the ten minutes the `*/10` version promised, and much better
than the one to three builds a day it delivered.

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
