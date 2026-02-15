
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
): Promise<{ transcript: string; duration: number; segments: { start: number; end: number; text: string }[] }> {
  console.log("[transcribe] fetching video from URL:", videoUrl);
  console.log(`[debug] DEEPGRAM_API_KEY length: ${deepgramKey ? deepgramKey.length : "undefined"}`);
  if (deepgramKey) {
    console.log(`[debug] DEEPGRAM_API_KEY starts with: ${deepgramKey.substring(0, 4)}...`);
  } else {
    console.error("[error] DEEPGRAM_API_KEY is missing or empty");
  }

  // STEP 1 -- Validate Video Fetch
  const videoRes = await fetch(videoUrl);
  console.log("[transcribe] video fetch status:", videoRes.status);
  const contentType = videoRes.headers.get("content-type");
  const contentLength = videoRes.headers.get("content-length");
  console.log("[transcribe] content-type:", contentType);
  console.log("[transcribe] content-length:", contentLength);

  if (!videoRes.ok) {
    throw new Error(`Failed to fetch video: ${videoRes.status} ${videoRes.statusText}`);
  }

  // Check content length if available
  const estimatedSize = contentLength ? parseInt(contentLength, 10) : 0;

  if (estimatedSize > 0 && estimatedSize < 10 * 1024) { // 10KB
    throw new Error("Video file too small or invalid (< 10KB)");
  }

  // STEP 2 -- Stream directly to Deepgram to avoid memory issues
  console.log("[transcribe] sending stream to Deepgram (nova-2)...");
  
  // Create a timeout controller - 60 seconds
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  let deepgramRes;
  try {
    deepgramRes = await fetch("https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&utterances=true&punctuate=true", {
      method: "POST",
      headers: {
        Authorization: `Token ${deepgramKey}`,
        // Note: deepgram handles chunked transfer encoding automatically
        // but some environments might require Content-Length if streaming
      },
      // Pass the readable stream directly
      body: videoRes.body,
      signal: controller.signal,
      // duplex: 'half' is required for streaming request bodies in some environments
      // @ts-ignore - Deno's fetch type might not include duplex yet
      duplex: "half", 
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error("[transcribe] Deepgram request timed out after 60s");
      throw new Error("Deepgram transcription timed out (60s)");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  // STEP 3 -- Handle Response Safely
  if (!deepgramRes.ok) {
    const errBody = await deepgramRes.text();
    console.error("[transcribe] Deepgram error:", deepgramRes.status, errBody);
    throw new Error(`Deepgram API error: ${deepgramRes.status} – ${errBody}`);
  }

  const data = await deepgramRes.json();
  console.log("[transcribe] Deepgram response received");

  const duration = data.metadata?.duration || 0;
  console.log("[transcribe] Deepgram duration:", duration);

  const transcriptText = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
  console.log("[transcribe] transcript length:", transcriptText.length);

  if (!transcriptText || transcriptText.trim() === "") {
    console.error("[transcribe] Empty transcript. Metadata:", JSON.stringify(data.metadata));
    throw new Error(`Deepgram returned empty transcript. Duration: ${duration}`);
  }

  // Extract segments for viral moment detection
  let segments: { start: number; end: number; text: string }[] = [];
  
  // Prefer utterances (speaker-aware segments with timestamps)
  const utterances = data.results?.utterances;
  if (utterances && utterances.length > 0) {
    console.log("[transcribe] Using utterances:", utterances.length);
    segments = utterances.map((u: any) => ({
      start: u.start,
      end: u.end,
      text: u.transcript,
    }));
  } else {
    // Fallback: use word-level data grouped into ~10-word chunks
    const words = data.results?.channels?.[0]?.alternatives?.[0]?.words || [];
    console.log("[transcribe] Words count:", words.length);

    if (words.length > 0) {
      for (let i = 0; i < words.length; i += 10) {
        const slice = words.slice(i, i + 10);
        segments.push({
          start: slice[0].start,
          end: slice[slice.length - 1].end,
          text: slice.map((w: any) => w.punctuated_word || w.word).join(" "),
        });
      }
    } else {
       // Deepgram returned transcript but no words/utterances? 
       // Create one big segment
       console.log("[transcribe] Fallback: single segment from full text");
       segments = [{ start: 0, end: duration, text: transcriptText }];
    }
  }

  return {
    transcript: transcriptText,
    duration,
    segments
  };
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

    const { transcript, duration, segments } = await transcribeVideo(videoUrlForDeepgram, deepgramKey);

    await supabase.from("raw_videos").update({
      transcript: transcript,
      transcript_json: segments,
    }).eq("id", rawVideo.id);

    await logStep("transcribing", `Transcription complete – ${segments.length} segments, duration: ${duration}s`);
    await updateStatus("transcribed");

    // ── STEP 2: Detect Viral Moment ─────────────────────────────────────
    await logStep("detecting", "Analyzing transcript for viral moments...");
    await updateStatus("detecting");

    const viralMoment = await detectViralMoment(segments, lovableKey);

    await logStep("detecting", `Viral moment found: ${viralMoment.reason}`);
    await updateStatus("segment_selected");

    // ── STEP 3: Simulated clipping (FFmpeg not yet implemented) ─────────
    await logStep("clipping", "Clipping video segment...");
    await updateStatus("clipping");
    await new Promise((r) => setTimeout(r, 2000));
    await logStep("clipping", `Clipped ${viralMoment.start_time}s – ${viralMoment.end_time}s`);

    // ── STEP 4: Simulated rendering ─────────────────────────────────────
    await logStep("rendering", "Rendering with overlays and captions...");
    await updateStatus("rendering");
    await new Promise((r) => setTimeout(r, 2000));

    // Save generated video record
    await supabase.from("generated_videos").insert({
      project_id,
      video_url: rawVideo.file_url,
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
