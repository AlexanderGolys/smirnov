const DEFAULT_TOLERANCE = 1e-12;
const DEFAULT_MAX_ITERATIONS = 100;
const DEFAULT_SEARCH_START = 0;
const DEFAULT_SEARCH_STEP = 1;
const DEFAULT_MAX_INTEGRATION_DEPTH = 24;
const DEFAULT_INTEGRATION_SUBDIVISIONS = 16;

/**
 * Creates a sampler by numerically inverting a monotone cumulative
 * distribution function.
 *
 * @param {object} options
 * @param {(x: number) => number} options.cdf
 * @param {number} [options.min]
 * @param {number} [options.max]
 * @param {() => number} [options.rng]
 * @param {number} [options.tolerance]
 * @param {number} [options.maxIterations]
 * @param {number} [options.searchStart]
 * @param {number} [options.searchStep]
 */
export function createInverseTransformSampler(options) {
  const {
    cdf,
    min,
    max,
    rng = Math.random,
    tolerance = DEFAULT_TOLERANCE,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    searchStart = DEFAULT_SEARCH_START,
    searchStep = DEFAULT_SEARCH_STEP,
  } = options ?? {};

  assertFunction(cdf, "cdf");
  assertFunction(rng, "rng");
  assertProbabilityTolerance(tolerance, "tolerance");
  assertPositiveInteger(maxIterations, "maxIterations");
  assertFiniteNumber(searchStart, "searchStart");
  assertPositiveNumber(searchStep, "searchStep");

  if (min !== undefined) {
    assertFiniteNumber(min, "min");
  }

  if (max !== undefined) {
    assertFiniteNumber(max, "max");
  }

  if (min !== undefined && max !== undefined && min >= max) {
    throw new RangeError("min must be less than max");
  }

  const lowerTailProbability = tolerance;
  const upperTailProbability = 1 - tolerance;
  const effectiveMin =
    min === undefined ? findProbabilityPoint(lowerTailProbability) : min;
  const effectiveMax =
    max === undefined ? findProbabilityPoint(upperTailProbability) : max;

  if (effectiveMin >= effectiveMax) {
    throw new RangeError("min must be less than max");
  }

  const cdfMin = readCdf(cdf, effectiveMin, "cdf(min)");
  const cdfMax = readCdf(cdf, effectiveMax, "cdf(max)");

  if (cdfMin >= cdfMax) {
    throw new RangeError("cdf(max) must be greater than cdf(min)");
  }

  function quantile(probability) {
    assertProbability(probability, "probability");

    if (probability === 0) {
      return effectiveMin;
    }

    if (probability === 1) {
      return effectiveMax;
    }

    const target = cdfMin + probability * (cdfMax - cdfMin);
    let low = effectiveMin;
    let high = effectiveMax;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const midpoint = low + (high - low) / 2;
      const value = readCdf(cdf, midpoint, "cdf(x)");

      if (value < target) {
        low = midpoint;
      } else {
        high = midpoint;
      }

      if (high - low <= tolerance) {
        break;
      }
    }

    return low + (high - low) / 2;
  }

  function findProbabilityPoint(target) {
    let low;
    let high;
    const startValue = readCdf(cdf, searchStart, "cdf(searchStart)");

    if (startValue <= target) {
      low = searchStart;
      high = expandRightUntil(target);
    } else {
      low = expandLeftUntil(target);
      high = searchStart;
    }

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const midpoint = low + (high - low) / 2;
      const value = readCdf(cdf, midpoint, "cdf(x)");

      if (value < target) {
        low = midpoint;
      } else {
        high = midpoint;
      }

      if (high - low <= tolerance) {
        break;
      }
    }

    return low + (high - low) / 2;
  }

  function expandRightUntil(target) {
    return expandUntil(searchStart, searchStep, (value) => value >= target);
  }

  function expandLeftUntil(target) {
    return expandUntil(searchStart, -searchStep, (value) => value <= target);
  }

  function expandUntil(start, initialStep, accepts) {
    let step = initialStep;
    let candidate = start + step;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const value = readCdf(cdf, candidate, "cdf(x)");
      if (accepts(value)) {
        return candidate;
      }

      step *= 2;
      candidate += step;
    }

    throw new RangeError(
      "could not find compact domain; provide min/max or increase maxIterations/searchStep",
    );
  }

  function sample() {
    return quantile(readUnitRandom(rng));
  }

  return { sample, quantile };
}

