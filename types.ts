// The global 'vision' object is no longer needed as we import from the package.

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface FaceLandmarkerResult {
  faceLandmarks: NormalizedLandmark[][];
  facialTransformationMatrixes: {data: number[]}[];
}

export type CalibrationStep =
    | 'idle'
    | 'collecting_center'
    | 'awaiting_top_center'
    | 'collecting_top_center'
    | 'awaiting_top_right'
    | 'collecting_top_right'
    | 'awaiting_middle_right'
    | 'collecting_middle_right'
    | 'awaiting_bottom_right'
    | 'collecting_bottom_right'
    | 'awaiting_bottom_center'
    | 'collecting_bottom_center'
    | 'awaiting_bottom_left'
    | 'collecting_bottom_left'
    | 'awaiting_middle_left'
    | 'collecting_middle_left'
    | 'awaiting_top_left'
    | 'collecting_top_left'
    | 'done';

export interface GazeVector {
    x: number;
    y: number;
}

export interface CalibrationPointData {
    avgGaze: GazeVector;
    // avgTranslation is no longer needed as parallax is corrected geometrically.
}

export interface RegressionCoefficients {
    u: number[]; // Coefficients for predicting u
    v: number[]; // Coefficients for predicting v
}

export interface CalibrationData {
    points: Partial<Record<string, CalibrationPointData>>;
    regressionCoeffs?: RegressionCoefficients;
}

export interface TranslationVector {
    x: number;
    y: number;
    z: number;
}

export interface CalibrationSample {
    vec_R: GazeVector;
    vec_L: GazeVector;
    // translation is now handled geometrically before sampling.
}

export interface CalibrationState {
    step: CalibrationStep;
    data: CalibrationData | null;
    onCalibrationSample?: (sample: CalibrationSample) => void;
}

export interface GazePoint {
    x: number;
    y: number;
}

export interface NormalizedGazePoint {
    u: number; // Represents x-coordinate, from 0.0 (left) to 1.0 (right)
    v: number; // Represents y-coordinate, from 0.0 (top) to 1.0 (bottom)
}