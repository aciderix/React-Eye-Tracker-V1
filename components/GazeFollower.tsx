import React from 'react';
import type { GazePoint } from '../types';

interface GazeFollowerProps {
    point: GazePoint | null;
}

export const GazeFollower: React.FC<GazeFollowerProps> = ({ point }) => {
    if (!point) {
        return null;
    }

    return (
        <div 
            className="fixed w-10 h-10 rounded-full bg-cyan-400/30 border-2 border-cyan-300 shadow-lg shadow-cyan-500/50 blur-sm pointer-events-none transition-all duration-100 ease-out z-[100]"
            style={{ 
                left: `${point.x}px`, 
                top: `${point.y}px`,
                transform: 'translate(-50%, -50%)',
            }}
            aria-hidden="true"
        />
    );
};