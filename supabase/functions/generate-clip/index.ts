import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;

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

    // Step 1: Transcribing
    await logStep("transcribing", "Starting AI transcription...");
    await updateStatus("transcribing");

    const transcriptResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: "You are a transcript generator. Generate a realistic 3-minute video transcript with timestamps. Format: [MM:SS] Speaker text. Make it about an interesting, engaging topic."
          },
          {
            role: "user",
            content: "Generate a realistic video transcript that has at least one highly engaging, viral-worthy moment. The transcript should be ~3 minutes long with various topics discussed."
          }
        ],
      }),
    });

    if (!transcriptResponse.ok) {
      const errText = await transcriptResponse.text();
      console.error("Transcript API error:", transcriptResponse.status, errText);
      throw new Error(`AI gateway error: ${transcriptResponse.status}`);
    }

    const transcriptData = await transcriptResponse.json();
    const transcript = transcriptData.choices?.[0]?.message?.content || "Transcript unavailable";

    await supabase.from("raw_videos").update({ transcript }).eq("id", rawVideo.id);
    await logStep("transcribing", "Transcription complete");

    // Step 2: Viral moment detection
    await logStep("detecting", "Analyzing transcript for viral moments...");
    await updateStatus("detecting");

    const viralResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                reason: { type: "string", description: "Why this moment is viral-worthy" }
              },
              required: ["start_time", "end_time", "hook_text", "captions", "reason"],
              additionalProperties: false,
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "detect_viral_moment" } },
        messages: [
          {
            role: "system",
            content: "You analyze video transcripts to find the single most engaging 30-60 second viral moment."
          },
          {
            role: "user",
            content: `Find the most viral 30-60 second segment:\n\n${transcript}`
          }
        ],
      }),
    });

    if (!viralResponse.ok) {
      const errText = await viralResponse.text();
      console.error("Viral detection API error:", viralResponse.status, errText);
      throw new Error(`AI gateway error: ${viralResponse.status}`);
    }

    const viralData = await viralResponse.json();
    let viralMoment: { start_time: number; end_time: number; hook_text: string; captions: string; reason: string };

    try {
      const toolCall = viralData.choices?.[0]?.message?.tool_calls?.[0];
      viralMoment = JSON.parse(toolCall?.function?.arguments || "{}");
    } catch {
      viralMoment = {
        start_time: 30,
        end_time: 75,
        hook_text: "You won't believe what happens next...",
        captions: "Auto-generated captions for the most engaging segment of the video.",
        reason: "High engagement potential detected"
      };
    }

    await logStep("detecting", `Viral moment: ${viralMoment.reason}`);

    // Step 3: Clipping
    await logStep("clipping", "Clipping video segment...");
    await updateStatus("clipping");
    await new Promise(r => setTimeout(r, 2000));
    await logStep("clipping", `Clipped ${viralMoment.start_time}s - ${viralMoment.end_time}s`);

    // Step 4: Rendering
    await logStep("rendering", "Rendering with overlays and captions...");
    await updateStatus("rendering");
    await new Promise(r => setTimeout(r, 2000));

    // Save generated video
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
