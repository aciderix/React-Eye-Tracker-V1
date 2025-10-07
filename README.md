# Advanced Gaze Tracking with MediaPipe

This is a sophisticated web application that transforms your webcam into a real-time eye tracker. Using advanced facial landmark detection, it allows you to control a cursor on the screen simply by moving your eyes. The project serves as a powerful demonstration of what's possible with modern computer vision in the browser.

![Demo GIF of gaze tracking]
*(Here you could insert a GIF showing the calibration process and the gaze follower in action)*

---

## ✨ Features

-   **Real-Time Gaze Tracking**: Utilizes a standard webcam to track eye movements with low latency.
-   **High-Accuracy Calibration**: A guided, multi-point calibration process creates a personalized profile for precise tracking.
-   **Advanced Head Pose Correction**: The system intelligently compensates for head rotations (tilting) and movements (translations), ensuring that the cursor follows your gaze, not just your head.
-   **Visual Feedback**: A smooth, glowing "gaze follower" provides immediate visual confirmation of the tracked point.
-   **High Sensitivity Mode**: An optional mode to increase responsiveness, particularly useful for users with limited eye movement.
-   **Modern Tech Stack**: Built entirely with client-side technologies using React, TypeScript, and Google's MediaPipe framework.

---

## ⚙️ How It Works

The application's core logic can be broken down into a few key steps:

1.  **Face Landmark Detection**: It uses the MediaPipe Face Landmarker model to identify 478 key points on the face in real-time. It pays special attention to the landmarks defining the eyes and the irises.

2.  **Gaze Vector Calculation**: For each eye, it calculates a "gaze vector"—the direction and magnitude from the center of the eye to the center of the iris. This vector represents the raw direction of the user's gaze.

3.  **Head Pose Correction & Stabilization**: A crucial step for accuracy. The system uses the 3D transformation matrix provided by MediaPipe to understand the head's rotation and position in space. It then computationally "removes" these movements from the gaze vectors. This isolates the pure movement of the eyes, meaning the cursor won't drift if you tilt or move your head.

4.  **Calibration & Machine Learning**:
    -   To map the user's unique eye movements to the screen, the user undergoes a calibration process. They are asked to look at nine distinct points on the screen.
    -   At each point, the application collects the corresponding (and now stabilized) gaze vectors.
    -   Once all points are collected, it trains a **Ridge Regression model**. This statistical model learns the unique relationship between the user's gaze vectors and the actual coordinates on the screen.

5.  **Real-Time Prediction**: After calibration, the application continuously feeds the live, stabilized gaze vector into the trained model. The model predicts the `(x, y)` screen coordinates where the user is looking, and the visual gaze follower is moved to that position.

---

## 🚀 How to Use

1.  Open the application in a modern web browser (like Chrome or Firefox).
2.  A prompt will ask for permission to use your camera. Click **Allow**.
3.  Click the **ENABLE WEBCAM** button. You should see your video feed with the face mesh overlaid.
4.  For the best accuracy, click **CALIBRATE GAZE**.
5.  A full-screen calibration interface will appear. Follow the on-screen instructions carefully, looking at each marker as it appears on the screen.
6.  Once calibration is complete, click **Finish**.
7.  Move your eyes around the screen and watch the glowing cursor follow your gaze!

---

## 🛠️ Technology Stack

-   **React** for the user interface.
-   **TypeScript** for robust, type-safe code.
-   **MediaPipe Face Landmarker** for the core computer vision task.
-   **Tailwind CSS** for styling the components.
