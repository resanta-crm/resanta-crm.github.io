# Triovist Infographic Factory 5.0 — Master Creative Standard

## Mission

The system is not a poster generator. It is an autonomous senior marketplace design team producing publication-ready product stories for 21vek from exact-SKU facts, while using public 21vek/Wildberries/Ozon visual research only as abstract creative intelligence.

A batch may contain 300–500 SKUs. The director must not supervise each SKU, choose concepts, wait for intermediate AI roles or troubleshoot provider errors. The factory continues in the background and exposes only useful business states: queued, in work, auto-remaking, completed, attention.

## Non-negotiable quality rule

**Every slide is a hero slide.**

There are no secondary slides, filler slides or “one characteristic + product + empty background” slides.

If a product has enough truthful material for only 5 excellent screens, create 5. Do not create 8 weak screens to satisfy a quota. The allowed range is normally 5–9.

Every finished screen must contain:

- one clear buyer question or job;
- one strong visual story;
- the exact product as the unmistakable main subject;
- 2–4 verified exact-SKU facts when the slide contains technical claims;
- a deliberate visual hierarchy;
- multiple supporting visual layers, not decorative noise;
- a composition that is meaningfully different from the previous screen;
- a useful buyer conclusion, not generic advertising filler.

## Stage 1 — Category Creative Director / Visual DNA

Research the category once, then reuse the result for all SKUs in the group.

Inputs may contain visual examples from 21vek, Wildberries and Ozon. These examples are **design research only**.

Extract:

1. successful product scale and camera angles;
2. lighting language;
3. background depth and environmental context;
4. information density;
5. technical visualization patterns;
6. category-specific visual proof devices;
7. common slide archetypes;
8. weak/cheap patterns to avoid;
9. a premium quality bar.

Never copy:

- competitor wording;
- competitor logos;
- exact competitor composition;
- proprietary illustrations;
- trade dress;
- competitor specifications.

The output is **Visual DNA**, not a template.

## Stage 2 — SKU Storyboard Designer

Use the Visual DNA, the exact source photo, exact-SKU characteristics and 21vek competitor context.

Choose the correct number of slides between 5 and 9.

Build a product-specific story rather than forcing a universal sequence.

For each slide return:

- role;
- title;
- subtitle;
- buyer value;
- 2–4 exact fact IDs;
- layout key;
- detailed art brief.

### Story rules

The story should normally move from “why should I look at this product?” toward “what exactly am I buying?”, but category logic wins over a generic sequence.

Potential roles include hero, result, capability, construction, material, dimension, control, installation, use, choice, recap — only when supported.

Do not create a slide because a slot exists. Create it only if the SKU has a real buyer reason for it.

## Stage 3 — Senior Marketplace Designer

Each slide is generated as an independent premium key visual with the same creative priority as the cover.

### Exact product fidelity

The supplied source image is the exact SKU.

Preserve:

- silhouette;
- proportions;
- product color;
- visible controls;
- wheels, handles, vents and fasteners;
- existing brand markings;
- visible construction.

Never invent:

- handles;
- accessories;
- internal mechanisms;
- transparent cutaways;
- packaging;
- tools;
- certificates;
- extra batteries;
- hoses, nozzles or fittings;
- physical details not present in the exact product reference.

If the planned scene risks changing the product, fall back to a premium studio/environmental composition.

### Scene quality

The scene must feel like high-end commercial photography:

- purposeful physical light;
- material realism;
- depth;
- foreground/background layering;
- strong focal point;
- category-relevant environment where truthful;
- protected regions for later typography;
- no generated word art.

The image generator does **not** render marketing text. Correct Russian typography and factual cards are composited separately from verified data.

## Stage 4 — Independent Visual Quality Director

Compare the final slide with the exact source product.

The QA is adversarial. It should reject attractive work if it is wrong.

Score:

- product fidelity;
- factual accuracy;
- text legibility;
- visual hierarchy;
- commercial strength;
- visual richness;
- category consistency.

Default acceptance threshold: **90/100**.

Hard floors:

- product fidelity ≥ 95;
- factual accuracy ≥ 98;
- text legibility ≥ 90;
- commercial strength ≥ 90;
- visual richness ≥ 90.

Reject when:

- the product has changed;
- a physical detail was invented;
- text is cropped or hard to read;
- the slide looks like a cheap secondary poster;
- composition is sparse;
- the visual story does not support the buyer value;
- a claim is not backed by the linked exact-SKU facts;
- the slide is materially weaker than the strongest slide in the set.

A rejected slide is regenerated **individually** with the QA corrections. Other accepted slides are never regenerated.

## Fact policy

Competitor information may influence strategy only.

No competitor fact may become our product fact.

Every number or technical statement printed on a slide must be linked to exact-SKU evidence for that same slide.

Never infer:

- “per cycle” from a volume value;
- durability from material alone;
- higher productivity from higher power alone;
- suitability for an application that is not supported;
- warranty, certification or country of origin without evidence;
- superiority over competitors from missing competitor data.

## Background factory behavior

Temporary 429/5xx/network errors are operational events, not product failures.

The factory must:

- persist progress after every stage;
- use leases so two workers cannot pay for the same slide;
- retry temporary errors with backoff;
- continue other SKUs when one SKU needs attention;
- auto-remake only the rejected slide;
- allow the browser/computer to be closed;
- avoid all writes to sales, stock, price, plans, tasks and parser source tables.

## Director UX

The director sees:

- selected product groups;
- requested SKU count;
- marketplaces used for visual research;
- batch progress;
- completed;
- in work;
- auto-remaking;
- attention;
- download/preview.

Technical states such as provider names, fact IDs, worker names and rate-limit codes stay hidden.

For a previously unseen product group, the factory first produces one control SKU. Once the director approves that group style, future launches for that group can process hundreds of SKUs unattended.
