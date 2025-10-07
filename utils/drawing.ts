import { DrawingUtils, FaceLandmarker } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark, CalibrationState, NormalizedGazePoint, TranslationVector, CalibrationStep } from '../types';

// --- State for Smoothing ---
// These variables will hold the smoothed direction vectors between frames.
let smoothedVecX_R = 0;
let smoothedVecY_R = 0;
let smoothedVecX_L = 0;
let smoothedVecY_L = 0;

// The smoothing factor (alpha). A smaller value means more smoothing.
// 0.2 provides a good balance between responsiveness and stability.
const SMOOTHING_FACTOR = 0.2;

// Maps calibration steps to their normalized screen coordinates
export const SCREEN_POSITION_MAP: Record<string, { u: number; v: number; }> = {
    'collecting_center':       { u: 0.5, v: 0.5 },
    'collecting_top_center':   { u: 0.5, v: 0.0 },
    'collecting_top_right':    { u: 1.0, v: 0.0 },
    'collecting_middle_right': { u: 1.0, v: 0.5 },
    'collecting_bottom_right': { u: 1.0, v: 1.0 },
    'collecting_bottom_center':{ u: 0.5, v: 1.0 },
    'collecting_bottom_left':  { u: 0.0, v: 1.0 },
    'collecting_middle_left':  { u: 0.0, v: 0.5 },
    'collecting_top_left':     { u: 0.0, v: 0.0 },
};

