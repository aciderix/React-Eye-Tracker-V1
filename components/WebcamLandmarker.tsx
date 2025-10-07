



import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DrawingUtils, FaceLandmarker } from '@mediapipe/tasks-vision';
import type { FaceLandmarkerResult, CalibrationData, CalibrationSample, CalibrationState, GazePoint, CalibrationStep, GazeVector, NormalizedGazePoint, TranslationVector, CalibrationPointData } from '../types';
import { drawLandmarks, SCREEN_POSITION_MAP } from '../utils/drawing';
import { CalibrationDisplay } from './CalibrationDisplay';

// --- Matrix Math Utilities for Ridge Regression ---
type Matrix = number[][];
type Vector = number[];

const transpose = (matrix: Matrix): Matrix => {
    return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
};
const multiply = (a: Matrix, b: Matrix): Matrix => {
    const aNumRows = a.length, aNumCols = a[0].length;
    const bNumRows = b.length, bNumCols = b[0].length;
    if (aNumCols !== bNumRows) throw new Error("Matrix dimensions are not compatible for multiplication.");
    const result: Matrix = new Array(aNumRows).fill(0).map(() => new Array(bNumCols).fill(0));
    for (let r = 0; r < aNumRows; r++) for (let c = 0; c < bNumCols; c++) for (let i = 0; i < aNumCols; i++) result[r][c] += a[r][i] * b[i][c];
    return result;
};
const multiplyVector = (matrix: Matrix, vector: Vector): Vector => {
    const numRows = matrix.length, numCols = matrix[0].length;
    if (numCols !== vector.length) throw new Error("Matrix and vector dimensions are not compatible.");
    const result: Vector = new Array(numRows).fill(0);
    for (let r = 0; r < numRows; r++) for (let c = 0; c < numCols; c++) result[r] += matrix[r][c] * vector[c];
    return result;
};
const add = (a: Matrix, b: Matrix): Matrix => {
    const numRows = a.length, numCols = a[0].length;
    if (numRows !== b.length || numCols !== b[0].length) throw new Error("Matrix dimensions must be same for addition.");
    const result: Matrix = new Array(numRows).fill(0).map(() => new Array(numCols).fill(0));
    for (let r = 0; r < numRows; r++) for (let c = 0; c < numCols; c++) result[r][c] = a[r][c] + b[r][c];
    return result;
};
const identity = (size: number): Matrix => {
    const result: Matrix = new Array(size).fill(0).map(() => new Array(size).fill(0));
    for (let i = 0; i < size; i++) result[i][i] = 1;
    return result;
};
const scalarMultiply = (matrix: Matrix, scalar: number): Matrix => matrix.map(row => row.map(val => val * scalar));
const invert = (matrix: Matrix): Matrix | null => {
    const n = matrix.length;
    if (n === 0 || n !== matrix[0].length) return null;
    const augmented: Matrix = matrix.map((row, i) => [...row, ...identity(n)[i]]);
    for (let i = 0; i < n; i++) {
        let maxRow = i;
        for (let k = i + 1; k < n; k++) if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) maxRow = k;
        [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
        const pivot = augmented[i][i];
        if (Math.abs(pivot) < 1e-10) return null; // Singular
        for (let j = i; j < 2 * n; j++) augmented[i][j] /= pivot;
        for (let k = 0; k < n; k++) {
            if (k !== i) {
                const factor = augmented[k][i];
                for (let j = i; j < 2 * n; j++) augmented[k][j] -= factor * augmented[i][j];
            }
        }
    }
    return augmented.map(row => row.slice(n));
};
const ridgeRegression = (X: Matrix, y: Vector, lambda: number): Vector | null => {
    try {
        const XT = transpose(X);
        const XTX = multiply(XT, X);
        const lambdaI = scalarMultiply(identity(XTX.length), lambda);
        const term1_inv = invert(add(XTX, lambdaI));
        if (!term1_inv) {
            console.error("Matrix is singular, cannot perform regression.");
            return null;
        }
        const term2 = multiply(term1_inv, XT);
        return multiplyVector(term2, y);
    } catch (e) {
        console.error("Error during ridge regression:", e);
        return null;
    }
};


