# Demand forecast

`GET /api/forecast?city=dhaka&days=7` (approved farmers and admins) says how many kilos of
each produce customers are expected to order over the next `days` days (1 to 14), so
farmers know what is worth listing. Busiest produce comes first. Results are city totals
with no customer details, and are cached for 10 minutes.

## Where the numbers come from

Demand is read straight from orders: kilos ordered per produce per day (Bangladesh time),
over the last 56 complete days. Cancelled orders and today (not over yet) are excluded.

## How it is worked out

1. **Every day counts.** Days with no orders are zeros, not skipped. The engine refuses a
   history that has gaps.
2. **Level:** an exponential average of recent days (weekday effect removed). With fewer than
   10 selling days it uses a plain average instead, because a trend needs data.
3. **Weekday pattern:** only used with at least 3 weeks of history and 10 selling days. It is
   pulled towards "no pattern" so a few odd days cannot create extreme factors.
4. **Season:** in a peak month demand is 15 percent higher. It is applied as a ratio
   between the forecast day's month and the month the history ended in, so a season already
   visible in recent sales is not counted twice.

Each produce carries a `confidence`: `low` (under 14 days, or fewer than 10 selling days),
`medium`, or `high` (at least 56 days and 30 selling days). A new marketplace will show
mostly `low`, which is the honest answer. Produce nobody has ordered forecasts zero.

All constants are at the top of `server/src/services/forecast/forecast.js`.
