"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

const PRESET_AVATARS = [
  { id: "avatar1", name: "Persona A", src: "/avatars/avatar1.svg" },
  { id: "avatar2", name: "Persona B", src: "/avatars/avatar2.svg" },
  { id: "avatar3", name: "Persona C", src: "/avatars/avatar3.svg" },
];

const BACKGROUNDS = [
  { id: "studio", name: "Studio", className: "from-neutral-900 to-neutral-800" },
  { id: "gradient", name: "Gradient", className: "from-fuchsia-700/40 to-cyan-600/30" },
  { id: "night", name: "Night", className: "from-slate-900 to-indigo-950" },
];

export default function HomePage() {
  const [selectedAvatar, setSelectedAvatar] = useState(PRESET_AVATARS[0]);
  const [customFaceUrl, setCustomFaceUrl] = useState("");

  const [text, setText] = useState("");
  const [voice, setVoice] = useState("alloy");
  const [audioUrl, setAudioUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  const [model, setModel] = useState("wav2lip");
  const [emotion, setEmotion] = useState({ happy: 50, sad: 0, angry: 0, surprised: 0, neutral: 50 });
  const [movement, setMovement] = useState({ head: 50, eyes: 50, hands: 20 });
  const [cameraAngle, setCameraAngle] = useState("center");
  const [background, setBackground] = useState(BACKGROUNDS[0]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [outputUrl, setOutputUrl] = useState("");
  const [compositeUrl, setCompositeUrl] = useState("");
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const faceSrc = customFaceUrl || selectedAvatar.src;

  const disableGenerate = useMemo(() => {
    return isGenerating || !(text || audioUrl || videoUrl);
  }, [isGenerating, text, audioUrl, videoUrl]);

  useEffect(() => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const onEnded = () => setIsPlaying(false);
    v.addEventListener("ended", onEnded);
    return () => v.removeEventListener("ended", onEnded);
  }, []);

  async function handleUpload(file) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.url;
  }

  async function onUploadFace(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await handleUpload(file);
    setCustomFaceUrl(url);
  }

  async function onUploadAudio(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await handleUpload(file);
    setAudioUrl(url);
  }

  async function onUploadVideo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await handleUpload(file);
    setVideoUrl(url);
  }

  async function extractAudioFromVideo() {
    if (!videoUrl) return;
    // Use MediaRecorder to capture audio from a hidden video element playback
    const tempVideo = document.createElement("video");
    tempVideo.src = videoUrl;
    tempVideo.crossOrigin = "anonymous";
    tempVideo.muted = false;
    await tempVideo.play().catch(() => {});

    const stream = tempVideo.captureStream();
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      tempVideo.pause();
      throw new Error("No audio track found in video");
    }
    const audioStream = new MediaStream([audioTracks[0]]);

    const chunks = [];
    const rec = new MediaRecorder(audioStream, { mimeType: "audio/webm" });
    const done = new Promise((resolve) => {
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => resolve();
    });
    rec.start();
    tempVideo.onended = () => rec.stop();
    tempVideo.currentTime = 0;
    await tempVideo.play();
    await done;

    const blob = new Blob(chunks, { type: "audio/webm" });
    const file = new File([blob], "extracted.webm", { type: "audio/webm" });
    const url = await handleUpload(file);
    setAudioUrl(url);
  }

  async function generateTTS() {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });
    if (!res.ok) throw new Error("TTS failed. Configure OPENAI_API_KEY or ELEVENLABS_API_KEY.");
    const data = await res.json();
    return data.audioUrl;
  }

  async function generateLipSync({ imageUrl, driveAudioUrl }) {
    const res = await fetch("/api/lipsync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrl,
        audioUrl: driveAudioUrl,
        model,
        emotion,
        movement,
        cameraAngle,
      }),
    });
    if (!res.ok) throw new Error("Lip sync failed. Configure REPLICATE_API_TOKEN.");
    const data = await res.json();
    return data.videoUrl;
  }

  async function onGenerate() {
    setIsGenerating(true);
    setOutputUrl("");
    setCompositeUrl("");
    try {
      let driveAudioUrl = audioUrl;
      if (!driveAudioUrl && text) {
        driveAudioUrl = await generateTTS();
      }
      if (!driveAudioUrl && videoUrl) {
        await extractAudioFromVideo();
        driveAudioUrl = audioUrl; // will be set by extraction
      }

      if (!driveAudioUrl) throw new Error("No audio available");

      const imageUrl = faceSrc;
      const video = await generateLipSync({ imageUrl, driveAudioUrl });
      setOutputUrl(video);
    } catch (e) {
      alert(e.message);
    } finally {
      setIsGenerating(false);
    }
  }

  function onPlayPause() {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      v.pause();
      setIsPlaying(false);
    } else {
      v.play();
      setIsPlaying(true);
    }
  }

  async function onCompositeAndExport(type = "webm") {
    if (!outputUrl) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // 1080p canvas
    canvas.width = 1920;
    canvas.height = 1080;

    const video = document.createElement("video");
    video.src = outputUrl;
    video.crossOrigin = "anonymous";
    await video.play().catch(() => {});

    const bgGradient = background.className;

    let rafId; 
    function draw() {
      // Background
      // We emulate background gradients by drawing a flat color; CSS gradients cannot be drawn directly
      ctx.fillStyle = "#0a0a0a";
      if (bgGradient.includes("fuchsia")) ctx.fillStyle = "#1a1024";
      if (bgGradient.includes("indigo")) ctx.fillStyle = "#0b1020";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw video centered with some camera transform
      const angle = cameraAngle;
      const scale = angle === "close" ? 1.2 : angle === "wide" ? 0.9 : 1.0;
      const w = canvas.width * 0.6 * scale;
      const h = (w * 9) / 16;
      const x = (canvas.width - w) / 2;
      const y = (canvas.height - h) / 2;
      ctx.drawImage(video, x, y, w, h);

      // Simple eye/head movement overlays (decorative)
      ctx.globalAlpha = 0.08 + movement.head / 100 * 0.12;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, 8);
      ctx.fillRect(0, canvas.height - 8, canvas.width, 8);
      ctx.globalAlpha = 1;

      if (!video.paused && !video.ended) rafId = requestAnimationFrame(draw);
    }
    draw();

    const stream = canvas.captureStream(30);
    const audio = video.captureStream().getAudioTracks()[0];
    if (audio) stream.addTrack(audio);
    const mimeType = type === "mp4" ? "video/webm;codecs=vp9" : "video/webm;codecs=vp9";
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 9_000_000 });

    const chunks = [];
    const done = new Promise((resolve) => {
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => resolve();
    });
    rec.start();
    video.onended = () => {
      rec.stop();
      cancelAnimationFrame(rafId);
    };

    video.currentTime = 0;
    await video.play();
    await done;

    const blob = new Blob(chunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    setCompositeUrl(url);

    const a = document.createElement("a");
    a.href = url;
    a.download = `avatar-${Date.now()}.${type === "mp4" ? "webm" : "webm"}`; // mp4 not supported by MediaRecorder everywhere
    a.click();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 grid md:grid-cols-[360px,1fr] gap-6">
      <section className="space-y-6">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <h2 className="text-sm font-semibold mb-3">Avatar</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {PRESET_AVATARS.map((a) => (
              <button key={a.id} onClick={() => {setSelectedAvatar(a); setCustomFaceUrl("");}}
                className={`group relative rounded-lg border ${faceSrc===a.src?"border-fuchsia-500":"border-neutral-800"} bg-neutral-900 hover:bg-neutral-800 p-2`}>
                <Image src={a.src} alt={a.name} width={64} height={64} className="rounded" />
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-neutral-400 opacity-0 group-hover:opacity-100">{a.name}</span>
              </button>
            ))}
          </div>
          <div className="mt-3">
            <label className="text-xs text-neutral-400">Upload custom face</label>
            <input className="mt-1 w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-800 file:px-3 file:py-2 file:text-neutral-200 file:hover:bg-neutral-700" type="file" accept="image/*" onChange={onUploadFace} />
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3">
          <h2 className="text-sm font-semibold">Audio & Voice</h2>
          <textarea className="w-full rounded-md bg-neutral-900 border border-neutral-800 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500" rows={4}
            placeholder="Type text to synthesize or upload audio/video"
            value={text} onChange={(e)=>setText(e.target.value)} />
          <div className="flex items-center gap-2">
            <select className="flex-1 rounded-md bg-neutral-900 border border-neutral-800 p-2 text-sm" value={voice} onChange={(e)=>setVoice(e.target.value)}>
              <option value="alloy">Alloy (OpenAI)</option>
              <option value="elevenlabs/rachel">Rachel (ElevenLabs)</option>
            </select>
            <button onClick={async()=>{ try{ const url=await generateTTS(); setAudioUrl(url);}catch(e){ alert(e.message);} }}
              className="rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 px-3 py-2 text-sm font-medium">Generate TTS</button>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-neutral-400">Upload audio</label>
            <input type="file" accept="audio/*" onChange={onUploadAudio} className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-800 file:px-3 file:py-2 file:text-neutral-200 file:hover:bg-neutral-700" />
            <label className="text-xs text-neutral-400">Upload video (to extract voice)</label>
            <div className="flex gap-2">
              <input type="file" accept="video/*" onChange={onUploadVideo} className="flex-1 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-800 file:px-3 file:py-2 file:text-neutral-200 file:hover:bg-neutral-700" />
              <button onClick={extractAudioFromVideo} disabled={!videoUrl}
                className="rounded-md border border-neutral-700 hover:bg-neutral-800 px-3 py-2 text-sm">Extract audio</button>
            </div>
          </div>
          <div className="text-xs text-neutral-400">Audio: {audioUrl? <a className="text-fuchsia-400 hover:underline" href={audioUrl} target="_blank" rel="noreferrer">ready</a> : "none"}</div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-4">
          <h2 className="text-sm font-semibold">Controls</h2>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(emotion).map(([k,v]) => (
              <div key={k}>
                <label className="text-xs text-neutral-400 capitalize">{k}: {v}</label>
                <input type="range" min={0} max={100} value={v}
                  onChange={(e)=>setEmotion({...emotion, [k]: Number(e.target.value)})} className="w-full" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(movement).map(([k,v]) => (
              <div key={k}>
                <label className="text-xs text-neutral-400 capitalize">{k}: {v}</label>
                <input type="range" min={0} max={100} value={v}
                  onChange={(e)=>setMovement({...movement, [k]: Number(e.target.value)})} className="w-full" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-400">Model</label>
              <select className="w-full rounded-md bg-neutral-900 border border-neutral-800 p-2 text-sm" value={model} onChange={(e)=>setModel(e.target.value)}>
                <option value="wav2lip">Wav2Lip (2D)</option>
                <option value="sadtalker">SadTalker (3D-ish)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-400">Camera</label>
              <select className="w-full rounded-md bg-neutral-900 border border-neutral-800 p-2 text-sm" value={cameraAngle} onChange={(e)=>setCameraAngle(e.target.value)}>
                <option value="center">Center</option>
                <option value="close">Close</option>
                <option value="wide">Wide</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-400">Background</label>
            <div className="flex gap-2 mt-2">
              {BACKGROUNDS.map((bg) => (
                <button key={bg.id} onClick={()=>setBackground(bg)} className={`h-8 w-16 rounded border ${background.id===bg.id?"border-fuchsia-500":"border-neutral-700"} bg-gradient-to-br ${bg.className}`} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 flex flex-col">
        <div className={`relative rounded-xl overflow-hidden bg-gradient-to-br ${background.className} aspect-video`}> 
          {!outputUrl && (
            <div className="absolute inset-0 grid place-items-center text-center p-6">
              <div className="space-y-3">
                <div className="mx-auto w-32 h-32 relative">
                  <Image src={faceSrc} alt="face" fill className="object-contain rounded-lg" />
                </div>
                <p className="text-sm text-neutral-300">Prepare audio and click Generate to create a lip-synced video.</p>
              </div>
            </div>
          )}
          {outputUrl && (
            <video ref={videoRef} src={outputUrl} className="absolute inset-0 h-full w-full object-contain" controls />
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={onGenerate} disabled={disableGenerate}
            className="rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 px-4 py-2 text-sm font-medium">{isGenerating?"Generating...":"Generate / Regenerate"}</button>
          <button onClick={onPlayPause} disabled={!outputUrl}
            className="rounded-md border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50 px-4 py-2 text-sm">{isPlaying?"Pause":"Play"}</button>
          <button onClick={()=>onCompositeAndExport("webm")} disabled={!outputUrl}
            className="rounded-md border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50 px-4 py-2 text-sm">Export WebM (1080p)</button>
        </div>
        <canvas ref={canvasRef} className="hidden" />
        {compositeUrl && (
          <div className="mt-2 text-xs text-neutral-400">Composite ready.</div>
        )}
      </section>
    </div>
  );
}
