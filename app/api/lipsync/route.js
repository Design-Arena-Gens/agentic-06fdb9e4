import Replicate from "replicate";

export const maxDuration = 300;
export const runtime = "nodejs";

const MODELS = {
  wav2lip: "cjwbw/wav2lip:8d707c8e8d2f5ab4b7d4b5a536f8f9c7b9db0f8da8b0c4b8b5e4c6a7b9d5e5a1", // fallback hash may be outdated
  sadtalker: "fofr/sadtalker:3f0b3d836efc0fbf8a79cbceaaee8c5a3d63d6b6b8a3b1f2e1b0a0e9c8d7f6e1",
};

export async function POST(req) {
  try {
    const { imageUrl, audioUrl, model = "wav2lip", emotion = {}, movement = {}, cameraAngle = "center" } = await req.json();
    if (!imageUrl || !audioUrl) return new Response(JSON.stringify({ error: "imageUrl and audioUrl required" }), { status: 400 });

    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
    const m = (model === "sadtalker" ? MODELS.sadtalker : MODELS.wav2lip) || MODELS.sadtalker;

    let outputUrl = null;

    if (m === MODELS.wav2lip) {
      // Try Wav2Lip; if it fails, fallback to SadTalker
      try {
        const result = await replicate.run(m, {
          input: {
            face: imageUrl,
            audio: audioUrl,
            pads: 0,
            nosmooth: false,
          },
        });
        // result could be a URL string or array
        outputUrl = Array.isArray(result) ? result[result.length - 1] : result;
      } catch (_) {
        // Fallback to SadTalker
      }
    }

    if (!outputUrl) {
      const expressionScale = Math.min(2.0, Math.max(0.5, (emotion.happy || 50) / 50));
      const pose = cameraAngle === "close" ? "yaw=0,pitch=0,roll=0,scale=1.1" : cameraAngle === "wide" ? "scale=0.9" : "";
      const result = await replicate.run(MODELS.sadtalker, {
        input: {
          source_image: imageUrl,
          driven_audio: audioUrl,
          preprocess: "full",
          enhancer: false,
          expression_scale: expressionScale,
          pose: pose,
          batch_size: 1,
          still_mode: false,
        },
      });
      outputUrl = Array.isArray(result) ? result[result.length - 1] : result;
    }

    if (!outputUrl) throw new Error("No video output from model");

    return new Response(JSON.stringify({ videoUrl: outputUrl }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
