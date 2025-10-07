
import React from 'react';

export const Header: React.FC = () => {
    return (
        <header className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
                MediaPipe Face Landmarker
            </h1>
            <p className="mt-2 text-lg text-gray-400">
                Real-time facial landmark and expression detection in your browser.
            </p>
        </header>
    );
};
