export interface InverseTransformSamplerOptions {
  cdf: (x: number) => number;
  min?: number;
  max?: number;
  rng?: () => number;
  tolerance?: number;
  maxIterations?: number;
  searchStart?: number;
  searchStep?: number;
}

export interface InverseTransformSampler {
  sample(): number;
  quantile(probability: number): number;
}

export declare function createInverseTransformSampler(
  options: InverseTransformSamplerOptions
): InverseTransformSampler;

export declare function sampleInverseTransform(
  options: InverseTransformSamplerOptions
): number;

export interface PdfSamplerOptions {
  pdf: (x: number) => number;
  min?: number;
  max?: number;
  rng?: () => number;
  tolerance?: number;
  maxIterations?: number;
  searchStart?: number;
  searchStep?: number;
  integrationTolerance?: number;
  maxIntegrationDepth?: number;
  integrationSubdivisions?: number;
  pdfLipschitz?: number;
}

export interface PdfSampler {
  sample(): number;
  quantile(probability: number): number;
  readonly min: number;
  readonly max: number;
  readonly totalMass: number;
}

export declare function createPdfSampler(options: PdfSamplerOptions): PdfSampler;

export declare function samplePdf(options: PdfSamplerOptions): number;

export interface WeightedSampler<T> {
  sample(): T;
  quantile(probability: number): T;
  readonly totalWeight: number;
}

export declare function createWeightedSampler<T>(
  entries: Array<[T, number]>,
  options?: { rng?: () => number }
): WeightedSampler<T>;
