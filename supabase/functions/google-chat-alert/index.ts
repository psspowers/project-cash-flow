import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GOOGLE_CHAT_WEBHOOK =
  "https://chat.googleapis.com/v1/spaces/AAQA19SFOYE/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=SdFPo9gxSHZHrybOeV3MNfXRChUrqHg-uMbA7aWD1TY";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload = await req.json();

    // Supabase database webhooks send { type, table, record, old_record, schema }
    const record = payload?.record;
    if (!record) {
      return new Response(JSON.stringify({ error: "No record in payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { content, user_id, entity_type, entity_id } = record;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch sender name
    const { data: sender } = await supabase
      .from("user_profiles")
      .select("full_name")
      .eq("id", user_id)
      .maybeSingle();

    const senderName: string = sender?.full_name ?? "Someone";

    // Fetch entity label
    let entityLabel: string = entity_id;
    if (entity_type === "purchase_order") {
      const { data: po } = await supabase
        .from("purchase_orders")
        .select("pss_po_no")
        .eq("id", entity_id)
        .maybeSingle();
      if (po?.pss_po_no) entityLabel = po.pss_po_no;
    }

    const chatPayload = {
      text: `💬 *${senderName}* commented on *${entityLabel}*:\n\n"${content}"`,
    };

    const chatRes = await fetch(GOOGLE_CHAT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chatPayload),
    });

    if (!chatRes.ok) {
      const errBody = await chatRes.text();
      console.error("[google-chat-alert] Google Chat error:", chatRes.status, errBody);
      return new Response(JSON.stringify({ error: "Google Chat delivery failed", detail: errBody }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, entity: entityLabel, sender: senderName }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[google-chat-alert] Unhandled error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
