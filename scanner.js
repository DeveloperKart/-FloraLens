
const MODEL_URL = "https://teachablemachine.withgoogle.com/models/mIiK1Xitk/";

const CONFIDENCE_THRESHOLD = 0.85;
const REQUIRED_STABLE_FRAMES = 5;
const CAMERA_WIDTH = 400;
const CAMERA_HEIGHT = 400;

// Plant and weed information
const classInfo = {
    tulsi: {
        name: "Tulsi",
        type: "Medicinal Plant",
        benefits: [
            "Benefit 1: Tulsi leaves are traditionally used in herbal preparations for coughs and colds, although evidence for treating these conditions is limited.",
            "Benefit 2: Tulsi contains plant compounds with antioxidant activity demonstrated in laboratory studies."
        ]
    },

    bryophyllumpinnatum: {
        name: "Bryophyllum pinnatum",
        type: "Medicinal Plant",
        benefits: [
            "Benefit 1: It is grown as an ornamental succulent and can be propagated using plantlets along its leaf margins.",
            "Benefit 2: It is studied by researchers for potentially useful plant compounds, including antioxidant activity; its medicinal effectiveness in humans is not well established."
        ]
    },

    aloevera: {
        name: "Aloe Vera",
        type: "Medicinal Plant",
        benefits: [
            "Benefit 1: Aloe vera gel can help soothe and moisturize dry skin.",
            "Benefit 2: Certain aloe vera gel products may help soothe minor skin irritation and burns, although evidence varies by use and product."
        ]
    },

    crabgrass: {
        name: "Crab Grass",
        type: "Common Weed",
        benefits: [
            "Crab grass is a common grass weed found in lawns, gardens, fields, and along roadsides.",
            "It grows quickly and can compete with nearby plants for water, nutrients, sunlight, and space."
        ]
    },

    backgroundnoise: {
        name: "Background / Noise",
        type: "Unrecognized Object",
        benefits: []
    }
};

// Elements from scanner.html
const camera = document.getElementById("camera");
const statusElement = document.getElementById("status");
const resultElement = document.getElementById("result");
const detailsElement = document.getElementById("details");
const predictionsElement = document.getElementById("predictions");
const confidenceInfo = document.getElementById("confidenceInfo");

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const voiceBtn = document.getElementById("voiceBtn");

let model = null;
let webcam = null;
let animationFrame = null;
let isRunning = false;
let isLoading = false;

let voiceEnabled = true;
let stableLabel = "";
let stableFrames = 0;
let lastDisplayedLabel = "";
let lastSpokenLabel = "";
let lastSpokenTime = 0;

// Convert model labels into comparable keys.
// Example: "Crab Grass (Weed)" -> "crabgrass"
function normaliseLabel(label) {
    return String(label || "")
        .toLowerCase()
        .trim()
        .replace(/\s*\([^)]*\)/g, "")
        .replace(/[^a-z0-9]/g, "");
}

// Match Teachable Machine labels to our information database.
function getClassInfo(label) {
    const key = normaliseLabel(label);

    const aliases = {
        tulsi: "tulsi",
        holybasil: "tulsi",

        bryophyllum: "bryophyllumpinnatum",
        bryophyllumpinnatum: "bryophyllumpinnatum",
        brophyllumpinnatum: "bryophyllumpinnatum",

        aloe: "aloevera",
        aloevera: "aloevera",

        crabgrass: "crabgrass",

        background: "backgroundnoise",
        backgroundnoise: "backgroundnoise",
        noise: "backgroundnoise"
    };

    const matchedKey = aliases[key] || key;
    return classInfo[matchedKey] || null;
}

// Update the page status safely.
function setStatus(message) {
    if (statusElement) {
        statusElement.textContent = message;
    }
}

// Update the voice button.
function updateVoiceButton() {
    if (!voiceBtn) return;

    voiceBtn.textContent = voiceEnabled
        ? "Voice: ON"
        : "Voice: OFF";

    voiceBtn.setAttribute(
        "aria-pressed",
        String(voiceEnabled)
    );
}

// Stop any ongoing speech.
function stopSpeech() {
    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }
}

