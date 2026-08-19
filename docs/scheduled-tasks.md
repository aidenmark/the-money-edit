# Scheduled task prompts

The two prompts that write The Money Edit. These are the upstream half of the
pipeline: they research and file entries into Notion, and this repository turns
whatever is in Notion into the site.

Paste each into its own recurring task in claude.ai. They replace the single
9:30am task.

| Task | Cron (UTC) | Eastern, summer | Eastern, winter | Writes |
|---|---|---|---|---|
| Opening Bell | `0 13 * * 1-5` | 9:00am | 8:00am | A short pre-market scan |
| Closing Bell | `15 22 * * 1-5` | 6:15pm | 5:15pm | The full recap of the session |

### Why those UTC times, and not the obvious ones

Task cron runs on fixed UTC and does not follow daylight saving, so every
schedule is two different Eastern times across the year. Both have to work, or
the brief quietly degrades for five months.

**Closing Bell must never fire before 5:00pm Eastern.** The journalism that
explains a session publishes between 4:15 and 5:30pm. `15 21` looks right in
summer, at 5:15pm, but becomes 4:15pm in winter, fifteen minutes after the
close and before the good sources exist. `15 22` is 6:15pm in summer and
5:15pm in winter, so it is always late enough. An hour of summer lateness for
an evening read costs nothing.

**Opening Bell is safe either way.** 8:00am in winter is still well inside
pre-market, which opens at 4:00am, and the site rebuilds before the 9:30 bell
in both seasons.

Do not solve this with a calendar reminder to shift the times in November. A
seasonal manual step is the failure mode this whole project is built to avoid.
Pick times that hold year round instead.

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

Cron `0 13 * * 1-5`. Before the opening bell in both seasons.

```
You write the Opening Bell edition of The Money Edit, a daily finance brief for
someone smart who does not work in finance and is building real fluency in money
and markets.

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
Send a push notification with the headline and this link on its own line:
https://aidenmark.github.io/the-money-edit/latest/
```

---

## Closing Bell

Cron `15 22 * * 1-5`. After the close and after the explainers publish, in
both seasons.

```
You write the Closing Bell edition of The Money Edit, a daily finance brief for
someone smart who does not work in finance and is building real fluency in money
and markets.

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
Send a push notification with the headline and this link on its own line:
https://aidenmark.github.io/the-money-edit/latest/
```

---

## Optional, once you want the card live within a minute

The site rebuilds on a cron shortly after each edition is written. GitHub does
not guarantee cron punctuality, so the card can lag the notification by ten
minutes or more under load.

To close that gap, add this to the end of both prompts. It needs a GitHub fine
grained personal access token with **Contents: write** on
`aidenmark/the-money-edit` and nothing else.

**Never paste this token into a chat.** It would sit in the transcript
permanently. Create it at github.com/settings/personal-access-tokens, set an
expiry, and paste it straight into the task prompt in claude.ai yourself.

Understand the tradeoff before doing this. The token lives in plaintext inside
a stored prompt. Scoped to one repository with Contents write and nothing else,
the worst case is someone committing to this repo, which is recoverable and not
catastrophic. It is a reasonable trade for an instant rebuild, but it is a real
one, and the cron path costs nothing and leaks nothing.

```
After filing the entry, trigger the site rebuild:

curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/aidenmark/the-money-edit/dispatches \
  -d '{"event_type":"entry-published"}'
```

Until this is added the cron covers it, just less promptly.

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
