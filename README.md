# smirnov

Dependency-free inverse transform sampling utilities.

## Install

```sh
npm install smirnov
```

## Continuous distributions

Use `createInverseTransformSampler` when you have a cumulative distribution
function. The sampler numerically inverts the CDF with binary search. Provide
`min` and `max` when you know finite bounds. When either bound is omitted, the
sampler expands a compact domain that covers approximately
`[tolerance, 1 - tolerance]` in CDF space, then samples within that domain.

```js
import { createInverseTransformSampler } from "smirnov";

const exponential = createInverseTransformSampler({
  cdf: (x) => 1 - Math.exp(-x),
  min: 0,
  max: 20
});

const value = exponential.sample();
```

Bounds are optional:

```js
const logistic = createInverseTransformSampler({
  cdf: (x) => 1 / (1 + Math.exp(-x))
});

const median = logistic.quantile(0.5);
```

For unbounded distributions, `quantile(0)` and `quantile(1)` return the finite
automatic tail bounds. Provide explicit `min` or `max` when endpoint behavior
matters.

## PDF-based continuous distributions

Use `createPdfSampler` when you have a probability density function. The sampler
numerically integrates the PDF over the effective domain, normalizes the mass,
then inverts that numerical CDF.

```js
import { createPdfSampler } from "smirnov";

const triangular = createPdfSampler({
  pdf: (x) => 2 * x,
  min: 0,
  max: 1
});

const value = triangular.sample();
```

If either bound is omitted, the sampler expands from `searchStart` until the
integrated mass over the compact domain is at least `1 - tolerance`, then
refines that domain. Explicit `min` and `max` intentionally truncate and
renormalize the PDF over that interval.

PDF integration uses adaptive Simpson quadrature. Increase
`integrationSubdivisions` when a bounded-domain density has narrow features.
For Riemann-integrable PDFs on explicit finite bounds, refining the partition is
the relevant convergence control.

For omitted bounds, pass `pdfLipschitz` when you know a global Lipschitz bound.
The automatic domain search then accepts an interval only after a certified
lower bound on captured mass reaches `1 - tolerance`. Without finite bounds or
`pdfLipschitz`, omitted-bound search is heuristic; a black-box PDF can hide mass
in arbitrarily narrow or far-away regions.

## Discrete weighted distributions

Use `createWeightedSampler` for finite weighted choices.

```js
import { createWeightedSampler } from "smirnov";

const sampler = createWeightedSampler([
  ["small", 0.6],
  ["medium", 0.3],
  ["large", 0.1]
]);

const choice = sampler.sample();
```

All samplers accept an `rng` option for deterministic tests or seeded random
number generators.