// Read the recognized plant or weed information.
function speakResult(info, labelKey) {
    if (!voiceEnabled || !("speechSynthesis" in window)) {
        return;
    }

    const now = Date.now();

    // Avoid repeatedly announcing the same result.
    if (
        labelKey === lastSpokenLabel &&
        now - lastSpokenTime < 10000
    ) {
        return;
    }

    stopSpeech();

    const message = info.name === "Background / Noise"
        ? "No supported plant or weed recognized."
        : `${info.name}. ${info.type}. ${info.benefits.join(" ")}`;

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "en-IN";
    utterance.rate = 0.95;
    utterance.pitch = 1;

    lastSpokenLabel = labelKey;
    lastSpokenTime = now;

    window.speechSynthesis.speak(utterance);
}

// Display the final recognized result.
function displayResult(label, confidence) {
    const info = getClassInfo(label);

    if (!info) {
        console.warn("No information found for model class:", label);

        if (resultElement) {
            resultElement.textContent = label;
        }

        if (detailsElement) {
            detailsElement.textContent =
                "Information for this class has not been configured.";
        }

        lastDisplayedLabel = "";
        return;
    }

    const labelKey = normaliseLabel(info.name);

    if (resultElement) {
        resultElement.textContent = info.name;
    }

    if (detailsElement) {
        if (info.name === "Background / Noise") {
            detailsElement.textContent =
                "Benefits will appear here if any medicinal plant is recognized.";
        } else {
            detailsElement.textContent =
                `${info.type}\n\n${info.benefits.join("\n\n")}`;
        }
    }

    if (confidenceInfo) {
        confidenceInfo.textContent =
            `Confidence: ${(confidence * 100).toFixed(1)}%`;
    }

    // Announce only when the recognized class changes.
    if (labelKey !== lastDisplayedLabel) {
        lastDisplayedLabel = labelKey;
        speakResult(info, labelKey);
    }
}

// Display model predictions and confidence bars.
function updatePredictions(predictions) {
    if (!predictionsElement) return;

    predictionsElement.innerHTML = "";

    predictions.forEach((prediction) => {
        const percentage = Math.max(
            0,
            Math.min(100, prediction.probability * 100)
        );

        const row = document.createElement("div");
        row.className = "prediction-row";

        const heading = document.createElement("div");
        heading.className = "prediction-heading";

        const name = document.createElement("span");
        name.textContent = prediction.className;

        const score = document.createElement("span");
        score.textContent = `${percentage.toFixed(1)}%`;

        heading.appendChild(name);
        heading.appendChild(score);

        const track = document.createElement("div");
        track.className = "confidence-track";

        const bar = document.createElement("div");
        bar.className = "confidence-bar";
        bar.style.width = `${percentage}%`;

        track.appendChild(bar);
        row.appendChild(heading);
        row.appendChild(track);

        predictionsElement.appendChild(row);
    });
}

// Find the strongest prediction and require stable frames.
async function processPredictions() {
    if (!isRunning || !model || !webcam) return;

    try {
        await webcam.update();

        const predictions = await model.predict(webcam.canvas);

        if (!isRunning) return;

        updatePredictions(predictions);

        const bestPrediction = predictions.reduce(
            (best, current) =>
                current.probability > best.probability
                    ? current
                    : best,
            predictions[0]
        );

        if (!bestPrediction) {
            setStatus("Waiting for a prediction...");
            return;
        }

        const predictedInfo = getClassInfo(bestPrediction.className);

        console.debug("FloraLens prediction:", {
            modelClass: bestPrediction.className,
            matchedClass: predictedInfo
                ? predictedInfo.name
                : "NO MATCH",
            confidence: (
                bestPrediction.probability * 100
            ).toFixed(2) + "%"
        });

        // Require the prediction to meet the confidence threshold.
        if (bestPrediction.probability < CONFIDENCE_THRESHOLD) {
            stableLabel = "";
            stableFrames = 0;

            setStatus("Plant not recognized confidently. Try moving closer.");

            if (confidenceInfo) {
                confidenceInfo.textContent =
                    `Best confidence: ${(bestPrediction.probability * 100).toFixed(1)}%`;
            }

            animationFrame = requestAnimationFrame(processPredictions);
            return;
        }

        const currentKey = normaliseLabel(bestPrediction.className);

        // Reset the counter whenever the predicted class changes.
        if (currentKey === stableLabel) {
            stableFrames++;
        } else {
            stableLabel = currentKey;
            stableFrames = 1;
        }

        setStatus(
            `Analyzing ${bestPrediction.className}... ` +
            `(${Math.min(stableFrames, REQUIRED_STABLE_FRAMES)}/${REQUIRED_STABLE_FRAMES})`
        );

        if (stableFrames >= REQUIRED_STABLE_FRAMES) {
            if (predictedInfo) {
                displayResult(
                    bestPrediction.className,
                    bestPrediction.probability
                );

                setStatus(`${predictedInfo.name} recognized successfully.`);
            } else {
                // Do not falsely display an unknown class as a known plant.
                if (resultElement) {
                    resultElement.textContent = "Unknown Class";
                }

                if (detailsElement) {
                    detailsElement.textContent =
                        `The model predicted "${bestPrediction.className}", ` +
                        "but this class has no matching information in FloraLens.";
                }

                setStatus("Model class needs to be configured.");
            }
        }

    } catch (error) {
        console.error("Prediction error:", error);
        setStatus("Prediction error. Please restart the scanner.");
    }

    if (isRunning) {
        animationFrame = requestAnimationFrame(processPredictions);
    }
}

