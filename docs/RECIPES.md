# Recipe suggestions

`POST /api/recipes` (signed-in customers) with `{ "produceSlugs": ["tomato", "spinach"],
"language": "bn" }` returns up to three simple recipes for the produce in a basket.
`language` is `bn` (default) or `en`.

## Safe and cheap by design

- **No client text reaches the model.** The request holds 1 to 6 catalog produce codes
  and a language. Names in the prompt come from the catalog, so nothing can be injected.
  Unknown or inactive produce is refused.
- **Limited.** 20 requests per customer per hour, plus the daily model budget of the AI
  gateway (see AI.md).
- **Cached.** A real model answer is saved for 30 days under the basket and language (in any
  order), so repeats cost nothing. Answers from the built-in rules are never cached.
- **Model output is checked before use.** A recipe may only use produce from the basket,
  must have a sensible time and 2 to 8 steps, has its text cleaned and length-limited,
  and is dropped if it contains a link. If nothing usable remains, the rules answer.
- **Always works.** The built-in rules need no key or network, in English and Bangla.

## The response

`recipes` (title, `timeMinutes`, `uses`, `extras`, `steps`), `produce` (names), `language`,
`source` (`model` or `rules`), `cached`, and `fallbackReason` when the rules answered
instead of the model (see AI.md).