export const drawLandmarks = (
    ctx: CanvasRenderingContext2D, 
    drawingUtils: DrawingUtils, 
    landmarks: NormalizedLandmark[],
    options: {
        calibrationState?: CalibrationState;
        transformationMatrix?: {data: number[]};
        drawTesselation?: boolean;
        highSensitivity?: boolean;
    } = {}
): NormalizedGazePoint | null => {
    const { calibrationState, transformationMatrix, drawTesselation = true, highSensitivity = false } = options;

    if (drawTesselation) {
        drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: "#C0C0C070", lineWidth: 1 });
    }
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, { color: "#FF3030" });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW, { color: "#FF3030" });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, { color: "#30FF30" });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW, { color: "#30FF30" });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, { color: "#E0E0E0" });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LIPS, { color: "#E0E0E0" });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS, { color: "#FF3030" });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, { color: "#30FF30" });

    // Draw spheres and lasers over eyes
    let finalGazePoint: NormalizedGazePoint | null = null;
    if (landmarks && landmarks.length > 473) {
        const { width, height } = ctx.canvas;

        const rightEyeOuterCorner = landmarks[133];
        const rightEyeInnerCorner = landmarks[33];
        const rightIrisCenter = landmarks[468];

        const leftEyeOuterCorner = landmarks[263];
        const leftEyeInnerCorner = landmarks[362];
        const leftIrisCenter = landmarks[473];


        if (rightEyeOuterCorner && rightEyeInnerCorner && leftEyeOuterCorner && leftEyeInnerCorner && rightIrisCenter && leftIrisCenter) {
            // --- Right Eye ---
            const rightEyeWidth = Math.hypot(
                (rightEyeOuterCorner.x - rightEyeInnerCorner.x) * width,
                (rightEyeOuterCorner.y - rightEyeInnerCorner.y) * height
            );
            const rightEyeRadius = rightEyeWidth / 2;
            const rightEyeCenterX = (rightEyeOuterCorner.x + rightEyeInnerCorner.x) / 2 * width;
            const rightEyeCenterY = (rightEyeOuterCorner.y + rightEyeInnerCorner.y) / 2 * height;
            
            // Draw right eye sphere
            ctx.beginPath();
            ctx.fillStyle = "rgba(255, 48, 48, 0.4)"; // Semi-transparent red
            ctx.arc(rightEyeCenterX, rightEyeCenterY, rightEyeRadius, 0, 2 * Math.PI);
            ctx.fill();

            // --- Left Eye ---
            const leftEyeWidth = Math.hypot(
                (leftEyeOuterCorner.x - leftEyeInnerCorner.x) * width,
                (leftEyeOuterCorner.y - leftEyeInnerCorner.y) * height
            );
            const leftEyeRadius = leftEyeWidth / 2;
            const leftEyeCenterX = (leftEyeOuterCorner.x + leftEyeInnerCorner.x) / 2 * width;
            const leftEyeCenterY = (leftEyeOuterCorner.y + leftEyeInnerCorner.y) / 2 * height;

            // Draw left eye sphere
            ctx.beginPath();
            ctx.fillStyle = "rgba(48, 255, 48, 0.4)"; // Semi-transparent green
            ctx.arc(leftEyeCenterX, leftEyeCenterY, leftEyeRadius, 0, 2 * Math.PI);
            ctx.fill();


            // --- Laser Logic ---
            const rightIrisX = rightIrisCenter.x * width;
            const rightIrisY = rightIrisCenter.y * height;
            const leftIrisX = leftIrisCenter.x * width;
            const leftIrisY = leftIrisCenter.y * height;
            
            // The raw gaze vector is calculated in 3D and then rotated into a stable
            // canonical head space to remove the influence of head rotation.
            let rawVec_R = { x: rightEyeCenterX - rightIrisX, y: rightIrisY - rightEyeCenterY };
            let rawVec_L = { x: leftEyeCenterX - leftIrisX, y: leftIrisY - leftEyeCenterY };
            
            let translation: TranslationVector | null = null;
            if (transformationMatrix?.data) {
                const m = transformationMatrix.data;
                // The transformation matrix is column-major. Translation is in elements 12, 13, 14.
                translation = { x: m[12], y: m[13], z: m[14] };

                // De-normalize landmark coordinates to create 3D vectors in pixel space.
                const rightEyeOuterCorner_3d = { x: landmarks[133].x * width, y: landmarks[133].y * height, z: landmarks[133].z * width };
                const rightEyeInnerCorner_3d = { x: landmarks[33].x * width, y: landmarks[33].y * height, z: landmarks[33].z * width };
                const rightIrisCenter_3d = { x: landmarks[468].x * width, y: landmarks[468].y * height, z: landmarks[468].z * width };

                const leftEyeOuterCorner_3d = { x: landmarks[263].x * width, y: landmarks[263].y * height, z: landmarks[263].z * width };
                const leftEyeInnerCorner_3d = { x: landmarks[362].x * width, y: landmarks[362].y * height, z: landmarks[362].z * width };
                const leftIrisCenter_3d = { x: landmarks[473].x * width, y: landmarks[473].y * height, z: landmarks[473].z * width };

                const rightEyeCenter_3d = {
                    x: (rightEyeOuterCorner_3d.x + rightEyeInnerCorner_3d.x) / 2,
                    y: (rightEyeOuterCorner_3d.y + rightEyeInnerCorner_3d.y) / 2,
                    z: (rightEyeOuterCorner_3d.z + rightEyeInnerCorner_3d.z) / 2,
                };
                const leftEyeCenter_3d = {
                    x: (leftEyeOuterCorner_3d.x + leftEyeInnerCorner_3d.x) / 2,
                    y: (leftEyeOuterCorner_3d.y + leftEyeInnerCorner_3d.y) / 2,
                    z: (leftEyeOuterCorner_3d.z + leftEyeInnerCorner_3d.z) / 2,
                };
                
                const gazeVector_R_3d = {
                    x: rightIrisCenter_3d.x - rightEyeCenter_3d.x,
                    y: rightIrisCenter_3d.y - rightEyeCenter_3d.y,
                    z: rightIrisCenter_3d.z - rightEyeCenter_3d.z,
                };
                const gazeVector_L_3d = {
                    x: leftIrisCenter_3d.x - leftEyeCenter_3d.x,
                    y: leftIrisCenter_3d.y - leftEyeCenter_3d.y,
                    z: leftIrisCenter_3d.z - leftEyeCenter_3d.z,
                };

                // Transform the world-space gaze vector into the head's local coordinate system.
                // This is done by multiplying by the inverse (transpose) of the head's rotation matrix.
                const stabilized_R_3d = {
                    x: m[0] * gazeVector_R_3d.x + m[1] * gazeVector_R_3d.y + m[2] * gazeVector_R_3d.z,
                    y: m[4] * gazeVector_R_3d.x + m[5] * gazeVector_R_3d.y + m[6] * gazeVector_R_3d.z,
                    z: m[8] * gazeVector_R_3d.x + m[9] * gazeVector_R_3d.y + m[10] * gazeVector_R_3d.z,
                };
                const stabilized_L_3d = {
                    x: m[0] * gazeVector_L_3d.x + m[1] * gazeVector_L_3d.y + m[2] * gazeVector_L_3d.z,
                    y: m[4] * gazeVector_L_3d.x + m[5] * gazeVector_L_3d.y + m[6] * gazeVector_L_3d.z,
                    z: m[8] * gazeVector_L_3d.x + m[9] * gazeVector_L_3d.y + m[10] * gazeVector_L_3d.z,
                };

                // --- Parallax Correction for Head Pitch (Flexion/Extension) ---
                // The user wants the cursor to follow head rotation. The original correction
                // moved it in the opposite direction. By flipping the sign of the rotation
                // (applying a rotation of -pitch instead of +pitch), we make the cursor
                // move in the same direction as the head's pitch.
                const pitch = Math.atan2(m[6], m[10]);
                const cosPitch = Math.cos(pitch);
                const sinPitch = Math.sin(pitch);
                const pitchCorrected_R_3d = {
                    x: stabilized_R_3d.x,
                    y: stabilized_R_3d.y * cosPitch + stabilized_R_3d.z * sinPitch,
                    z: -stabilized_R_3d.y * sinPitch + stabilized_R_3d.z * cosPitch
                };
                const pitchCorrected_L_3d = {
                    x: stabilized_L_3d.x,
                    y: stabilized_L_3d.y * cosPitch + stabilized_L_3d.z * sinPitch,
                    z: -stabilized_L_3d.y * sinPitch + stabilized_L_3d.z * cosPitch
                };
                
                // --- Parallax Correction for Head Translation (Side-to-side/Up-down) ---
                // This compensates for the perspective shift when the head moves. The gaze vector
                // is adjusted so that the cursor follows the head's movement proportionally.
                const TRANSLATION_CORRECTION_X_FACTOR = 0.8; // Sensitivity for horizontal movement
                const TRANSLATION_CORRECTION_Y_FACTOR = 0.8; // Sensitivity for vertical movement

                let poseCorrected_R_3d = { ...pitchCorrected_R_3d };
                let poseCorrected_L_3d = { ...pitchCorrected_L_3d };

                if (Math.abs(translation.z) > 0.1) { // Avoid division by zero
                    // Note: translation.z is negative, so -translation.z is the positive distance.
                    const offsetX = TRANSLATION_CORRECTION_X_FACTOR * (translation.x / -translation.z);
                    const offsetY = TRANSLATION_CORRECTION_Y_FACTOR * (translation.y / -translation.z);

                    // We adjust the x and y components of the stabilized 3D gaze vector.
                    // Head moves right (tx > 0) -> cursor should shift right.
                    // Head moves up (ty > 0) -> cursor should shift up.
                    poseCorrected_R_3d.x += offsetX;
                    poseCorrected_R_3d.y -= offsetY;
                    poseCorrected_L_3d.x += offsetX;
                    poseCorrected_L_3d.y -= offsetY;
                }
                
                const STABILIZATION_SCALAR = 4;
                rawVec_R = { x: -poseCorrected_R_3d.x * STABILIZATION_SCALAR, y: poseCorrected_R_3d.y * STABILIZATION_SCALAR };
                rawVec_L = { x: -poseCorrected_L_3d.x * STABILIZATION_SCALAR, y: poseCorrected_L_3d.y * STABILIZATION_SCALAR };
            }
            
            // During calibration, collect samples of the fully corrected gaze vectors
            if (calibrationState?.step.startsWith('collecting_') && calibrationState.onCalibrationSample) {
                calibrationState.onCalibrationSample({
                    vec_R: rawVec_R,
                    vec_L: rawVec_L,
                });
            }
            
            // The concept of a simple offset is removed. Mapping is now handled by the advanced algorithm.
            const correctedVecX_R = rawVec_R.x;
            const correctedVecY_R = rawVec_R.y;
            const correctedVecX_L = rawVec_L.x;
            const correctedVecY_L = rawVec_L.y;

            // Apply smoothing to the raw vectors
            smoothedVecX_R = SMOOTHING_FACTOR * correctedVecX_R + (1 - SMOOTHING_FACTOR) * smoothedVecX_R;
            smoothedVecY_R = SMOOTHING_FACTOR * correctedVecY_R + (1 - SMOOTHING_FACTOR) * smoothedVecY_R;
            smoothedVecX_L = SMOOTHING_FACTOR * correctedVecX_L + (1 - SMOOTHING_FACTOR) * smoothedVecX_L;
            smoothedVecY_L = SMOOTHING_FACTOR * correctedVecY_L + (1 - SMOOTHING_FACTOR) * smoothedVecY_L;
            
            const laserLength = Math.max(width, height) * 2;

            // --- Third Eye (Cyclops) Laser ---
            const thirdEyeCenterX = (rightEyeCenterX + leftEyeCenterX) / 2;
            const thirdEyeCenterY = (rightEyeCenterY + leftEyeCenterY) / 2;

            // Average the two SMOOTHED eye vectors for the final gaze vector
            const avgVecX = (smoothedVecX_R + smoothedVecX_L) / 2;
            const avgVecY = (smoothedVecY_R + smoothedVecY_L) / 2;

            const endX_Third = thirdEyeCenterX + avgVecX * laserLength;
            const endY_Third = thirdEyeCenterY + avgVecY * laserLength;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(thirdEyeCenterX, thirdEyeCenterY);
            ctx.lineTo(endX_Third, endY_Third);
            ctx.strokeStyle = "rgba(0, 255, 255, 0.8)"; // Cyan laser
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();

            // --- Gaze Follower Calculation ---
            const cal = calibrationState?.data;
            let normalizedPoint: NormalizedGazePoint | null = null;
            
            // Use advanced mapping if regression model from calibration is available
            if (cal?.regressionCoeffs) {
                const features = [
                    1, // intercept
                    avgVecX,
                    avgVecY,
                ];

                const dot = (a: number[], b: number[]) => a.reduce((sum, val, i) => sum + val * b[i], 0);

                const u = dot(features, cal.regressionCoeffs.u);
                const v = dot(features, cal.regressionCoeffs.v);

                // Clamp values to be within the screen [0, 1] to prevent the follower from going off-screen.
                normalizedPoint = {
                    u: Math.max(0, Math.min(1, u)),
                    v: Math.max(0, Math.min(1, v)),
                };
            } else { // Fallback to simpler projection method if not fully calibrated
                const GAZE_PROJECTION_STRENGTH = highSensitivity ? 60 : 30;
                const REFERENCE_INTER_OCULAR_DISTANCE = 120; // in pixels

                const interOcularDistance = Math.hypot(leftEyeCenterX - rightEyeCenterX, leftEyeCenterY - rightEyeCenterY);
                const dynamicSensitivity = (interOcularDistance > 10)
                    ? GAZE_PROJECTION_STRENGTH * (REFERENCE_INTER_OCULAR_DISTANCE / interOcularDistance)
                    : GAZE_PROJECTION_STRENGTH;
                const gazePointX = thirdEyeCenterX + avgVecX * dynamicSensitivity;
                const gazePointY = thirdEyeCenterY + avgVecY * dynamicSensitivity;
                
                normalizedPoint = { u: gazePointX / width, v: gazePointY / height };
            }
            
            finalGazePoint = normalizedPoint;
        }
    }
    
    if (!finalGazePoint) {
        // If no face is detected, reset the smoothing state.
        smoothedVecX_R = 0;
        smoothedVecY_R = 0;
        smoothedVecX_L = 0;
        smoothedVecY_L = 0;
    }

    return finalGazePoint;
};