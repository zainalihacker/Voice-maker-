/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  Mic, 
  Play, 
  Download, 
  Scan, 
  Volume2, 
  Settings, 
  History, 
  Trash2, 
  Copy, 
  Check, 
  Camera,
  Loader2,
  AlertCircle,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Available voices for gemini-2.5-flash-preview-tts
const VOICES = [
  { id: "Puck", name: "Puck", gender: "Male", description: "Deep and resonant" },
  { id: "Charon", name: "Charon", gender: "Male", description: "Smooth and professional" },
  { id: "Kore", name: "Kore", gender: "Female", description: "Bright and clear" },
  { id: "Fenrir", name: "Fenrir", gender: "Male", description: "Strong and authoritative" },
  { id: "Zephyr", name: "Zephyr", gender: "Female", description: "Soft and airy" },
];

// Styles to simulate more voices/variations
const STYLES = [
  "Normal", "Cheerful", "Sad", "Angry", "Excited", "Whispering", "Professional", "Storyteller", "Robotic", "Friendly"
];

export default function App() {
  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState(VOICES[2].id); // Default to Kore
  const [selectedStyle, setSelectedStyle] = useState("Normal");
  const [pitch, setPitch] = useState(1.0);
  const [speed, setSpeed] = useState(1.0);
  const [intonation, setIntonation] = useState(50);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: string; text: string; voice: string; date: Date; url: string }[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const generateVoice = async () => {
    if (!text.trim()) {
      setError("Please enter some text first.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      // Construct a detailed prompt for the TTS model to follow customization parameters
      const customizationInstructions = [
        selectedStyle !== "Normal" ? `in a ${selectedStyle.toLowerCase()} style` : "",
        speed !== 1.0 ? `at ${speed}x speed` : "",
        pitch !== 1.0 ? `with a ${pitch > 1.0 ? "higher" : "lower"} pitch (${pitch}x)` : "",
        intonation !== 50 ? `with ${intonation > 50 ? "high" : "low"} emotional intonation` : ""
      ].filter(Boolean).join(", ");

      const prompt = customizationInstructions 
        ? `Say ${customizationInstructions}: ${text}`
        : text;

      console.log("Generating voice for prompt:", prompt);
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice },
            },
          },
        },
      });

      console.log("TTS Response:", response);

      const candidate = response.candidates?.[0];
      
      if (candidate?.finishReason && !["STOP", "MAX_TOKENS"].includes(candidate.finishReason)) {
        throw new Error(`Generation blocked or failed: ${candidate.finishReason}`);
      }

      let base64Audio = null;
      // Iterate through parts to find audio data
      candidate?.content?.parts?.forEach(part => {
        if (part.inlineData?.data && part.inlineData.mimeType?.includes("audio")) {
          base64Audio = part.inlineData.data;
        } else if (part.inlineData?.data) {
          // Fallback if mimeType is missing but data is present
          base64Audio = part.inlineData.data;
        }
      });

      if (base64Audio) {
        const audioBlob = await fetch(`data:audio/wav;base64,${base64Audio}`).then(r => r.blob());
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        
        // Add to history
        setHistory(prev => [
          { 
            id: Math.random().toString(36).substr(2, 9), 
            text: text.length > 50 ? text.substring(0, 50) + "..." : text, 
            voice: selectedVoice, 
            date: new Date(),
            url 
          }, 
          ...prev
        ]);
      } else {
        // Check if there's a text response instead (maybe an error message from the model)
        const textResponse = response.text;
        if (textResponse) {
          throw new Error(`Model returned text instead of audio: ${textResponse}`);
        }
        throw new Error("No audio data received from the model. The prompt might have been filtered or the service is temporarily unavailable.");
      }
    } catch (err: any) {
      console.error("Error generating voice:", err);
      setError(err.message || "Failed to generate voice. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleScanImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(",")[1];
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: {
            parts: [
              { inlineData: { data: base64Data, mimeType: file.type } },
              { text: "Extract all the text from this image. Only return the extracted text, nothing else." }
            ]
          }
        });

        if (response.text) {
          setText(response.text);
        } else {
          throw new Error("Could not extract text from the image.");
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error("Error scanning image:", err);
      setError("Failed to scan image. Please try again.");
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadAudio = () => {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = `voice_${Date.now()}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Volume2 className="text-black w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight">AI Voice Maker</h1>
              <p className="text-[10px] uppercase tracking-widest text-emerald-500 font-bold">Powered by Zainali</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-white/5 rounded-full transition-colors">
              <Settings className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Input & Controls */}
        <div className="lg:col-span-8 space-y-6">
          {/* Text Input Section */}
          <section className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                Input Text
              </h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setText("")}
                  className="p-2 hover:bg-white/5 rounded-lg text-zinc-500 transition-colors"
                  title="Clear text"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={copyToClipboard}
                  className="p-2 hover:bg-white/5 rounded-lg text-zinc-500 transition-colors"
                  title="Copy text"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            
            <div className="relative">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type or paste your text here, or scan an image..."
                className="w-full h-64 bg-black/30 border border-white/10 rounded-2xl p-4 text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all resize-none placeholder:text-zinc-700"
              />
              
              <div className="absolute bottom-4 right-4 flex gap-2">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleScanImage} 
                  accept="image/*" 
                  className="hidden" 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isScanning}
                  className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                >
                  {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  Scan Image
                </button>
              </div>
            </div>
          </section>

          {/* Voice & Style Selection */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
              <h3 className="text-sm font-semibold text-zinc-400 mb-4 flex items-center gap-2">
                <Mic className="w-4 h-4 text-emerald-500" />
                Select Voice
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {VOICES.map((voice) => (
                  <button
                    key={voice.id}
                    onClick={() => setSelectedVoice(voice.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      selectedVoice === voice.id 
                        ? "bg-emerald-500/10 border-emerald-500 text-white" 
                        : "bg-black/20 border-white/5 text-zinc-500 hover:border-white/20"
                    }`}
                  >
                    <div className="text-left">
                      <p className="font-semibold text-sm">{voice.name}</p>
                      <p className="text-[10px] opacity-60">{voice.gender} • {voice.description}</p>
                    </div>
                    {selectedVoice === voice.id && <Check className="w-4 h-4 text-emerald-500" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
              <h3 className="text-sm font-semibold text-zinc-400 mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                Voice Style
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {STYLES.map((style) => (
                  <button
                    key={style}
                    onClick={() => setSelectedStyle(style)}
                    className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                      selectedStyle === style 
                        ? "bg-emerald-500/10 border-emerald-500 text-white" 
                        : "bg-black/20 border-white/5 text-zinc-500 hover:border-white/20"
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Voice Customization Sliders */}
          <section className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
            <h3 className="text-sm font-semibold text-zinc-400 mb-6 flex items-center gap-2">
              <Settings className="w-4 h-4 text-emerald-500" />
              Voice Customization
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Pitch Slider */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-zinc-500">Pitch</label>
                  <span className="text-xs font-bold text-emerald-500">{pitch.toFixed(1)}x</span>
                </div>
                <input 
                  type="range" 
                  min="0.5" 
                  max="2.0" 
                  step="0.1" 
                  value={pitch} 
                  onChange={(e) => setPitch(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-600">
                  <span>Deep</span>
                  <span>Normal</span>
                  <span>High</span>
                </div>
              </div>

              {/* Speed Slider */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-zinc-500">Speed</label>
                  <span className="text-xs font-bold text-emerald-500">{speed.toFixed(2)}x</span>
                </div>
                <input 
                  type="range" 
                  min="0.25" 
                  max="2.0" 
                  step="0.05" 
                  value={speed} 
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-600">
                  <span>Slow</span>
                  <span>Normal</span>
                  <span>Fast</span>
                </div>
              </div>

              {/* Intonation Slider */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-zinc-500">Intonation</label>
                  <span className="text-xs font-bold text-emerald-500">{intonation}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  step="1" 
                  value={intonation} 
                  onChange={(e) => setIntonation(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-600">
                  <span>Flat</span>
                  <span>Normal</span>
                  <span>Expressive</span>
                </div>
              </div>
            </div>
          </section>

          {/* Action Button */}
          <button
            onClick={generateVoice}
            disabled={isGenerating || !text.trim()}
            className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-2xl font-bold text-black text-lg shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                Generating Magic...
              </>
            ) : (
              <>
                <Play className="w-6 h-6 fill-current" />
                Generate AI Voice
              </>
            )}
          </button>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-500/10 border border-red-500/50 rounded-2xl flex items-center gap-3 text-red-400 text-sm"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              {error}
            </motion.div>
          )}

          {/* Audio Player Section */}
          <AnimatePresence>
            {audioUrl && (
              <motion.section 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-6"
              >
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/40">
                    <Volume2 className="text-black w-8 h-8" />
                  </div>
                  <div className="flex-1 w-full space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold">Generated Voice</h4>
                        <p className="text-xs text-zinc-500">{selectedVoice} • {selectedStyle}</p>
                      </div>
                      <button 
                        onClick={downloadAudio}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-xl text-sm font-bold hover:bg-zinc-200 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Download Free
                      </button>
                    </div>
                    <audio ref={audioRef} src={audioUrl} controls className="w-full h-10 accent-emerald-500" />
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column: History & Stats */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6 h-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-semibold text-zinc-400 flex items-center gap-2">
                <History className="w-4 h-4 text-emerald-500" />
                Recent History
              </h3>
              <span className="text-[10px] bg-zinc-800 px-2 py-1 rounded-full text-zinc-500">
                {history.length} Items
              </span>
            </div>

            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
              {history.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <History className="w-6 h-6 text-zinc-600" />
                  </div>
                  <p className="text-zinc-500 text-sm">No history yet</p>
                </div>
              ) : (
                history.map((item) => (
                  <div 
                    key={item.id} 
                    className="p-4 bg-black/20 border border-white/5 rounded-2xl hover:border-white/10 transition-all group"
                  >
                    <p className="text-sm text-zinc-300 mb-2 line-clamp-2">{item.text}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full font-medium">
                          {item.voice}
                        </span>
                        <span className="text-[10px] text-zinc-600">
                          {item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => {
                            setAudioUrl(item.url);
                            setTimeout(() => audioRef.current?.play(), 100);
                          }}
                          className="p-1.5 hover:bg-emerald-500/20 rounded-lg text-emerald-500 transition-colors"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                        <button 
                          onClick={() => {
                            const a = document.createElement("a");
                            a.href = item.url;
                            a.download = `voice_${item.id}.wav`;
                            a.click();
                          }}
                          className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-12 border-t border-white/5 mt-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-zinc-500 text-sm">
          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-emerald-500" />
            <span className="font-bold text-white">Zainali AI</span>
            <span className="opacity-50">© 2026 All rights reserved.</span>
          </div>
          <div className="flex items-center gap-8">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">API Docs</a>
          </div>
          <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-500 font-bold text-[10px] uppercase tracking-widest">
            Fast & Free AI Generation
          </div>
        </div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
