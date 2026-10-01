// Runs on the schedule set in vercel.json ("crons").
// Finds any pending message past its delete time and deletes it from Telegram.

async function upstash(cmdPath) {
  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const res = await fetch(base + cmdPath, {
    headers: { Authorization: "Bearer " + token },
  });
  return res.json();
}

export default async function handler(req, res) {
  try {
    const keysRes = await upstash(`/keys/${encodeURIComponent("msg:*")}`);
    const keys = keysRes.result || [];
    const now = Date.now();
    let deleted = 0;

    for (const key of keys) {
      const getRes = await upstash(`/get/${encodeURIComponent(key)}`);
      if (!getRes.result) continue;
      let record;
      try { record = JSON.parse(decodeURIComponent(getRes.result)); } catch (e) {
        try { record = JSON.parse(getRes.result); } catch (e2) { continue; }
      }
      if (record.delete_at <= now) {
        try {
          await fetch(
            `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: record.chat_id, message_id: record.message_id }),
            }
          );
        } catch (e) { /* already deleted or inaccessible - move on */ }
        await upstash(`/del/${encodeURIComponent(key)}`);
        deleted++;
      }
    }

    res.status(200).json({ ok: true, checked: keys.length, deleted });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
}
