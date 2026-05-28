import assert from "node:assert/strict";
import test from "node:test";

import {
  createInverseTransformSampler,
  createPdfSampler,
  createWeightedSampler,
  samplePdf,
  sampleInverseTransform
} from "../src/index.js";

test("inverts a uniform distribution over finite bounds", () => {
  const sampler = createInverseTransformSampler({
    cdf: (x) => x / 10,
    min: 0,
    max: 10
  });

  assert.equal(sampler.quantile(0), 0);
  assert.ok(Math.abs(sampler.quantile(0.25) - 2.5) < 1e-9);
  assert.ok(Math.abs(sampler.quantile(0.75) - 7.5) < 1e-9);
  assert.equal(sampler.quantile(1), 10);
});

test("uses injected random source for continuous samples", () => {
  const value = sampleInverseTransform({
    cdf: (x) => x,
    min: 0,
    max: 1,
    rng: () => 0.42
  });

  assert.ok(Math.abs(value - 0.42) < 1e-9);
});

test("auto-brackets continuous quantiles when bounds are omitted", () => {
  const cdf = (x) => 1 / (1 + Math.exp(-x));
  const sampler = createInverseTransformSampler({
    cdf
  });

  assert.ok(Number.isFinite(sampler.quantile(0)));
  assert.ok(Math.abs(cdf(sampler.quantile(0)) - 1e-12) < 1e-9);
  assert.ok(Math.abs(sampler.quantile(0.5)) < 1e-9);
  assert.ok(Math.abs(sampler.quantile(0.8) - Math.log(4)) < 1e-9);
  assert.ok(Number.isFinite(sampler.quantile(1)));
  assert.ok(Math.abs(cdf(sampler.quantile(1)) - (1 - 1e-12)) < 1e-9);
});

test("auto-brackets far-shifted continuous distributions", () => {
  const shift = 1e9;
  const cdf = (x) => 1 / (1 + Math.exp(-(x - shift)));
  const sampler = createInverseTransformSampler({ cdf });

  assert.ok(Math.abs(sampler.quantile(0.5) - shift) < 1e-6);
  assert.ok(Math.abs(sampler.quantile(0) - (shift + Math.log(1e-12))) < 1e-3);
});

test("auto-brackets continuous quantiles with one explicit bound", () => {
  const sampler = createInverseTransformSampler({
    cdf: (x) => 1 - Math.exp(-x),
    min: 0
  });

  assert.equal(sampler.quantile(0), 0);
  assert.ok(Math.abs(sampler.quantile(0.5) - Math.log(2)) < 1e-9);
});

test("samples from a bounded pdf by numerical integration", () => {
  const sampler = createPdfSampler({
    pdf: (x) => 2 * x,
    min: 0,
    max: 1
  });

  assert.ok(Math.abs(sampler.totalMass - 1) < 1e-12);
  assert.equal(sampler.quantile(0), 0);
  assert.ok(Math.abs(sampler.quantile(0.25) - 0.5) < 1e-7);
  assert.ok(Math.abs(sampler.quantile(0.81) - 0.9) < 1e-7);
  assert.equal(sampler.quantile(1), 1);
});

test("uses injected random source for pdf samples", () => {
  const value = samplePdf({
    pdf: () => 1,
    min: 0,
    max: 10,
    rng: () => 0.3
  });

  assert.ok(Math.abs(value - 3) < 1e-7);
});

test("auto-bounds a shifted pdf when searchStart is near the mass", () => {
  const shift = 1e9;
  const sampler = createPdfSampler({
    pdf: (x) => {
      const z = x - shift;
      const e = Math.exp(-Math.abs(z));
      return e / (1 + e) ** 2;
    },
    searchStart: shift,
    tolerance: 1e-10
  });

  assert.ok(Math.abs(sampler.quantile(0.5) - shift) < 1e-5);
  assert.ok(sampler.min > shift - 30);
  assert.ok(sampler.max < shift + 30);
  assert.ok(Math.abs((sampler.min + sampler.max) / 2 - shift) < 1e-12);
});

test("pdf integration subdivisions can resolve narrow features", () => {
  const sampler = createPdfSampler({
    pdf: (x) => (x >= 0.24 && x <= 0.26 ? 50 : 0),
    min: 0,
    max: 1,
    integrationSubdivisions: 100
  });

  assert.ok(Math.abs(sampler.totalMass - 1) < 1e-6);
  assert.ok(Math.abs(sampler.quantile(0.5) - 0.25) < 1e-4);
});

test("pdfLipschitz certifies automatic pdf domain mass", () => {
  const sampler = createPdfSampler({
    pdf: (x) => Math.max(0, 1 - Math.abs(x)),
    pdfLipschitz: 1,
    tolerance: 0.05,
    integrationSubdivisions: 200
  });

  assert.ok(sampler.totalMass >= 0.95);
  assert.ok(sampler.min > -1);
  assert.ok(sampler.max < 1);
  assert.ok(Math.abs(sampler.min + sampler.max) < 1e-12);
  assert.ok(Math.abs(sampler.quantile(0.5)) < 0.05);
});

test("samples from weighted entries by cumulative probability", () => {
  const sampler = createWeightedSampler([
    ["a", 2],
    ["b", 3],
    ["c", 5]
  ]);

  assert.equal(sampler.totalWeight, 10);
  assert.equal(sampler.quantile(0), "a");
  assert.equal(sampler.quantile(0.19), "a");
  assert.equal(sampler.quantile(0.2), "b");
  assert.equal(sampler.quantile(0.49), "b");
  assert.equal(sampler.quantile(0.5), "c");
  assert.equal(sampler.quantile(0.999), "c");
});

test("uses injected random source for weighted samples", () => {
  const sampler = createWeightedSampler(
    [
      ["low", 1],
      ["high", 1]
    ],
    { rng: () => 0.75 }
  );

  assert.equal(sampler.sample(), "high");
});

test("rejects invalid continuous sampler inputs", () => {
  assert.throws(
    () => createInverseTransformSampler({ cdf: (x) => x, min: 1, max: 1 }),
    /min must be less than max/
  );

  assert.throws(
    () => createInverseTransformSampler({ cdf: () => 2, min: 0, max: 1 }),
    /cdf\(min\) must be between 0 and 1/
  );

  assert.throws(
    () => createInverseTransformSampler({ cdf: (x) => x, tolerance: 0.5 }),
    /tolerance must be less than 0.5/
  );
});

test("rejects invalid pdf sampler inputs", () => {
  assert.throws(() => createPdfSampler({ pdf: () => -1, min: 0, max: 1 }), /must not be negative/);

  assert.throws(
    () => createPdfSampler({ pdf: () => 0, min: 0, max: 1 }),
    /positive mass/
  );

  assert.throws(
    () => createPdfSampler({ pdf: () => 0 }),
    /could not find compact domain/
  );

  assert.throws(
    () => createPdfSampler({ pdf: () => 1, min: 0, max: 1, pdfLipschitz: -1 }),
    /pdfLipschitz must not be negative/
  );
});

test("rejects invalid weighted sampler inputs", () => {
  assert.throws(() => createWeightedSampler([]), /non-empty array/);
  assert.throws(() => createWeightedSampler([["x", -1]]), /must not be negative/);
  assert.throws(() => createWeightedSampler([["x", 0]]), /at least one weight/);
});