/**
 * Convenience wrapper for one continuous inverse-transform draw.
 *
 * @param {Parameters<typeof createInverseTransformSampler>[0]} options
 */
export function sampleInverseTransform(options) {
  return createInverseTransformSampler(options).sample();
}

/**
 * Creates an inverse-transform sampler from a probability density function.
 * The PDF is numerically integrated and normalized over the effective domain.
 *
 * @param {object} options
 * @param {(x: number) => number} options.pdf
 * @param {number} [options.min]
 * @param {number} [options.max]
 * @param {() => number} [options.rng]
 * @param {number} [options.tolerance]
 * @param {number} [options.maxIterations]
 * @param {number} [options.searchStart]
 * @param {number} [options.searchStep]
 * @param {number} [options.integrationTolerance]
 * @param {number} [options.maxIntegrationDepth]
 * @param {number} [options.integrationSubdivisions]
 * @param {number} [options.pdfLipschitz]
 */
export function createPdfSampler(options) {
  const {
    pdf,
    min,
    max,
    rng = Math.random,
    tolerance = DEFAULT_TOLERANCE,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    searchStart = DEFAULT_SEARCH_START,
    searchStep = DEFAULT_SEARCH_STEP,
    integrationTolerance = tolerance,
    maxIntegrationDepth = DEFAULT_MAX_INTEGRATION_DEPTH,
    integrationSubdivisions = DEFAULT_INTEGRATION_SUBDIVISIONS,
    pdfLipschitz,
  } = options ?? {};

  assertFunction(pdf, "pdf");
  assertFunction(rng, "rng");
  assertProbabilityTolerance(tolerance, "tolerance");
  assertPositiveNumber(integrationTolerance, "integrationTolerance");
  assertPositiveInteger(maxIterations, "maxIterations");
  assertPositiveInteger(maxIntegrationDepth, "maxIntegrationDepth");
  assertPositiveInteger(integrationSubdivisions, "integrationSubdivisions");
  assertFiniteNumber(searchStart, "searchStart");
  assertPositiveNumber(searchStep, "searchStep");

  if (pdfLipschitz !== undefined) {
    assertNonNegativeNumber(pdfLipschitz, "pdfLipschitz");
  }

  if (min !== undefined) {
    assertFiniteNumber(min, "min");
  }

  if (max !== undefined) {
    assertFiniteNumber(max, "max");
  }

  if (min !== undefined && max !== undefined && min >= max) {
    throw new RangeError("min must be less than max");
  }

  const { effectiveMin, effectiveMax, totalMass } = findPdfDomain();

  if (effectiveMin >= effectiveMax) {
    throw new RangeError("min must be less than max");
  }

  if (totalMass <= 0) {
    throw new RangeError(
      "pdf must have positive mass over the effective domain",
    );
  }

  function quantile(probability) {
    assertProbability(probability, "probability");

    if (probability === 0) {
      return effectiveMin;
    }

    if (probability === 1) {
      return effectiveMax;
    }

    const targetMass = probability * totalMass;
    let low = effectiveMin;
    let high = effectiveMax;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const midpoint = low + (high - low) / 2;
      const mass = integratePdf(effectiveMin, midpoint);

      if (mass < targetMass) {
        low = midpoint;
      } else {
        high = midpoint;
      }

      if (high - low <= tolerance) {
        break;
      }
    }

    return low + (high - low) / 2;
  }

  function sample() {
    return quantile(readUnitRandom(rng));
  }

  function findPdfDomain() {
    if (min !== undefined && max !== undefined) {
      return {
        effectiveMin: min,
        effectiveMax: max,
        totalMass: integratePdf(min, max),
      };
    }

    if (min === undefined && max === undefined) {
      return findTwoSidedPdfDomain();
    }

    let low = min ?? searchStart;
    let high = max ?? searchStart;
    let previousLow = low;
    let previousHigh = high;
    let leftStep = searchStep;
    let rightStep = searchStep;

    if (min === undefined) {
      low -= leftStep;
    }

    if (max === undefined) {
      high += rightStep;
    }

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const mass = domainAcceptanceMass(low, high);
      if (mass >= 1 - tolerance) {
        return refineMassDomain(previousLow, previousHigh, low, high);
      }

      previousLow = low;
      previousHigh = high;

      if (min === undefined) {
        leftStep *= 2;
        low -= leftStep;
      }

      if (max === undefined) {
        rightStep *= 2;
        high += rightStep;
      }
    }

    throw new RangeError(
      "could not find compact domain with mass at least 1 - tolerance; provide min/max or increase maxIterations/searchStep",
    );
  }

  function findTwoSidedPdfDomain() {
    let innerRadius = 0;
    let outerRadius = searchStep;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const low = searchStart - outerRadius;
      const high = searchStart + outerRadius;
      const mass = domainAcceptanceMass(low, high);

      if (mass >= 1 - tolerance) {
        return refineRadialMassDomain(innerRadius, outerRadius);
      }

      innerRadius = outerRadius;
      outerRadius *= 2;
    }

    throw new RangeError(
      "could not find compact domain with mass at least 1 - tolerance; provide min/max or increase maxIterations/searchStep",
    );
  }

  function refineRadialMassDomain(innerRadius, outerRadius) {
    let radius = outerRadius;
    let mass = domainAcceptanceMass(searchStart - radius, searchStart + radius);

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const midpointRadius = (innerRadius + radius) / 2;
      const midpointMass = domainAcceptanceMass(
        searchStart - midpointRadius,
        searchStart + midpointRadius,
      );

      if (midpointMass >= 1 - tolerance) {
        radius = midpointRadius;
        mass = midpointMass;
      } else {
        innerRadius = midpointRadius;
      }

      if (radius - innerRadius <= tolerance) {
        break;
      }
    }

    const effectiveMin = searchStart - radius;
    const effectiveMax = searchStart + radius;

    return {
      effectiveMin,
      effectiveMax,
      totalMass: integratePdf(effectiveMin, effectiveMax),
    };
  }

  function refineMassDomain(innerLow, innerHigh, outerLow, outerHigh) {
    let low = outerLow;
    let high = outerHigh;
    let mass = domainAcceptanceMass(low, high);

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const midpointLow = min === undefined ? (innerLow + low) / 2 : low;
      const midpointHigh = max === undefined ? (innerHigh + high) / 2 : high;
      const midpointMass = domainAcceptanceMass(midpointLow, midpointHigh);

      if (midpointMass >= 1 - tolerance) {
        low = midpointLow;
        high = midpointHigh;
        mass = midpointMass;
      } else {
        innerLow = midpointLow;
        innerHigh = midpointHigh;
      }

      if (high - low <= tolerance) {
        break;
      }
    }

    return {
      effectiveMin: low,
      effectiveMax: high,
      totalMass: integratePdf(low, high),
    };
  }

  function domainAcceptanceMass(a, b) {
    if (pdfLipschitz === undefined) {
      return integratePdf(a, b);
    }

    return certifiedPdfMassLowerBound(a, b);
  }

  function certifiedPdfMassLowerBound(a, b) {
    let lowerBound = 0;
    const width = (b - a) / integrationSubdivisions;
    let left = a;
    let leftDensity = readPdf(pdf, left, "pdf(x)");

    for (let index = 0; index < integrationSubdivisions; index += 1) {
      const right = index === integrationSubdivisions - 1 ? b : left + width;
      const rightDensity = readPdf(pdf, right, "pdf(x)");
      const segmentWidth = right - left;
      const segmentFloor = Math.max(
        0,
        Math.min(leftDensity, rightDensity) - pdfLipschitz * segmentWidth,
      );

      lowerBound += segmentFloor * segmentWidth;
      left = right;
      leftDensity = rightDensity;
    }

    return lowerBound;
  }

  function integratePdf(a, b) {
    return adaptiveSimpson(
      (x) => readPdf(pdf, x, "pdf(x)"),
      a,
      b,
      integrationTolerance,
      maxIntegrationDepth,
      integrationSubdivisions,
    );
  }

  return {
    sample,
    quantile,
    min: effectiveMin,
    max: effectiveMax,
    totalMass,
  };
}

