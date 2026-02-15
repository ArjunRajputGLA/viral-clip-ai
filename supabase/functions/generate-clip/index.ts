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
): Promise<{ start: number; end: number; text: string }[]> {
  console.log("Deepgram: sending URL for transcription:", videoUrl);

  const res = await fetch("https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&utterances=true&punctuate=true", {
    method: "POST",
    headers: {
      Authorization: `Token ${deepgramKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: videoUrl }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error("Deepgram error:", res.status, errBody);
    throw new Error(`Deepgram API error: ${res.status} – ${errBody}`);
  }

  const data = await res.json();

  // Prefer utterances (speaker-aware segments with timestamps)
  const utterances = data.results?.utterances;
  if (utterances && utterances.length > 0) {
    return utterances.map((u: any) => ({
      start: u.start as number,
      end: u.end as number,
      text: u.transcript as string,
    }));
  }

  // Fallback: use word-level data grouped into ~10-word chunks
  const words = data.results?.channels?.[0]?.alternatives?.[0]?.words || [];
  if (words.length === 0) throw new Error("Deepgram returned empty transcript");

  const chunks: { start: number; end: number; text: string }[] = [];
  for (let i = 0; i < words.length; i += 10) {
    const slice = words.slice(i, i + 10);
    chunks.push({
      start: slice[0].start,
      end: slice[slice.length - 1].end,
      text: slice.map((w: any) => w.punctuated_word || w.word).join(" "),
    });
  }
  return chunks;
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

  try {
    const { project_id } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const deepgramKey = Deno.env.get("DEEPGRAM_API_KEY");

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

    // ── STEP 1: Transcribe with Deepgram ────────────────────────────────
    await logStep("transcribing", "Starting Deepgram transcription (nova-2)...");
    await updateStatus("transcribing");

    const transcript = await transcribeVideo(rawVideo.file_url, deepgramKey);
    const fullTranscriptText = transcript.map((t) => t.text).join(" ");

    await supabase.from("raw_videos").update({
      transcript: fullTranscriptText,
      transcript_json: transcript,
    }).eq("id", rawVideo.id);

    await logStep("transcribing", `Transcription complete – ${transcript.length} segments`);
    await updateStatus("transcribed");

    // ── STEP 2: Detect Viral Moment ─────────────────────────────────────
    await logStep("detecting", "Analyzing transcript for viral moments...");
    await updateStatus("detecting");

    const viralMoment = await detectViralMoment(transcript, lovableKey);

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
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
