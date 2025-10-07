
import React from 'react';

export const Loader: React.FC = () => {
    return (
        <div className="flex flex-col items-center justify-center space-y-4 p-8">
            <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-blue-500"></div>
            <p className="text-lg text-gray-300">Initializing ML Model...</p>
        </div>
    );
};
