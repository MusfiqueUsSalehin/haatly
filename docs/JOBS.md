# Scheduled jobs

The API server runs its own timetable of background jobs. There is no cron library: a
simple timer checks every 15 seconds which jobs are due.

## The jobs

| Job                 | When                            | What it does                                                |
| ------------------- | ------------------------------- | ----------------------------------------------------------- |
| `shelf-morning`     | every day at 05:30 (Bangladesh) | builds the day's shelf                                      |
| `shelf-refresh`     | every 15 minutes                | rebuilds the shelf so new lots appear, sold-out boxes close |
| `lot-upkeep`        | every hour                      | expires finished lots, marks prices down                    |
| `payment-upkeep`    | every 5 minutes                 | releases unpaid wallet orders, retries failed refunds       |
| `earnings-backfill` | every day at 02:00 (Bangladesh) | records earnings a delivery missed                          |

Each job only calls a function that is already safe to repeat, so a late, doubled or
half-finished run can never do harm. Definitions: `server/src/jobs/definitions.js`.

## How runs are scheduled

A schedule is a series of **slots**: every N minutes on the clock, or once a day at a
Bangladesh time. A job runs at most once per slot. After downtime it runs **once** to catch
up, not once per missed slot.

## Several servers

You can run more than one copy of the API. Each run is claimed with one atomic database
update, so a job runs on exactly one of them, and a claim expires by itself if a server dies
mid-job. A run that overruns its claim cannot overwrite a newer one. Set
`ENABLE_SCHEDULER=false` on servers that should not run jobs (the default is on).

## Safety

- A failing job, a timeout or a database hiccup is logged and the next job still runs. The
  scheduler never throws.
- Every job has a timeout (and gets an abort signal), so a stuck job cannot block the rest.
- On shutdown the server stops starting jobs and lets a running one finish.

## Looking at it

- `GET /api/admin/jobs` (admins): each job's timetable, next run, and how it last went.
- `GET /api/admin/jobs/runs?name=&status=&limit=`: run history (kept for 30 days).
- `npm run jobs:run`: runs every job that is due, once, and exits. Use it from an external
  timer (a system cron, a hosting scheduler), or to try the jobs by hand.

## Not covered

The impact figure and forecast are cached in memory, not scheduled. Jobs run inside the web
process; at much larger scale you would move them to a separate worker.
