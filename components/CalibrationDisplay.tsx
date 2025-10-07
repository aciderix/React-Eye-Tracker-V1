import React from 'react';
import type { CalibrationStep } from '../types';

interface CalibrationDisplayProps {
    step: CalibrationStep;
    progress: number; // 0 to 1
    onStart: () => void;
    onReset: () => void;
    onFinish: () => void;
}

const STEP_CONFIG: Record<CalibrationStep, { title: string; instruction: string; markerPosition: string }> = {
    idle: {
        title: 'Ready to Calibrate',
        instruction: 'Look directly at the marker in the center of your screen, then press start. Keep your head relatively still during the process.',
        markerPosition: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
    },
    collecting_center: {
        title: 'Calibrating Center...',
        instruction: 'Please continue looking at the central marker.',
        markerPosition: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
    },
    awaiting_top_center: {
        title: 'Get Ready...',
        instruction: 'Now, look at the TOP-CENTER.',
        markerPosition: 'top-4 left-1/2 -translate-x-1/2',
    },
    collecting_top_center: {
        title: 'Calibrating Top-Center...',
        instruction: 'Keep looking at the marker.',
        markerPosition: 'top-4 left-1/2 -translate-x-1/2',
    },
    awaiting_top_right: {
        title: 'Get Ready...',
        instruction: 'Now, look at the TOP-RIGHT corner.',
        markerPosition: 'top-4 right-4',
    },
    collecting_top_right: {
        title: 'Calibrating Top-Right...',
        instruction: 'Keep looking at the corner.',
        markerPosition: 'top-4 right-4',
    },
     awaiting_middle_right: {
        title: 'Get Ready...',
        instruction: 'Now, look at the MIDDLE-RIGHT.',
        markerPosition: 'top-1/2 right-4 -translate-y-1/2',
    },
    collecting_middle_right: {
        title: 'Calibrating Middle-Right...',
        instruction: 'Keep looking at the marker.',
        markerPosition: 'top-1/2 right-4 -translate-y-1/2',
    },
    awaiting_bottom_right: {
        title: 'Get Ready...',
        instruction: 'Now, look at the BOTTOM-RIGHT corner.',
        markerPosition: 'bottom-4 right-4',
    },
    collecting_bottom_right: {
        title: 'Calibrating Bottom-Right...',
        instruction: 'Keep looking at the corner.',
        markerPosition: 'bottom-4 right-4',
    },
    awaiting_bottom_center: {
        title: 'Get Ready...',
        instruction: 'Now, look at the BOTTOM-CENTER.',
        markerPosition: 'bottom-4 left-1/2 -translate-x-1/2',
    },
    collecting_bottom_center: {
        title: 'Calibrating Bottom-Center...',
        instruction: 'Keep looking at the marker.',
        markerPosition: 'bottom-4 left-1/2 -translate-x-1/2',
    },
    awaiting_bottom_left: {
        title: 'Get Ready...',
        instruction: 'Now, look at the BOTTOM-LEFT corner.',
        markerPosition: 'bottom-4 left-4',
    },
    collecting_bottom_left: {
        title: 'Calibrating Bottom-Left...',
        instruction: 'Keep looking at the corner.',
        markerPosition: 'bottom-4 left-4',
    },
     awaiting_middle_left: {
        title: 'Get Ready...',
        instruction: 'Now, look at the MIDDLE-LEFT.',
        markerPosition: 'top-1/2 left-4 -translate-y-1/2',
    },
    collecting_middle_left: {
        title: 'Calibrating Middle-Left...',
        instruction: 'Keep looking at the marker.',
        markerPosition: 'top-1/2 left-4 -translate-y-1/2',
    },
    awaiting_top_left: {
        title: 'Get Ready...',
        instruction: 'Now, look at the TOP-LEFT corner.',
        markerPosition: 'top-4 left-4',
    },
    collecting_top_left: {
        title: 'Calibrating Top-Left...',
        instruction: 'Keep looking at the corner.',
        markerPosition: 'top-4 left-4',
    },
    done: {
        title: 'Calibration Complete!',
        instruction: 'Your gaze is now calibrated. You can finish or recalibrate if needed.',
        markerPosition: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 hidden', // Hide marker when done
    },
};

export const CalibrationDisplay: React.FC<CalibrationDisplayProps> = ({ step, progress, onStart, onReset, onFinish }) => {
    const config = STEP_CONFIG[step];

    return (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-center p-4 z-10 rounded-lg backdrop-blur-sm select-none">
            {/* Target Marker */}
            <div className={`absolute text-cyan-400 text-5xl font-thin opacity-80 transition-all duration-500 ${config.markerPosition}`} aria-hidden="true">
                +
            </div>

            <div className="relative z-20">
                <h3 className={`text-xl font-semibold text-white mb-2 ${step === 'done' ? 'text-green-400' : ''}`}>
                    {config.title}
                </h3>
                <p className="text-gray-300 mb-6 max-w-sm">
                   {config.instruction}
                </p>

                {step === 'idle' && (
                    <button onClick={onStart} className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">
                        Start Calibration
                    </button>
                )}

                {step.startsWith('collecting_') && (
                    <div role="progressbar" aria-valuenow={progress * 100} aria-valuemin={0} aria-valuemax={100} className="w-64 bg-gray-700 rounded-full h-2.5">
                        <div className="bg-cyan-500 h-2.5 rounded-full" style={{ width: `${progress * 100}%` }}></div>
                    </div>
                )}
                
                {step.startsWith('awaiting_') && (
                    <div className="flex items-center justify-center space-x-2 text-gray-400">
                        <div className="w-4 h-4 border-2 border-dashed rounded-full animate-spin border-gray-400"></div>
                        <span>Preparing...</span>
                    </div>
                )}

                {step === 'done' && (
                    <div className="flex gap-4 justify-center">
                        <button onClick={onReset} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">
                            Recalibrate
                        </button>
                         <button onClick={onFinish} className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">
                            Finish
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