/**
 * Convenience wrapper for one PDF-based inverse-transform draw.
 *
 * @param {Parameters<typeof createPdfSampler>[0]} options
 */
export function samplePdf(options) {
  return createPdfSampler(options).sample();
}

/**
 * Creates a weighted sampler from `[value, weight]` entries.
 *
 * @template T
 * @param {Array<[T, number]>} entries
 * @param {{ rng?: () => number }} [options]
 */
export function createWeightedSampler(entries, options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new TypeError("entries must be a non-empty array");
  }

  const rng = options.rng ?? Math.random;
  assertFunction(rng, "rng");

  let totalWeight = 0;
  const cumulative = entries.map((entry, index) => {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new TypeError(`entries[${index}] must be a [value, weight] pair`);
    }

    const [value, weight] = entry;
    assertFiniteNumber(weight, `entries[${index}][1]`);

    if (weight < 0) {
      throw new RangeError(`entries[${index}][1] must not be negative`);
    }

    totalWeight += weight;
    return [value, totalWeight];
  });

  if (totalWeight <= 0) {
    throw new RangeError("at least one weight must be positive");
  }

  function quantile(probability) {
    assertProbability(probability, "probability");

    const target = probability * totalWeight;
    let low = 0;
    let high = cumulative.length - 1;

    while (low < high) {
      const midpoint = Math.floor((low + high) / 2);
      if (target < cumulative[midpoint][1]) {
        high = midpoint;
      } else {
        low = midpoint + 1;
      }
    }

    return cumulative[low][0];
  }

  function sample() {
    return quantile(readUnitRandom(rng));
  }

  return { sample, quantile, totalWeight };
}

