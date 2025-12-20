import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Replicate from 'replicate';

dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const port = 3001;

// Increase limit to accept images
app.use(express.json({ limit: '50mb' }));
app.use(cors());

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

console.log('------------------------------------------------');
console.log('Server starting...');
console.log('Replicate Token Present:', !!process.env.REPLICATE_API_TOKEN);
if (process.env.REPLICATE_API_TOKEN) {
    console.log('Token starts with:', process.env.REPLICATE_API_TOKEN.substring(0, 5) + '...');
} else {
    console.error('CRITICAL WARNING: No Replicate Token found in env!');
}
console.log('------------------------------------------------');

// Simple in-memory rate limiter
const rateLimitMap = new Map();
const MAX_DAILY_GENERATIONS = 4;

const rateLimiter = (req, res, next) => {
    // Rate limiting disabled for development/debugging
    return next();

    // Original logic preserved below:
    /*
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const today = new Date().toISOString().split('T')[0];
  
    const userRecord = rateLimitMap.get(ip);
  
    if (userRecord && userRecord.date === today) {
      if (userRecord.count >= MAX_DAILY_GENERATIONS) {
        return res.status(429).json({ error: 'Daily limit reached. Please come back tomorrow!' });
      }
      userRecord.count++;
    } else {
      rateLimitMap.set(ip, { date: today, count: 1 });
    }
  
    next();
    */
};

app.post('/api/generate', rateLimiter, async (req, res) => {
    try {
        const { image, modifiers } = req.body;

        // Construct prompt based on modifiers
        let featureDescription = "";
        let featureKeywords = "";

        const selectedMode = modifiers && modifiers.length > 0 ? modifiers[0] : null;

        if (selectedMode === 'Cuban Chain') {
            featureDescription = "wearing a thick cuban chain necklace, featuring sparkling diamond grills for teeth and subtle white glowing eyes";
            featureKeywords = "cuban chain, silver link chain, diamond grills, sparkling teeth, glowing white eyes";
        } else if (selectedMode === 'Cuban Chain + Diamond Cross') {
            featureDescription = "wearing a thick cuban chain necklace with a large glowing diamond cross pendant, featuring sparkling diamond grills for teeth and subtle white glowing eyes";
            featureKeywords = "cuban chain, diamond cross, glowing pendant, sparkling diamonds, diamond grills, sparkling teeth, glowing white eyes";
        }

        // Fallback or default if nothing selected (though UI restricts it, good for safety to have defaults)
        if (!featureDescription) {
            featureDescription = "featuring sparkling diamond grills for teeth and subtle white glowing eyes";
            featureKeywords = "diamond grills, sparkling teeth, glowing white eyes";
        }

        const prompt = `Create me a darkened black and white picture of this character ${featureDescription}. The character should resemble sort of a silhouette figure. High contrast monochrome aesthetic, deep shadows, dramatic lighting, mysterious atmosphere, silhouette form with glowing elements, ${featureKeywords}, noir style, cinematic black and white photography, ultra detailed, 8k`;

        if (!image) return res.status(400).json({ error: 'Image is required' });

        console.log('Generating with Google Nano Banana Pro (Gemini)...');
        console.log('Type of input sending to Replicate:', Array.isArray([image]) ? 'ARRAY (Correct)' : 'STRING (Error)');

        // Manual fetch to ensure control over the input format
        // Switched to google/nano-banana as requested by user
        const model = "google/nano-banana";

        // Ensure image is properly formatted data URI or URL
        // If it's a raw base64 without prefix, add it (though Replicate usually handles it, better safe)
        let processedImage = image;

        // Log the start of the image string for debugging
        console.log('Image input start:', processedImage.substring(0, 50));

        const response = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.REPLICATE_API_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                input: {
                    image_input: [processedImage], // Model expects 'image_input' as an array
                    prompt: prompt,
                    output_format: "jpg"
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('SERVER ERROR DETAIL:', error);
            return res.status(response.status).json({ error: 'Failed to generate image', details: error });
        }

        let prediction = await response.json();
        console.log("Prediction created:", prediction.id);

        // Poll for result
        while (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled") {
            await new Promise(r => setTimeout(r, 1000));
            const statusRes = await fetch(prediction.urls.get, {
                headers: {
                    "Authorization": `Bearer ${process.env.REPLICATE_API_TOKEN}`,
                }
            });
            prediction = await statusRes.json();
        }

        if (prediction.status !== "succeeded") {
            console.error("Prediction failed:", prediction.error);
            return res.status(500).json({ error: "Prediction failed", details: prediction.error });
        }

        const output = prediction.output;
        console.log('Generation complete:', output);

        // Handle return (URL or array)
        const resultUrl = Array.isArray(output) ? output[0] : output;
        res.json({ result: resultUrl });

    } catch (error) {
        console.error('SERVER ERROR DETAIL:', error);
        res.status(500).json({ error: 'Failed to generate image', details: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