interface WebcamLandmarkerProps {
    faceLandmarker: FaceLandmarker;
    isCalibrating: boolean;
    setIsCalibrating: (isCalibrating: boolean) => void;
    onGazeUpdate: (point: GazePoint | null) => void;
    highSensitivity: boolean;
    setHighSensitivity: (value: boolean) => void;
}

const CALIBRATION_FRAMES = 90; // Approx 3 seconds at 30fps
const AWAIT_TIME = 2000; // 2 seconds to look at the next point
const Z_SCORE_THRESHOLD = 2.0;

// Helper to calculate mean and standard deviation
const getStats = (data: number[]) => {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const stdDev = Math.sqrt(data.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / data.length);
    return { mean, stdDev };
};

export const WebcamLandmarker: React.FC<WebcamLandmarkerProps> = ({ faceLandmarker, isCalibrating, setIsCalibrating, onGazeUpdate, highSensitivity, setHighSensitivity }) => {
    const [webcamRunning, setWebcamRunning] = useState(false);
    const [calibrationStep, setCalibrationStep] = useState<CalibrationStep>('idle');
    const [calibrationData, setCalibrationData] = useState<CalibrationData | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const lastVideoFrameRef = useRef(-1);
    const calibrationSamples = useRef<CalibrationSample[]>([]);
    const isProcessingSamples = useRef(false);
    const predictCallbackRef = useRef<(now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void>();


    // --- Calibration State Machine ---
    useEffect(() => {
        if (!isCalibrating) {
            setCalibrationStep('idle');
            return;
        }

        let timeoutId: number;

        const advanceState = (nextStep: CalibrationStep, delay: number) => {
            timeoutId = window.setTimeout(() => {
                calibrationSamples.current = []; // Reset samples for next collection
                isProcessingSamples.current = false;
                setCalibrationStep(nextStep);
            }, delay);
        };

        switch (calibrationStep) {
            case 'awaiting_top_center': advanceState('collecting_top_center', AWAIT_TIME); break;
            case 'awaiting_top_right': advanceState('collecting_top_right', AWAIT_TIME); break;
            case 'awaiting_middle_right': advanceState('collecting_middle_right', AWAIT_TIME); break;
            case 'awaiting_bottom_right': advanceState('collecting_bottom_right', AWAIT_TIME); break;
            case 'awaiting_bottom_center': advanceState('collecting_bottom_center', AWAIT_TIME); break;
            case 'awaiting_bottom_left': advanceState('collecting_bottom_left', AWAIT_TIME); break;
            case 'awaiting_middle_left': advanceState('collecting_middle_left', AWAIT_TIME); break;
            case 'awaiting_top_left': advanceState('collecting_top_left', AWAIT_TIME); break;
        }

        return () => clearTimeout(timeoutId);
    }, [calibrationStep, isCalibrating]);


    const handleStartCalibration = () => {
        calibrationSamples.current = [];
        setCalibrationData({ points: {} });
        setCalibrationStep('collecting_center');
    };

    const handleResetCalibration = () => {
        handleStartCalibration(); // Just restart the process
    };
    
    const processCollectedSamples = useCallback((step: CalibrationStep) => {
        if (calibrationSamples.current.length < CALIBRATION_FRAMES / 2) return; // Need a minimum number of samples
        
        isProcessingSamples.current = true;

        // --- Z-Score Outlier Rejection ---
        const stats = {
            vec_R_x: getStats(calibrationSamples.current.map(s => s.vec_R.x)),
            vec_R_y: getStats(calibrationSamples.current.map(s => s.vec_R.y)),
            vec_L_x: getStats(calibrationSamples.current.map(s => s.vec_L.x)),
            vec_L_y: getStats(calibrationSamples.current.map(s => s.vec_L.y)),
        };

        const filteredSamples = calibrationSamples.current.filter(s => 
            Math.abs((s.vec_R.x - stats.vec_R_x.mean) / (stats.vec_R_x.stdDev + 1e-6)) < Z_SCORE_THRESHOLD &&
            Math.abs((s.vec_R.y - stats.vec_R_y.mean) / (stats.vec_R_y.stdDev + 1e-6)) < Z_SCORE_THRESHOLD &&
            Math.abs((s.vec_L.x - stats.vec_L_x.mean) / (stats.vec_L_x.stdDev + 1e-6)) < Z_SCORE_THRESHOLD &&
            Math.abs((s.vec_L.y - stats.vec_L_y.mean) / (stats.vec_L_y.stdDev + 1e-6)) < Z_SCORE_THRESHOLD
        );

        const samplesToUse = filteredSamples.length > 10 ? filteredSamples : calibrationSamples.current; // Use original if filtering is too aggressive
        
        const avg = samplesToUse.reduce((acc, s) => {
            acc.x_R += s.vec_R.x;
            acc.y_R += s.vec_R.y;
            acc.x_L += s.vec_L.x;
            acc.y_L += s.vec_L.y;
            return acc;
        }, { x_R: 0, y_R: 0, x_L: 0, y_L: 0 });

        const numSamples = samplesToUse.length;
        const avgVec_R: GazeVector = { x: avg.x_R / numSamples, y: avg.y_R / numSamples };
        const avgVec_L: GazeVector = { x: avg.x_L / numSamples, y: avg.y_L / numSamples };
        
        const avgGaze: GazeVector = {
            x: (avgVec_R.x + avgVec_L.x) / 2,
            y: (avgVec_R.y + avgVec_L.y) / 2,
        };
        
        const newPointData: CalibrationPointData = { avgGaze };

        const updatedCalibrationData = {
            ...calibrationData,
            points: {
                ...calibrationData?.points,
                [step]: newPointData,
            }
        };
        
        setCalibrationData(updatedCalibrationData as CalibrationData);

        // --- State Transitions ---
        const transitionMap: Partial<Record<CalibrationStep, CalibrationStep>> = {
            'collecting_center': 'awaiting_top_center',
            'collecting_top_center': 'awaiting_top_right',
            'collecting_top_right': 'awaiting_middle_right',
            'collecting_middle_right': 'awaiting_bottom_right',
            'collecting_bottom_right': 'awaiting_bottom_center',
            'collecting_bottom_center': 'awaiting_bottom_left',
            'collecting_bottom_left': 'awaiting_middle_left',
            'collecting_middle_left': 'awaiting_top_left',
        };

        if (step === 'collecting_top_left') {
             // --- Final step: Train regression model ---
            const trainingData = Object.entries(updatedCalibrationData.points)
                // FIX: Add type annotation for 'data' to resolve type inference issue with Object.entries.
                .map(([stepName, data]: [string, CalibrationPointData | undefined]) => {
                    const screenPos = SCREEN_POSITION_MAP[stepName as keyof typeof SCREEN_POSITION_MAP];
                    if (data && screenPos) {
                        return {
                            features: [1, data.avgGaze.x, data.avgGaze.y],
                            target: screenPos,
                        };
                    }
                    return null;
                })
                .filter((item): item is NonNullable<typeof item> => !!item);

            // We need at least as many data points as features for a valid regression.
            if (trainingData.length >= 3) {
                const X = trainingData.map(d => d.features);
                const y_u = trainingData.map(d => d.target.u);
                const y_v = trainingData.map(d => d.target.v);
                
                const lambda = 0.01; // Regularization strength
                const coeffs_u = ridgeRegression(X, y_u, lambda);
                const coeffs_v = ridgeRegression(X, y_v, lambda);

                if (coeffs_u && coeffs_v) {
                    setCalibrationData(prev => ({
                        ...(prev as CalibrationData),
                        regressionCoeffs: { u: coeffs_u, v: coeffs_v }
                    }));
                }
            }
            setCalibrationStep('done');
        } else {
            const nextStep = transitionMap[step];
            if (nextStep) {
                setCalibrationStep(nextStep);
            }
        }
    }, [calibrationData]);

    const handleCalibrationSample = useCallback((sample: CalibrationSample) => {
        if (calibrationStep.startsWith('collecting_') && calibrationSamples.current.length < CALIBRATION_FRAMES) {
            calibrationSamples.current.push(sample);
            // If we just reached the required number of samples, process them.
            if (calibrationSamples.current.length === CALIBRATION_FRAMES && !isProcessingSamples.current) {
                processCollectedSamples(calibrationStep);
            }
        }
    }, [calibrationStep, processCollectedSamples]);

    // This effect updates the prediction logic that the loop will call.
    useEffect(() => {
        predictCallbackRef.current = (now, metadata) => {
            if (!webcamRunning || !videoRef.current || !canvasRef.current || !faceLandmarker) return;

            const video = videoRef.current;
            const canvas = canvasRef.current;
            
            // Using metadata.presentedFrames is more reliable than video.currentTime for preventing re-processing.
            if (metadata.presentedFrames <= lastVideoFrameRef.current) {
                return; // Skip if same frame or an older frame
            }
            lastVideoFrameRef.current = metadata.presentedFrames;
            
            const ctx = canvas.getContext("2d");
            
            if (video.videoWidth > 0) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
            }
            
            const results = faceLandmarker.detectForVideo(video, now);
            
            if (ctx) {
                const calibrationState: CalibrationState = {
                    step: isCalibrating ? calibrationStep : 'idle',
                    data: calibrationData,
                    onCalibrationSample: isCalibrating ? handleCalibrationSample : undefined
                };
                
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                const landmarks = results.faceLandmarks?.[0];
                const transformationMatrix = results.facialTransformationMatrixes?.[0];
                let gazePointForUpdate: GazePoint | null = null;
                
                ctx.save();

                // Stabilize video feed
                if (landmarks && landmarks.length > 362 && transformationMatrix?.data) {
                    const leftEyeInnerCorner = landmarks[133];
                    const rightEyeInnerCorner = landmarks[362];

                    const anchorPoint = {
                        x: (leftEyeInnerCorner.x + rightEyeInnerCorner.x) / 2,
                        y: (leftEyeInnerCorner.y + rightEyeInnerCorner.y) / 2,
                    };
                    
                    const m = transformationMatrix.data;
                    const roll = Math.atan2(m[1], m[0]);

                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    ctx.rotate(roll);
                    ctx.translate(-anchorPoint.x * canvas.width, -anchorPoint.y * canvas.height);
                    
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                } else {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                }
                
                if (landmarks) {
                    const drawingUtils = new DrawingUtils(ctx);
                    const normalizedGazePoint = drawLandmarks(
                        ctx, 
                        drawingUtils, 
                        landmarks, 
                        {
                            calibrationState,
                            transformationMatrix,
                            drawTesselation: false,
                            highSensitivity
                        }
                    );
                    
                    if (normalizedGazePoint) {
                        gazePointForUpdate = {
                            x: normalizedGazePoint.u * window.innerWidth,
                            y: normalizedGazePoint.v * window.innerHeight
                        };
                    }
                }

                ctx.restore();
                onGazeUpdate(gazePointForUpdate);
            }
        };
    }, [webcamRunning, faceLandmarker, isCalibrating, calibrationStep, calibrationData, onGazeUpdate, handleCalibrationSample, highSensitivity]);

    // This effect manages the video callback loop.
    useEffect(() => {
        if (!webcamRunning || !videoRef.current) return;
        
        const video = videoRef.current;
        let handle: number;

        const frameCallback: VideoFrameRequestCallback = (now, metadata) => {
            predictCallbackRef.current?.(now, metadata);
            // Re-register for the next frame. The browser will stop calling this if the video is paused/ended.
            handle = video.requestVideoFrameCallback(frameCallback);
        };

        handle = video.requestVideoFrameCallback(frameCallback);

        return () => {
            if (video && handle) {
                video.cancelVideoFrameCallback(handle);
            }
            lastVideoFrameRef.current = -1; // Reset frame count
        };
    }, [webcamRunning]);

    const enableCam = async () => {
        if (!faceLandmarker || !navigator.mediaDevices) return;
        
        if (webcamRunning) {
            setWebcamRunning(false);
            onGazeUpdate(null);
            setIsCalibrating(false); // Also exit calibration mode
            if (videoRef.current?.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
                videoRef.current.srcObject = null;
            }
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                    }
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.addEventListener("loadeddata", () => {
                        setWebcamRunning(true);
                    });
                }
            } catch (err) {
                console.error("Error accessing webcam:", err);
            }
        }
    };
    
    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (videoRef.current?.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
        }
    }, [])

    return (
        <section className={isCalibrating 
            ? 'fixed inset-0 z-50 bg-black flex flex-col items-center justify-center' 
            : "bg-gray-800 rounded-xl p-4 sm:p-6 space-y-4 flex flex-col"
        }>
            {!isCalibrating && (
                 <h2 className="text-2xl font-bold text-center text-white">Webcam Feed</h2>
            )}
           
            <div className={isCalibrating ? 'relative w-full h-full flex items-center justify-center' : 'relative'}>
                <video ref={videoRef} autoPlay playsInline className="hidden"></video>
                <canvas 
                    ref={canvasRef} 
                    className={isCalibrating 
                        ? 'max-w-full max-h-full object-contain' 
                        : 'rounded-lg w-full h-auto aspect-video bg-black'
                    }
                ></canvas>
                {isCalibrating && (
                    <CalibrationDisplay
                        step={calibrationStep}
                        progress={calibrationStep.startsWith('collecting_') ? calibrationSamples.current.length / CALIBRATION_FRAMES : 0}
                        onStart={handleStartCalibration}
                        onReset={handleResetCalibration}
                        onFinish={() => setIsCalibrating(false)}
                    />
                )}
            </div>

            {!isCalibrating && (
                <>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <button
                            onClick={enableCam}
                            className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors duration-200 ${
                                webcamRunning 
                                    ? 'bg-red-600 hover:bg-red-700' 
                                    : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                        >
                            {webcamRunning ? 'DISABLE WEBCAM' : 'ENABLE WEBCAM'}
                        </button>
                        <button
                            onClick={() => {
                                if (!webcamRunning) return;
                                setIsCalibrating(true);
                                setCalibrationStep('idle'); // Reset status when entering calibration
                            }}
                            disabled={!webcamRunning}
                            className={'w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors duration-200 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed'}
                        >
                            CALIBRATE GAZE
                        </button>
                    </div>
                    
                    <div className="pt-4 mt-4 border-t border-gray-700">
                        <label htmlFor="highSensitivityToggle" className={`flex items-center justify-center ${webcamRunning ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                            <input
                                type="checkbox"
                                id="highSensitivityToggle"
                                className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500 focus:ring-offset-gray-800 disabled:opacity-50"
                                checked={highSensitivity}
                                onChange={(e) => setHighSensitivity(e.target.checked)}
                                disabled={!webcamRunning}
                                aria-describedby="sensitivity-description"
                            />
                            <span className={`ml-3 text-sm font-medium ${!webcamRunning ? 'text-gray-500' : 'text-gray-300'}`}>
                                High Sensitivity Mode
                                <p id="sensitivity-description" className="text-xs font-normal text-gray-400">Increases sensitivity for limited eye movement.</p>
                            </span>
                        </label>
                    </div>

                    <div className="flex-grow" />
                </>
            )}
        </section>
    );
};