function readUnitRandom(rng) {
  const value = rng();
  assertFiniteNumber(value, "rng()");

  if (value < 0 || value >= 1) {
    throw new RangeError("rng() must return a number in [0, 1)");
  }

  return value;
}

function readCdf(cdf, x, name) {
  const value = cdf(x);
  assertProbability(value, name);
  return value;
}

function readPdf(pdf, x, name) {
  const value = pdf(x);
  assertFiniteNumber(value, name);

  if (value < 0) {
    throw new RangeError(`${name} must not be negative`);
  }

  return value;
}

function adaptiveSimpson(fn, a, b, tolerance, maxDepth, subdivisions = 1) {
  if (a === b) {
    return 0;
  }

  if (subdivisions > 1) {
    let area = 0;
    const width = (b - a) / subdivisions;
    const localTolerance = tolerance / subdivisions;

    for (let index = 0; index < subdivisions; index += 1) {
      const left = a + index * width;
      const right = index === subdivisions - 1 ? b : left + width;
      area += adaptiveSimpson(fn, left, right, localTolerance, maxDepth, 1);
    }

    return area;
  }

  const fa = fn(a);
  const midpoint = a + (b - a) / 2;
  const fm = fn(midpoint);
  const fb = fn(b);
  const whole = simpsonArea(a, b, fa, fm, fb);

  return adaptiveSimpsonStep(fn, a, b, fa, fm, fb, whole, tolerance, maxDepth);
}

function adaptiveSimpsonStep(fn, a, b, fa, fm, fb, whole, tolerance, depth) {
  const midpoint = a + (b - a) / 2;
  const leftMidpoint = a + (midpoint - a) / 2;
  const rightMidpoint = midpoint + (b - midpoint) / 2;
  const leftMid = fn(leftMidpoint);
  const rightMid = fn(rightMidpoint);
  const left = simpsonArea(a, midpoint, fa, leftMid, fm);
  const right = simpsonArea(midpoint, b, fm, rightMid, fb);
  const delta = left + right - whole;

  if (depth <= 0 || Math.abs(delta) <= 15 * tolerance) {
    return left + right + delta / 15;
  }

  return (
    adaptiveSimpsonStep(
      fn,
      a,
      midpoint,
      fa,
      leftMid,
      fm,
      left,
      tolerance / 2,
      depth - 1,
    ) +
    adaptiveSimpsonStep(
      fn,
      midpoint,
      b,
      fm,
      rightMid,
      fb,
      right,
      tolerance / 2,
      depth - 1,
    )
  );
}

function simpsonArea(a, b, fa, fm, fb) {
  return ((b - a) / 6) * (fa + 4 * fm + fb);
}

function assertFunction(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
}

function assertFiniteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
}

function assertPositiveNumber(value, name) {
  assertFiniteNumber(value, name);

  if (value <= 0) {
    throw new RangeError(`${name} must be positive`);
  }
}

function assertNonNegativeNumber(value, name) {
  assertFiniteNumber(value, name);

  if (value < 0) {
    throw new RangeError(`${name} must not be negative`);
  }
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

function assertProbabilityTolerance(value, name) {
  assertPositiveNumber(value, name);

  if (value >= 0.5) {
    throw new RangeError(`${name} must be less than 0.5`);
  }
}

function assertProbability(value, name) {
  assertFiniteNumber(value, name);

  if (value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1`);
  }
}
