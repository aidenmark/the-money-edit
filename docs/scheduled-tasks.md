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

## Rebuild trigger, and why it lives on Cloudflare

The task that writes an entry cannot trigger the site build. Scheduled cloud
sessions on claude.ai are blocked from reaching the GitHub API by a proxy in
their run environment:

```
403  repository_dispatch is not permitted for this session type
```

This is a platform restriction, not a scope problem. A correctly scoped fine
grained token fails identically, so adding one only puts a live credential in a
stored prompt. That was tried on 2026-08-19 and both firings hit the 403.

### GitHub's own scheduler could not cover the gap either

The fallback was GitHub Actions cron. It degraded badly:

| Date | Median delay | Worst |
|---|---|---|
| Aug 19 to 21 | 29 to 44 min | 44 min |
| Sep 3 | 78 min | 187 min |
| Sep 7 | 152 min | 218 min |
| Sep 8 | 79 min | 193 min |
| Sep 9 | no morning run at all | |

On 2026-09-09 the entry published at 13:20 UTC and not one of the five morning
crons had fired by 14:45. The site sat a day stale until it was rebuilt by hand.

Three cron configurations were measured before giving up on this path:

```
10 crons requested  ->  10 to 13 runs a day, 29 to 44 min late
48 crons requested  ->  1 to 3 runs a day, throttled
14 crons requested  ->  14 runs a day, 1 to 3.5 hours late
```

More gets throttled, fewer covers less, and neither changes how long GitHub
sits on the event. The delay is on their side and has no setting.

### What is broken is only the `schedule` event

Every other GitHub trigger is immediate. A `repository_dispatch` sent at
14:45:56 created its run at 14:45:56, the same second. GitHub is not the
problem; its alarm clock is.

### So the alarm clock moved, and nothing else did

`worker/` holds a Cloudflare Worker on a Cron Trigger. Cloudflare fires on time.
The Worker asks the published site whether today's edition is there yet, and
sends a `repository_dispatch` only when it is missing.

The repository, the build, and the site all remain on GitHub. This replaces one
thing: what decides when to knock.

Two design choices worth keeping:

**It checks the site rather than Notion.** "Is the site current" is the question
that actually matters, and answering it from the published page keeps the Notion
token out of a second platform. The Worker holds one secret, a GitHub token with
Contents write on this repository and nothing else.

**It only fires when something is missing.** Knocking on all 36 ticks a weekday
would mean 36 deploys a day, which is wasteful and near the rate GitHub Pages
will accept. In the normal case it sends one or two dispatches per edition and
then goes quiet.

The Actions crons are kept as a fallback for a Worker that is broken or
undeployed. They cost nothing when the site is already current.

### Deploying it

From `worker/`:

```
npx wrangler login
npx wrangler deploy
npx wrangler secret put GITHUB_TOKEN
```

The token is a GitHub fine grained personal access token with **Contents: write**
on `aidenmark/the-money-edit` and nothing else, with an expiry set. Cloudflare
stores it encrypted. Never paste it into a chat or a file.

The Worker also serves a read only status endpoint at its own URL, reporting
which edition it thinks is due and whether it would fire. It never dispatches
from that path, so the public URL cannot be used to force builds.

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
