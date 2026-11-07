# API reference

Base path `/api`. Authenticated calls send `Authorization: Bearer <token>`.
Errors: `{ "error": { "code", "message", "details" } }`. Lists take `?page&limit` and return `{ <items>, page, limit, total }`. Money is BDT.

| Area         | Endpoints                                                                                                                                                      | Access                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Auth         | POST /auth/register, POST /auth/login, GET /auth/me                                                                                                            | public / signed in         |
| Catalog      | GET /catalog/cities, /catalog/produce, /catalog/produce/:slug, /catalog/hubs                                                                                   | public                     |
| Shelf        | GET /boxes?city=, /boxes/:code                                                                                                                                 | public                     |
| Impact       | GET /impact                                                                                                                                                    | public                     |
| Impact (own) | GET /impact/me, GET /impact/me/summary                                                                                                                         | customer                   |
| Orders       | POST /orders, GET /orders, GET /orders/:code, POST /orders/:code/cancel                                                                                        | customer                   |
| Payments     | POST /payments/sandbox/complete                                                                                                                                | development only           |
| Lots         | POST /lots, GET /lots, GET /lots/:code, POST /lots/:code/withdraw                                                                                              | farmer                     |
| Earnings     | GET /earnings, GET /earnings/entries                                                                                                                           | farmer                     |
| AI           | POST /ai/triage                                                                                                                                                | farmer                     |
| Recipes      | POST /recipes                                                                                                                                                  | customer                   |
| Forecast     | GET /forecast?city=&days=                                                                                                                                      | farmer, admin              |
| Pricing      | GET /pricing/policy, POST /pricing/quote                                                                                                                       | signed in                  |
| Rider        | GET /rider/me, POST /rider/duty, GET /rider/runs, GET /rider/runs/:code, POST /rider/runs/:code/start, POST /rider/runs/:code/stops/:orderCode/deliver, …/fail | rider                      |
| Hub          | GET /hub/me, /hub/lots, /hub/runs                                                                                                                              | hub manager (own hub only) |
| Admin users  | GET/POST /admin/users, PATCH /admin/users/:id/status                                                                                                           | admin                      |
| Admin riders | GET /admin/riders, PUT /admin/riders/:id                                                                                                                       | admin                      |
| Admin ops    | POST /admin/dispatch, GET /admin/runs, POST /admin/shelf/rebuild, GET /admin/overview                                                                          | admin                      |
| Admin money  | GET /admin/earnings, POST /admin/earnings/:id/payout                                                                                                           | admin                      |
| Admin system | GET /admin/jobs, GET /admin/jobs/runs, GET /admin/ai/health, GET/PATCH /admin/produce                                                                          | admin                      |

## Realtime (Socket.IO)

Connect with `auth: { token }`. Client sends `order:subscribe { orderCode }` and `rider:location { lat, lng, accuracyM }`. Server sends `order:update`, `run:assigned`, `run:update`.
