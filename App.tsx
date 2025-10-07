

import React, { useState, useEffect } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { FaceLandmarkerResult, GazePoint } from './types';
import { Header } from './components/Header';
import { Loader } from './components/Loader';
import { WebcamLandmarker } from './components/WebcamLandmarker';
import { GazeFollower } from './components/GazeFollower';

const App: React.FC = () => {
    const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [isCalibrating, setIsCalibrating] = useState(false);
    const [gazePoint, setGazePoint] = useState<GazePoint | null>(null);
    const [highSensitivity, setHighSensitivity] = useState(false);


    useEffect(() => {
        const initializeFaceLandmarker = async () => {
            try {
                const filesetResolver = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
                );

                const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                        delegate: "GPU"
                    },
                    outputFaceBlendshapes: false,
                    outputFacialTransformationMatrixes: true,
                    runningMode: "VIDEO",
                    numFaces: 1
                });

                setFaceLandmarker(landmarker);
            } catch (e) {
                if (e instanceof Error) {
                    setError(`Initialization Error: ${e.message}`);
                } else {
                    setError("An unknown error occurred during initialization.");
                }
                console.error(e);
            } finally {
                setLoading(false);
            }
        };

        initializeFaceLandmarker();
    }, []);
    
    const mainContent = () => {
        if (loading) return <Loader />;
        if (error) return <p className="text-center text-red-500 bg-red-900/50 p-4 rounded-lg">{error}</p>;
        if (faceLandmarker) {
            return (
                 <div className="flex justify-center">
                    <div className="w-full max-w-2xl">
                        <WebcamLandmarker 
                            faceLandmarker={faceLandmarker}
                            isCalibrating={isCalibrating}
                            setIsCalibrating={setIsCalibrating}
                            onGazeUpdate={setGazePoint}
                            highSensitivity={highSensitivity}
                            setHighSensitivity={setHighSensitivity}
                        />
                    </div>
                </div>
            )
        }
        return null;
    }


    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans p-4 sm:p-6 md:p-8">
            <GazeFollower point={!isCalibrating ? gazePoint : null} />
            <Header />
            <main className="max-w-7xl mx-auto mt-8">
                {mainContent()}
            </main>
        </div>
    );
};

export default App;