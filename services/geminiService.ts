import { GoogleGenAI } from "@google/genai";
import { MODEL_NAMES } from "../constants";

export const generatePattern = async (prompt: string): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  const ai = new GoogleGenAI({ apiKey });
  
  const finalPrompt = `Create a vibrant, high-contrast, colorful bookmark pattern design. 
  Style: ${prompt}. 
  Constraints: Vertical aspect ratio (roughly 1:3). Minimalist, vector-art style, suitable for 4-color 3D printing. 
  Colors: Use bright, saturated colors. Avoid dark backgrounds, pastels, or muted tones.
  No gradients, clear separation of colors.`;

  // Using generateContent with gemini-2.5-flash-image for image generation
  const response = await ai.models.generateContent({
    model: MODEL_NAMES.IMAGE_GEN,
    contents: {
        parts: [{ text: finalPrompt }]
    }
  });

  // Extract image
  const candidates = response.candidates;
  if (candidates && candidates.length > 0) {
      const parts = candidates[0].content.parts;
      for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
              return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          }
      }
  }
  
  throw new Error("No image generated");
};