
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Deepgram Transcription ──────────────────────────────────────────────
async function transcribeVideo(
  videoUrl: string,
  deepgramKey: string
): Promise<{ transcript: string; duration: number; segments: { start: number; end: number; text: string }[]; words: any[] }> {
  // STEP 4 -- ADD DEBUG LOGGING
  console.log("[transcribe] downloading video locally");

  // STEP 1 -- DOWNLOAD VIDEO INSIDE EDGE FUNCTION
  const response = await fetch(videoUrl);
  if (response.status !== 200) {
    throw new Error(`Video fetch failed with status ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  console.log(`[transcribe] video size = ${buffer.byteLength} bytes`);

  if (buffer.byteLength < 10000) {
    throw new Error("Video fetch failed or empty");
  }

  // STEP 2 -- SEND RAW BYTES TO DEEPGRAM
  console.log("[transcribe] sending binary to Deepgram");

  // STEP 1 -- ENABLE WORD TIMESTAMPS IN DEEPGRAM REQUEST
  const deepgramRes = await fetch("https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&utterances=true&words=true", {
    method: "POST",
    headers: {
      "Authorization": `Token ${deepgramKey}`,
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(buffer),
  });

  // STEP 3 -- PARSE RESPONSE SAFELY
  const json = await deepgramRes.json();

  const transcript = json?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
  const duration = json?.metadata?.duration || 0;

  console.log(`[transcribe] Deepgram duration = ${duration}`);
  console.log(`[transcribe] transcript length = ${transcript.length}`);

  if (!transcript || transcript.trim() === "") {
    console.log("[transcribe] Full Deepgram response:", JSON.stringify(json));
    console.log(`[transcribe] Metadata duration: ${json?.metadata?.duration}`);
    throw new Error("Deepgram returned empty transcript");
  }

  // STEP 3 -- BUILD STRUCTURED TRANSCRIPT
  // Extract word timestamps
  const words = json.results?.channels?.[0]?.alternatives?.[0]?.words || [];
  let segments: { start: number; end: number; text: string }[] = [];

  if (words.length > 0) {
    // Group words into chunks of 5-8 words per segment
    // This provides better granularity for viral moment detection than whole sentences sometimes
    const CHUNK_SIZE = 8;
    for (let i = 0; i < words.length; i += CHUNK_SIZE) {
      const chunk = words.slice(i, i + CHUNK_SIZE);
      const start = chunk[0].start;
      const end = chunk[chunk.length - 1].end;
      const text = chunk.map((w: any) => w.punctuated_word || w.word).join(" ");

      segments.push({ start, end, text });
    }
  } else {
    // Fallback if no words found but transcript exists
    console.log("[transcribe] No word timestamps found, using single segment fallback");
    segments = [{ start: 0, end: duration, text: transcript }];
  }

  // STEP 6 -- RETURN STRUCTURED RESULT
  return {
    transcript: transcript,
    duration: duration,
    segments: segments,
    words: words
  };
}

// ── Caption Generation Helpers ──────────────────────────────────────────

interface CaptionSegment {
  start: number;
  end: number;
  text: string;
  words: { word: string; start: number; end: number }[];
}

function generateCaptions(words: any[]): CaptionSegment[] {
  const captions: CaptionSegment[] = [];
  let currentCaption: any[] = [];
  let currentDuration = 0;

  for (const w of words) {
    currentCaption.push(w);
    const duration = w.end - currentCaption[0].start;

    // Rules: 3-6 words OR > 2.5s duration
    if (currentCaption.length >= 6 || duration > 2.5 || (w.word.match(/[.!?]$/) && currentCaption.length >= 3)) {
      captions.push({
        start: currentCaption[0].start,
        end: currentCaption[currentCaption.length - 1].end,
        text: currentCaption.map((cw) => cw.punctuated_word || cw.word).join(" "),
        words: currentCaption
      });
      currentCaption = [];
    }
  }

  // Flush remaining
  if (currentCaption.length > 0) {
    captions.push({
      start: currentCaption[0].start,
      end: currentCaption[currentCaption.length - 1].end,
      text: currentCaption.map((cw) => cw.punctuated_word || cw.word).join(" "),
      words: currentCaption
    });
  }

  return captions;
}

function formatTimestamp(seconds: number, isVtt: boolean = false): string {
  const date = new Date(0);
  date.setMilliseconds(seconds * 1000);
  const hh = date.getUTCHours().toString().padStart(2, "0");
  const mm = date.getUTCMinutes().toString().padStart(2, "0");
  const ss = date.getUTCSeconds().toString().padStart(2, "0");
  const ms = date.getUTCMilliseconds().toString().padStart(3, "0");

  if (isVtt) {
    return `${hh}:${mm}:${ss}.${ms}`;
  } else {
    return `${hh}:${mm}:${ss},${ms}`;
  }
}

function buildSRT(captions: CaptionSegment[]): string {
  return captions.map((c, i) => {
    return `${i + 1}\n${formatTimestamp(c.start)} --> ${formatTimestamp(c.end)}\n${c.text}\n`;
  }).join("\n");
}

function buildVTT(captions: CaptionSegment[]): string {
  return "WEBVTT\n\n" + captions.map((c) => {
    return `${formatTimestamp(c.start, true)} --> ${formatTimestamp(c.end, true)}\n${c.text}\n`;
  }).join("\n");
}

// ── Viral Moment Detection (Lovable AI) ─────────────────────────────────
async function detectViralMoment(
  transcript: { start: number; end: number; text: string }[],
  lovableKey: string
): Promise<{ start_time: number; end_time: number; hook_text: string; captions: string; reason: string }> {
  const formattedTranscript = transcript
    .map((t) => `[${t.start.toFixed(1)}s – ${t.end.toFixed(1)}s] ${t.text}`)
    .join("\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tools: [{
        type: "function",
        function: {
          name: "detect_viral_moment",
          description: "Detect the most viral 30-60 second moment from a video transcript",
          parameters: {
            type: "object",
            properties: {
              start_time: { type: "number", description: "Start time in seconds" },
              end_time: { type: "number", description: "End time in seconds" },
              hook_text: { type: "string", description: "A catchy viral hook sentence (max 10 words)" },
              captions: { type: "string", description: "Clean caption text for the viral segment, 2-3 sentences" },
              reason: { type: "string", description: "Why this moment is viral-worthy" },
            },
            required: ["start_time", "end_time", "hook_text", "captions", "reason"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "detect_viral_moment" } },
      messages: [
        {
          role: "system",
          content:
            "You are a viral content strategist. From this transcript, choose the BEST 30–60 second segment for a viral short video.\nRules:\n- prioritize emotional impact\n- prioritize surprising or valuable info\n- avoid intros/outros",
        },
        {
          role: "user",
          content: `Find the most viral 30-60 second segment:\n\n${formattedTranscript}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Viral detection API error:", res.status, errText);
    throw new Error(`AI gateway error: ${res.status}`);
  }

  const data = await res.json();
  try {
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    return JSON.parse(toolCall?.function?.arguments || "{}");
  } catch {
    return {
      start_time: 30,
      end_time: 75,
      hook_text: "You won't believe what happens next...",
      captions: "Auto-generated captions for the most engaging segment.",
      reason: "Fallback: could not parse AI response",
    };
  }
}

// ── Main Handler ────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let projectId: string | null = null;

  try {
    const requestBody = await req.json();
    projectId = requestBody.project_id;
    const project_id = projectId; // Alias for compatibility with existing code

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const deepgramKey = Deno.env.get("DEEPGRAM_API_KEY");

    // Debugging: Log key status (never log full key)
    if (!deepgramKey) {
      console.error("DEEPGRAM_API_KEY is completely missing from environment variables.");
    } else {
      console.log(`DEEPGRAM_API_KEY found (Length: ${deepgramKey.length}, Starts with: ${deepgramKey.substring(0, 4)}...)`);
    }

    if (!deepgramKey) throw new Error("DEEPGRAM_API_KEY is not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);

    const logStep = async (step: string, message: string) => {
      await supabase.from("processing_logs").insert({ project_id, step, message });
    };
    const updateStatus = async (status: string) => {
      await supabase.from("projects").update({ status, updated_at: new Date().toISOString() }).eq("id", project_id);
    };

    // Get raw video
    const { data: rawVideo } = await supabase
      .from("raw_videos")
      .select("*")
      .eq("project_id", project_id)
      .single();

    if (!rawVideo) throw new Error("No raw video found");

    // Extract storage path from public URL to generate a signed URL for Deepgram
    const publicUrlPrefix = `${supabaseUrl}/storage/v1/object/public/raw-videos/`;
    let videoUrlForDeepgram = rawVideo.file_url;

    if (rawVideo.file_url.startsWith(publicUrlPrefix)) {
      const storagePath = rawVideo.file_url.replace(publicUrlPrefix, "");
      const { data: signedData, error: signedErr } = await supabase.storage
        .from("raw-videos")
        .createSignedUrl(storagePath, 3600); // 1 hour
      if (signedErr) {
        console.error("Failed to create signed URL:", signedErr);
        await logStep("transcribing", "Warning: using public URL (signed URL failed)");
      } else {
        videoUrlForDeepgram = signedData.signedUrl;
        console.log("Using signed URL for Deepgram");
      }
    }

    // ── STEP 1: Transcribe with Deepgram ────────────────────────────────
    await logStep("transcribing", "Starting Deepgram transcription (nova-2)...");
    await updateStatus("transcribing");

    const { transcript, duration, segments, words } = await transcribeVideo(videoUrlForDeepgram, deepgramKey);

    // Generate Captions (3-6 words, max 2.5s)
    const captions = generateCaptions(words);

    // Generate SRT & VTT
    const srtContent = buildSRT(captions);
    const vttContent = buildVTT(captions);

    // Upload SRT/VTT to Storage
    const timestamp = Date.now();
    const srtPath = `${project_id}/${timestamp}.srt`;
    const vttPath = `${project_id}/${timestamp}.vtt`;

    await supabase.storage.from("captions").upload(srtPath, srtContent, { contentType: "text/plain" });
    await supabase.storage.from("captions").upload(vttPath, vttContent, { contentType: "text/vtt" });

    const { data: srtData } = supabase.storage.from("captions").getPublicUrl(srtPath);
    const { data: vttData } = supabase.storage.from("captions").getPublicUrl(vttPath);

    await supabase.from("raw_videos").update({
      transcript: transcript,
      transcript_json: segments, // Keep segments for viral detection
      captions_json: captions,   // New field: styled captions
      word_timestamps: words,    // New field: raw word timestamps
      srt_file_url: srtData.publicUrl,
      vtt_file_url: vttData.publicUrl,
    }).eq("id", rawVideo.id);

    await logStep("transcribing", `Transcription complete – ${segments.length} segments, duration: ${duration}s`);
    await updateStatus("transcribed");

    // ── STEP 2: Detect Viral Moment ─────────────────────────────────────
    await logStep("detecting", "Analyzing transcript for viral moments...");
    await updateStatus("detecting");

    // STEP 7 -- ADD LOGGING
    console.log(`[detect] received segments count = ${segments.length}`);

    const viralMoment = await detectViralMoment(segments, lovableKey);

    console.log(`[detect] chosen start=${viralMoment.start_time} end=${viralMoment.end_time}`);

    await logStep("detecting", `Viral moment found: ${viralMoment.reason}`);
    await updateStatus("segment_selected");

    // ── STEP 3: Real clipping (FFmpeg Worker) ───────────────────────────
    await logStep("clipping", "Sending to FFmpeg worker for clipping...");
    await updateStatus("clipping");

    const renderId = `${project_id}_${Date.now()}`;
    const outputName = `${project_id}/${renderId}.mp4`;

    console.log(`[clipping] calling worker at http://localhost:4000/clip`);

    // Call user's local FFmpeg worker
    let clippedUrl = "";
    try {
      const workerRes = await fetch("http://localhost:4000/clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputUrl: videoUrlForDeepgram,
          startTime: viralMoment.start_time,
          endTime: viralMoment.end_time,
          fileName: outputName
        })
      });

      if (!workerRes.ok) {
        const errText = await workerRes.text();
        throw new Error(`FFmpeg worker error: ${workerRes.status} ${errText}`);
      }

      const workerJson = await workerRes.json();
      clippedUrl = workerJson.clippedUrl;
      console.log(`[clipping] success, url: ${clippedUrl}`);

      await logStep("clipping", `Clipping complete`);
    } catch (err: any) {
      console.error("[clipping] worker failed, falling back to original URL", err);
      // Fallback to original URL if worker fails (so the flow doesn't completely die in dev)
      // But we should probably log this properly
      await logStep("error", `Clipping failed: ${err.message}. Using original video.`);
      clippedUrl = rawVideo.file_url; // Fallback
    }

    // ── STEP 4: Simulated rendering (Overlay persistence) ───────────────
    // We already generated captions/SRT separately. The 'generated_video' 
    // simply links the clipped video with the metadata.

    await logStep("rendering", "Finalizing generated video record...");
    await updateStatus("rendering");

    // Save generated video record
    await supabase.from("generated_videos").insert({
      project_id,
      video_url: clippedUrl, // Use the actual clipped URL
      start_time: viralMoment.start_time,
      end_time: viralMoment.end_time,
      hook_text: viralMoment.hook_text,
      captions: viralMoment.captions,
    });

    await updateStatus("ready");
    await logStep("complete", "Video processing complete!");

    return new Response(JSON.stringify({ success: true, viral_moment: viralMoment }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-clip error:", e);
    const errMsg = e instanceof Error ? e.message : "Unknown error";

    // Try to set project status to error so frontend can show it
    if (projectId) {
      console.log(`Reporting error for project ${projectId}: ${errMsg}`);
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(supabaseUrl, supabaseKey);

        await sb.from("processing_logs").insert({
          project_id: projectId,
          step: "error",
          message: errMsg
        });

        await sb.from("projects").update({
          status: "error",
          updated_at: new Date().toISOString()
        }).eq("id", projectId);
      } catch (logErr) {
        console.error("Failed to log error to DB:", logErr);
      }
    } else {
      console.error("No project_id available to log error");
    }

    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