// Start the camera and load the model.
async function startScanner() {
    if (isRunning || isLoading) return;

    isLoading = true;

    if (startBtn) startBtn.disabled = true;

    setStatus("Loading FloraLens AI model...");

    try {
        if (
            typeof tmImage === "undefined" ||
            !tmImage.Webcam ||
            !tmImage.load
        ) {
            throw new Error(
                "Teachable Machine library not loaded. Check scanner.html script tags."
            );
        }

        const modelURL = MODEL_URL + "model.json";
        const metadataURL = MODEL_URL + "metadata.json";

        model = await tmImage.load(modelURL, metadataURL);

        webcam = new tmImage.Webcam(
            CAMERA_WIDTH,
            CAMERA_HEIGHT,
            true
        );

        await webcam.setup();
        await webcam.play();

        if (!camera) {
            throw new Error('Canvas element with ID "camera" was not found.');
        }

        camera.width = CAMERA_WIDTH;
        camera.height = CAMERA_HEIGHT;

        isRunning = true;

        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;

        setStatus("Camera ready. Point it at a plant or weed.");

        if (resultElement) {
            resultElement.textContent = "Waiting for a plant...";
        }

        if (detailsElement) {
            detailsElement.textContent =
                "Keep the plant centered and ensure it is well lit.";
        }

        if (confidenceInfo) {
            confidenceInfo.textContent =
                "Waiting for prediction...";
        }

        lastDisplayedLabel = "";
        stableLabel = "";
        stableFrames = 0;

        processPredictions();

    } catch (error) {
        console.error("Unable to start FloraLens:", error);

        setStatus(
            "Could not start the scanner. Allow camera access and try again."
        );

        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;

        if (webcam) {
            try {
                webcam.stop();
            } catch (stopError) {
                console.warn("Camera cleanup issue:", stopError);
            }
        }

        webcam = null;
        model = null;
        isRunning = false;

    } finally {
        isLoading = false;
    }
}

// Stop the camera and prediction loop.
function stopScanner() {
    isRunning = false;

    if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }

    if (webcam) {
        try {
            webcam.stop();
        } catch (error) {
            console.warn("Camera stop issue:", error);
        }
    }

    webcam = null;

    stopSpeech();

    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;

    setStatus("Scanner stopped. Press Start Scanner to scan again.");
}

// Toggle voice output.
function toggleVoice() {
    voiceEnabled = !voiceEnabled;

    updateVoiceButton();

    if (!voiceEnabled) {
        stopSpeech();
        setStatus("Voice output is off.");
    } else {
        setStatus("Voice output is on.");
    }
}

// Connect the page buttons.
if (startBtn) {
    startBtn.addEventListener("click", startScanner);
}

if (stopBtn) {
    stopBtn.addEventListener("click", stopScanner);
    stopBtn.disabled = true;
}

if (voiceBtn) {
    voiceBtn.addEventListener("click", toggleVoice);
}

updateVoiceButton();

console.log("FloraLens scanner.js loaded successfully.");
